# Per-Channel Audio Effects (HPF, LPF, Reverb) — Implementation Plan

## Context

Each BGM channel needs an independent effects chain (HPF, LPF, Reverb). For V1, all effect parameters are **hardcoded** — the UI only toggles effects on/off. The Web Audio engine is built with full parameter support so V2's Workshop Audio Editor and Scene Builder can wire up controls (frequency sliders, wet/dry mix, preset selectors) without reworking the graph.

The effects state shape matches V2's `SceneAudioChannel` and `music_assets` column naming for forward compatibility.

---

## Architecture Decisions

### Node Graph — Effects Before Volume
```
BufferSource → [HPF stage] → [LPF stage] → [Reverb stage] → GainNode → AnalyserNode → MasterGain → destination
```
Effects process the dry signal; volume fader comes after. Analyser shows the post-effects signal (what the listener hears).

### Always-Created Nodes with Bypass via Gains
All effect nodes are created at init time. Toggling uses gain value changes (dry=1/wet=0 when off, dry=1-mix/wet=mix when on) with `linearRampToValueAtTime` to avoid clicks. No dynamic connect/disconnect.

### Each Effect Stage Uses Parallel Dry/Wet Routing
```
inputGain ──→ dryGain (1-mix) ──┐
                                 ├──→ outputGain
inputGain ──→ effectNode → wetGain ─┘
```

### Single Nested Ref for All Effect Nodes
```javascript
channelEffectNodesRef.current['audio_channel_A'] = {
  hpf:    { filterNode, dryGain, wetGain, inputGain, outputGain },
  lpf:    { filterNode, dryGain, wetGain, inputGain, outputGain },
  reverb: { convolverNode, dryGain, wetGain, inputGain, outputGain },
}
```

### IR Loading — Lazy with Caching
Impulse response files fetched on first reverb enable, cached in `impulseResponseBuffersRef`. Shared across channels.

### SFX — No Effects
SFX slots have no entry in `channelEffectNodesRef`. The fallback path in `playRemoteTrack` connects directly to the gain node.

---

## Implementation Steps

### 1. Add constants to `types.js`
- `DEFAULT_EFFECTS` — hardcoded params: `{ hpf: { enabled: false, frequency: 200, mix: 0.5 }, lpf: { enabled: false, frequency: 8000, mix: 0.8 }, reverb: { enabled: false, preset: 'hall', mix: 0.3 } }`
- `IMPULSE_RESPONSE_PRESETS` — path map: `{ hall: '/audio/impulse-responses/hall.wav', ... }`

**File:** `rollplay/app/audio_management/types.js`

### 2. Ship impulse response files
- Add 2-3 WAV IR files to `rollplay/public/audio/impulse-responses/` (hall, room, cathedral)
- Use freely licensed IR samples (~100-300KB each)

### 3. Modify `useUnifiedAudio.js` — Core engine changes

**File:** `rollplay/app/audio_management/hooks/useUnifiedAudio.js`

#### 3a. New refs and state (~line 107)
- `channelEffectNodesRef` — nested object per BGM channel
- `impulseResponseBuffersRef` — cached IR AudioBuffers
- `channelEffects` state — per-channel effects state (V2-compatible shape), initialized from `DEFAULT_EFFECTS`

#### 3b. `createEffectStage()` helper
- Creates `inputGain → dryGain/wetGain → outputGain` parallel routing for any effect node
- Returns `{ inputGain, dryGain, wetGain, outputGain, effectNode }`

#### 3c. Modify `initializeWebAudio()` (~line 162-177)
- Inside the `Object.keys(remoteTrackStates).forEach(trackId => {...})` loop, after creating `gainNode` and `analyserNode`:
  - Skip SFX channels (only BGM `audio_channel_*` gets effects)
  - Create HPF (`BiquadFilterNode`, type: 'highpass', freq: 200, Q: 0.707)
  - Create LPF (`BiquadFilterNode`, type: 'lowpass', freq: 8000, Q: 0.707)
  - Create Reverb (`ConvolverNode`, null buffer initially)
  - Chain: `hpfStage.outputGain → lpfStage.inputGain → lpfStage.outputGain → reverbStage.inputGain → reverbStage.outputGain → gainNode`
  - Store in `channelEffectNodesRef.current[trackId]`

#### 3d. Modify `playRemoteTrack()` source connection (~line 459)
- Change `source.connect(remoteTrackGainsRef.current[trackId])` to connect to effects chain input when available:
```javascript
const effectChain = channelEffectNodesRef.current[trackId];
if (effectChain?.hpf?.inputGain) {
  source.connect(effectChain.hpf.inputGain);
} else {
  source.connect(remoteTrackGainsRef.current[trackId]);
}
```

#### 3e. Add `applyChannelEffects(trackId, effects)` function
- Updates Web Audio gain nodes with 20ms ramp (`linearRampToValueAtTime`)
- Lazy-loads IR buffer on first reverb enable
- Sets `ConvolverNode.buffer` before raising wet gain (prevents null-buffer error)
- Updates `channelEffects` React state

#### 3f. Modify `syncAudioState()` (~line 1000)
- After restoring metadata per channel, if `channelState.effects` exists, call `applyChannelEffects(channelId, channelState.effects)`

#### 3g. Cleanup in `cleanupAllAudio()`
- Clear `channelEffectNodesRef.current = {}`
- Clear `impulseResponseBuffersRef.current = {}`

#### 3h. Add to return object
- Export `channelEffects` and `applyChannelEffects`

### 4. Modify `webSocketAudioEvents.js` — Effects sync

**File:** `rollplay/app/audio_management/hooks/webSocketAudioEvents.js`

- Add `applyChannelEffects` to `handleRemoteAudioBatch` destructured dependencies (~line 113)
- Add `case 'effects':` in `processOperation` switch (~line 282):
```javascript
case 'effects':
  if (applyChannelEffects) {
    await applyChannelEffects(trackId, op.effects);
  }
  break;
```

### 5. Create `ChannelEffects.js` — Toggle UI component

**File:** `rollplay/app/audio_management/components/ChannelEffects.js` (NEW)

- Three toggle buttons in a row: HPF, LPF, REVERB
- On = rose accent, Off = gray
- Disabled when no audio file loaded in channel
- Props: `trackId`, `effects`, `onToggleEffect`, `disabled`
- ~50 lines, compact component

### 6. Modify `AudioMixerPanel.js` — Integrate effects

**File:** `rollplay/app/audio_management/components/AudioMixerPanel.js`

- Accept new props: `channelEffects`, `applyChannelEffects`
- Add `handleEffectToggle(trackId, effectType)` handler:
  - Toggles `enabled` flag on the specified effect
  - Calls `applyChannelEffects` locally
  - Sends `sendRemoteAudioBatch([{ trackId, operation: 'effects', effects: updatedEffects }])`
- Render `<ChannelEffects>` below each `<AudioTrack>` in the BGM channels loop (~line 872-915)
- Wrap each channel in `React.Fragment` with key

### 7. Wire props through `game/page.js`

**File:** `rollplay/app/game/page.js`

- Destructure `channelEffects` and `applyChannelEffects` from `useUnifiedAudio()` (~line 810)
- Pass both as props to `<AudioMixerPanel>` (~line 1649)
- Pass `applyChannelEffects` to the WebSocket audio event handlers dependencies

### 8. Backend — Add `effects` operation to batch handler

**File:** `api-game/websocket_handlers/websocket_events.py`

- Add `"effects"` to `valid_operations` list (line 817)
- Add validation: effects operation requires `effects` dict
- Add MongoDB persistence: merge effects into channel state
- Add log summary for effects operations
- No new endpoints — reuses existing `remote_audio_batch` WebSocket event

### 9. Update component index

**File:** `rollplay/app/audio_management/components/index.js`

- Add `export { default as ChannelEffects } from './ChannelEffects';`

---

## Key Files Summary

| File | Action | ~Lines |
|------|--------|--------|
| `rollplay/app/audio_management/types.js` | Modify | +15 |
| `rollplay/public/audio/impulse-responses/*.wav` | Create | 2-3 files |
| `rollplay/app/audio_management/hooks/useUnifiedAudio.js` | Modify | +120 |
| `rollplay/app/audio_management/hooks/webSocketAudioEvents.js` | Modify | +15 |
| `rollplay/app/audio_management/components/ChannelEffects.js` | **Create** | ~50 |
| `rollplay/app/audio_management/components/AudioMixerPanel.js` | Modify | +30 |
| `rollplay/app/game/page.js` | Modify | +5 |
| `rollplay/app/audio_management/components/index.js` | Modify | +1 |
| `api-game/websocket_handlers/websocket_events.py` | Modify | +20 |

---

## State Flow

**DM toggles effect:**
1. Click HPF toggle on Channel A
2. `handleEffectToggle('audio_channel_A', 'hpf')` in AudioMixerPanel
3. Local: `applyChannelEffects()` → updates Web Audio gains + React state
4. Remote: `sendRemoteAudioBatch([{ trackId, operation: 'effects', effects }])`
5. Backend: validates, persists to MongoDB, broadcasts
6. All clients: `handleRemoteAudioBatch` → `applyChannelEffects()` on each client

**Late-joiner:** `syncAudioState()` reads `channelState.effects` from MongoDB → `applyChannelEffects()` per channel

**Session pause/resume:** Effects state travels with `audio_state` dict in MongoDB → PostgreSQL `audio_config` JSONB. No additional ETL changes needed.

---

## Verification

1. Load a BGM track → verify playback works as before (no regression)
2. Toggle HPF on → verify audible bass cut for all connected clients
3. Toggle LPF on → verify audible treble cut (muffled sound) for all clients
4. Toggle Reverb on → verify reverb applied (first toggle may have ~200ms delay for IR load)
5. Toggle all off → verify dry signal restored
6. New player joins mid-session → verify they hear effects applied
7. Pause session → resume → verify effects restored
8. Verify SFX soundboard is unaffected by effects
9. `npm run build` passes
