# iOS Web Audio Playback Fix

## Context

On iOS (Safari and Chrome), Web Audio tracks don't produce audible output until the page is refreshed. The UI correctly shows tracks as "playing" but no sound comes out. After refresh, everything works. This also addresses the audible "beep" (sword.mp3) that plays when entering a session on iOS.

**Root cause**: The AudioContext is eagerly created on component mount (outside a user gesture) to enable `decodeAudioData()` for buffer preloading. On iOS, a context created before the hardware audio session is activated cannot produce output — even after `resume()` is called within a gesture. The promise resolves and state shows `'running'`, but audio hardware output was never connected. On refresh, the audio session persists from the previous `sword.mp3` play, so the new eagerly-created context works.

## Changes

### 1. Recreate AudioContext within user gesture (`useUnifiedAudio.js:1060-1085`)

In `unlockAudio()`, after HTML5 Audio.play() activates the iOS audio session, **close the stale eager-init context and create a fresh one**:

```javascript
// After HTML5 Audio.play() succeeds:

// Close stale context (created on mount, before iOS audio session was active)
if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
  await audioContextRef.current.close();
}
audioContextRef.current = null;

// Create fresh context + full graph within user gesture
const webAudioSuccess = await initializeWebAudio();
```

**Why this is safe:**
- `AudioBuffer` objects are context-independent (raw PCM) — `audioBuffersRef` survives
- `initializeWebAudio()` rebuilds all gain nodes, EQ, reverb, metering and updates all refs
- No active sources exist on the old context (it was suspended, all plays were queued)
- Pending ops drain uses current ref values → connects to the new graph
- Desktop browsers are unaffected (no "audio session" concept)

**Why the previous attempt failed:** The ref wasn't nulled before calling `initializeWebAudio()`, so the guard (`!audioContextRef.current || state === 'closed'`) returned early without rebuilding.

### 2. Replace sword.mp3 with silence.mp3 (`useUnifiedAudio.js:1068`)

iOS ignores `volume = 0` on HTML5 Audio (read-only, always 1.0). Replace:
```javascript
// Before:
const silentAudio = new Audio('/audio/sword.mp3');
// After:
const silentAudio = new Audio('/audio/silence.mp3');
```

Create `public/audio/silence.mp3` — a ~0.1s silent MP3 file generated with ffmpeg. `sword.mp3` stays for combat start sound (separate usage).

## Files to modify

- `rollplay/app/audio_management/hooks/useUnifiedAudio.js` — `unlockAudio()` lines 1060-1085
- `rollplay/public/audio/silence.mp3` — new file (silent MP3, ~1-2KB)

## Verification

1. Have DM start audio tracks in a session
2. Join as player on iOS Safari — tracks should play immediately after clicking "Enter" (no refresh needed)
3. Join as player on iOS Chrome — same behavior
4. No audible beep/sword sound on enter
5. Desktop Chrome/Firefox/Safari — no regression
6. Late-joiner sync: join mid-session, audio plays at correct offset
7. SFX soundboard: one-shots still fire correctly after enter
