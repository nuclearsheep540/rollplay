# Contract Passthrough + Preserve Semantics for MapConfig

## Context

Two related defects keep biting fog (and would bite any future MapConfig field):

1. **Field drift** — handlers manually enumerate `MapConfig` fields when constructing the contract. Forgetting one drops the field silently. Recently surfaced when api-game's `map_load` handler dropped `fog_config` because it wasn't in the field list.

2. **Accidental clears in transit** — non-fog-specific code paths (chaperones, not owners) carry fog through their payloads. If the field arrives null/missing, naïve handling wipes the live state. We don't want a `map_load` (or any future tangential event) to be able to erase fog the DM has painted.

This plan addresses both with a focused refactor: aggregates own their contract translation, transport handlers stop knowing field names, and the few places where `null` could cause data loss adopt a **preserve-unless-explicit** rule.

Out of scope: changing the wire contract shape, adding sentinels, or generalising beyond `MapConfig` for now (the same pattern can extend to `ImageConfig` etc. later if it proves useful).

---

## Rule of thumb (the system this builds toward)

> Fields are owned by the contract.
> Translation is owned by the aggregate.
> Transport handlers shouldn't know either.

`null` semantics by surface:

| Surface | Direction | `null` for fog means | Rationale |
|---|---|---|---|
| `_restore_map_config` (cold→hot ETL) | init | "no fog yet" | Birth of runtime state; cold IS the source of truth. |
| `EndSession` (hot→cold ETL) | persist | "no fog at session end" | Captures the final state; user may have cleared. |
| `map_load` WS event | runtime mutation | **preserve existing** | This event isn't about fog — fog is incidental cargo. |
| `fog_config_update` WS event | runtime mutation | **clear** | Explicit fog mutation — null is the clear signal. |
| `PATCH /api/library/{id}/fog` (workshop) | persist | **clear** | Explicit user action via dedicated endpoint. |

Any *future* event/handler that carries `MapConfig` but isn't fog-owned must use the preserve rule. We codify that with a single helper so it's hard to skip.

---

## 1. Aggregate-owned contract projection

**File:** `api-site/modules/library/domain/map_asset_aggregate.py`

Add two methods on `MapAsset`:

```python
def to_contract(self, file_path: str) -> MapConfig:
    """Project this aggregate to a MapConfig contract for the api-game
    boundary. Single source of truth for which aggregate fields populate
    which contract fields — adding a new MapConfig field updates this
    method and every consumer (ETL, future ETL-like callers) benefits
    automatically.
    """
    return MapConfig.model_validate({
        "asset_id":          str(self.id),
        "filename":          self.filename,
        "original_filename": self.filename,
        "file_path":         file_path,
        "file_size":         self.file_size,
        "grid_config":       self.build_grid_config_for_game(),
        "fog_config":        self.build_fog_config_for_game(),
    })

def update_from_contract(self, contract: MapConfig) -> None:
    """Apply a MapConfig (final session state) back onto this aggregate.
    Inverse of to_contract(). Same single-source-of-truth role for the
    hot→cold direction.
    """
    if contract.grid_config is not None:
        self.update_grid_config_from_game(contract.grid_config)
    # Fog can legitimately be None (user cleared it) — propagate that.
    self.update_fog_config_from_game(contract.fog_config)
```

`MapConfig.model_validate(...)` is the safety net: unknown keys raise (because of `extra="forbid"`), missing optional fields take defaults, types are validated. Loud failure on shape drift, not silent.

## 2. ETL handlers shrink to orchestration

**File:** `api-site/modules/session/application/commands.py`

`_restore_map_config` (~line 352):

```python
@staticmethod
def _restore_map_config(session, asset_lookup, url_map) -> Optional[MapConfig]:
    if not session.map_config or not session.map_config.get("asset_id"):
        return None
    map_asset_id = session.map_config["asset_id"]
    map_asset = asset_lookup.get(map_asset_id)
    if not map_asset:
        logger.warning(f"Cannot restore map: asset {map_asset_id} not in campaign")
        return None
    if not isinstance(map_asset, MapAsset):
        return None
    fresh_url = url_map.get(map_asset.s3_key)
    if not fresh_url:
        logger.warning(f"Cannot restore map: asset {map_asset_id} has no presigned URL")
        return None
    return map_asset.to_contract(file_path=fresh_url)
```

`EndSession` block (~line 691):

```python
if asset_repo and final_state.map_state:
    try:
        map_asset = asset_repo.get_by_id(UUID(map_asset_id))
        if map_asset and isinstance(map_asset, MapAsset):
            map_asset.update_from_contract(final_state.map_state)
            asset_repo.save(map_asset)
            logger.info(f"Synced map state back to MapAsset {map_asset_id}")
    except Exception as e:
        logger.warning(f"Failed to sync map config for {map_asset_id}: {e}")
```

The conditional "only if grid changed / only if fog explicitly carried" gymnastics goes away — the aggregate handles that internally.

## 3. WS `map_load` passthrough + preserve

**File:** `api-game/websocket_handlers/websocket_events.py` (~line 1137 `map_load`)

Two changes:

**A. Passthrough construction** — stop enumerating fields by hand:

```python
incoming_mc = mc_data or {}

# Compute the merged values (preserve in-room state when incoming
# would null them — fog/grid are cargo here, not the subject).
grid_config_to_use, fog_config_to_use = _merge_preserved_map_fields(
    incoming=incoming_mc,
    existing=existing_map.get("map_config", {}) if existing_map else {},
)

map_config = MapConfig.model_validate({
    **incoming_mc,
    "grid_config": grid_config_to_use,
    "fog_config":  fog_config_to_use,
})
```

`{**incoming_mc, …overrides}` is the "structural passthrough" — any field MapConfig adds tomorrow that the frontend sends rides through automatically. Pydantic validates the whole thing.

**B. Preserve helper** — extract the merge logic so it's reusable:

```python
def _merge_preserved_map_fields(incoming: dict, existing: dict) -> tuple:
    """For surfaces where map_config is *cargo*, not the subject:
    incoming-null means "I don't know about this field, keep what's there."
    Returns (grid_config, fog_config).

    For surfaces where the field IS the subject (fog_config_update,
    PATCH /fog, EndSession), use the value as-is — null means clear.
    """
    grid = incoming.get("grid_config")
    if grid is None:
        grid = existing.get("grid_config")  # preserve

    fog = incoming.get("fog_config")
    if fog is None:
        fog = existing.get("fog_config")    # preserve

    return grid, fog
```

This is the only place in the codebase where the preserve rule is encoded. Other handlers either use it (cargo) or don't (owners).

## 4. Documentation

**File:** `rollplay-shared-contracts/shared_contracts/map.py`

Add a docstring on `MapConfig` covering the rule:

```python
class MapConfig(ContractModel):
    """Map state for ETL boundary (session start/end) and the runtime
    map_load WS event.

    null semantics for the optional fields (grid_config, fog_config,
    map_image_config) depend on the surface that's carrying this
    contract:

      • At ETL boundaries (cold→hot, hot→cold): null is meaningful,
        means "the user has no value for this".

      • At map_load (runtime "switch active map"): null means "no
        signal", and the receiver (api-game) preserves any existing
        value for that field. See _merge_preserved_map_fields.

      • At field-specific events (fog_config_update, PATCH /fog),
        the field is its own contract — see those endpoints.

    When adding a new optional MapConfig field, also add it to:
      - MapAsset.to_contract / update_from_contract  (api-site domain)
      - _merge_preserved_map_fields                   (api-game WS)
    Tests below the contract enforce the round-trip.
    """
    asset_id: str = Field(..., min_length=1)
    …
```

This + the helper function name make the rule self-documenting at the read sites.

## 5. Verification

**Backend tests:**

1. `cd rollplay-shared-contracts && pytest` — existing contract tests still pass, no new tests required (no contract change).

2. **New aggregate test** in `api-site` (informal smoke is fine for now):

```python
asset = MapAsset(...)
asset.update_grid_config(grid_width=10, grid_height=10)
asset.update_fog_config(mask="data:image/png;base64,abc", mask_width=256, mask_height=256)

contract = asset.to_contract(file_path="https://s3/x.png")
assert contract.grid_config.grid_width == 10
assert contract.fog_config.mask.startswith("data:image/png")

# Round-trip back
fresh = MapAsset(...)
fresh.update_from_contract(contract)
assert fresh.grid_width == 10
assert fresh.fog_config["mask"].startswith("data:image/png")
```

3. **Manual end-to-end**:
   - Workshop: paint fog on a map, save.
   - Start a session: confirm fog appears (cold→hot via to_contract).
   - In-game DM: load a different map, then load the original — fog still there (preserve rule).
   - In-game DM: paint over the fog, click Update Fog → players see it (fog_config_update path, unaffected).
   - End the session: reload workshop, fog persisted (hot→cold via update_from_contract).
   - In-game DM: load a fresh map that's never had fog — confirm starts empty (preserve correctly returns None).

## What this does NOT do

- Doesn't change the contract shape — no new sentinel for "explicit clear".
- Doesn't generalise to other aggregates (`ImageAsset`, `MusicAsset`) yet — same pattern can be applied later if their commands grow similar pain.
- Doesn't address the workshop UI's fog Discard removal (already shipped) or undo history (already shipped).
- Doesn't touch `fog_config_update` or `PATCH /fog` — they're owners and `null = clear` there is correct.

## File changes summary

**Modified:**
- `rollplay-shared-contracts/shared_contracts/map.py` — docstring only
- `api-site/modules/library/domain/map_asset_aggregate.py` — add `to_contract`, `update_from_contract`
- `api-site/modules/session/application/commands.py` — `_restore_map_config` and `EndSession` shrink to call the aggregate methods
- `api-game/websocket_handlers/websocket_events.py` — `map_load` switches to passthrough + preserve helper

**New:**
- (No new files — `_merge_preserved_map_fields` is a module-level helper inside the existing WS file)

**Untouched (deliberately):**
- `fog_config_update` WS handler
- `PATCH /api/library/{id}/fog` endpoint
- The fog engine, frontend FogPaintControls, undo/history hook
- In-game DM panel
