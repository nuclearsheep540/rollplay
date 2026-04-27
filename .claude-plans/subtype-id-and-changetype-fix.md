# Subtype `id` Redeclaration + `ChangeAssetType` Robustness

## Context

While testing fog of war, clicking a map asset in the workshop produced `?asset_id=None`, causing 422 errors. Root cause: a previously type-changed asset (`echo_cave_map.jpg`, id `6b04cdfd-…`) has `media_assets.asset_type='map'` but no `map_assets` row — its data still lives in `image_assets` from before the type change.

Two compounding problems:

1. **Every subtype model redeclares `id` as its own column** with FK back to `media_assets.id`. SQLAlchemy reads `MapAssetModel.id` from the *subtype* table, not the base. When the LEFT JOIN to `map_assets` returns no row, `.id` comes back NULL — even though `media_assets.id` has a valid UUID.
2. **`ChangeAssetType` only flips the `asset_type` tag** in `media_assets`. It doesn't migrate the joined-table row from the old subtype table to the new one, leaving the asset in a partially-broken state on every subsequent load.

The first problem is a footgun in the ORM mapping. The second is an incomplete command. Fixing both makes the data layer self-consistent.

---

## 1. Drop subtype `id` redeclaration (low-risk first)

Remove the `id = Column(UUID, ForeignKey('media_assets.id', ondelete='CASCADE'), primary_key=True)` block from each of:

- `api-site/modules/library/model/map_asset_model.py`
- `api-site/modules/library/model/image_asset_model.py`
- `api-site/modules/library/model/music_asset_model.py`
- `api-site/modules/library/model/sfx_asset_model.py`

Replace with `__mapper_args__` that just declares the polymorphic identity. SQLAlchemy auto-handles the FK on the underlying table (the DB schema already has it).

**No migration.** Physical schema unchanged. Only the Python ORM mapping changes.

After this change, `model.id` on any subtype always reads from `media_assets.id` — guaranteed to be a real UUID for any existing asset, even if the subtype joined-row is missing.

## 2. Make `ChangeAssetType` transactionally correct

Update `api-site/modules/library/application/commands.py` `ChangeAssetType.execute()`:

1. Load the current asset and capture `old_type`.
2. If `new_type == old_type`, no-op return.
3. Call a new repository method `change_subtype(asset_id, old_type, new_type)` that, in a single transaction:
   - `UPDATE media_assets SET asset_type = :new WHERE id = :id`
   - `DELETE FROM <old_type>_assets WHERE id = :id` (only if the source subtype has a real subtype table — base/unknown types skipped)
   - `INSERT INTO <new_type>_assets (id) VALUES (:id)` (only if the destination has a subtype table; subtype-specific columns default to NULL)
4. Refetch the asset by id — it now polymorphic-dispatches as the new type.
5. Return the refreshed aggregate.

Subtype-specific config (grid_width on a map, image_fit on an image, audio loop_start, etc.) is **deliberately discarded** on type change — semantically the user is saying "this is a different kind of asset now". The wire/UX implication: after type change, all subtype fields start at default/None. Document this behaviour in the command docstring.

The existing `check_asset_in_active_session` guard stays.

## 3. One-off cleanup for the existing broken asset

After (1) the asset will load (id is the base UUID), but the orphan `image_assets` row will still be there alongside an empty `map_assets` row. Clean it up explicitly so the asset is in a normal state:

```sql
INSERT INTO map_assets (id) VALUES ('6b04cdfd-657f-418e-9e24-2f2c248f48e5');
DELETE FROM image_assets WHERE id = '6b04cdfd-657f-418e-9e24-2f2c248f48e5';
```

Document the audit query for any other orphans:

```sql
SELECT ma.id, ma.asset_type, 'image_assets' AS orphan_table FROM media_assets ma JOIN image_assets i ON i.id = ma.id WHERE ma.asset_type <> 'image'
UNION ALL
SELECT ma.id, ma.asset_type, 'map_assets'   FROM media_assets ma JOIN map_assets   m ON m.id = ma.id WHERE ma.asset_type <> 'map'
UNION ALL
SELECT ma.id, ma.asset_type, 'music_assets' FROM media_assets ma JOIN music_assets x ON x.id = ma.id WHERE ma.asset_type <> 'music'
UNION ALL
SELECT ma.id, ma.asset_type, 'sfx_assets'   FROM media_assets ma JOIN sfx_assets   s ON s.id = ma.id WHERE ma.asset_type <> 'sfx';
```

---

## Read/write impact summary

| Surface | Before | After |
|---|---|---|
| `model.id` on subtype | reads `<subtype>_assets.id` (NULL on bad joins) | reads `media_assets.id` (always real) |
| `model.grid_width` etc. | unchanged | unchanged |
| Polymorphic load | unchanged | unchanged |
| `ConfirmUpload` create-new | INSERTs into both base and subtype | unchanged |
| `repository.save()` update branch | sets subtype-specific cols on subtype table | unchanged |
| `ChangeAssetType` | flips tag only — leaves orphan source subtype row, no destination row → asset becomes unloadable on next read | full row migration + refetch — asset is consistent on every read |
| Query perf | LEFT JOINs to subtype tables under `with_polymorphic` | identical SQL; one fewer column to read per subtype (`<subtype>_assets.id` no longer mapped) — sub-microsecond |

## Risks

- **`SubTypeModel.id` used in a `query.filter(...)` somewhere.** Grep before/after. Behaviour is semantically identical (PK-FK linked) but worth checking.
- **Test fixtures** that pass `id=` to subtype model constructors — should still work; SQLAlchemy maps via the inherited base attribute.
- **Removing the explicit `ondelete='CASCADE'` in the model.** The constraint exists at the DB level already (the migration that originally created these tables added it). Removing the Python redeclaration doesn't drop the SQL constraint.

## Verification

1. Restart `api-site`. Import-time mapper config still resolves (no SQLAlchemy mapper errors in startup logs).
2. `docker exec api-site-dev python -c "from main import app"` — imports cleanly.
3. Hit `GET /api/library/?asset_type=map` for the test user — broken asset returns a real `id`, not `"None"`.
4. Click the asset in workshop → URL has a real UUID → tool loads.
5. Smoke-test fresh asset: upload a new map → configure grid → save → reload. Round-trip still works.
6. Smoke-test `ChangeAssetType`:
   - Upload a throwaway image → change type to map → reload → confirm `map_assets` row exists, `image_assets` row gone, asset loads cleanly.
   - Change back to image → confirm reverse direction works.
7. `cd rollplay-shared-contracts && pytest` — should still pass (we didn't touch contracts).

---

## Files touched

**Modified:**
- `api-site/modules/library/model/map_asset_model.py`
- `api-site/modules/library/model/image_asset_model.py`
- `api-site/modules/library/model/music_asset_model.py`
- `api-site/modules/library/model/sfx_asset_model.py`
- `api-site/modules/library/repositories/asset_repository.py` — add `change_subtype` method
- `api-site/modules/library/application/commands.py` — rework `ChangeAssetType.execute`

**No new files. No DB migration. No frontend changes.**
