# Plan: Compose API Response Schemas from Shared Contracts

## Context

api-site's library REST schemas re-declare fields that already have canonical definitions
in shared contracts — with diverged constraints, naming, and optionality. This creates
dual maintenance burden and the exact drift that shared contracts were introduced to prevent.

The fix is architectural: response schemas **embed** contract types as nested fields rather
than re-declaring their contents flat. Request schemas that are domain objects **use**
contract types directly. Contracts become the single source of truth at every boundary,
not just at the api-site ↔ api-game ETL.

**Response schemas with presentation-only data (`MediaAssetResponse`, base fields like
`s3_url`, `created_at`, `user_id`) are intentionally separate — these are not part of
this plan. Command-input schemas (`AssociateRequest`, `RenameRequest` etc.) are also
intentionally separate.**

---

## What Changes

| Schema | Current | Target |
|--------|---------|--------|
| `MapAssetResponse` | 7 flat grid fields (`grid_width`, `grid_height`, `grid_opacity`, `grid_offset_x`, `grid_offset_y`, `grid_line_color`) | `grid_config: Optional[GridConfig]` |
| `MusicAssetResponse` | 8 `effect_*` fields + `default_volume` + `default_looping` | `effects: Optional[AudioEffects]`, `volume`, `looping` |
| `SfxAssetResponse` | `default_volume`, `default_looping` | `volume`, `looping` |
| `UpdateGridConfigRequest` | 6 flat optional fields, `le=100` | deleted — endpoint accepts `GridConfig` directly |
| `UpdateAudioConfigRequest` | 8 flat `effect_*` optional fields | deleted — endpoint accepts `AudioEffects` directly |

---

## Backend Changes

### `api-site/modules/library/api/schemas.py`
- Delete `UpdateGridConfigRequest` and `UpdateAudioConfigRequest`
- Add `from shared_contracts import GridConfig, AudioEffects`
- `MapAssetResponse`: replace 7 flat grid fields with `grid_config: Optional[GridConfig] = None`
- `MusicAssetResponse`: replace 11 effect/audio fields with `effects: Optional[AudioEffects] = None`, `volume: Optional[float] = None`, `looping: Optional[bool] = None`
- `SfxAssetResponse`: `default_volume` → `volume`, `default_looping` → `looping`

### `api-site/modules/library/api/endpoints.py`
- `update_grid_config` endpoint: `request: GridConfig`, pass `grid_config=request` to command
- `update_audio_config` endpoint: `request: AudioEffects`, pass `effects=request` to command
- `_to_media_asset_response()` map branch: `grid_config=asset.build_grid_config_for_game()` (method already exists, returns `GridConfig`)
- `_to_media_asset_response()` audio branch: `effects=asset.build_effects_for_game()` (method already exists, returns `AudioEffects`), `volume=asset.default_volume`, `looping=asset.default_looping`

### `api-site/modules/library/application/commands.py`
- `UpdateGridConfig.execute()`: replace 6 individual params with `grid_config: GridConfig`, call `asset.update_grid_config_from_game(grid_config)` (already exists)
- Audio command equivalent: replace flat effect params with `effects: AudioEffects` — investigate exact method signature on `MusicAsset` aggregate before implementing

### No aggregate changes needed
- `build_grid_config_for_game()` and `build_effects_for_game()` already exist and return the right contract types — reuse for response mapping
- `update_grid_config_from_game(GridConfig)` already exists — used by the simplified grid command

---

## Frontend Changes

### `rollplay/app/audio_management/components/AudioMixerPanel.js` (lines 104-124)
- `asset.effect_*` → `asset.effects?.eq`, `asset.effects?.hpf` etc.
- `asset.default_volume` → `asset.volume`
- `asset.default_looping` → `asset.looping`

### `rollplay/app/audio_management/hooks/useUnifiedAudio.js` (lines 1536, 1582-1593)
- `asset.default_volume` → `asset.volume`
- `asset.effect_*` block → `asset.effects?.hpf` etc.

### `rollplay/app/audio_management/hooks/webSocketAudioEvents.js` (lines 184, 276)
- `default_volume` → `volume` in constructed asset-like objects passed to load functions

### Asset library display components (investigate)
- Any reads of `asset.grid_width` / `asset.grid_height` in the asset library UI → `asset.grid_config?.grid_width` etc.

---

## Order of Work

1. Backend schema + response mapping + request simplification (all atomic — single commit)
2. Frontend audio field reads (AudioMixerPanel, useUnifiedAudio, webSocketAudioEvents) — must ship with step 1 (breaking change)
3. Frontend asset library grid display — investigate and update

---

## Verification

1. `docker exec api-site-dev pytest` — all api-site tests pass
2. `cd rollplay-shared-contracts && pytest` — contract tests unchanged
3. Load audio asset into DM mixer — volume and effects apply correctly
4. Load a map with existing grid config — grid renders correctly
5. Set grid cols > 100 in Edit Grid → Apply — no 422
6. Update audio effects on an asset in the library — effects persist and round-trip
