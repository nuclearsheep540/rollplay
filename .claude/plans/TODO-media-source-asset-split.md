# TODO — Split MediaAsset into MediaSource (file) + MediaAsset (alias/instance)

> Supersedes the earlier "campaign asset alias" sketch. This version is grounded in a code survey of
> `modules/library` and the current lock, and reflects the design decisions taken in discussion.

## Motivation

Today a single `MediaAsset` row conflates three concerns — the physical file, its config, and its
campaign associations. That blocks three things we want:

1. **Reuse** one uploaded file as different *instances* (same image as a battle map in one campaign,
   a handout in another), each independently configured.
2. **Per-instance config** so a runtime tweak in one campaign never leaks into another (today's ETL
   writes config back onto the *shared* asset).
3. **Storage dedup / marketplace foundation** — many instances, one physical file (no duplicate S3
   objects). Marketplace itself is out of scope; this is the data model that unblocks it later.

It also **simplifies the in-session lock** (see below), which is the concrete pain that kicked this off.

> Note from the investigation: the current lock is *correct* and adding a brand-new library asset to
> an active campaign is **not** actually blocked (`AssociateWithCampaign` checks the asset's *existing*
> `campaign_ids`, not the target — `commands.py:352-354`). What *is* locked is editing config on a
> shared asset while any of its campaigns has a live session. This plan removes that friction by
> making config per-instance.

## Decisions (locked in discussion)

| # | Decision |
|---|---|
| Config storage | Single `config JSONB` on `MediaAsset` — collapses today's polymorphic subclass tables. |
| Alias lifecycle | Aliases live in the **user's library** (`campaign_id = null`); once assigned to a campaign, the alias is lockable when that campaign's session is `ACTIVE/STARTING/STOPPING`. |
| Ownership | `user_id` = uploader, for both entities, for now. Marketplace file-copy/bucket is **out of scope**. |
| Upload-time dedup | **Out of scope** (marketplace work). Sharing/aliasing an existing source is the reuse path we build. |
| Naming | Reuse `MediaAsset` for the alias; new `MediaSource` for the file. |
| `content_type` | On **`MediaSource`** — the immutable file/family fact (`image/*`, `audio/*`). |
| `asset_type` | On **`MediaAsset`** — the *usage* (`MAP/IMAGE/MUSIC/SFX`), editable, with a family guard. |
| Mixed sibling types | **Allowed** — instances of one source may differ in `asset_type` *within the family* (that's the reuse win). |

## Current state (verified)

- `MediaAsset` (`media_assets`): `id`, `user_id` (owner), `filename`, `s3_key` (unique),
  `content_type`, `file_size`, `asset_type`, `campaign_ids ARRAY(UUID)`, timestamps —
  `modules/library/model/asset_model.py:30-58`.
- **Config is joined-table polymorphic**: `MapAssetModel` (`map_assets`) has
  `grid_width/height/opacity/offset_x/offset_y/line_color/cell_size` + `fog_config JSONB`
  (`map_asset_model.py:40-53`); audio/image subclasses similarly.
- Association is the `campaign_ids` **array** on the asset (no join table) —
  `asset_aggregate.py:37,96-115`.
- Lock: `check_asset_in_active_session(asset.campaign_ids)` (`commands.py:31-40`) → `AssetInUseError`
  → **409**, applied to Associate / Rename / ChangeType / UpdateGrid / UpdateFog / UpdateAudio /
  UpdateImage / Delete.
- ETL reads config from the asset and writes runtime tweaks back onto it
  (`session/commands.py` `_restore_*_config`, `_extract_and_sync_game_state`).

---

## Target model

### `MediaSource` — new table `media_sources` (the physical file)
| Column | Source (today) |
|---|---|
| `id` PK | new |
| `user_id` (uploader) FK users | `media_assets.user_id` |
| `filename` | `media_assets.filename` |
| `s3_key` unique | `media_assets.s3_key` |
| `content_type` | `media_assets.content_type` |
| `file_size` | `media_assets.file_size` |
| `created_at` / `updated_at` | — |

Immutable after upload. Deleting a source (and its S3 object) is **refcount-gated** — blocked while
any `MediaAsset` references it.

### `MediaAsset` — repurposed `media_assets` (the alias/instance)
| Column | Notes |
|---|---|
| `id` PK | keep |
| `media_source_id` FK → `media_sources` | the file it aliases |
| `user_id` (owner) FK users | uploader for now |
| `campaign_id` FK → campaigns, **nullable** | `null` = library; set = assigned/lockable |
| `asset_type` | `MAP/IMAGE/MUSIC/SFX`; guarded against source family |
| `config JSONB` | all type config (grid/fog/image/audio) lives here |
| `tags JSONB` | array of strings (library org / future search) |
| `display_name` nullable | per-instance rename (rename becomes alias-local) |
| `created_at` / `updated_at` | — |

Drop the polymorphic subclass tables (`map_assets`, audio/image subclasses) — their columns fold into
`config`.

### Family guard (the only `asset_type` rule)
```python
ALLOWED_TYPES = { "image/*": {IMAGE, MAP}, "audio/*": {MUSIC, SFX} }
# on create/edit of a MediaAsset:
assert asset.asset_type in allowed_for(source.content_type)
```
`MediaSource` is authoritative on the **family**; `MediaAsset` owns the **type within it**. No
"keep siblings in sync" mechanism.

### The lock, simplified (alias-scoped)
```python
def check_alias_locked(asset, session_repository):
    if asset.campaign_id:
        s = session_repository.get_active_for_campaign(asset.campaign_id)
        if s and s.status in (ACTIVE, STARTING, STOPPING):
            raise AssetInUseError(...)
```
- Single `campaign_id` → no array scan.
- Library aliases (`campaign_id = null`) are **never** locked → the "accidental map / change type"
  correction is free and local.
- Editing alias-A can't lock alias-B of the same source.

---

## Implementation steps

### Step 1 — Models
**Files:** `modules/library/model/source_model.py` (new `MediaSource`), `model/asset_model.py`
(repurpose: drop file/s3 columns + `campaign_ids` + polymorphic mapper; add `media_source_id`,
`campaign_id`, `config`, `tags`, `display_name`). Delete `map_asset_model.py` + audio/image subclass
models. Import the new model in `alembic/env.py`.

### Step 2 — Domain
**Files:** `domain/media_source_aggregate.py` (new), `domain/asset_aggregate.py` (rework):
- `MediaAsset`: `media_source_id`, `campaign_id`, `asset_type`, `config` dict, `tags`, methods
  `assign_to_campaign` / `unassign` (replace `associate/disassociate_with_campaign`), config setters
  operating on the JSONB blob, and the family guard.
- Move S3/file concerns to `MediaSourceAggregate`.

### Step 3 — Repositories
**Files:** `repositories/asset_repository.py` (+ new source repo). Drop the polymorphic hydration;
hydrate `config` from JSONB. Add `find_assets_for_source`, `count_refs(source_id)` for GC gating.

### Step 4 — Commands + the lock
**File:** `application/commands.py`
- Replace `check_asset_in_active_session(asset.campaign_ids, …)` with the single-`campaign_id`
  `check_alias_locked` at every guarded command.
- `ConfirmUpload` → create a `MediaSource` (+ optionally a first library `MediaAsset`).
- `AssociateWithCampaign` → `AssignAssetToCampaign` (set `campaign_id`; family already fixed).
- Config/rename/type/delete commands operate on the alias; `Delete` of a `MediaSource` is
  refcount-gated.
- **Copy-or-fresh:** creating a new campaign alias from a source that already has aliases → optionally
  copy `config` from a chosen existing alias.

### Step 5 — API + schemas
**Files:** `api/endpoints.py`, `api/schemas.py` — split responses into source + asset shapes; add
`tags`, `display_name`; `asset_type` edit endpoint (family-validated); keep 409 semantics.

### Step 6 — Data migration (Alembic, autogenerate + hand-authored data step)
- Create `media_sources`; for each existing `media_assets` row, insert one `MediaSource` (file fields).
- Rewrite `media_assets`: add new columns; fold subclass config → `config` JSONB.
  - Tokens v2 ([tokens/02](tokens/02-dm-tokens-workshop-images.md), 2026-07-23) adds two more folds:
    `map_assets.token_config` (NPC baseline) and `image_assets.focal_areas` (purpose-keyed crops).
    Both become per-instance under this split — which *dissolves* tokens-v2 decision 22's
    shared-baseline caveat and simplifies its in-play guard to a single `campaign_id` check.
- **Explode** `campaign_ids`: one row with `[c1,c2,c3]` → 3 `MediaAsset` rows (one per campaign,
  `config` copied); empty array → 1 library alias (`campaign_id = null`).
- **Remap session JSONB asset refs** for exploded rows: `sessions.map_config` `{"asset_id"}`,
  the `map_token_state` board keys (tokens v1), `map_token_seed` keys (tokens v2 PR 9), and
  `image_asset_id` fields inside stored tokens (tokens v2 PR 10) must point at the campaign's
  own alias id.
- Drop `campaign_ids`, the file columns, and the subclass tables.
- Run in Docker per repo convention.

### Step 7 — Contract + ETL
**Files:** `rollplay-shared-contracts/shared_contracts/{map,image,audio,assets}.py`,
`modules/session/application/commands.py`
- ETL references switch `asset_id` → `media_asset_id` (the alias); read config from the alias; write
  runtime tweaks back to the **alias**, never the source. Update `_restore_*`, `_build_session_users`
  siblings for assets, `_extract_and_sync_game_state`, and the api-game payload/restore.

### Step 8 — api-game
**File:** `api-game/app.py` (+ handlers) — store/reference `media_asset_id`; config restore reads the
alias config. Presigned URLs resolve via the alias → source `s3_key`.

### Step 9 — Front-end
**Files:** `app/asset_library/*`, `app/game/components/{ImageSelectionSection,MapSelectionModal,MapControlsPanel}.js`
- Upload → creates a source (+ library alias). Library shows aliases; family-constrained `asset_type`
  picker; `tags` + `display_name`; the copy-or-fresh prompt when aliasing a reused source.
- Runtime "add" assigns an alias to the active campaign (still not blocked for library aliases).
- All config edits target the alias.

### Step 10 — Verify
- Reuse: one image → a MAP alias + an IMAGE alias, independently configured, one S3 object.
- Lock: config edit on a library alias always allowed; on a campaign-assigned alias blocked only while
  that campaign's session is live; sibling aliases unaffected.
- Family guard rejects `image → MUSIC`.
- Delete of a source blocked while aliases exist.

---

## Out of scope (explicit)
- Marketplace: shared/public visibility, the "copy file once into a marketplace bucket" flow, and
  cross-user ownership of aliases.
- Upload-time content-hash dedup.

## Open sub-decisions (resolve during build)
1. **Assign = move vs copy:** does assigning a library alias to a campaign set its `campaign_id`
   in place, or create a new campaign alias and keep the library one as a template? (Data model
   supports both; recommend "create campaign alias, copy-or-fresh from existing" so the library keeps
   reusable templates.)
2. `tags` as JSONB array vs a normalized `tags` table (JSONB is fine until marketplace search).
3. Whether `MediaSource` needs a stable `asset family` enum derived from `content_type`, or we derive
   it on the fly.
