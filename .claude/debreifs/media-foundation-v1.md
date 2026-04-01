# Debrief: V1 Media Foundation

**Plan file:** `.claude-plans/media-foundation-v1.md`
**Branches:** `media-foundation-v1-f1` (PR #80), `media-foundation-v1-f2-audio` (PR #81), `media-foundation-v1-f3-audio-channels` (in progress)
**Period:** Jan–Feb 2025
**Status:** F1 merged, F2 merged, F3 in progress, F4 not started

---

## Goals Set (from plan)

The V1 plan defined four features to mature the media foundation before V2's Scene Builder:

1. **Image Loading in Game** — Load IMAGE assets into game view, separate from maps, with `active_display` toggle, own WebSocket events, own ETL
2. **SFX Soundboard** — Replace the 4 SFX channel strips with a hit-to-play button grid
3. **Per-Channel Audio Effects** — HPF, LPF, Reverb with wet/dry mix per BGM channel
4. **Loop Points + Waveform + BPM** — Custom loop regions, waveform editor, BPM detection, `music_assets` joined table

---

## What Was Delivered

### Feature 1: Image Loading in Game — Shipped (PR #80)

Delivered as planned. Key files created:
- `api-game/imageservice.py` — MongoDB CRUD for active image
- `rollplay/app/map_management/components/ImageDisplay.js` — image renderer
- `rollplay/app/map_management/hooks/useImageWebSocket.js` — WebSocket hook
- `rollplay/app/game/components/ImageControlsPanel.js` — DM controls in drawer tab

The `active_display` field (`"map"` | `"image"` | `null`) works as specified — loading either type sets it, switching is instant with no reload. ETL persists `active_image_asset_id` and `active_display` to PostgreSQL on session pause/finish.

No significant diversions from plan on F1.

### Feature 2: SFX Soundboard + Audio Foundation — Shipped (PR #81)

Delivered as planned, plus substantial foundational audio work. Key files created:
- `rollplay/app/audio_management/components/SfxSoundboard.js` — button grid
- Major rework of `useUnifiedAudio.js` and `webSocketAudioEvents.js`

The `remote_audio_batch` WebSocket event was built during F2 as the unified transport for all audio operations (play, stop, pause, resume, volume, loop, load, clear). This became the foundation that F3 extended with `effects`, `mute`, and `solo` operations.

`audio_management/types.js` was created during F2 with `ChannelType` and `BGM_CHANNELS`/`SFX_CHANNELS` constants.

No significant diversions from plan on F2.

### Feature 3: Per-Channel Audio Effects — In Progress (branch `media-foundation-v1-f3-audio-channels`)

Core implementation complete with several deliberate diversions from the original plan. See "Decisions & Diversions" below for details.

**Delivered:**
- Full Web Audio effects chain: `Source → [HPF] → [LPF] → [Reverb] → VolumeGain → MuteGain → Analyser → Master`
- Per-channel mute/solo system (not in original plan — emerged during development)
- Audio track config stash (preserves per-track settings across channel swaps)
- 3-phase fail-safe ETL (fetch → write → cleanup) for session pause/finish
- PostgreSQL persistence: `effect_hpf_enabled`, `effect_lpf_enabled`, `effect_reverb_enabled` on `music_assets`
- Alembic migration for effect toggle columns
- Late-joiner sync and full WebSocket broadcast

**Not delivered (V1 scoping decision):**
- Per-effect parameter controls (frequency sliders, wet/dry mix, reverb preset selector) — hardcoded in V1, deferred to V2 Workshop Audio Editor

### Feature 4: Loop Points + Waveform + BPM — Not Started

No work has begun. The `music_assets` table exists (created in F2) but does not yet have `loop_start`, `loop_end`, or `bpm` columns.

---

## Challenges

### 1. ETL Fragility (discovered during F3)

The session pause/finish ETL was brittle — previous implementation assumed JSONB columns had been removed in earlier migrations, but they hadn't. This led to a mid-flight refactor of the entire ETL pipeline. The fix was a 3-phase approach:
- **Phase 1:** Fetch final state from MongoDB (non-destructive read)
- **Phase 2:** Write to PostgreSQL (atomic commit)
- **Phase 3:** Background cleanup of MongoDB (fire-and-forget)

This ensures a failed write doesn't corrupt either store. Commit `7f237cf` captures this refactor.

### 2. Effects Not Persisting Across Sessions (bug, fixed)

After implementing effects, they weren't surviving session pause/resume. Root cause: `setChannelEffects` was guarded behind a Web Audio node existence check — if the AudioContext wasn't initialized yet (e.g., on resume before user interaction), React state never got updated, so the UI showed effects as off even though MongoDB had them as on.

Fix: moved `setChannelEffects` (React state update) above the Web Audio chain guard so state is always updated regardless of AudioContext readiness. Commit `47567cf`.

### 3. SFX Parameters Leaking into MongoDB (discovered during F3)

SFX channel state was being stored in MongoDB with full parameter objects, creating unnecessary bloat and confusion during ETL. Refactored to store only pointers (asset_id references) for SFX, not full config objects. Commit `da1bff2`.

### 4. Channel Clear Not Resetting Effects/Mute/Solo

When clearing a channel, effects and mute/solo state wasn't being reset. This meant loading a new track into a cleared channel would inherit the previous track's mute state. Fixed by adding explicit resets in both the `clear` WebSocket handler and the `handleBgmClear` frontend handler.

---

## Decisions & Diversions

### D1: Toggle-Only Effects UI (planned full controls → shipped toggles only)

**Plan said:** "Three knobs/sliders per effect: enable toggle, parameter (frequency/preset), wet/dry mix"
**Shipped:** On/off toggle buttons only (HPF, LPF, RVB)

**Rationale:** V2's Workshop Audio Editor will be the proper home for detailed effect parameter editing (frequency, Q, mix, preset selection). Building full slider UI in the in-game mixer would create duplicate UX that we'd later need to reconcile with the Workshop. The Web Audio engine underneath supports full parameter control — only the UI is simplified.

**Impact on V2:** None — the engine is built for it. V2 just needs to wire up parameter controls to the existing `applyChannelEffects()` function which already accepts the full `{ enabled, frequency, mix }` shape via `DEFAULT_EFFECTS`.

Documented in plan: `.claude-plans/media-foundation-v1.md` → Feature 3a

### D2: Runtime IR Generation (planned static WAV files → shipped algorithmic)

**Plan said:** "Ship 2-3 built-in IR files to `/public/audio/impulse-responses/`"
**Shipped:** `createImpulseResponse()` generates impulse responses algorithmically (exponentially decaying white noise)

**Rationale:** Eliminates static asset management, reduces bundle size, and allows parametric control (duration, decay rate) per preset. Three presets defined in `REVERB_PRESETS`: room (0.6s), hall (1.0s), cathedral (3.0s).

**Impact on V2:** Positive — V2 could add more presets by just adding entries to `REVERB_PRESETS` without shipping WAV files. If higher-fidelity IRs are wanted later, the `ConvolverNode` can accept any `AudioBuffer` — the loading path exists but uses generated buffers instead of fetched files.

### D3: Mute/Solo System (not in original plan — added as scope expansion)

**Plan said:** Nothing — mute/solo wasn't part of the V1 plan
**Shipped:** Full mute/solo system with smart gain computation, WebSocket sync, MongoDB persistence, late-joiner restore

**Rationale:** Once the effects chain was built with per-channel gain nodes, mute/solo was a natural extension (just another gain node in the chain). It's a core mixer feature that DMs expect. The `MuteGainNode` sits between the volume fader and the analyser, so muted channels show silent meters (what the audience hears).

**Behaviour:** Solo overrides mute. If any channel is soloed, only soloed channels are audible. Mute/solo is channel-level state (survives track swaps within a channel). Persists to MongoDB and survives session pause/resume via existing `audio_config` ETL.

Documented in plan: `.claude-plans/media-foundation-v1.md` → Feature 3b

### D4: Audio Track Config Stash (not in original plan — added for UX)

**Plan said:** Nothing
**Shipped:** `audio_track_config` dict in MongoDB that preserves per-track settings (volume, looping, effects) when a track is swapped out of a channel

**Rationale:** Without this, swapping a track out of channel A and later loading it into channel B would lose all its configured effects and volume. The stash saves outgoing track config keyed by `asset_id`, and restores it when that asset is loaded back into any channel. Mute/solo is explicitly excluded from the stash (it's channel-level, not track-level).

**Impact on V2:** Positive — Scene Builder can leverage the stash for scene-switching where the same tracks may appear across different scenes with different channel assignments.

### D5: Effects Stored as Slim Boolean Flags (simplified from plan's nested objects)

**Plan said:** MongoDB effects shape: `{ hpf: { enabled: true, frequency: 200, mix: 0.5 }, ... }`
**Shipped:** MongoDB effects shape: `{ hpf: true, lpf: false, reverb: false }`

**Rationale:** Since V1 only supports toggle (no user-configurable params), storing the full nested object would be misleading — the frequency/mix values are hardcoded in `DEFAULT_EFFECTS` on the frontend. Slim flags are simpler, and the frontend reconstitutes full params from constants at apply time.

**Impact on V2:** When V2 adds parameter controls, the MongoDB shape will need to expand back to the nested object format. This is a straightforward change in `applyChannelEffects()` and the `effects` batch operation handler. The PostgreSQL `music_assets` columns already use the expanded naming (`effect_hpf_enabled`, `effect_hpf_frequency` in V2 migration) so cold storage is forward-compatible.

### D6: 3-Phase ETL Pattern (refactored from simpler approach)

**Plan said:** Standard ETL — extract from MongoDB, persist to PostgreSQL, delete MongoDB doc
**Shipped:** 3-phase fail-safe: (1) non-destructive fetch, (2) atomic PostgreSQL write, (3) background MongoDB cleanup

**Rationale:** The original approach could leave data in an inconsistent state if the PostgreSQL write failed after MongoDB deletion. The 3-phase approach ensures MongoDB data is only cleaned up after PostgreSQL confirms the write. If Phase 2 fails, Phase 1's data is still intact in MongoDB for retry.

**Impact on V2:** Positive — the same 3-phase pattern will handle Scene Builder state ETL which will be more complex (scene + positioned images + multi-channel audio).

---

## Current Audio Architecture (post-F3)

### Web Audio Node Graph (per BGM channel)
```
BufferSource → [HPF dry/wet] → [LPF dry/wet] → [Reverb dry/wet] → VolumeGain → MuteGain → Analyser → MasterGain → destination
```

### State Locations
| State | Where | Persistence |
|-------|-------|-------------|
| Effects toggles (hpf/lpf/reverb) | React state + Web Audio nodes | MongoDB (hot) → PostgreSQL `music_assets` columns (cold) |
| Mute/solo flags | React state + MuteGainNode | MongoDB (hot) → PostgreSQL `audio_config` JSONB (cold) |
| Track config stash | MongoDB `audio_track_config` | MongoDB (hot) → PostgreSQL `audio_config` JSONB (cold) |
| Volume/looping | React state + GainNode | MongoDB (hot) → PostgreSQL `audio_config` JSONB (cold) |
| Effect parameters (freq, mix, preset) | `DEFAULT_EFFECTS` constants (frontend only) | Not persisted — hardcoded in V1 |

### WebSocket Batch Operations (via `remote_audio_batch`)
`play`, `stop`, `pause`, `resume`, `volume`, `loop`, `load`, `clear`, `effects`, `mute`, `solo`

---

## V2 Readiness Assessment

| V2 Dependency | V1 Status | Ready? |
|---------------|-----------|--------|
| `music_assets` table exists | Created in F2 | Yes |
| `music_assets` has `effect_*_enabled` columns | Added in F3 | Yes |
| `music_assets` has `loop_start`, `loop_end`, `bpm` columns | Not yet — F4 work | No |
| Effects engine supports full parameter control | Engine built for it, UI is toggle-only | Yes |
| `SceneSfxSlot`-compatible soundboard | SFX soundboard with slots delivered in F2 | Yes |
| 3-tier effects precedence (asset → scene → live) | Tier 3 (live) + Tier 1 booleans implemented | Partial |
| `active_display` toggle (map/image) | Delivered in F1 | Yes |
| Positional images (SceneImage with x/y/z) | Not V1 scope | No — V2 Phase 5 |

---

## Open Items for F3 Merge

1. Run `npm run build` to confirm clean production build
2. Decide if plan file should be annotated with "[DELIVERED]" / "[DEFERRED]" markers, or if this debrief is sufficient
3. F4 (Loop Points) can be a separate branch off main after F3 merges
