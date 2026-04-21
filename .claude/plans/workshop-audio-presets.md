# Workshop Audio Tool — Reset & Preset Feature

## Context

This plan supersedes the Part B (Workshop DAW) section of the earlier plan at [.claude/plans/daw-audio-engine-refactor.md](.claude/plans/daw-audio-engine-refactor.md) (committed on branch `unified_audio_refactor` at commit `8d54b2a`). **Part A of that plan — the audio engine refactor — shipped and stays.** Part B drifted.

**What went wrong with the old plan:**
F4 of the Media Foundation V1 milestone was always "loop points + waveform + BPM per audio asset." That maps naturally to a per-asset editor: one track, trim it, loop it, tweak its effects, save. Somewhere along the way the tool grew into a 6-track multi-buffer DAW with solo/mute/transport and a custom canvas waveform renderer (1091 lines in `AudioWorkstationTool.js`, 260 lines in `WaveformCanvas.js`). This was a category error: the tool doesn't produce a mix-down, so the tracks beyond the first have nothing to combine *into*. They were overhead without output.

**The real missing feature was something else:** an in-game **preset** — a named collection of tracks the DM pre-configures so they can load "Tavern Evening" or "Forest Ambush" into the mixer with one click. A placeholder `<select>` for this already sits disabled at `AudioMixerPanel.js:451-464` (found during exploration). The multi-track concept belongs *there*, not inside the per-asset editor.

**What this plan does:**
1. Collapses the Workshop audio tool back to per-asset (single track), using WaveSurfer for waveform + region editing (dep already installed in `package.json`).
2. Adds a `PresetAggregate` inside the existing `library/` module. DM-scoped (user owns their presets, reusable across campaigns). Each preset is a named, ordered set of channel-slot → music-asset-id entries.
3. Adds a new Workshop tile for preset CRUD.
4. Wires the existing in-game dropdown to list + load presets (read-only) via the existing `sendRemoteAudioBatch` WebSocket path.

Single source of truth for audio config stays on the `MusicAssetAggregate`. Presets only store *which asset plays where* — never overrides.

---

## Part A — Workshop audio tool: strip to single-track, restore WaveSurfer

**Branch:** continue on `unified_audio_refactor` (rebase on current `main` first so we pick up 0.44.x fixes).

### Files to modify

**[rollplay/app/workshop/components/AudioWorkstationTool.js](rollplay/app/workshop/components/AudioWorkstationTool.js)** (1091 → target ~400 lines)
Strip:
- `tracks` array state, `activeTrackIndex`, `trackIdCounter`, `emptyTrack()`, `MAX_TRACKS`
- `addTrack()`, track tabs UI, per-track M/S buttons, loop-drawer-per-track toggle
- `setActiveTrackField()` indirection — operate directly on `selectedAsset`, `loopMode`, `loopStart`, `loopEnd`, `bpm`
- `audioBuffersRef` (Map keyed by track index) → single `audioBufferRef`

Keep:
- `AssetPicker` import flow for the one slot
- Dirty tracking: one `savedConfig` snapshot (`{loopMode, loopStart, loopEnd, bpm}`) held in state, updated on every successful save. `hasChanges` compares live state to `savedConfig` and drives the Save/Revert button affordance. The current code has a `saved` field on every track in the `tracks` array — this collapses to a single snapshot for the one asset being edited.
- `handleDetectBpm`, `importAsset` (simplified to one slot)
- `useUpdateAudioConfig` unchanged — it already targets one asset by ID

**[rollplay/app/workshop/components/WaveformCanvas.js](rollplay/app/workshop/components/WaveformCanvas.js)** — **delete**.
Replace with a thin WaveSurfer wrapper component (new file: `WaveformViewer.js`):
- Mounts a WaveSurfer instance bound to the decoded buffer (via `loadBlob` or `loadDecodedBuffer`)
- Uses the **Regions plugin** (https://wavesurfer.xyz/docs/plugins-regions) for loop-in/loop-out interaction — drag-create and drag-edit are built in
- Emits `onRegionChange(start, end)` up to the tool
- Binds WaveSurfer to the engine's `AudioContext` via `AudioEngine.context` (the old Part-A plan specifically preserved this hook)
- No peak pre-computation, no canvas caching, no scroll-sync logic. WaveSurfer handles it all.

Net delete: ~260 lines custom canvas + ~540 lines multi-track = ~800 lines removed. New WaveSurfer wrapper: ~120 lines.

**[rollplay/app/workshop/components/AudioWorkstationControls.js](rollplay/app/workshop/components/AudioWorkstationControls.js)** (104 lines) — **no change**. Already single-track compatible.

**[rollplay/app/workshop/hooks/useWorkshopPreview.js](rollplay/app/workshop/hooks/useWorkshopPreview.js)** (79 → ~40 lines)
- Remove `getChannel(index)` multi-channel lookup; single persistent channel
- Remove solo/mute handling (moot with one channel)
- Keep `initChannelFromAsset(asset)` (applies effects chain from `MusicAssetAggregate.get_audio_config()`)

**[rollplay/app/workshop/hooks/useUpdateAudioConfig.js](rollplay/app/workshop/hooks/useUpdateAudioConfig.js)** — no change. Already PATCHes `/api/library/{assetId}/audio-config` with `{loop_start, loop_end, bpm, loop_mode}`.

**[rollplay/app/workshop/utils/detectBpm.js](rollplay/app/workshop/utils/detectBpm.js)** — no change.

### Dependency note
`wavesurfer.js ^7.12.5` is already in `rollplay/package.json` — verified during exploration. No install needed. Import `WaveSurfer` and `RegionsPlugin` from `wavesurfer.js/dist/plugins/regions.esm.js`.

### Backend — Part A
**No changes.** The `MusicAssetAggregate` at [api-site/modules/library/domain/music_asset_aggregate.py](api-site/modules/library/domain/music_asset_aggregate.py) already carries every field the single-track editor needs: `loop_start`, `loop_end`, `loop_mode`, `bpm`, `duration_seconds`, `default_volume`, `default_looping`, plus all eight effect fields (`effect_eq_enabled`, `effect_hpf_enabled`, `effect_hpf_mix`, `effect_lpf_enabled`, `effect_lpf_mix`, `effect_reverb_enabled`, `effect_reverb_mix`, `effect_reverb_preset`). `update_audio_config()` and `get_audio_config()` exist. The `PATCH /api/library/{assetId}/audio-config` endpoint is already live.

---

## Part B — Preset aggregate inside `library/` module

### Scope decisions (locked from clarifying questions)
- **User/DM-scoped**: preset has `user_id`, not `campaign_id`. The DM owns the preset; it's reusable across all their campaigns.
- **Explicit channel slots**: preset stores `tracks: List[{channel_id, music_asset_id}]`. The DM designs intent into the preset ("tavern music on A, rain on B"). On load, the mixer replays slots directly.
- **Assets own all config**: the preset stores **only** `channel_id + music_asset_id`. Volume, loop points, effects all come from `MusicAssetAggregate` at load time. No overrides, ever. This is the single-source-of-truth invariant.

### Aggregate

**New file: `api-site/modules/library/domain/preset_aggregate.py`**

```python
@dataclass
class PresetSlot:
    channel_id: str
    music_asset_id: UUID

@dataclass
class PresetAggregate:
    id: UUID
    user_id: UUID
    name: str
    slots: List[PresetSlot]
    created_at: datetime
    updated_at: datetime

    @classmethod
    def create(cls, user_id: UUID, name: str, slots: List[PresetSlot]) -> "PresetAggregate": ...
    @classmethod
    def from_persistence(cls, model) -> "PresetAggregate": ...

    def rename(self, name: str) -> None: ...
    def set_slot(self, channel_id: str, music_asset_id: UUID) -> None: ...   # upsert one slot
    def clear_slot(self, channel_id: str) -> None: ...
    def replace_slots(self, slots: List[PresetSlot]) -> None: ...            # bulk save from the edit UI
```

All methods validate + bump `updated_at`. Names are 1-64 chars, non-empty. Per-user uniqueness of names is enforced in the command layer (check before save).

### Model

**New file: `api-site/modules/library/model/preset_model.py`**
- Table `presets`: `id UUID PK`, `user_id UUID FK users.id ON DELETE CASCADE`, `name TEXT`, `slots JSONB NOT NULL DEFAULT '[]'`, `created_at`, `updated_at`
- Index on `user_id` for list queries
- `UNIQUE(user_id, name)` constraint (enforces no duplicate names per DM)

**Why JSONB, not a child `preset_slots` table:** the slot list is small (bounded by mixer channel count, ~4-8), only ever loaded/saved as a whole, and never queried by slot. Matches the codebase's "POC simplicity" stance — same reasoning the team used for `MediaAssetModel.campaign_ids = ARRAY(UUID)` rather than a join table.

**Register in [api-site/alembic/env.py](api-site/alembic/env.py)** — add `from modules.library.model.preset_model import PresetModel`, otherwise autogenerate won't detect the table.

### Migration

Create via `docker exec api-site-dev alembic revision --autogenerate -m "add presets table"`. Do **not** hand-write. (Per `feedback_alembic_autogenerate` memory.)

### Repository

**New file: `api-site/modules/library/repositories/preset_repository.py`**

```python
class PresetRepository:
    def __init__(self, db: Session): ...
    def save(self, preset: PresetAggregate) -> None: ...         # upsert
    def get_by_id(self, preset_id: UUID) -> Optional[PresetAggregate]: ...
    def list_for_user(self, user_id: UUID) -> List[PresetAggregate]: ...
    def delete(self, preset_id: UUID) -> None: ...
```

Mirror the existing `MediaAssetRepository` patterns at [api-site/modules/library/repositories/asset_repository.py](api-site/modules/library/repositories/asset_repository.py): DbSession injected, `_model_to_aggregate` via `PresetAggregate.from_persistence`.

### Application layer

**Extend `api-site/modules/library/application/commands.py`** with:
- `CreatePreset(name, slots)` — checks unique name per user, validates every `music_asset_id` exists and is a music asset owned/accessible by the user
- `RenamePreset(preset_id, name)`
- `UpdatePresetSlots(preset_id, slots)` — bulk replace (what the edit UI POSTs)
- `DeletePreset(preset_id)`

All class-based with `.execute()`, matching existing commands. None require WebSocket events (presets are DM-private config, not collaborative game state). Synchronous (no `async def`).

**Extend `api-site/modules/library/application/queries.py`** with:
- `GetPresetById(preset_id)`
- `ListPresetsForUser(user_id)` — returns all presets owned by the current DM

### API

**Extend `api-site/modules/library/api/endpoints.py`** with:
- `POST /api/library/presets` → `CreatePreset`
- `GET /api/library/presets` → `ListPresetsForUser` (scoped to `current_user`)
- `GET /api/library/presets/{preset_id}` → `GetPresetById`
- `PATCH /api/library/presets/{preset_id}` → `RenamePreset` or `UpdatePresetSlots` (based on body shape)
- `DELETE /api/library/presets/{preset_id}` → `DeletePreset`

All under the same router/auth guard as existing library endpoints. Reuse `get_current_user_from_token` from [api-site/shared/dependencies/auth.py](api-site/shared/dependencies/auth.py).

**NGINX:** `/api/library/*` already routes to `api-site:8082` — no config change needed.

### Schemas

**Extend `api-site/modules/library/api/schemas.py`** with `PresetSlotSchema`, `PresetSchema`, `CreatePresetRequest`, `UpdatePresetRequest` Pydantic models. `slots` serialised as a list of `{channel_id: str, music_asset_id: str}`.

---

## Part C — Preset editor (new Workshop tile)

**Principle: the in-game mixer is read-only for preset management.** Creating, renaming, editing slots, and deleting presets all happen in the Workshop (DM's pre-session prep tool). The game surface only *lists* and *loads* presets. This mirrors how Map Config, Image Config, and the per-asset Audio Workstation already work — Workshop for authoring, game for consumption.

### New Workshop tile: "Audio Presets"

**New route:** `rollplay/app/workshop/audio-presets/page.js` — auth wrapper + `AudioPresetsTool` component, matching the existing `audio-workstation/page.js` structure.

**Register the tile:** add an entry to the Workshop tile grid (see `rollplay/app/workshop/components/WorkshopManager.js` or equivalent tile listing) so it appears alongside Map Config / Image Config / Audio Workstation.

**New component:** `rollplay/app/workshop/components/AudioPresetsTool.js`

UI shape:
- **Left pane:** list of the DM's presets (name + track count). "New Preset" button at the top. Click to select/edit. Right-click or ellipsis menu for Rename + Delete.
- **Right pane:** when a preset is selected, a grid of channel slots. For each channel slot:
  - Channel label (derived from the mixer's channel config — same source the in-game mixer uses, so labels stay consistent)
  - An `AssetPicker` (existing component, reused from the Audio Workstation tool) scoped to music assets
  - A "Clear" button
- Dirty tracking on the edited preset: one `savedSlots` snapshot compared to live state, Save/Revert buttons at the bottom. Same dirty-flag pattern as the per-asset tool.
- Save flow: Save button calls `useUpdatePresetSlots(presetId).mutate(slots)` which hits `PATCH /api/library/presets/{id}`. Cache invalidates `['presets']` so the in-game dropdown reflects changes next time it's opened.

### Workshop-only TanStack hooks

Create under the Workshop slice (not audio_management, since this is an authoring UI, not gameplay):
- `rollplay/app/workshop/hooks/useListPresets.js` — shared query (used by both Workshop editor and in-game dropdown; Workshop is where it lives since it's the authoring surface, and audio_management imports it)
- `rollplay/app/workshop/hooks/useCreatePreset.js`
- `rollplay/app/workshop/hooks/useUpdatePreset.js` — covers both rename and slot-update (discriminates by body shape)
- `rollplay/app/workshop/hooks/useDeletePreset.js`

All use `authFetch` (CLAUDE.md rule).

*Decision point:* if sharing `useListPresets` between Workshop and game feels awkward, move it to `rollplay/app/shared/hooks/useListPresets.js` — same query, imported by both surfaces. Either works; will pick during implementation based on which import graph is cleaner.

## Part D — In-game dropdown (read-only: list + load)

**[rollplay/app/audio_management/components/AudioMixerPanel.js](rollplay/app/audio_management/components/AudioMixerPanel.js) (lines 451-464)** — convert the disabled placeholder into a live `<Dropdown>` (Headless UI, consistent with `app/shared/components/Dropdown.js`).

Game responsibilities (read-only):
- Fetch presets via `useListPresets()` (the hook shared with Workshop — see note above)
- On select: call a local `loadPreset(presetId)` handler that:
  - Fetches the preset's full `slots` (either from the list query's cached payload or a per-id refetch)
  - For each slot, resolves the referenced `MusicAssetAggregate` (asset list query is already hot in this view)
  - Builds a batch payload per slot: `{ operation: 'load', channel_id, asset_id, s3_url, volume, looping, effects, loop_start, loop_end }` — **all config pulled from the asset, never from the preset**
  - Calls existing `sendRemoteAudioBatch(operations)` — the atomic path already used at `AudioMixerPanel.js:103` for single-asset loads. Multiple slots land as one batch.

Game explicitly does **not**:
- Show create / rename / delete affordances for presets
- Allow inline editing of a loaded preset's slots
- Mutate the preset in any way

If the DM wants to change a preset, they leave the game and go to Workshop → Audio Presets. The next time they load the preset in the mixer, the new shape takes effect.

### No backend event wiring

Presets are per-user DM config, never broadcast. No `PresetEvents` class, no WebSocket fan-out, no MongoDB doc. Writes go to PostgreSQL only. The in-session mixer reads fresh asset config via the standard single-asset load path on every preset-load operation, so a DM who edits a music asset's loop points between preset loads will see the new values.

---

## Files affected — summary

### Deleting
- `rollplay/app/workshop/components/WaveformCanvas.js` (260 lines)

### Creating
- `rollplay/app/workshop/components/WaveformViewer.js` (new, ~120 lines — WaveSurfer wrapper)
- `rollplay/app/workshop/audio-presets/page.js` (new Workshop route)
- `rollplay/app/workshop/components/AudioPresetsTool.js` (new preset editor UI)
- `api-site/modules/library/domain/preset_aggregate.py`
- `api-site/modules/library/model/preset_model.py`
- `api-site/modules/library/repositories/preset_repository.py`
- `api-site/alembic/versions/*_add_presets_table.py` (autogenerated)
- `rollplay/app/workshop/hooks/useListPresets.js` (shared with game; may be hoisted to `shared/hooks/` if cleaner)
- `rollplay/app/workshop/hooks/useCreatePreset.js`
- `rollplay/app/workshop/hooks/useUpdatePreset.js`
- `rollplay/app/workshop/hooks/useDeletePreset.js`

### Modifying
- `rollplay/app/workshop/components/AudioWorkstationTool.js` (1091 → ~400)
- `rollplay/app/workshop/hooks/useWorkshopPreview.js` (79 → ~40)
- `rollplay/app/workshop/components/WorkshopManager.js` (add "Audio Presets" tile to the tile grid)
- `api-site/modules/library/application/commands.py` (add 4 commands)
- `api-site/modules/library/application/queries.py` (add 2 queries)
- `api-site/modules/library/api/endpoints.py` (add 5 routes)
- `api-site/modules/library/api/schemas.py` (add preset schemas)
- `api-site/modules/library/dependencies/providers.py` (provide `PresetRepository`)
- `api-site/alembic/env.py` (import `PresetModel`)
- `rollplay/app/audio_management/components/AudioMixerPanel.js` (wire read-only dropdown, lines 451-464)

### Unchanged (verifying no drift)
- `MusicAssetAggregate` — already has all required loop/effect fields
- `useUpdateAudioConfig.js` — already per-asset
- `AudioWorkstationControls.js` — already single-track
- `detectBpm.js` — no track awareness
- NGINX config — `/api/library/*` route already exists
- Shared contracts — no preset type needed; presets are DM-private, never cross the site↔game boundary

---

## Verification

### Part A — workshop single-track
1. `docker-compose -f docker-compose.dev.yml up` — confirm `api-site` boots clean (no migration errors)
2. Open Workshop → Audio Workstation tool
3. Import a music asset: waveform renders via WaveSurfer
4. Drag across the waveform: a region is created (WaveSurfer Regions plugin)
5. Edit region edges: loopStart/loopEnd update
6. Hit Save: `PATCH /api/library/{id}/audio-config` — reopen asset, values persist
7. Hit BPM detect: populates `bpm`; save persists
8. Effects knobs: tweak reverb/LPF/HPF, save, reopen — all persist
9. Confirm: **no** "add track" button, **no** track tabs, **no** per-track M/S — single-track only
10. Load the same asset in the in-game mixer: loop points + effects apply correctly (regression check on pre-existing consumer)

### Part B — preset CRUD via API
1. `docker exec api-site-dev alembic current` — new migration is head
2. `curl -H "Authorization: Bearer ..." POST /api/library/presets` with `{name, slots: [{channel_id, music_asset_id}]}` — creates
3. `GET /api/library/presets` — lists only the current user's presets (check with a second DM account — presets shouldn't cross)
4. `PATCH` rename — works; duplicate name returns 409
5. `PATCH` update slots — works; referencing a non-existent asset returns 400
6. `DELETE` — removes row
7. Delete the user → presets cascade-delete (FK `ON DELETE CASCADE`)

### Part C — Workshop preset editor
1. Go to Workshop → Audio Presets tile
2. Click "New Preset" → name it → save: appears in left pane
3. Select the preset → right pane shows channel slots
4. For each slot, open AssetPicker → pick a music asset → slot reflects it. Save → PATCH fires, dirty state clears
5. Rename → dup name returns 409 from backend, UI surfaces error
6. Delete → preset removed, disappears from list pane and from in-game dropdown cache
7. Edit preset slots → Save → open the in-game mixer in a session → dropdown shows new shape on next fetch

### Part D — in-game dropdown (read-only)
1. With presets created in Part C, open the in-game mixer as that DM → presets appear in dropdown
2. Select preset → each slot loads its asset into the named channel atomically (one WebSocket batch)
3. Refresh the page / other players' views: loaded tracks survive (standard MongoDB hot-state persistence)
4. Load the same preset in a different campaign of the same DM → works (user-scoped)
5. Log in as a different DM → preset is NOT visible
6. Confirm the in-game mixer exposes NO create / rename / delete affordances for presets — only list + load. The only CRUD surface is the Workshop tile.

### Regression sweep
- Run frontend build: `cd rollplay && npm run build` — no broken imports
- Run whatever backend tests exist for `library/` module
- Verify existing per-asset audio editing flows still work (hot path: DM changes a BGM track's loop in the mixer, mid-session, via existing single-asset load path)

---

## References

- Prior plan (Part A done, Part B superseded): [.claude/plans/daw-audio-engine-refactor.md](.claude/plans/daw-audio-engine-refactor.md) — sits in this same directory on branch `unified_audio_refactor`
- Custom canvas waveform commits being reverted: `735018e`, `b4ebb9b`, `d4b81d1`, `1fa173a`
- WaveSurfer removal commit being reversed: `100bb6a` ("now using our own audio engine, not wavesurf because it was not compatible with our looping logic — at least, not easily"). Single-track + Regions plugin eliminates the original incompatibility.
- Placeholder preset dropdown: `AudioMixerPanel.js:451-464`
- Batch load path to reuse: `sendRemoteAudioBatch` via `handleAssetSelected` at `AudioMixerPanel.js:103`
- Similar many-to-something pattern (ARRAY column precedent): `MediaAssetModel.campaign_ids`
- Autogenerate migration rule: `feedback_alembic_autogenerate` memory
- `authFetch` rule for all authenticated frontend calls: CLAUDE.md "Authenticated Fetch" section
