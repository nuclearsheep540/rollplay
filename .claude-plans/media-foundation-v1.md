# V1: Media Foundation — Revised Plan

## Context

Tabletop Tavern's USP is **storytelling** — giving DMs intuitive tools to leverage rich media (audio, images) to bridge the missing theatrics of face-to-face sessions. The current media implementations (audio mixer, map display, asset library) are proof-of-concept. Before we can build the Scene Builder (V2), the media foundation needs to mature.

V1 delivers four capabilities:
1. **Image loading in game** — Load and display images during live sessions (own tab, own events, independent from maps)
2. **SFX soundboard** — Rework SFX from channel-style to hit-to-play buttons
3. **Per-channel audio effects** — Reverb, HPF, LPF with wet/dry mix per channel
4. **Loop points + waveform + BPM** — Custom loop regions with visual waveform editor

---

## Feature 1: Image Loading in Game

### What

DMs can load IMAGE-type assets into the game view. Images are a separate asset type from maps — own tab in the control drawer, own WebSocket events, own backend service. Images are DM-presented and non-interactive for players (no grid, no pan/zoom).

### Display Behaviour

Only one display type is visible at a time — **map or image, not both**. Loading an image makes it the active display (hiding the map); loading a map makes it the active display (hiding the image). Both stay loaded in the background — switching between them is instant, no re-loading required.

An `active_display` field (`"map"` | `"image"` | `null`) on the MongoDB game session determines which renders. Loading either type sets this field accordingly.

### How Images Differ from Maps

| Aspect | Map | Image |
|--------|-----|-------|
| Grid overlay | Yes | No |
| Player pan/zoom | Yes (unlock) | No |
| Interactive | Yes (grid, config) | No — DM-presented |
| Control drawer | MAP tab | IMAGE tab (new) |
| WebSocket events | `map_load`, `map_clear`, `map_request` | `image_load`, `image_clear`, `image_request` |
| Asset type | `MAP` | `IMAGE` |

### Data Model

**MongoDB — game session document (new fields):**
```python
# New field on game session document
"active_display": "map" | "image" | null,   # Which display type is visible

# New field (or sub-document) for loaded image
"active_image": {
  "asset_id": "<uuid>",
  "filename": "tavern_interior.png",
  "original_filename": "tavern_interior.png",
  "file_path": "https://s3.../...",        # Presigned download URL
  "loaded_by": "dm"
} | null
```

The existing `active_maps` collection remains unchanged for map state. Image state is stored separately.

**PostgreSQL — session persistence (ETL):**

New column on sessions table: `active_image_asset_id` (UUID, FK → media_assets, nullable). Simple relational reference — no JSONB. Paired with a `active_display` VARCHAR column to remember which display type was active at pause.

Alembic migration adds:
- `active_image_asset_id` UUID column (nullable, FK → media_assets)
- `active_display` VARCHAR(10) column (nullable)

### Backend (api-game)

**New: `api-game/imageservice.py`**
- MongoDB CRUD for active image (following `mapservice.py` pattern)
- `get_active_image(room_id)` — retrieve current image
- `set_active_image(room_id, image_data)` — store image + set `active_display = "image"`
- `clear_active_image(room_id)` — remove image, set `active_display` back to `"map"` if map exists, else `null`

**Modified: `api-game/websocket_handlers/websocket_events.py`**
- `image_load` — DM loads image → save to MongoDB → set `active_display = "image"` → broadcast image + display state to all
- `image_clear` — DM clears image → remove from MongoDB → update `active_display` → broadcast
- `image_request` — Late-joiner requests current image state (like `map_request`)

**Modified: `api-game/websocket_handlers/app_websocket.py`**
- 3 new `elif` dispatcher branches for image events

**Modified: `api-game/mapservice.py`**
- `set_active_map()` — Also set `active_display = "map"` on the game session
- Existing map logic unchanged otherwise

### Backend (api-site)

**Modified: `api-site/modules/campaign/model/session_model.py`**
- New columns: `active_image_asset_id` (UUID FK), `active_display` (VARCHAR)

**Modified: `api-site/modules/session/application/commands.py`**
- `StartSession` — Restore image state if `active_image_asset_id` exists (generate fresh presigned URL). Include `active_display` in startup payload.
- `PauseSession` / `FinishSession` — Extract image state and active_display from MongoDB. Persist `active_image_asset_id` and `active_display` to session.

### Frontend

**New: `map_management/components/ImageDisplay.js`**
- Renders a single image filling the game view
- No grid overlay, no pan/zoom, no interactivity
- Simple `<img>` with `object-fit: contain` (or cover, TBD)

**New: `map_management/hooks/useImageWebSocket.js`**
- WebSocket handlers for `image_load`, `image_clear`, `image_request`
- Send functions for DM actions
- Follows exact pattern of `useMapWebSocket.js`

**New: `game/components/ImageControlsPanel.js`**
- DM panel in its own drawer tab (separate from MAP tab)
- Select IMAGE assets from campaign library
- Load/clear buttons
- Uses existing `useAssets` hook filtered to `asset_type=image`

**Modified: `game/page.js`**
- New state: `activeImage`, `activeDisplay`
- Wire up `useImageWebSocket` hook
- Conditional rendering: show `MapDisplay` when `activeDisplay === "map"`, show `ImageDisplay` when `activeDisplay === "image"`
- Add IMAGE tab to the control drawer

**Modified: `map_management/components/MapDisplay.js`**
- Minor: when a map is loaded via `map_load`, the parent should set `activeDisplay = "map"` (handled in page.js, not MapDisplay itself)

### Session Persistence (ETL)

| Direction | What happens |
|-----------|-------------|
| **Pause (Hot→Cold)** | Extract `active_image.asset_id` → `session.active_image_asset_id`. Extract `active_display` → `session.active_display`. |
| **Start (Cold→Hot)** | If `active_image_asset_id` exists, fetch asset, generate fresh presigned URL, include in startup payload. Include `active_display`. |

### Key Files

| File | Action |
|------|--------|
| `api-game/imageservice.py` | **Create** — MongoDB service for active image |
| `api-game/websocket_handlers/websocket_events.py` | Modify — 3 new image handlers |
| `api-game/websocket_handlers/app_websocket.py` | Modify — 3 dispatcher branches |
| `api-game/app.py` | Modify — ETL extraction/restoration for images |
| `api-game/mapservice.py` | Modify — set active_display on map load |
| `rollplay/app/map_management/components/ImageDisplay.js` | **Create** — image renderer |
| `rollplay/app/map_management/hooks/useImageWebSocket.js` | **Create** — WebSocket hook |
| `rollplay/app/game/components/ImageControlsPanel.js` | **Create** — DM controls (new drawer tab) |
| `rollplay/app/game/page.js` | Modify — activeImage + activeDisplay state, conditional rendering |
| `api-site/modules/campaign/model/session_model.py` | Modify — 2 new columns |
| `api-site/modules/session/application/commands.py` | Modify — ETL for image + active_display |
| `api-site/alembic/versions/xxx_image_session_columns.py` | **Create** — migration |

---

## Feature 2: SFX Soundboard

### What

Replace the current SFX channel UI (which mirrors BGM channels with waveform, transport controls, etc.) with a **soundboard** — a grid of buttons that play one-shot sounds on hit. SFX don't need waveform visualizers, transport controls, or the DJ cue system. They just need a trigger button and a volume level.

BGM channels (A, B, C, D) remain unchanged — they handle both "music" and "ambience" since both are just long looping audio tracks.

### Current State
- 4 SFX channels (`audio_channel_3` through `audio_channel_6`) use the same `AudioTrack` component as BGM
- SFX already hardcoded to `looping: false` in `useUnifiedAudio.js` (line 416-418)
- SFX channels already use `ChannelType.SFX` for identification

### Design

**Soundboard UI** — replaces the 4 SFX AudioTrack instances in AudioMixerPanel:
- Grid of buttons (2-column layout or flexible grid)
- Each button shows the SFX asset name + a small volume knob/slider
- Click = play (from beginning). If already playing, restart from 0
- DM pre-loads SFX from campaign library into soundboard slots
- Visual feedback: button highlights while sound is playing, fades when done

**Soundboard slots** — configurable number of slots (8-12), each with:
- `slot_index` (Integer) — position in the grid
- `asset_id` (UUID) — loaded SFX asset
- `volume` (Float, 0.0-1.0) — per-slot volume

This structure aligns with V2's `SceneSfxSlot` (slot_index, asset_id, volume).

Slots persist to MongoDB game state so late-joiners see the board.

### Backend
- SFX channels still use the same `remote_audio_batch` WebSocket event
- No new backend events needed — the batch system already supports play/stop
- Soundboard slot configuration stored as part of audio state in MongoDB

### Frontend

**New: `audio_management/components/SfxSoundboard.js`**
- Grid of soundboard buttons
- Each slot: asset selector + trigger button + volume slider
- Uses existing `sendRemoteAudioBatch` for playback
- Slots are pre-loaded from campaign library (SFX filter)

**Modified: `audio_management/components/AudioMixerPanel.js`**
- Replace the SFX section (currently renders 4 `AudioTrack` components for SFX channels) with `SfxSoundboard` component
- BGM section remains unchanged

**Modified: `audio_management/hooks/useUnifiedAudio.js`**
- SFX channels may need minor adjustments (restart behavior on re-trigger)
- Consider whether 4 SFX channels is enough for a soundboard, or if we need more concurrent SFX playback. Can dynamically create additional SFX nodes.

### Key Files

| File | Action |
|------|--------|
| `rollplay/app/audio_management/components/SfxSoundboard.js` | **Create** — soundboard UI |
| `rollplay/app/audio_management/components/AudioMixerPanel.js` | Modify — swap SFX section |
| `rollplay/app/audio_management/hooks/useUnifiedAudio.js` | Modify — SFX restart behavior |

---

## Feature 3: Per-Channel Audio Effects

### What

Each BGM channel gets an independent effects chain: **Reverb**, **High-Pass Filter (HPF)**, and **Low-Pass Filter (LPF)**, each with a wet/dry mix control.

### V2 Alignment — Three-Tier Effects System

V2 defines three tiers of effects config with cascading precedence:

| Tier | Where configured | Where stored | V1 scope |
|------|-----------------|-------------|----------|
| **1. Asset defaults** | Workshop Audio Editor | `music_assets` table | **Not V1** — columns added in V2 |
| **2. Scene overrides** | Scene Builder | `scene_audio_channels` table | **Not V1** — Scene Builder is V2 |
| **3. Live tweaks** | In-game audio mixer | MongoDB (transient) | **V1 — this feature** |

V1 implements Tier 3 only (live tweaks). The effect state shape uses the same field naming as V2's `music_assets` and `scene_audio_channels` tables to ensure compatibility:

```javascript
// V1 effect state shape (per channel, in MongoDB)
effects: {
  hpf: { enabled: true, frequency: 200, mix: 0.5 },
  lpf: { enabled: true, frequency: 8000, mix: 0.8 },
  reverb: { enabled: true, preset: 'hall', mix: 0.3 }
}
```

When V2 adds Tier 1 (asset defaults) and Tier 2 (scene overrides), the live game simply initializes from those defaults instead of starting blank.

### Web Audio Node Graph

**Current** (per channel):
```
BufferSource → GainNode → AnalyserNode → MasterGainNode → destination
```

**New** (per channel):
```
BufferSource → [HPF stage] → [LPF stage] → [Reverb stage] → GainNode → AnalyserNode → MasterGain → destination
```

Each effect stage uses parallel dry/wet routing:
```
input ──→ dryGain (1 - mix) ──┐
                                ├──→ output (summed by Web Audio)
input ──→ effectNode → wetGain ─┘
```

### Web Audio Nodes Used
- **HPF**: `BiquadFilterNode` with `type: 'highpass'`, controllable `frequency` cutoff
- **LPF**: `BiquadFilterNode` with `type: 'lowpass'`, controllable `frequency` cutoff
- **Reverb**: `ConvolverNode` loaded with an impulse response (IR) buffer
  - Ship 2-3 built-in IR presets (small room, large hall, cathedral)
  - IR files stored as static assets in `/public/audio/impulse-responses/`

### Syncing
- Effects state is per-channel, sent via `remote_audio_batch` with a new `effects` operation
- All players apply the same effects (effects are server-authoritative)
- Effects state persisted in MongoDB audio channels
- ETL: Effects state included in existing `audio_config` JSONB on session pause/resume (extends per-channel config with `effects` key)

### Frontend

**New: `audio_management/components/ChannelEffects.js`**
- Expandable effects panel per BGM channel
- Three knobs/sliders per effect: enable toggle, parameter (frequency/preset), wet/dry mix
- Compact UI that doesn't bloat the mixer panel

**Modified: `audio_management/hooks/useUnifiedAudio.js`**
- Rework `initializeWebAudio()` to create effects chain per channel
- New refs: `remoteTrackHpfRef`, `remoteTrackLpfRef`, `remoteTrackReverbRef`, `remoteTrackDryGainRef`, `remoteTrackWetGainRef` (per effect stage)
- New functions: `setChannelEffects(trackId, effectType, params)`
- Reconnect node graph when effects are enabled/disabled

**Modified: `audio_management/hooks/webSocketAudioEvents.js`**
- Handle new `effects` operation in batch events
- Sync effects state to all clients

### Key Files

| File | Action |
|------|--------|
| `rollplay/app/audio_management/components/ChannelEffects.js` | **Create** — effects UI per channel |
| `rollplay/app/audio_management/hooks/useUnifiedAudio.js` | Modify — effects node graph |
| `rollplay/app/audio_management/hooks/webSocketAudioEvents.js` | Modify — effects sync |
| `rollplay/app/audio_management/components/AudioMixerPanel.js` | Modify — integrate ChannelEffects |
| `rollplay/app/audio_management/components/AudioTrack.js` | Modify — effects toggle UI per track |
| `public/audio/impulse-responses/` | **Create** — IR preset files |

---

## Feature 4: Loop Points + Waveform + BPM Detection

### What

DMs can set custom loop in/out points on audio tracks. Instead of looping the entire track (which can break immersion at the start/end), the track plays from 0:00 initially but loops between custom points. This requires:
- **Waveform visualization** — rendered from decoded AudioBuffer
- **Interactive markers** — draggable in/out points on the waveform
- **BPM detection** — automated detection for accurate snap-to-beat loop points

### V2 Alignment

V1 creates the `music_assets` joined table with `loop_start`, `loop_end`, `bpm`. V2 later adds effect default columns (`effect_hpf_enabled`, `effect_hpf_frequency`, etc.) to this same table via a new migration. The V1 table design anticipates this.

The WaveformEditor component built here in `audio_management/` will later be reused/extracted for the Workshop Audio Editor in V2.

### Web Audio API (Native Loop Support)
```javascript
source.loop = true;
source.loopStart = 12.5;  // Loop back point (seconds)
source.loopEnd = 180.2;   // Loop here, jump to loopStart
// First play: starts at 0:00, reaches loopEnd, then loops to loopStart
```

This is built into the Web Audio API — no custom timer logic needed.

### Data Model

**PostgreSQL — MusicAssetModel** (new joined-table, like MapAssetModel):

Currently `MusicAssetModel` uses single-table inheritance (no extra columns). Convert to joined-table inheritance to store loop config:

```python
class MusicAssetModel(MediaAsset):
    __tablename__ = 'music_assets'

    id = Column(UUID, ForeignKey('media_assets.id', ondelete='CASCADE'), primary_key=True)

    # Loop points (seconds, null = use full track)
    loop_start = Column(Float, nullable=True)
    loop_end = Column(Float, nullable=True)

    # BPM metadata
    bpm = Column(Float, nullable=True)

    __mapper_args__ = {
        'polymorphic_identity': MediaAssetType.MUSIC,
    }
```

Loop points are **saved on the asset** (PostgreSQL) and reused across all sessions. They're Tier 1 data in V2's three-tier system.

### Waveform Rendering

Generate waveform data from the decoded `AudioBuffer`:

```javascript
function generateWaveformData(audioBuffer, numSamples = 800) {
  const channelData = audioBuffer.getChannelData(0);
  const blockSize = Math.floor(channelData.length / numSamples);
  const peaks = [];

  for (let i = 0; i < numSamples; i++) {
    const start = i * blockSize;
    let max = 0;
    for (let j = start; j < start + blockSize; j++) {
      const abs = Math.abs(channelData[j]);
      if (abs > max) max = abs;
    }
    peaks.push(max);
  }
  return peaks; // Array of 0-1 values
}
```

Render to a `<canvas>` element with draggable loop markers.

### BPM Detection

Client-side BPM detection using audio analysis:
- Use `OfflineAudioContext` to process the buffer
- Apply onset detection (energy-based or spectral flux)
- Calculate inter-onset intervals → BPM estimate
- Consider using `web-audio-beat-detector` npm package as a practical starting point
- Allow manual override (DM can type BPM or use tap-tempo)

BPM enables **snap-to-beat** for loop markers — when DM drags a loop point, it snaps to the nearest beat boundary for seamless loops.

### API Endpoint

**New: `PATCH /api/library/{asset_id}/loop-config`** (api-site):
```json
{
  "loop_start": 12.5,
  "loop_end": 180.2,
  "bpm": 120.0
}
```
- New command: `UpdateLoopConfig` in `library/application/commands.py`
- Persists to `music_assets` table

### Frontend

**New: `audio_management/components/WaveformEditor.js`**
- Canvas-based waveform visualization
- Draggable loop-in and loop-out markers
- BPM display with manual override input
- Snap-to-beat toggle
- Save button → `PATCH /api/library/{asset_id}/loop-config`
- Opens as a modal/expanded view from the AudioTrack component

**Modified: `audio_management/hooks/useUnifiedAudio.js`**
- When playing a track with loop points, set `source.loopStart` and `source.loopEnd`
- Load loop config from asset metadata (passed through WebSocket batch events)

**Modified: `audio_management/hooks/webSocketAudioEvents.js`**
- Include loop_start/loop_end in play operations
- Sync loop points to all clients

### Alembic Migration
- Create `music_assets` table (joined-table inheritance)
- Columns: `id` (FK → media_assets), `loop_start`, `loop_end`, `bpm`
- Import `MusicAssetModel` in `alembic/env.py`

### Key Files

| File | Action |
|------|--------|
| `api-site/modules/library/model/audio_asset_models.py` | Modify — MusicAssetModel joined-table |
| `api-site/modules/library/application/commands.py` | Modify — UpdateLoopConfig command |
| `api-site/modules/library/api/endpoints.py` | Modify — new PATCH endpoint |
| `api-site/modules/library/api/schemas.py` | Modify — LoopConfigSchema |
| `api-site/alembic/env.py` | Modify — import MusicAssetModel |
| `api-site/alembic/versions/xxx_music_assets_table.py` | **Create** — migration |
| `rollplay/app/audio_management/components/WaveformEditor.js` | **Create** — waveform UI |
| `rollplay/app/audio_management/hooks/useUnifiedAudio.js` | Modify — loopStart/loopEnd |
| `rollplay/app/audio_management/hooks/webSocketAudioEvents.js` | Modify — loop sync |
| `rollplay/app/audio_management/components/AudioTrack.js` | Modify — link to WaveformEditor |

---

## Implementation Order

These features are largely independent but I'd suggest this sequence:

### Phase 1: Image Loading in Game
- Own system: new service, new WebSocket events, new drawer tab
- Follows established map loading patterns closely
- Introduces `active_display` toggle between map and image
- ~12 files changed/created

### Phase 2: SFX Soundboard
- Pure UI rework, minimal backend changes
- Quick win — immediately improves DM experience
- ~3-4 files changed/created

### Phase 3: Per-Channel Audio Effects
- Deepest Web Audio API work
- Independent of other features
- ~6-7 files changed/created

### Phase 4: Loop Points + Waveform + BPM
- Most complex feature (waveform rendering, BPM analysis)
- Benefits from effects chain work being done first (effects in node graph)
- Creates the `music_assets` joined table that V2 extends
- ~8-10 files changed/created

---

## Verification

### Image Loading
1. Load a game session → open DM controls → open IMAGE tab in drawer
2. Select IMAGE asset from campaign library → verify image fills game view for all clients
3. Verify no grid overlay, no pan/zoom on the image
4. Load a MAP from MAP tab → verify map becomes active display, image hidden
5. Load an IMAGE again → verify image becomes active display, map hidden (instant, no re-load)
6. Clear image → verify display falls back to map (if one was loaded)
7. New player joins → verify they see the correct active display (late-joiner sync)
8. Pause session → resume → verify both map and image restored, correct active_display preserved

### SFX Soundboard
1. Open audio mixer → verify SFX section shows soundboard grid (not channels)
2. Load SFX assets into soundboard slots from campaign library
3. Hit trigger button → verify sound plays for all clients
4. Hit again while playing → verify restart from beginning
5. Adjust volume → verify volume applies
6. Verify BGM channels are unaffected

### Audio Effects
1. Load a BGM track → expand effects panel
2. Enable HPF → adjust frequency → verify audible change for all clients
3. Enable LPF → adjust frequency → verify audible change
4. Enable reverb → select preset → adjust wet/dry → verify audible change
5. Verify effects persist in session (pause/resume via audio_config ETL)
6. Verify late-joiner hears effects applied

### Loop Points
1. Load a BGM track → open waveform editor
2. Verify waveform renders from decoded audio
3. Drag loop-in marker → verify visual update
4. Drag loop-out marker → verify visual update
5. Enable snap-to-beat → verify markers snap to beat grid
6. Save loop config → verify persists to asset (refresh and reopen)
7. Play track → verify it loops between custom points
8. Verify loop points sync to all clients
