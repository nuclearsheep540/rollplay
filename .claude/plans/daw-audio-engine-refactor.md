# Audio Workstation — Engine Refactor + DAW

## Context

Media Foundation V1 has 3 of 4 features shipped. **F4 (Loop Points + Waveform + BPM)** is the final piece. The Workshop infrastructure is fully delivered — Map Config and Image Config tools work, the "Audio Workstation" tile exists but is disabled.

The current audio system (`useUnifiedAudio`, ~1800 lines) is a monolith that mixes Web Audio API, React state, WebSocket integration, network sync, and hardcoded channel counts. Before building the DAW, we refactor this into a clean, reusable audio engine with proper separation of concerns.

**Two deliverables, sequenced:**
1. **Audio Engine refactor** — extract a reusable, class-based engine from `useUnifiedAudio`
2. **Workshop DAW** — lightweight audio workstation built on the new engine

---

## Part A: Audio Engine

### Design Decisions

- **ES6 Classes** — `AudioEngine`, `AudioChannel`, `EffectChain`, `AudioEffect` subclasses
- **Presets with overrides** — engine is capability-based; `CHANNEL_PRESETS.BGM` and `CHANNEL_PRESETS.SFX` are convenience constants, not built-in types. Domain rules (SFX can't loop) enforced in React hooks, not the engine
- **Simple callbacks** (`.on()` / `.off()` / `.once()`) — consistent with Howler, Tone.js, WaveSurfer
- **Audio unlock in engine** — `engine.unlock()` handles mobile/desktop strategies, queues ops before unlock, emits `'ready'`
- **Pure JS, no React** — engine has zero React dependencies. React hooks are adapters on top

- **Adapter layer** — explicit mappers decouple backend shapes from engine config. The engine has its own configuration format and never sees backend field names. Adapters (`audio_management/adapters/`) are the only code that knows both sides.

### Directory Structure

```
rollplay/app/audio_management/engine/
├── AudioEngine.js        — Core: context, master chain, buffer cache, channel registry, unlock
├── AudioChannel.js       — Single channel: playback, volume, loop, fade, time tracking
├── EffectChain.js        — Signal routing: inline inserts + send/return slots
├── effects/
│   ├── AudioEffect.js    — Base class (interface contract)
│   ├── HighPassFilter.js  — BiquadFilter, log frequency mapping
│   ├── LowPassFilter.js   — BiquadFilter, log frequency mapping
│   └── ConvolutionReverb.js — ConvolverNode, impulse response, presets, wet/dry
├── StereoMeter.js        — Stereo metering chain
├── EventEmitter.js       — Lightweight .on/.off/.once mixin (~15 lines)
├── presets.js            — CHANNEL_PRESETS, REVERB_PRESETS, DEFAULT_EFFECTS
├── constants.js          — Frequency mappings, ramp times
└── index.js              — Barrel export

rollplay/app/audio_management/adapters/
├── assetAdapter.js        — REST API ↔ engine config mappers
├── channelStateAdapter.js — AudioChannelState (WebSocket/MongoDB) ↔ engine config
└── index.js               — Barrel export
```

### Class APIs

#### EventEmitter (mixin)
```
Lightweight event system (~15 lines). Mixed into all engine classes.
  on(event, callback)     — register listener
  off(event, callback)    — remove listener
  once(event, callback)   — register one-shot listener
  emit(event, data)       — dispatch to all registered listeners
```

#### AudioEngine
```
Core orchestrator. Owns AudioContext, master output chain, buffer cache, channel registry.

Lifecycle:
  constructor(options?)           — options: { sampleRate?, latencyHint? }
  async init()                    — creates AudioContext (suspended), master chain
  async unlock()                  — mobile/desktop detection + unlock strategy
  destroy()                       — closes context, removes all channels, cleanup

State machine: 'suspended' → 'ready' → 'closed'
  get state                       — current engine state
  get context                     — raw AudioContext (for WaveSurfer integration)

Master chain:
  Channels → masterGain (broadcast) → metering → localGain (per-client) → destination
  setMasterVolume(value)          — broadcast gain (DM-controlled)
  setLocalVolume(value)           — per-client listening gain
  getMasterAnalysers()            — { left, right } AnalyserNodes

Channel management:
  createChannel(id, config)       — returns AudioChannel instance
    config: { effects: string[], loopDefault: bool, metering: bool }
  getChannel(id)                  — lookup by id
  removeChannel(id)               — disconnect + cleanup
  getChannelIds()                 — list active channel ids
  get channels                    — Map of id → AudioChannel

Buffer management:
  async loadBuffer(url, cacheKey?) — fetch + decode, cache by key
  getBuffer(cacheKey)              — retrieve from cache
  hasBuffer(cacheKey)              — check cache
  clearBuffer(cacheKey)            — evict one
  clearAllBuffers()                — evict all

Events:
  'ready'        — engine unlocked and operational
  'statechange'  — state machine transition (detail: { from, to })
```

#### AudioChannel
```
Single audio channel with playback, effects, volume, loop, and metering.

Constructor: (engine, id, config)
  config: { effects: string[], loopDefault: bool, metering: bool }

Playback:
  async play(buffer, options?)     — options: { offset?, volume?, fade?, fadeDuration? }
    buffer: AudioBuffer (from engine.loadBuffer())
  stop(options?)                   — options: { fade?, fadeDuration? }
  pause()                          — preserves playhead position
  async resume(options?)           — from paused position; options: { fade?, fadeDuration? }

State (read-only):
  get playbackState                — 'stopped' | 'playing' | 'paused'
  get currentTime                  — current playhead position (seconds)
  get duration                     — buffer duration (seconds)
  get isPlaying                    — shorthand

Volume:
  setVolume(value)                 — channel fader (0.0–1.3)
  get volume

Loop:
  setLoopMode(mode)                — 'off' | 'full' | 'region'
  setLoopRegion(start, end)        — set region boundaries (seconds)
  clearLoopRegion()                — remove region
  get loopMode
  get loopRegion                   — { start, end } or null

Mute / Solo:
  setMuted(bool)
  setSoloed(bool)
  get muted / get soloed

Effects:
  get effectChain                  — EffectChain instance

Metering:
  getAnalysers()                   — { left, right } or null (if metering disabled)

Events:
  'ended'       — non-looping track finished (detail: { channelId })
  'timeupdate'  — periodic position update (detail: { currentTime, duration, remaining })
  'statechange' — playback state changed (detail: { from, to })
  'loopiteration' — loop boundary crossed (detail: { iteration })

Cleanup:
  destroy()
```

#### EffectChain
```
Manages the signal routing for a channel's effects.

Constructor: (ctx, config)
  config: { effects: string[], outputNode, impulseBuffer? }

  Creates the chain based on effect names:
    'hpf' → HighPassFilter (inline insert)
    'lpf' → LowPassFilter (inline insert)
    'reverb' → ConvolutionReverb (send/return)
  
  Signal path:
    inputNode ��� [inline insert 1] → [inline insert 2] → ... → postInsertNode
      → gainNode (channel fader)
      → [send 1 wet] → ... → outputNode
      → [send 2 wet] → ... → outputNode

Routing:
  get inputNode                    — connect sources here
  
Effect management:
  getEffect(name)                  — returns AudioEffect instance
  hasEffect(name)                  — check if registered
  
Batch apply:
  applyEffects(state)              — { hpf: true, hpf_mix: 0.7, reverb: true, ... }
  
Individual control:
  setEffectEnabled(name, bool)
  setEffectMix(name, value)
  setEffectParam(name, param, value)
  
Bypass:
  setBypass(bool)                  — bypass all effects (pass-through)
  get bypassed

Cleanup:
  destroy()
```

#### AudioEffect (base class)
```
Interface contract for all effects. Subclasses implement the audio processing.

Constructor: (ctx, options?)

Properties:
  get name                         — 'hpf' | 'lpf' | 'reverb' | etc.
  get type                         — 'insert' | 'send'
  get enabled
  get mix                          — 0.0–1.0 (or 1.3 for reverb)

Wiring (called by EffectChain):
  connect(inputNode, outputNode)   — wire into chain
  disconnect()                     — remove from chain
  
Control:
  setEnabled(bool)                 — enable/disable (insert: pass-all freq; send: 0 wet gain)
  setMix(value)                    — set mix/frequency level
  setParam(name, value)            — effect-specific params

Cleanup:
  destroy()
```

#### HighPassFilter extends AudioEffect
```
type: 'insert'
Nodes: BiquadFilterNode (highpass, Q=0.707)
Enabled: frequency set via log mapping (20Hz–5000Hz)
Disabled: frequency = 20Hz (pass-all)
Mix: maps 0.0–1.0 → 20Hz–5000Hz via logarithmic curve
Ramp: linearRampToValueAtTime, 20ms
```

#### LowPassFilter extends AudioEffect
```
type: 'insert'
Nodes: BiquadFilterNode (lowpass, Q=0.707)
Enabled: frequency set via log mapping (200Hz–20kHz)
Disabled: frequency = 20000Hz (pass-all)
Mix: maps 0.0–1.0 → 200Hz–20kHz via logarithmic curve (inverted: up = brighter)
Ramp: linearRampToValueAtTime, 20ms
```

#### ConvolutionReverb extends AudioEffect
```
type: 'send'
Nodes: ConvolverNode → makeupGain (3x) → wetGain → sendMuteGain
Impulse response: generated at runtime (exponentially decaying stereo white noise)
Presets: { room: {0.3, 1.0}, hall: {0.6, 1.5}, cathedral: {1.0, 0.3} }
setParam('preset', name): regenerates impulse buffer on ConvolverNode
Enabled: wetGain = mix level
Disabled: wetGain = 0.0
Ramp: linearRampToValueAtTime, 20ms
```

#### StereoMeter
```
Reusable stereo metering chain.
  constructor(ctx)
  get inputNode    — GainNode (channelCount=2, explicit, speakers)
  get outputNode   — ChannelMerger
  get analyserL    — AnalyserNode (fftSize=256, smoothing=0.8)
  get analyserR    — AnalyserNode (fftSize=256, smoothing=0.8)
  destroy()
```

#### presets.js
```javascript
export const CHANNEL_PRESETS = {
  BGM: { effects: ['hpf', 'lpf', 'reverb'], loopDefault: true, metering: true },
  SFX: { effects: [], loopDefault: false, metering: false },
};

export const REVERB_PRESETS = {
  room: { duration: 0.3, decay: 1.0 },
  hall: { duration: 0.6, decay: 1.5 },
  cathedral: { duration: 1.0, decay: 0.3 },
};

export const DEFAULT_EFFECTS = {
  hpf: { enabled: false, mix: 0.7 },
  lpf: { enabled: false, mix: 0.7 },
  reverb: { enabled: false, mix: 0.6, preset: 'room' },
};
```

### Unlock Flow (in AudioEngine)

```
State machine: 'suspended' → 'ready' → 'closed'

init():
  - Creates AudioContext (starts in 'suspended' on most browsers)
  - Builds master chain (masterGain → metering → localGain → destination)
  - Can decode buffers while suspended (loadBuffer works before unlock)
  - State: 'suspended'

unlock():
  - Detects strategy from context state:
    - context.state === 'running' → desktop (context already live)
    - context.state === 'suspended' → mobile/iOS
  
  - Desktop strategy:
    - Resume if somehow suspended
    - State → 'ready'
  
  - Mobile strategy:
    - Play silent MP3 via HTML5 Audio (activates iOS audio session)
    - Close stale AudioContext
    - Create fresh AudioContext within user gesture
    - Rebuild master chain
    - Rebuild all channel effect chains (channels survive, nodes are recreated)
    - State → 'ready'
  
  - After unlock:
    - Drain pending operations (play calls that arrived before unlock)
    - Emit 'ready'

Pending operation queue:
  - play() calls before unlock are queued
  - On unlock, queue is drained in order
  - Channel creation works before unlock (creates data structures, nodes deferred)
```

### Adapter Layer (Backend ↔ Engine Decoupling)

The engine has its own config format. The backend has its own schemas. Adapters translate at each boundary.

#### assetAdapter.js — REST API ↔ Engine

```
assetToEngineConfig(apiResponse) → {
  effects: {
    hpf: { enabled, mix },
    lpf: { enabled, mix },
    reverb: { enabled, mix, preset }
  },
  loop: { mode, start, end },
  volume, bpm
}

engineToApiPayload(engineConfig) → {
  loop_start, loop_end, bpm, loop_mode,
  effect_hpf_enabled, effect_hpf_mix, ...
}
```

**assetToEngineConfig**: Maps flat backend fields (`effect_hpf_enabled`, `effect_hpf_mix`, `loop_start`, `loop_mode`) into engine's structured config. Used by Workshop preview (`useWorkshopPreview.initFromAsset()`).

**engineToApiPayload**: Maps engine state back to flat fields for `PATCH /api/library/{id}/audio-config`. Used by Workshop save.

#### channelStateAdapter.js — AudioChannelState (MongoDB/WebSocket) ↔ Engine

```
channelStateToEngineConfig(channelState) → {
  effects: { hpf: { enabled, mix }, ... },
  loop: { mode, start, end },
  volume, looping, playbackState, startedAt, pausedElapsed
}

engineConfigToChannelState(engineConfig) → {
  effects: AudioEffects shape,
  looping, loop_mode, loop_start, loop_end, volume, ...
}
```

**channelStateToEngineConfig**: Maps `AudioChannelState` contract (from `syncAudioState`, initial_state WebSocket message) into engine config. Used by `useUnifiedAudio` during late-joiner sync.

**engineConfigToChannelState**: Maps engine state back to contract shape for WebSocket broadcast operations. Used by `useUnifiedAudio` when sending `remote_audio_batch`.

#### Where adapters are consumed

| Consumer | Adapter function | When |
|----------|-----------------|------|
| `useWorkshopPreview` | `assetToEngineConfig` | Loading asset defaults into preview channel |
| Workshop save button | `engineToApiPayload` | PATCH audio-config with current state |
| `useUnifiedAudio.syncAudioState` | `channelStateToEngineConfig` | Late-joiner sync from MongoDB |
| `useUnifiedAudio.handleRemoteAudioBatch` | `channelStateToEngineConfig` | Processing WebSocket events |
| `useUnifiedAudio` playback calls | `engineConfigToChannelState` | Sending loop/effect state via WebSocket |

### useUnifiedAudio Migration

After the engine is built, `useUnifiedAudio` is refactored to use it. The hook becomes a **React adapter** that:

1. Creates an `AudioEngine` instance on mount
2. Creates 6 BGM channels (`CHANNEL_PRESETS.BGM`) and 9 SFX slots
3. Bridges engine events to React state (`remoteTrackStates`, `channelEffects`, etc.)
4. Handles game-session-specific concerns:
   - WebSocket batch event handling (`handleRemoteAudioBatch`)
   - Batch state accumulator (startStateBatch/flushStateBatch)
   - Network sync (started_at offset compensation for late joiners)
   - Server state sync (syncAudioState from initial_state)
   - Visibility recovery (resume after tab switch/phone lock)
   - Local audio (HTML5 dice/combat sounds — stays in hook, not engine)
   - SFX soundboard state management

**What moves to engine:**
- AudioContext creation + lifecycle → `AudioEngine`
- Buffer loading + caching → `AudioEngine.loadBuffer()`
- Per-channel gain/mute/metering nodes → `AudioChannel`
- Effect chain creation (HPF/LPF/reverb) → `EffectChain` + `AudioEffect` subclasses
- Effect application (frequency ramping, wet/dry) → `AudioEffect.setEnabled/setMix`
- Playback (source.start/stop, loop config) → `AudioChannel.play/stop/pause/resume`
- Time tracking (rAF loop) → `AudioChannel` (emits 'timeupdate')
- Fade transitions → `AudioChannel.play/stop({ fade, fadeDuration })`
- Stereo metering chains → `StereoMeter`
- Impulse response generation → `ConvolutionReverb`
- Frequency mapping functions → `constants.js`
- Audio unlock (mobile/desktop) → `AudioEngine.unlock()`

**What stays in `useUnifiedAudio`:**
- React state (remoteTrackStates, channelEffects, sfxSlots, mutedChannels, soloedChannels)
- WebSocket event handler integration
- Batch state accumulator
- Network sync (started_at compensation — consumes engine's play with offset)
- Visibility recovery (calls engine's resume/play on visibility change)
- Server state sync
- SFX soundboard React state
- Local audio (HTML5)
- Master volume persistence (localStorage)
- setClearPendingOperationCallback

**Migration approach:**
The refactored `useUnifiedAudio` instantiates the engine and subscribes to events:

```javascript
// Simplified sketch
const useUnifiedAudio = () => {
  const engineRef = useRef(null);
  
  useEffect(() => {
    const engine = new AudioEngine();
    engine.init();
    engineRef.current = engine;
    
    // Create BGM channels
    ['A','B','C','D','E','F'].forEach(ch => {
      const channel = engine.createChannel(`audio_channel_${ch}`, CHANNEL_PRESETS.BGM);
      channel.on('timeupdate', ({ currentTime, duration }) => {
        setRemoteTrackStates(prev => ({
          ...prev,
          [`audio_channel_${ch}`]: { ...prev[`audio_channel_${ch}`], currentTime, duration }
        }));
      });
      channel.on('ended', () => { /* update state to stopped, clear pending ops */ });
    });
    
    return () => engine.destroy();
  }, []);
  
  // playRemoteTrack now delegates to engine
  const playRemoteTrack = async (trackId, audioFile, loop, volume, resumeFromTime, completeTrackState) => {
    const engine = engineRef.current;
    const channel = engine.getChannel(trackId);
    const buffer = await engine.loadBuffer(completeTrackState?.s3_url || `/audio/${audioFile}`, assetId);
    
    // Apply loop mode
    if (completeTrackState?.loop_mode === 'region') {
      channel.setLoopMode('region');
      channel.setLoopRegion(completeTrackState.loop_start, completeTrackState.loop_end);
    } else {
      channel.setLoopMode(loop ? 'full' : 'off');
    }
    
    await channel.play(buffer, { offset: resumeFromTime, volume, fade });
  };
  
  // unlockAudio delegates to engine
  const unlockAudio = () => engineRef.current.unlock();
  
  // ... rest of hook wraps engine methods
};
```

### Engine Build Order

| Step | File | What |
|------|------|------|
| 1 | `EventEmitter.js` | Lightweight .on/.off/.once mixin |
| 2 | `constants.js` | Frequency mappings, ramp times |
| 3 | `presets.js` | CHANNEL_PRESETS, REVERB_PRESETS, DEFAULT_EFFECTS |
| 4 | `StereoMeter.js` | Stereo metering chain class |
| 5 | `effects/AudioEffect.js` | Base class |
| 6 | `effects/HighPassFilter.js` | HPF implementation |
| 7 | `effects/LowPassFilter.js` | LPF implementation |
| 8 | `effects/ConvolutionReverb.js` | Reverb implementation |
| 9 | `EffectChain.js` | Signal routing + effect management |
| 10 | `AudioChannel.js` | Playback + volume + loop + events |
| 11 | `AudioEngine.js` | Core orchestrator + unlock + buffer cache |
| 12 | `engine/index.js` | Barrel export |
| 13 | `adapters/assetAdapter.js` | REST API ↔ engine config mappers |
| 14 | `adapters/channelStateAdapter.js` | AudioChannelState ↔ engine config mappers |
| 15 | `adapters/index.js` | Barrel export |
| 16 | Refactor `useUnifiedAudio.js` | Migrate to use engine + adapters |
| 17 | Verify game audio | All existing functionality works identically |

---

## Part B: Workshop DAW + Backend

### Backend: Schema + Domain + API

#### B.1 Add columns to MusicAssetModel
**File:** `api-site/modules/library/model/music_asset_model.py`
```python
loop_start = Column(Float, nullable=True)       # seconds
loop_end = Column(Float, nullable=True)          # seconds
bpm = Column(Float, nullable=True)               # beats per minute
loop_mode = Column(String, nullable=True)        # "off" | "full" | "region"
```

#### B.2 Alembic migration
```bash
docker exec api-site-dev alembic revision --autogenerate -m "add loop_start loop_end bpm loop_mode to music_assets"
```

#### B.3 Extend MusicAsset aggregate
**File:** `api-site/modules/library/domain/music_asset_aggregate.py`
- Add four dataclass fields (Optional, default None)
- Extend `create()`, `from_base()`, `update_audio_config()`, `get_audio_config()`, `has_audio_config()`
- Extend `build_channel_state_for_game()` to populate loop fields on AudioChannelState
- Validation: `loop_mode` in {None, "off", "full", "region"}, `loop_start >= 0`, `loop_start < loop_end`, `loop_end <= duration`, `bpm > 0`

#### B.4 Update repository
**File:** `api-site/modules/library/repositories/asset_repository.py`
Wire four fields through save, load, and create branches.

#### B.5 Update API schemas
**File:** `api-site/modules/library/api/schemas.py`
Add `loop_start`, `loop_end`, `bpm`, `loop_mode` to `UpdateAudioConfigRequest` + `MediaAssetResponse`.

#### B.6 Update command + endpoint
- `api-site/modules/library/application/commands.py` — wire through `UpdateAudioConfig.execute()` (MusicAsset branch)
- `api-site/modules/library/api/endpoints.py` — pass to command + add to `_to_media_asset_response()`

### Shared Contracts

#### B.7 Extend AudioChannelState
**File:** `rollplay-shared-contracts/shared_contracts/audio.py`
```python
loop_mode: Optional[str] = None
loop_start: Optional[float] = Field(default=None, ge=0)
loop_end: Optional[float] = Field(default=None, ge=0)
```
Keep `looping: bool = True` for backward compat. Add same to `AudioTrackConfig`.

### Frontend: Workshop Audio Workstation

#### B.8 Install wavesurfer.js
```bash
cd rollplay && npm install wavesurfer.js
```

#### B.9 Enable tile + route
- `WorkshopToolNav.js` — `enabled: true` (line 27)
- `WorkshopManager.js` — uncomment audio route (line 13)
- `AssetLibraryManager.js` — add `&from=library` to "Edit Loop Points" link

#### B.10 Route page
**New:** `rollplay/app/workshop/audio-workstation/page.js`
Pattern: `map-config/page.js` — Suspense, URL-driven asset_id, SiteHeader, back button, renders `AudioWorkstationTool`.

#### B.11 TanStack mutation hook
**New:** `rollplay/app/workshop/hooks/useUpdateAudioConfig.js`
Pattern: `useUpdateGridConfig.js` — PATCH audio-config, invalidate ['assets'], surface 409.

#### B.12 BPM detection utility
**New:** `rollplay/app/workshop/utils/detectBpm.js`
Client-side onset energy autocorrelation. `async detectBpm(AudioBuffer) → number | null`.
Returns null for ambient/drone tracks (no clear beat).

#### B.13 Workshop preview hook
**New:** `rollplay/app/workshop/hooks/useWorkshopPreview.js`

Uses the **new AudioEngine** — creates a single-channel preview:
```javascript
const useWorkshopPreview = () => {
  const engineRef = useRef(null);
  const channelRef = useRef(null);
  
  const init = async () => {
    const engine = new AudioEngine();
    await engine.init();
    await engine.unlock(); // Workshop page has user interaction by this point
    const channel = engine.createChannel('preview', CHANNEL_PRESETS.BGM);
    engineRef.current = engine;
    channelRef.current = channel;
  };
  
  const initFromAsset = (asset) => {
    // Apply asset's saved effect defaults to the preview channel
    channelRef.current.effectChain.applyEffects({
      eq: !!(asset.effect_hpf_enabled || asset.effect_lpf_enabled),
      hpf: asset.effect_hpf_enabled ?? false,
      hpf_mix: asset.effect_hpf_mix ?? 0.7,
      lpf: asset.effect_lpf_enabled ?? false,
      lpf_mix: asset.effect_lpf_mix ?? 0.7,
      reverb: asset.effect_reverb_enabled ?? false,
      reverb_mix: asset.effect_reverb_mix ?? 0.6,
      reverb_preset: asset.effect_reverb_preset ?? 'room',
    });
  };
  
  // WaveSurfer integration:
  // WaveSurfer decodes audio into its own AudioBuffer.
  // We also load the buffer into our engine for preview playback through the effect chain.
  // WaveSurfer handles visualization, engine handles audition.
  
  return { init, initFromAsset, engine: engineRef, channel: channelRef, destroy };
};
```

#### B.14 AudioWorkstationTool component
**New:** `rollplay/app/workshop/components/AudioWorkstationTool.js`

Pattern: `MapGridTool.js` — fetch asset by ID, local draft state, sidebar controls.

Layout:
```
┌──────────────────────────────────────────┬──────────────────┐
│ Waveform (WaveSurfer)                    │ Controls (w-80)  │
│ [====| loop-in >>>>>> loop-out |====]    │ Loop Mode        │
│                                          │ BPM              │
│ Transport: [Play] [Pause] timeline       │ Loop Region      │
│                                          │ [Save] [Reset]   │
└──────────────────────────────────────────┴──────────────────┘
```

- WaveSurfer: imperative API, `RegionsPlugin` for draggable loop region
- Preview playback: `useWorkshopPreview` routes through engine effect chain
- BPM: "Detect" button calls `detectBpm(wavesurfer.getDecodedData())`
- Save: `useUpdateAudioConfig.mutateAsync({ assetId, audioConfig })`

#### B.15 AudioWorkstationControls component
**New:** `rollplay/app/workshop/components/AudioWorkstationControls.js`

Sidebar sections:
1. **Loop Mode** — Off / Full / Region selector (Region disabled when no markers)
2. **BPM** — Detected value, "Detect" button, manual input. Null is valid.
3. **Loop Region** — Start/End in mm:ss.ms, "Clear Region" button
4. **Save / Reset**

### Game-Side Integration

#### B.16 Region looping in useUnifiedAudio
Already handled by engine migration — `AudioChannel.setLoopMode('region')` + `setLoopRegion(start, end)` uses native `source.loopStart`/`source.loopEnd`.

#### B.17 Three-state loop toggle
- `VerticalChannelStrip.js` — cycle OFF → FULL → REGION → OFF
- `BottomMixerDrawer.js` — send `loop_mode` in batch operation

#### B.18 api-game WebSocket handler
**File:** `api-game/websocket_handlers/websocket_events.py`
Extend `remote_audio_batch` to pass `loop_mode`, `loop_start`, `loop_end`.

---

## File Summary

### New Files — Engine + Adapters (15)
| File | Purpose |
|------|---------|
| `audio_management/engine/EventEmitter.js` | Lightweight .on/.off/.once mixin |
| `audio_management/engine/constants.js` | Frequency mappings, ramp times |
| `audio_management/engine/presets.js` | CHANNEL_PRESETS, REVERB_PRESETS |
| `audio_management/engine/StereoMeter.js` | Metering chain class |
| `audio_management/engine/effects/AudioEffect.js` | Base effect class |
| `audio_management/engine/effects/HighPassFilter.js` | HPF implementation |
| `audio_management/engine/effects/LowPassFilter.js` | LPF implementation |
| `audio_management/engine/effects/ConvolutionReverb.js` | Reverb implementation |
| `audio_management/engine/EffectChain.js` | Signal routing |
| `audio_management/engine/AudioChannel.js` | Channel class |
| `audio_management/engine/AudioEngine.js` | Core engine + unlock |
| `audio_management/engine/index.js` | Barrel export |
| `audio_management/adapters/assetAdapter.js` | REST API ↔ engine config |
| `audio_management/adapters/channelStateAdapter.js` | AudioChannelState ↔ engine config |
| `audio_management/adapters/index.js` | Barrel export |

### New Files — DAW (6)
| File | Purpose |
|------|---------|
| `workshop/audio-workstation/page.js` | Route page |
| `workshop/components/AudioWorkstationTool.js` | Main DAW component |
| `workshop/components/AudioWorkstationControls.js` | Sidebar controls |
| `workshop/hooks/useUpdateAudioConfig.js` | TanStack mutation |
| `workshop/hooks/useWorkshopPreview.js` | Preview via engine |
| `workshop/utils/detectBpm.js` | BPM detection |

### New Files — Backend (1)
| File | Purpose |
|------|---------|
| `api-site/alembic/versions/xxxx_add_loop_fields.py` | Migration (autogenerated) |

### Modified Files (10)
| File | Change |
|------|--------|
| `audio_management/hooks/useUnifiedAudio.js` | Refactor to use engine classes |
| `api-site/modules/library/model/music_asset_model.py` | 4 new columns |
| `api-site/modules/library/domain/music_asset_aggregate.py` | 4 fields + validation + ETL |
| `api-site/modules/library/repositories/asset_repository.py` | Wire new fields |
| `api-site/modules/library/api/schemas.py` | Extend request + response |
| `api-site/modules/library/application/commands.py` | Wire UpdateAudioConfig |
| `api-site/modules/library/api/endpoints.py` | Wire params + response |
| `rollplay-shared-contracts/shared_contracts/audio.py` | Add loop fields |
| `workshop/components/WorkshopToolNav.js` | Enable audio tile |
| `workshop/components/WorkshopManager.js` | Add audio route |

### Dependencies
- `wavesurfer.js` (npm)

---

## Verification

### Engine verification (after Part A)
1. **Game audio works identically** — all 6 BGM channels play, stop, pause, resume, loop
2. **Effects work** — HPF/LPF frequency sweeps, reverb wet/dry, preset changes, EQ bypass
3. **Mute/Solo** — mute a channel, solo a channel, reverb send respects mute
4. **SFX soundboard** — all 9 slots fire and forget
5. **Audio unlock** — desktop (immediate) and mobile (gesture-based) both work
6. **Late joiner sync** — joining mid-session picks up playing tracks at correct offset
7. **Visibility recovery** — lock phone, unlock, audio resumes
8. **Fade transitions** — fade in/out on play/stop

### DAW verification (after Part B)
9. **Backend round-trip** — PATCH audio-config with loop fields → 200 → GET returns same
10. **Workshop nav** — Audio Workstation tile active, navigates correctly
11. **Waveform** — renders from S3 URL
12. **Loop markers** — drag region → start/end update
13. **BPM detect** — works on rhythmic tracks, returns null on ambient
14. **Effect preview** — Workshop preview plays through engine effect chain with asset defaults
15. **Save** — persists → reload restores
16. **Game integration** — track with region loop works in-game
17. **Loop toggle** — mixer cycles off/full/region
18. **Backward compat** — existing assets work
19. **`npm run build`** — clean
