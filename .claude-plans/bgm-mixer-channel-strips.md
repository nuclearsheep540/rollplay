# BGM Mixer: Stereo RMS Meters + Solo/Mute + 6-Col Cue Grid

## Context

Update to the BGM mixer panel. The existing horizontal AudioTrack layout is kept. Three focus areas:

1. **Stereo RMS metering** — split L/R channels via ChannelSplitterNode for independent visual feedback per channel, displayed as two stacked horizontal bars above the volume slider
2. **Properly styled RMS visualization** — use dB-scaled mapping of true RMS values instead of the current 3x multiplier + 15% boost hack
3. **Solo/Mute per channel** — toggle buttons per track, broadcast to all players via WebSocket
4. **6-column cue grid** — add Play/Pause and Stop columns to the channel cue grid

## Layout: Before → After

**Before:**
```
Channel Cue Grid (4 cols): Cue | FADE | PGM | Preview
Fade controls: − | 1.0s | + | CUT | STOP ALL

Background Music:
  [AudioTrack 1 — horizontal row: label + filename + ▶⏸⏹↻ + volume slider w/ gradient RMS]
  [AudioTrack 2 — horizontal row]
  [AudioTrack 3 — horizontal row]
  [AudioTrack 4 — horizontal row]
```

**After:**
```
Channel Cue Grid (6 cols): ▶/⏸ | ⏹ | Cue | FADE | PGM | Preview
Fade controls: − | 1.0s | + | CUT | STOP ALL

Background Music:
  ┌──────────────────────────────────────────────────────────────┐
  │ Track A   song.mp3                                1:23/3:45 │
  │  L ████████████░░░░░░░░░░░                                  │
  │  R ██████████░░░░░░░░░░░░░                                  │
  │  dB ──●──────────────────────                   [S] [M] [↻] │
  └──────────────────────────────────────────────────────────────┘
  ┌──────────────────────────────────────────────────────────────┐
  │ Track B   rain.mp3                                0:45/2:10 │
  │  L █████████░░░░░░░░░░░░░░                                  │
  │  R ████████░░░░░░░░░░░░░░░                                  │
  │  dB ──●──────────────────────                   [S] [M] [↻] │
  └──────────────────────────────────────────────────────────────┘
```

---

## Changes

### 1. Stereo analyser nodes in audio chain

**File:** `rollplay/app/audio_management/hooks/useUnifiedAudio.js` (~lines 159-175)

Replace single `analyserNode` per track with a stereo split:

```
Current:  GainNode → AnalyserNode → MasterGain
New:      GainNode → MuteGainNode → ChannelSplitter(2) → [0] → AnalyserL ─┐
                                                        → [1] → AnalyserR ─┤→ ChannelMerger(2) → MasterGain
```

In `initializeWebAudio()`, for each BGM track:
- Create `ChannelSplitterNode(2)` and `ChannelMergerNode(2)`
- Create two `AnalyserNode`s (L and R), both with `fftSize: 256`, `smoothingTimeConstant: 0.8`
- Connect: `muteGainNode → splitter`, `splitter.connect(analyserL, 0)`, `splitter.connect(analyserR, 1)`, `analyserL → merger input 0`, `analyserR → merger input 1`, `merger → masterGain`
- Store as `remoteTrackAnalysersRef.current[trackId] = { left: analyserL, right: analyserR }`

### 2. Restyle RMS visualization with dB-scaled true values

**File:** `rollplay/app/audio_management/components/AudioTrack.js` (~lines 72-135)

Replace the current RAF loop with a proper dB-scaled stereo meter.

**Remove all artificial inflation:**
- Remove the `pct * 3` multiplier (line 101)
- Remove the `pct * 1.15` boost (line 104)
- Remove the slider gradient fill (lines 115-126)

**New RMS → dB → percentage mapping:**
```javascript
const DB_FLOOR = -60;  // meter floor
const DB_CEIL  =   0;  // meter ceiling (full scale)

function rmsToPct(rms) {
  if (rms < 0.001) return 0;                        // silence gate
  const dB = 20 * Math.log10(rms);                  // true dB
  const clamped = Math.max(DB_FLOOR, Math.min(DB_CEIL, dB));
  return ((clamped - DB_FLOOR) / (DB_CEIL - DB_FLOOR)) * 100;
}
```

This maps the full -60dB→0dB range to 0%→100%. Typical music sits around 20-60% on the meter — visible and meaningful without any hacks.

**Smoothing:** Keep EMA, tune to `0.8 * old + 0.2 * new` (slightly faster response than current 0.85/0.15).

**Color thresholds (dB-based):**
- Green: 0% – 70% (below -18dB)
- Yellow: 70% – 90% (-18dB to -6dB)
- Red: 90% – 100% (-6dB to 0dB)

### 3. Stereo meter rendering in AudioTrack

**File:** `rollplay/app/audio_management/components/AudioTrack.js`

**Props change:** `config.analyserNode` becomes `config.analysers` (`{ left, right }`)

**New DOM structure** — two thin bars stacked above the volume slider:
```jsx
{/* Stereo meter bars */}
<div className="flex flex-col gap-[2px] px-1">
  <div className="flex items-center gap-1">
    <span className="text-[9px] text-gray-500 w-2">L</span>
    <div ref={meterLRef} className="h-[4px] flex-1 rounded-sm bg-gray-700" />
  </div>
  <div className="flex items-center gap-1">
    <span className="text-[9px] text-gray-500 w-2">R</span>
    <div ref={meterRRef} className="h-[4px] flex-1 rounded-sm bg-gray-700" />
  </div>
</div>
```

**RAF loop update:** Read from both analysers, compute `rmsToPct()` for each, apply gradient fill to `meterLRef` and `meterRRef` independently. The volume slider gets a clean static background (no more gradient fill from RMS).

### 4. Expand Channel Cue grid to 6 columns

**File:** `rollplay/app/audio_management/components/AudioMixerPanel.js`

**a)** Change header grid from `grid-cols-4` → `grid-cols-6`. Add two new column headers at the start: `Play` | `Stop`

**b)** Change tracks grid from `grid-cols-4` → `grid-cols-6`. Add two new columns:

**Play/Pause column:** Per-channel button showing ▶ (when stopped/paused) or ⏸ (when playing/transitioning). Calls existing `handlePlay(channel)` / `handlePause(channel)`. Disabled when no file loaded.

**Stop column:** Per-channel ⏹ button. Calls existing `handleStop(channel)`. Disabled when already stopped.

Existing handlers already exist in AudioMixerPanel:
- `handlePlay` (line 486)
- `handlePause` (line 553)
- `handleStop` (line 577)

### 5. Add mute gain nodes + solo/mute state

**File:** `rollplay/app/audio_management/hooks/useUnifiedAudio.js`

**a)** Add ref: `const remoteTrackMuteGainsRef = useRef({});`

**b)** In `initializeWebAudio()`, insert mute gain node between track gain and stereo splitter:
```
Full chain: gainNode → muteGainNode → splitter → [AnalyserL, AnalyserR] → merger → masterGain
```

Meter reflects what the audience hears (silent when muted/not-soloed) — correct DAW behavior.

**c)** Add `mutedTracks`/`soloedTracks` state + `setTrackMuted`/`setTrackSoloed` functions.

**d)** Add `useEffect` that recomputes `muteGainNode.gain.value` whenever mute/solo sets change:
```javascript
if (anySoloed) effectiveGain = isSoloed ? 1.0 : 0.0;  // Solo overrides mute
else            effectiveGain = isMuted ? 0.0 : 1.0;
```

**e)** Export new state and functions from hook return.

### 6. Solo/Mute UI in AudioTrack

**File:** `rollplay/app/audio_management/components/AudioTrack.js`

Add Solo (S) and Mute (M) toggle buttons to each AudioTrack:
- **Solo:** Yellow (`bg-yellow-500 text-black`) when active, gray when inactive
- **Mute:** Red (`bg-red-600 text-white`) when active, gray when inactive
- New props: `isMuted`, `isSoloed`, `onMuteToggle`, `onSoloToggle`

### 7. WebSocket handlers for mute/solo

**File:** `rollplay/app/audio_management/hooks/webSocketAudioEvents.js`

Add `mute` and `solo` cases to the `processOperation` switch in `handleRemoteAudioBatch` (after line 264). Add `setTrackMuted`/`setTrackSoloed` to the destructured params (line 113).

### 8. Thread through page.js

**File:** `rollplay/app/game/page.js`

Destructure `mutedTracks`, `soloedTracks`, `setTrackMuted`, `setTrackSoloed` from `useUnifiedAudio()`. Pass to AudioMixerPanel as props. Add `setTrackMuted`/`setTrackSoloed` to `gameContext` for WebSocket handler access.

### 9. Backend: accept mute/solo operations

**File:** `api-game/websocket_handlers/websocket_events.py`

**a)** Add `"mute"` and `"solo"` to `valid_operations` list (line 817)

**b)** Add operation summaries for logging (after line 874)

**c)** Add MongoDB persistence — store `muted`/`soloed` booleans in channel audio state (after line 942)

### 10. Update AudioMixerPanel prop threading

**File:** `rollplay/app/audio_management/components/AudioMixerPanel.js`

- Pass `config.analysers` (stereo `{ left, right }` object) instead of `config.analyserNode` to AudioTrack
- Add `mutedTracks`/`soloedTracks` state and `handleMuteToggle`/`handleSoloToggle` handlers
- Pass mute/solo props to each AudioTrack
- Send `mute`/`solo` operations via `sendRemoteAudioBatch` for broadcast

---

## Audio chain diagram

```
BufferSource → trackGainNode → muteGainNode → ChannelSplitter(2)
               (volume fader)  (solo/mute gate)       │
                                                ┌─────┴─────┐
                                             ch0 [L]     ch1 [R]
                                                │            │
                                           AnalyserL    AnalyserR
                                                │            │
                                                └─────┬──────┘
                                               ChannelMerger(2)
                                                      │
                                                 MasterGain → Destination
```

---

## Key files

| File | Change |
|------|--------|
| `rollplay/app/audio_management/hooks/useUnifiedAudio.js` | Stereo split (splitter/merger + dual analysers), mute gain nodes, solo/mute state |
| `rollplay/app/audio_management/components/AudioTrack.js` | Stereo L/R meter bars above slider, dB-scaled RMS, solo/mute buttons, remove slider gradient hack |
| `rollplay/app/audio_management/components/AudioMixerPanel.js` | 6-col cue grid, stereo analyser prop threading, mute/solo state + handlers |
| `rollplay/app/audio_management/hooks/webSocketAudioEvents.js` | Mute/solo batch operation handlers |
| `rollplay/app/game/page.js` | Thread mute/solo state/functions to panel + gameContext |
| `api-game/websocket_handlers/websocket_events.py` | Accept mute/solo operations, MongoDB persistence |

## Solo/Mute behavior

- **Mute (M):** Toggle per track. Muted track's `muteGainNode.gain = 0`. Track keeps playing (stays in sync). Visual: red button.
- **Solo (S):** Toggle per track. When ANY track is soloed, all non-soloed tracks get `muteGainNode.gain = 0`. Visual: yellow button.
- **Solo overrides Mute:** If a track is both Soloed and Muted, it plays (Solo wins).
- **Broadcast:** All mute/solo changes go via WebSocket → server → all clients.
- **Late join:** MongoDB stores muted/soloed flags; `syncAudioState` restores them.

## Verification

1. Stereo L/R meter bars animate independently above the volume slider
2. Meters respond to true RMS values on a dB scale (no artificial inflation) — quiet audio shows modest movement, loud audio fills the meter naturally
3. Color transitions: green → yellow → red at appropriate dB thresholds
4. Meters go silent when track is muted (signal passes through mute gain before splitter)
5. Volume slider has clean static background (no gradient fill)
6. Play/Pause and Stop columns work in 6-column cue grid
7. Mute (M) silences a track for all players, track keeps playing, meter goes flat
8. Solo (S) on one track mutes all others for all players
9. Multiple solos: only soloed tracks audible
10. Solo overrides Mute: soloed+muted track is audible
11. Un-solo all: all unmuted tracks resume
12. Late-joining player sees correct mute/solo state from MongoDB

---

# Phase 2: Full Effects State Persistence — WebSocket, MongoDB, and ETL

## Context

Channel effects (EQ, reverb, mix levels, reverb presets) lose state on page refresh and across sessions. The system was built for V1 (boolean toggles only) but V2 added mix levels (`hpf_mix`, `lpf_mix`, `reverb_mix`), reverb presets (`reverb_preset`), and `eq` as a master bypass. These new fields are partially wired — they work in-memory but aren't fully persisted through MongoDB or PostgreSQL.

### What's broken

| Issue | Impact |
|-------|--------|
| `eq` not in AudioEffects model or backend | Page refresh loses EQ strip visibility AND individual HPF/LPF config |
| EQ toggle zeros out `hpf`/`lpf` flags | Re-enabling EQ doesn't restore which filters were active |
| `reverb_preset` missing from frontend `channelEffects` init | Preset not included in initial state broadcasts |
| PostgreSQL has no columns for mix levels, preset, or eq | Cold storage only saves enabled flags — mix levels reset to defaults on session restart |
| ETL out only writes `effect_hpf_enabled` etc. | Mix levels, preset, and eq bypass lost on PauseSession/FinishSession |
| ETL in (`build_effects_for_game`) only sends enabled flags | StartSession restores toggles but defaults all mix levels |
| Frontend load (AudioMixerPanel) only sends enabled flags | Track load broadcasts lack mix levels |

### What works

- MongoDB stores full `AudioEffects` during live sessions (WebSocket effects operations pass through all fields)
- `syncAudioState` correctly calls `applyChannelEffects` with MongoDB state
- Track swap stash/restore in api-game preserves full effects
- `AudioEffects` Pydantic model already has `hpf_mix`, `lpf_mix`, `reverb_mix`, `reverb_preset` fields
- `hpf_mix`/`lpf_mix` values already survive state merges (not zeroed on EQ toggle)

---

## Changes

### P2-1. `eq` as a real persisted master bypass

`eq` is a **master bypass** for pass filters — NOT derived from `hpf || lpf`. When `eq` is off, no filters are applied, but the individual `hpf`/`lpf` enabled flags and mix values are preserved. Re-enabling `eq` restores the exact filter config.

**Shared contract — `rollplay-shared-contracts/shared_contracts/audio.py`:**
- Add `eq: bool = False` to `AudioEffects` model (master bypass for HPF/LPF)

**`BottomMixerDrawer.js`** — Fix `handleToggleSend` for `eq`:
- **Stop zeroing `hpf`/`lpf`** when EQ toggles off. Only toggle the `eq` flag itself
- Current code (lines 82-85) sets `hpf: false, lpf: false` — remove that
- The `eq` field is now sent to backend as part of the effects object (no stripping)

**`useUnifiedAudio.js`** — `applyChannelEffects` respects `eq` bypass:
- Add `eq: false` and `reverb_preset: 'room'` to `channelEffects` init (lines 233-246)
- When processing HPF/LPF in `applyChannelEffects`: check `eq` flag first. If `eq === false`, set both filters to pass-all frequencies (20 Hz / 20 kHz) regardless of individual `hpf`/`lpf` state
- When `eq` toggles back to `true`, re-apply the stored `hpf`/`lpf` + mix values from `channelEffects` state

**`useUnifiedAudio.js`** — `syncAudioState`:
- When syncing from MongoDB, if `eq` field is present, apply it. If absent (old sessions), derive from `hpf || lpf` for backward compat

### P2-2. PostgreSQL: Add mix level, preset, and eq columns

**`api-site/modules/library/model/audio_asset_models.py`** — Add to MusicAsset:
```python
effect_eq_enabled = Column(Boolean, nullable=True)   # master bypass for HPF/LPF
effect_hpf_mix = Column(Float, nullable=True)        # 0.0-1.0
effect_lpf_mix = Column(Float, nullable=True)        # 0.0-1.0
effect_reverb_mix = Column(Float, nullable=True)     # 0.0-1.0
effect_reverb_preset = Column(String, nullable=True) # 'room'|'hall'|'cathedral'
```

**Alembic migration**: `alembic revision --autogenerate -m "add eq bypass, effect mix levels, and reverb preset to music assets"`

### P2-3. Asset domain: Full effects in `build_effects_for_game`

**`api-site/modules/library/domain/music_asset_aggregate.py`** — Update `build_effects_for_game()`:
```python
def build_effects_for_game(self) -> AudioEffects:
    return AudioEffects(
        eq=self.effect_eq_enabled or False,
        hpf=self.effect_hpf_enabled or False,
        hpf_mix=self.effect_hpf_mix if self.effect_hpf_mix is not None else 0.5,
        lpf=self.effect_lpf_enabled or False,
        lpf_mix=self.effect_lpf_mix if self.effect_lpf_mix is not None else 0.5,
        reverb=self.effect_reverb_enabled or False,
        reverb_mix=self.effect_reverb_mix if self.effect_reverb_mix is not None else 0.5,
        reverb_preset=self.effect_reverb_preset or 'room',
    )
```

### P2-4. ETL out: Save full effects on PauseSession/FinishSession

**`api-site/modules/session/application/commands.py`** — In `_extract_and_sync_game_state()`, expand the effects sync:
```python
if effects and isinstance(asset, MusicAsset):
    config_kwargs["effect_eq_enabled"] = effects.eq
    config_kwargs["effect_hpf_enabled"] = effects.hpf
    config_kwargs["effect_hpf_mix"] = effects.hpf_mix
    config_kwargs["effect_lpf_enabled"] = effects.lpf
    config_kwargs["effect_lpf_mix"] = effects.lpf_mix
    config_kwargs["effect_reverb_enabled"] = effects.reverb
    config_kwargs["effect_reverb_mix"] = effects.reverb_mix
    config_kwargs["effect_reverb_preset"] = effects.reverb_preset
```

### P2-5. Frontend load: Include full effects in broadcast

**`rollplay/app/audio_management/components/AudioMixerPanel.js`** — In `handleAssetSelected`:
```javascript
const effects = {
  eq: asset.effect_eq_enabled || false,
  hpf: asset.effect_hpf_enabled || false,
  hpf_mix: asset.effect_hpf_mix ?? DEFAULT_EFFECTS.hpf.mix,
  lpf: asset.effect_lpf_enabled || false,
  lpf_mix: asset.effect_lpf_mix ?? DEFAULT_EFFECTS.lpf.mix,
  reverb: asset.effect_reverb_enabled || false,
  reverb_mix: asset.effect_reverb_mix ?? DEFAULT_EFFECTS.reverb.mix,
  reverb_preset: asset.effect_reverb_preset || 'room',
};
```

Also update `loadAssetIntoChannel` in `useUnifiedAudio.js` to handle full effects from load operations.

### P2-6. API schema: Expose new fields in asset responses

**`api-site/modules/library/api/schemas.py`** — Add eq, mix level, and preset fields to the MusicAsset response schema.

---

## Phase 2 Key Files

| File | Change |
|------|--------|
| `rollplay-shared-contracts/shared_contracts/audio.py` | Add `eq: bool = False` to AudioEffects |
| `rollplay/app/audio_management/hooks/useUnifiedAudio.js` | `eq`/`reverb_preset` init, `eq` bypass in `applyChannelEffects`, full effects in load |
| `rollplay/app/audio_management/components/BottomMixerDrawer.js` | Stop zeroing `hpf`/`lpf` on EQ toggle — only toggle `eq` flag |
| `rollplay/app/audio_management/components/AudioMixerPanel.js` | Include full effects (incl. `eq`) in load broadcast |
| `api-site/modules/library/model/audio_asset_models.py` | Add `eq_enabled`, mix level + preset columns |
| `api-site/modules/library/domain/music_asset_aggregate.py` | Full effects incl. `eq` in `build_effects_for_game()` |
| `api-site/modules/session/application/commands.py` | Save full effects incl. `eq` in ETL out |
| `api-site/modules/library/api/schemas.py` | Expose new fields in asset response |
| Alembic migration | New columns on music_assets table |

## Phase 2 Verification

1. **EQ bypass round-trip**: Enable EQ → enable HPF only → toggle EQ off → toggle EQ on → HPF is re-enabled, LPF stays disabled
2. **Page refresh**: Enable EQ + reverb with custom mix levels → refresh → all effects restored including EQ strip visibility, individual filter states, mix levels, and reverb preset
3. **Late joiner**: Second client joins → sees correct effects state including EQ bypass and filter config
4. **Session pause/resume**: Pause session → resume → effects fully restored with mix levels and EQ bypass state
5. **Track swap**: Load track A with effects → swap to track B → swap back to A → effects restored from stash
6. **Cold start**: Finish session → start new session with same campaign → asset-level defaults include eq, mix levels, preset
7. **Build passes**, no Pydantic validation errors
