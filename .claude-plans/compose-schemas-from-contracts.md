# Plan: Compose Library API Schemas from Shared Contracts

## Context

The library module's REST schemas (`schemas.py`) re-declare fields that already have canonical definitions in shared contracts (`GridConfig`, `AudioEffects`). This creates dual maintenance burden and allows drift — the exact problem shared contracts were introduced to prevent.

The fix: response schemas **embed** contract types as nested fields; request schemas that are pure domain objects **use** contract types directly. This work is split into two independent pieces (map_schema, audio_schema) that can be implemented and shipped separately.

**Additional bugs found during exploration:**
- The `MapAssetResponse` builder only populates 3 of 6 declared grid fields (`grid_offset_x`, `grid_offset_y`, `grid_line_color` are silently dropped)
- `grid_cell_size` exists in the DB/aggregate but is never exposed in the API response
- Neither the grid nor audio-config PATCH endpoints are called from the frontend yet — they exist as backend-only endpoints

---

## SECTION 1: Map Schema (`map_schema`)

### What Changes

| Component | Current | Target |
|-----------|---------|--------|
| `MapAssetResponse` | 6 flat grid fields (no `grid_cell_size`) | `grid_config: Optional[GridConfig]` |
| `UpdateGridConfigRequest` | 6 flat optional fields | **Deleted** — endpoint accepts `GridConfig` directly |
| Response builder | Only sets 3 of 6 fields (bug) | Constructs `GridConfig` from aggregate fields |
| `UpdateGridConfig` command | 6 individual params | Receives `GridConfig`, unpacks to flat args for aggregate |

### Backend Changes

**`api-site/modules/library/api/schemas.py`**
- Delete `UpdateGridConfigRequest` class (lines 70-77)
- Replace `MapAssetResponse` flat fields (lines 80-87) with:
  ```python
  from shared_contracts.map import GridConfig

  class MapAssetResponse(MediaAssetResponse):
      grid_config: Optional[GridConfig] = None
  ```

**`api-site/modules/library/api/endpoints.py`**
- Response builder (`_to_media_asset_response`, line 70-86): construct `GridConfig` from the aggregate's flat fields (`grid_width`, `grid_height`, `grid_opacity`, `grid_offset_x`, `grid_offset_y`, `grid_line_color`, `grid_cell_size`). The contract validates the shape. Return `None` if `has_grid_config()` is false. This fixes the missing fields bug and adds `grid_cell_size`.
- Grid update endpoint (line 387-429): change `request: UpdateGridConfigRequest` → `request: GridConfig`, pass directly to command
- Remove `UpdateGridConfigRequest` from imports (line 43)

**`api-site/modules/library/application/commands.py`**
- `UpdateGridConfig.execute()` (line 339-393): receives `grid_config: GridConfig`, unpacks contract fields to flat args and calls `asset.update_grid_config()` directly. The command handles the translation (extracting `opacity`/`line_color` from `colors.display_mode`, `offset_x` → `grid_offset_x`, etc.), keeping the aggregate free of contract awareness. The aggregate's `update_grid_config()` does the validation (range checks etc).

### Key Design Decision
The aggregate stays contract-unaware — it works with flat domain fields and validates them. Translation between contract shape and domain fields lives in the application layer:
- **Reads**: endpoint builder constructs `GridConfig` from aggregate fields
- **Writes**: command unpacks `GridConfig` into flat args for `aggregate.update_grid_config()`

The existing `build_grid_config_for_game()` and `update_grid_config_from_game()` methods on the aggregate remain for the ETL path (session start/end) but are not used by the library API.

### Frontend Changes
None. No frontend code reads grid fields from library API responses — grid config flows through the game ETL/WebSocket path. The PATCH `/grid` endpoint isn't called from the frontend.

### Note on `GridConfig` as request body
`ContractModel` has `extra="forbid"`. `GridConfig` has required fields with defaults (`grid_width=20`, `enabled=True`, etc.). When used as a FastAPI request body, clients must send all required fields or rely on defaults. This is fine — the endpoint is a full replacement, not a partial patch.

---

## SECTION 2: Audio Schema (`audio_schema`)

### What Changes

| Component | Current | Target |
|-----------|---------|--------|
| `MusicAssetResponse` | 8 flat `effect_*` fields + 3 playback | `effects: Optional[AudioEffects]` + 3 playback |
| `SfxAssetResponse` | 3 playback fields | **Unchanged** (SFX has no effects) |
| `UpdateAudioConfigRequest` | 11 flat fields | Nested: 3 playback + `effects: Optional[AudioEffects]` |
| `UpdateAudioConfig` command | 11 individual params | 3 playback + `effects: Optional[AudioEffects]` |

### Backend Changes

**`api-site/modules/library/api/schemas.py`**
- `MusicAssetResponse` (lines 90-102): replace 8 flat `effect_*` fields with `effects: Optional[AudioEffects] = None`, keep `duration_seconds`, `default_volume`, `default_looping`
- `UpdateAudioConfigRequest` (lines 112-124): replace 8 flat `effect_*` fields with `effects: Optional[AudioEffects] = None`, keep 3 playback fields with their validation constraints
- Add `from shared_contracts.audio import AudioEffects`

**`api-site/modules/library/api/endpoints.py`**
- Response builder (`_to_media_asset_response`, lines 89-113): for `MusicAsset`, construct `AudioEffects` from the aggregate's flat effect fields (`effect_eq_enabled` → `eq`, `effect_hpf_enabled` → `hpf`, etc.). The contract validates the shape.
- Audio update endpoint (lines 432-462): pass `request.effects` to the command

**`api-site/modules/library/application/commands.py`**
- `UpdateAudioConfig.execute()` (lines 408-476): receives `effects: Optional[AudioEffects] = None` instead of 8 flat params. Command unpacks `effects.eq` → `effect_eq_enabled`, `effects.hpf` → `effect_hpf_enabled`, etc. and calls `asset.update_audio_config()` with flat args. Same principle as grid — aggregate stays contract-unaware.

### Key Design Decision (same as Map)
Translation between contract shape and domain fields lives in the application layer, not the aggregate. The existing `build_effects_for_game()` method on the aggregate remains for the ETL path but is not used by the library API.

### Frontend Changes

**`rollplay/app/audio_management/components/AudioMixerPanel.js`** (lines 104-124)
- `asset.effect_hpf_enabled` → `asset.effects?.hpf`
- `asset.effect_hpf_mix` → `asset.effects?.hpf_mix`
- Same pattern for all 8 effect fields
- `asset.default_volume` and `asset.default_looping` stay unchanged (still top-level)

**`rollplay/app/audio_management/hooks/useUnifiedAudio.js`** (lines 1842-1860)
- Already has dual handling: checks `asset.effects` first, falls back to flat `effect_*` fields
- After this change, library API responses will always have nested `effects` — the flat fallback branch (lines 1849-1860) can be removed
- `asset.default_volume` stays unchanged (line 1803, 1879)

### Field Mapping Reference

| Old flat field | New nested path |
|---|---|
| `effect_eq_enabled` | `effects.eq` |
| `effect_hpf_enabled` | `effects.hpf` |
| `effect_hpf_mix` | `effects.hpf_mix` |
| `effect_lpf_enabled` | `effects.lpf` |
| `effect_lpf_mix` | `effects.lpf_mix` |
| `effect_reverb_enabled` | `effects.reverb` |
| `effect_reverb_mix` | `effects.reverb_mix` |
| `effect_reverb_preset` | `effects.reverb_preset` |

---

## Implementation Order

Each section is independent and can ship as a separate PR:

**Map schema** (backend-only, no frontend changes):
1. Schema changes → Command changes → Endpoint changes
2. No frontend coordination needed

**Audio schema** (backend + frontend, must ship together):
1. Schema changes → Command changes → Endpoint changes
2. Frontend `AudioMixerPanel.js` + `useUnifiedAudio.js` in same commit

---

## Verification

### Map
1. `GET /api/library/` — map assets return `grid_config: { grid_width, grid_height, grid_cell_size, offset_x, offset_y, enabled, colors }` instead of flat fields
2. `GET /api/library/` — map with no grid returns `grid_config: null`
3. `PATCH /api/library/{id}/grid` with `GridConfig` body — updates all fields including `grid_cell_size`
4. Game ETL flow still works (grid config round-trips through start/end session)

### Audio
1. `GET /api/library/` — music assets return `effects: { eq, hpf, hpf_mix, ... }` instead of flat `effect_*` fields
2. `GET /api/library/` — SFX assets unchanged (no `effects` field)
3. `PATCH /api/library/{id}/audio-config` with nested `effects` body — updates correctly
4. Load a music asset into the DM mixer — volume, looping, and effects apply correctly
5. `npm run build` passes

---

## Files Modified

| File | Section | Action |
|------|---------|--------|
| `api-site/modules/library/api/schemas.py` | Both | Delete old request schemas, nest contract types |
| `api-site/modules/library/api/endpoints.py` | Both | Construct contracts from aggregate fields for responses |
| `api-site/modules/library/application/commands.py` | Both | Receive contracts, unpack to flat args for aggregates |
| `rollplay/app/audio_management/components/AudioMixerPanel.js` | Audio | `effect_*` → `effects.*` |
| `rollplay/app/audio_management/hooks/useUnifiedAudio.js` | Audio | Remove flat-field fallback branch |
