# Library v2 - Tags, Token Search, Collections

**Status**: planned · **Design contract**: `design-mock.html` (this dir) / live artifact: https://claude.ai/code/artifact/36b37c38-91ab-410c-af93-887cc65f8443

## Brief

Spotify as *inspiration, not clone*: search, browse, and save sets of media. Users group
assets with their own tags (`forest` maps; a `sea` set mixing music, images, and maps),
then find them with a token combobox search (`campaign: Big Campaign` + `tag: woodland` +
`type: Map, Image`). The left rail gets basic collections (manually managed, click-to-add)
and smart collections (saved filter sets), plus a campaigns section showing everything
associated with a campaign regardless of tags. Favorites and a grid⇄list toggle are in
scope; Recent/Archived are explicitly deferred. Smart collection creation is a **focused
view inside the library**, not a modal.

**The mock is a contract for structure and interaction, not pixels.** Where the mock and
the app's design system disagree, the app's system wins. The deltas are enumerated below -
each with a decided resolution, not an open question.

## Design deltas - deterministic resolutions

| # | Mock | Real app | Resolution |
|---|------|----------|------------|
| 1 | System font stack | Inter on `<body>` (`layout.js`) | Build in Tailwind utilities; Inter applies automatically. No action. The mock's font is an artifact-sandbox limitation. |
| 2 | Custom CSS props (`--surface-deep` etc.) | Token pipeline: `globals.css` `:root` vars → `tailwind.config.js` → `colorTheme.js` | Map mock tokens onto real ones. Mock's onyx rail = existing `--surface-elevated`. Hairlines on dark panels = existing `--border-subtle` (graphite 25% vs mock's smoke 9% - accepted delta). |
| 3 | Type accents (sage/amber/violet/slate) + star amber - don't exist | Only `--feedback-*` status colors exist | Add **6 new tokens** through the full pipeline (globals.css + tailwind.config + colorTheme.js): `--asset-map: #8FAE8B`, `--asset-music: #C9A36A`, `--asset-sfx: #A98FC0`, `--asset-image: #7FA3B8`, `--favorite: #D9A441`, `--surface-hover: #2B2724` (hover shade on dark panels). Do **not** overload `feedback-*` - semantic status ≠ type coding; `feedback-audio` stays for audio sync states. |
| 4 | Custom type badges | Shared `Badge` with token-driven variants (`color-mix` recipe) | Extend `Badge` `VARIANT_CLASSES` with `map/music/sfx/image` variants using the identical color-mix recipe over the new `--asset-*` vars. `AssetCard` passes `variant={asset.asset_type}`. |
| 5 | Gradient thumbnails | Real S3 thumbnails via `S3Image` | Map/image cards keep real thumbnails (grid will read busier than mock - expected). Audio cards get a new `AudioWaveThumb`: decorative deterministic waveform seeded by asset id, zero backend; duration chip from existing `duration_seconds` on music/sfx models. |
| 6 | Hover quick-action buttons | Existing right-click `ContextMenu` (Quick Look, Rename, Change Tag→"Edit Type", Add to Campaign, workshop bridges, Delete) | Context menu **stays** as-is. Hover quick actions (Quick Look, ＋ Collection) are additive. Favorite star always visible on card. |
| 7 | Mock header strip | Real `SiteHeader` + `SubNav` | Untouched. Library owns everything below the tab bar only. |
| 8 | Full-viewport flush rail | `DashboardLayout` `<main>` has `px-4..10` padding, with `isChildExpanded` escape hatch | Reuse `isChildExpanded`: when `activeSection === 'library'`, drop the padding; `LibraryShell` owns the two-pane layout. Rail: `bg-surface-elevated`, sticky within `#dashboard-main`'s scroll, fills main height. |
| 9 | No loading/error states in mock | `Spinner`, `EmptyState`, `ToastNotification` exist | Define three states: skeleton grid while loading, first-run empty (no assets → upload CTA), no-results (filters active → "clear filters" CTA). Reuse shared components. |
| 10 | Mock has no way to *edit* tags on an asset | - | **Gap in the mock, must ship**: context-menu item "Edit Tags" → shared `Modal` with a tag input (suggests existing tags, creates new on Enter). Without this, tags can never be created. PR 2. |

Rename note: the current context-menu label "Change Tag" (image↔map, music↔sfx) collides
with real tags now. Rename to **"Change Type"** in PR 2.

## Search semantics (the contract - encoded once, used everywhere)

- **Within a facet**: `type` and `campaign` are OR (`type: Map, Image` = either).
- **Tags**: AND - each added tag narrows (`forest` + `night` = both). Clicking a tag chip
  on a card toggles it in/out of the active filter.
- **Across facets**: AND. Free-text = case-insensitive substring on filename.
- These rules are one shared frontend function, used identically by browse filtering and
  smart-collection matching. The builder view states the rule in its hint text.
- **Tag normalization** (aggregate-enforced): trim, lowercase, collapse inner whitespace;
  max 32 chars; max 20 tags/asset.

## Architecture decision - where filtering runs

The dashboard already fetches the user's full asset list and filters client-side for
multi-select (existing `AssetLibraryManager` behavior). Per-user libraries are small.
**Decision: v1 filtering and tag aggregation are client-side** over the cached TanStack
list - instant token UX, no debounce round-trips, and the "aggregated meta tags" combobox
defaults (types + campaigns + tag counts) are a `useMemo` reduce over data we already hold.

Consequences, stated explicitly:
- **No** `GET /api/library/tags` endpoint, **no** `q`/`tags`/`asset_types` list params in
  v1 - they'd have zero callers (extend, don't invent). Revisit both only when pagination
  becomes necessary.
- Smart collections **store** filters (backend) but are **applied** client-side by the
  same shared filter function. No `/collections/{id}/assets` resolver endpoint in v1.
- Existing `asset_type`/`campaign_id` server params stay for back-compat.

## PR 1 - backend: tags + favorites (`api-site/modules/library/`)

- **Model** (`asset_model.py`): `tags = ARRAY(String), nullable=False, server_default '{}'`
  with a declared GIN index (declare in the model so autogenerate emits it);
  `favorite = Boolean, nullable=False, server_default false`.
- **Migration**: `docker exec api-site-dev alembic revision --autogenerate -m "asset tags and favorite"`
  - never hand-written. No new models → no `env.py` imports this PR.
- **Aggregate** (`asset_aggregate.py`): `tags`/`favorite` fields + `set_tags()` (applies
  normalization rules above), `set_favorite()`. Validation lives here, not in endpoints.
- **Commands** (`application/commands.py`): `UpdateAssetTags`, `SetAssetFavorite`
  (no "Command" suffix, per convention). Ownership check = same pattern as `RenameAsset`.
- **Endpoints**: `PATCH /api/library/{id}/tags` `{tags: [...]}`,
  `PUT /api/library/{id}/favorite` `{favorite: bool}`. Schemas are declarations only;
  responses include the new fields (extend existing asset response schema). UUIDs stay
  UUIDs internally; stringify only at the response boundary.
- **nginx**: none - `location /api/` catch-all already routes to api-site.

## PR 2 - frontend: browse experience (`rollplay/app/asset_library/`)

New components (all with GPL headers, all API calls via `authFetch`):
- `LibraryShell` - two-pane grid, wires `isChildExpanded`, owns view/context state.
- `LibraryRail` - sections per the mock: **Library** (All + 4 types w/ counts) ·
  divider · **Favorites** · divider · **Campaigns** (owned campaigns, reuse the same
  campaigns source the "Add to Campaign" context menu uses; counts from `campaign_ids`) ·
  divider · *(Smart) Collections land in PR 3* · Help pinned bottom. Rail styling:
  `bg-surface-elevated`, new `surface-hover` for item hover.
- `AssetFilterBar` - token combobox built directly on Headless UI `Combobox` primitives
  (the shared single-select `Combobox` stays untouched - it serves forms; promote a shared
  multi-token variant only if a second consumer appears). Default suggestions on focus:
  Types (static, counts), Your Tags (client aggregation, counts), Campaigns. Enter =
  name-contains chip; Backspace pops last chip; chips removable; "Clear all".
- `AssetListView` - table: mini-thumb, name, type pill, tags, size, campaigns, added, star.
  View toggle persisted to `localStorage` (same pattern as `assetGridScale`; slider stays).
- `AudioWaveThumb` - per delta #5.
- `AssetCard` updates - Badge type variants, clickable/toggleable tag chips (active =
  silver fill), always-visible star, meta row, hover quick actions.
- `EditTagsModal` - per delta #10, from the context menu ("Edit Tags"; rename old entry
  to "Change Type").
- Hooks: `useUpdateAssetTags`, `useToggleFavorite` (optimistic, invalidate on settle),
  extended asset query key; tag aggregation `useMemo` (not a server hook).
- States per delta #9.

## PR 3 - collections (backend + frontend)

Backend - new aggregate inside the library module:
- **Model** `collection_model.py` → `asset_collections`: `id` UUID PK, `user_id` FK→users
  CASCADE indexed, `name` String(120), `kind` PG enum `manual|smart`,
  `asset_ids ARRAY(UUID) NOT NULL DEFAULT '{}'` (manual), `filters JSONB` nullable (smart,
  shape `{version: 1, types: [], tags: [], campaigns: [], text: ''}` - campaign UUIDs as
  strings, JSONB is a serialization boundary), timestamps. **Import the model in
  `alembic/env.py`** or autogenerate misses the table.
- **Aggregate** `collection_aggregate.py` invariants: manual ⇒ `filters is None`;
  smart ⇒ `asset_ids == []`; name required/trimmed.
- **Commands**: `CreateCollection`, `RenameCollection`, `UpdateSmartFilters`,
  `AddAssetToCollection`, `RemoveAssetFromCollection`, `DeleteCollection`.
  `DeleteAsset` additionally calls repository `remove_asset_from_all_collections(asset_id)`
  (single `array_remove` UPDATE) so manual collections never hold dangling ids.
- **Queries**: `GetCollectionsByUser`.
- **Endpoints**: `GET/POST /api/library/collections`, `PATCH/DELETE .../{id}`,
  `POST/DELETE .../{id}/assets/{asset_id}`.

Frontend:
- Rail gains **Smart Collections** (bolt) and **Collections** (folder) sections with
  live counts (smart counts = shared filter fn over cached assets) + "＋ New" entries.
- `SmartCollectionBuilder` - focused in-pane view (swaps the browse view, no modal, no
  route): back link, name input, same `AssetFilterBar`, live match count + preview grid,
  Create/Save · Cancel · Delete (edit mode). "Save as Smart Collection" appears in the
  browse toolbar whenever filters are active → opens builder pre-filled.
- `CollectionPopover` - card hover "＋ Collection" add/remove toggle; collection context
  view shows members with manual-management hint.
- Selecting a smart collection loads its saved filters as live editable chips.

## Verification (per PR)

- PR 1: `docker-compose -f docker-compose.dev.yml up` - migration auto-runs on api-site
  start (container won't boot if it fails). Exercise tag/favorite endpoints through the
  running app; add module tests following existing library test patterns.
- PR 2/3: drive the real flows in the browser (token search stacking, tag toggle from
  cards, favorites, list toggle, campaign rail, builder round-trip). HMR is unreliable in
  Docker - cache clear + restart if edits don't appear. Patch notes entry per
  `rollplay/patch_notes/` conventions when the feature ships.

## Explicitly deferred (decided, not forgotten)

- Recent / Archived rail entries (user cut from v1).
- "Unassigned" campaigns rail entry (raised as a nice-to-have; revisit after v1).
- Drag-and-drop into collections (click-to-add ships first).
- Server-side search params, tag-aggregation endpoint, pagination - trigger: library
  sizes making full-list fetch impractical.
- Real waveform analysis for audio thumbs (decorative deterministic version ships).
