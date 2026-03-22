# Audio Bug Fixes — Two-Strategy Unlock Refactor

## Context
The current `unlockAudio` function mixes iOS and desktop concerns into a single path. On iOS the eager-init AudioContext is `suspended` (can't produce audio), so the close/recreate pattern is correct. On desktop the context starts `running`, so `syncAudioState` plays audio immediately on the old context — then `unlockAudio` closes it, killing the audio, while stale source refs trick the reconciliation into thinking channels are still alive.

Bugs 2 (JIT offset) and 4 (timestamps) are already implemented. This plan covers the unlock refactor that fixes Bug 1 (late-joiner audio) and Bug 3 (mobile resume).

## Files to Modify
- `rollplay/app/audio_management/hooks/useUnifiedAudio.js` — unlock refactor, visibility listener

---

## Two-Strategy Unlock

Replace the monolithic `unlockAudio` with an orchestrator that picks a strategy based on the AudioContext state at unlock time. No UA sniffing — the context state is the authoritative signal.

### Detection (in `unlockAudio` orchestrator)
```
const contextState = audioContextRef.current?.state;
if (contextState === 'running') → unlockDesktop()
else → unlockMobile()
```

### Strategy 1: `unlockDesktop()` — context is already `running`

The eager-init context is live and may already be producing audio (from `syncAudioState` → `playRemoteTrack`). No need to close/recreate.

Steps:
1. **Resume if somehow suspended** (defensive, should be no-op)
2. **Set `isAudioUnlocked = true`**
3. **Re-apply channel effects** — effects may have been applied to nodes that the eager init created; this is fine since we're keeping the same context, but re-apply ensures consistency
4. **Drain pending ops** (should be empty on desktop, but handle edge cases)
5. **Reconcile from `pendingAudioStateRef`** — for any channel that should be playing but has no active source (race condition where user clicked before `syncAudioState` finished loading buffers), start playback with JIT offsets

Key difference from current code: **no close, no recreate, no silent MP3**. The existing context and its sources stay alive.

### Strategy 2: `unlockMobile()` — context is `suspended`

iOS requires a fresh AudioContext created within a user gesture. The eager-init context can decode audio but can't produce output.

Steps:
1. **Play base64 silent MP3** — activates iOS audio session within gesture window (preserves timing for both Safari and Chrome iOS)
2. **Close the eager-init context** — it can never produce audio on iOS
3. **Clear stale refs** — `activeSourcesRef = {}`, `trackTimersRef = {}`, `playOperationsRef = {}` (on iOS these should be empty since context was suspended, but clear defensively)
4. **Create fresh AudioContext via `initializeWebAudio()`** — within gesture, gets a running context
5. **Resume if still suspended** (defensive)
6. **Set `isAudioUnlocked = true`**
7. **Re-apply channel effects** to fresh audio graph nodes
8. **Drain pending ops** — these are the queued `playRemoteTrack` calls from `syncAudioState` that couldn't play on the suspended context. Use JIT offset (pass `offset = null` when `started_at` exists)
9. **Reconcile from `pendingAudioStateRef`** — catches any channels missed by the pending ops queue

### Shared post-unlock: `reconcileAudioState()`

Extract the reconciliation loop into its own function, called by both strategies at the end.

## What stays the same
- `syncAudioState` — unchanged (stores to `pendingAudioStateRef`, loads buffers, tries to play)
- `playRemoteTrack` — unchanged (JIT offset from `started_at`, pending ops queue for suspended context)
- `initializeWebAudio` — unchanged
- `pendingAudioStateRef` logic — unchanged
- All component code (timestamps etc.) — unchanged

## Verification
- **Desktop late-joiner**: DM plays 2+ channels → open incognito, join → hear audio before clicking → click "Enter Session" → audio continues uninterrupted
- **Desktop fast-click**: Join, click immediately before buffers load → audio starts after click (reconciliation catches it)
- **iOS Safari**: Join → no audio before click → click "Enter Session" → audio starts at correct position
- **iOS Chrome**: Same as Safari
- **Mobile lock/unlock**: Enter session, start audio, lock phone 10s, unlock → audio resumes
- **DM controls**: Play/pause/stop/volume all work normally after unlock on both paths
