# Map Tokens v2 — DM Token Controls, Workshop Baseline, Token Images

> **Status:** PLANNED (designed with Matt, 2026-07-23). Builds on [01-token-system.md](01-token-system.md) (v1, decisions 1–15).
> **Scope:** three tracks. (0) Board preen: stack access UX, exact-cell re-snap on grid change, silent-drop instrumentation. (1) DM token controls in the runtime: DM-only movement of DM tokens, per-token `locked` and `hidden` flags with server-side per-recipient visibility filtering. (2) Workshop token tool: DM authors an NPC token baseline on the map asset, seeded into sessions via ETL with a seed-snapshot three-way merge; plus token images with a reusable focal-area select.
> **Governing philosophy:** [product-principles.md](../core/product-principles.md), inform maximally, constrain minimally. The new ACL is a *product* rule Matt chose (DM's pieces are the DM's), not canon enforcement; the in-play workshop guard is warn-and-proceed, not a lock.

---

## 1. Product decisions (settled with Matt, 2026-07-23)

Continues v1 numbering (1–15 in [01-token-system.md](01-token-system.md)).

16. **DM tokens are DM-only to move** (supersedes decision 2 *for npc tokens only*). Players can no longer move, remove, or configure `kind: "npc"` tokens; PC tokens keep the full decision-2 table-feel (anyone moves, attribution logs the social correction). Enforced server-side in both lanes (committed ops and drag grabs), mirrored client-side (no drag affordance on npc discs for players).
17. **`hidden` flag on DM tokens, default true at creation.** Hidden tokens are invisible to players and **must never reach player clients** (filtered server-side per recipient, including drag relays and holds; a websocket inspector must not reveal the ambush). The DM always sees them, rendered ghosted (reduced opacity + eye-slash affordance). Toggleable pre-placement on the draft row and post-placement. Supersedes decision 5's ambush mechanism ("hidden monster = unplaced monster"); tokens still render above fog (that part of decision 5 stands).
18. **`locked` flag on DM tokens.** A locked token cannot be moved or removed by anyone, **including the DM**, until unlocked. `configure` stays allowed (that is how the DM unlocks, and lock/hide/label tweaks shouldn't require unlocking). DM-only toggle. Invariant: lock applies to *placed* tokens only; the concept structurally cannot exist on a local draft (drafts live client-side, tokens only exist on boards), so the draft row shows hidden (toggleable) and lock (disabled, "place to lock").
19. **PC tokens are out of scope for lock/hidden, entirely.** Not just "unset": the toggles are not accessible for pc tokens and the contract forbids `hidden`/`locked` true on `kind: "pc"` (data invariant, axis 3).
20. **Exact-cell re-snap on grid change** (supersedes decision 7's "no auto re-snap"). Practice disproved "drift is cosmetic": Matt hit it. Rule: a token in cell C4 under the old grid moves to C4's center under the new grid, deterministically. Fallbacks: cell index clamped into bounds when the new grid removed rows/columns; nearest-cell-center when the token wasn't addressable under the old grid (gridless map gaining a grid, out-of-bounds position). Grid disabled → positions untouched.
21. **Stack cycling** (implements decision 13's "future affordance if overlap annoys" — it now annoys). A no-move click on a stack cycles which token renders on top (the gesture is currently semantically empty: grab + immediate put-back). Local render-order override only, no protocol change; plus a stack-count badge on hover. Decision 13's stacking-allowed rule is untouched, and no occupancy policy is introduced (a trap under a PC is a *narrative* event, the DM's to adjudicate).
22. **Workshop NPC baseline lives on the MapAsset** (`map_assets.token_config` JSONB), the same cold home as grid and fog. This is compatible with v1 §2's warning ("token state must NOT go on the asset"): that warning is about *people-referencing board state* leaking across campaigns via the `campaign_ids` many-to-many. The baseline holds only `kind: "npc"` tokens with `owner_user_id: None` — map authoring, not people state. Consequence, accepted: campaigns sharing a map share its authored token baseline, exactly as they share its fog regions and grid. Boards (which contain PC tokens) remain session-scoped, per v1.
23. **Runtime never writes the baseline.** In-session token changes persist across pause/resume on the session row (`sessions.map_token_state`, the v1 rail) and die at FINISH. Persistent tokens between games = author them in the workshop. Grid/fog keep their existing bidirectional sync; tokens are deliberately one-way (tokens are game state, grid/fog are map properties).
24. **Seed snapshot + three-way merge at session start.** The session row gains `map_token_seed` JSONB: a copy of each board as seeded at start (the merge base, like git's merge-base commit; it never feeds the game directly). Every session start runs, per map: `merge(seed, paused_board, current_baseline)` with per-token whole-token resolution, **play wins on conflict**:
    - PC tokens always come from the paused board (never in a baseline).
    - DM token untouched by play (board version == seed version, or absent from both): the current baseline decides (update/add/remove).
    - DM token touched by play (moved/configured/toggled/removed): the board version stands; a killed goblin stays dead even if still in the baseline.
    A fresh session (empty seed, empty board) degenerates to "baseline decides everything" — one uniform code path, no flags. Equality ignores server-stamped fields (`updated_at`, `created_by`). Float x/y equality is exact: snapped moves genuinely re-equal, freehand nudge-and-return reads as touched — accepted under "board config == baseline" semantics.
25. **`in_play` is derived, never stored** (Matt: non-sticky). A board is in play iff its paused state differs from its seed. A PC placed then removed leaves the board equal to seed → not in play. Consumed only by the workshop guard; api-game never learns the concept exists.
26. **Workshop guard: hard-block active, warn-and-proceed paused** (facilitate-don't-enforce). Token edits on an asset: 409 `asset_in_active_session` while any associated campaign has an ACTIVE/STARTING/STOPPING session (existing rule, no force override); 409 `board_in_play` when a non-FINISHED session's board for this map diverges from its seed, **overridable** with a `force` flag after the UI's "this board is in play, changes might cause conflicts — proceed?" dialog. Un-conflicting paused-time tweaks land on resume via the merge (that's the point); conflicting ones lose to play and apply next session (that's what the dialog warns about).
27. **Token images are workshop-only** (supersedes decision 3's "no token art"; players still cannot set or change token images anywhere). `MapToken.image_asset_id` references a library image asset. The crop is the *image's* attribute, not the token's: `image_assets.focal_areas` JSONB keyed by purpose (`{"token": {x, y, size}}` in source-image native px; square, so one side length). Purpose-keyed so `character` slots in later with zero migrations — **no character-facing work in this plan**. Every token using an image shares its crop; adjusting it moves them all (it is the image's "token face"). Selecting an image for a token always prompts the area select (pre-filled if the image already has a `token` area); changing a token's image re-prompts for the new image and never touches the old image's area.
28. **Area-select interaction: `react-easy-crop`** (new dependency, MIT, zero-dep). Pan/zoom-under-a-fixed-round-frame, `cropShape="round"` previews the literal token, `onCropComplete` returns natural-pixel `{x, y, width, height}` — our storage shape with no conversion. Rendering needs no cropping and no canvas: circle of diameter D shows area `{x, y, size}` via CSS `background-size: (naturalWidth × D / size)px auto` + `background-position: -(x × D / size)px -(y × D / size)px`. CSS image embedding also sidesteps the CDN CORS problem AssetDownloadManager works around for `fetch()`.
29. **Cross-session behavior confirmed** (resolves v1 §6.4): a new session starts with a clean board seeded from the current baseline. The finished session's row keeps final board + seed as history.

## 2. Current-system facts the design rests on (researched 2026-07-23)

### Realtime / api-game
- **Connections are keyed by `user_id`** (`connection_manager.py:11,30-34`); the WS endpoint takes `user_id` as a query param (`app_websocket.py:21-26`). **A single-recipient send already exists:** `ConnectionManager.send_to_player(room_id, user_id, message)` (`connection_manager.py:107-118`), wrapped by `RoomManager.send_to_player` (`:275-277`).
- **DM identity is on the session doc**: `dungeon_master` dict (`gameservice.py:21`), checked via `GameService.is_dm(room_id, user_id)` (`gameservice.py:247-252`); DM-gate precedent at `websocket_events.py:932`.
- **Two surfaces deliver token state to clients**: `initial_state` (assembled per-socket at `app_websocket.py:37-51`, `map_token_state` at line 48 — already single-recipient, trivial to filter) and the `map_token_state_update` broadcast (handler builds it at `websocket_events.py:1647-1657`, dispatcher broadcasts identical payload to all via `update_room_data` at `app_websocket.py:450`). Also verify the GET room HTTP hydration path (`app.py:271` per v1) — if it serves `map_token_state`, it must filter by requesting user or stop serving tokens.
- `update_room_data` is a serial identical-payload loop (`connection_manager.py:182-204`); per-recipient filtering = replace that one call site with a per-user loop over `room_users`, choosing full vs filtered arrays by `is_dm`.
- Client applies board fragments **wholesale** (`mapTokenWebSocketEvents.js:21-36`, full-array replace), so divergent per-recipient arrays need zero client rework: a reveal/hide is just the token appearing in / vanishing from the next fragment.
- Token ops: `MapToken.model_validate` at `websocket_events.py:1595`; `CONFIGURABLE_TOKEN_FIELDS = ("label", "footprint")` whitelist at `map_token_ops.py:28`; atomic builders `map_token_ops.py:36-86`; `GameService.apply_map_token_op` `gameservice.py:462-491`. Drag lane + holds: `websocket_events.py:1661-1739`, `map_token_holds.py`.
- **Grid state is in the separate `active_maps` collection** (`mapservice.py:16-22,36`), while boards live on the session doc (`gameservice.py:28`). `MapService.update_map_config` reads the existing doc (old grid) **before** the `$set` (`mapservice.py:147-161`) — the old grid needed for exact-cell re-snap is available in the `map_config_update` handler (`websocket_events.py:1429-1474`).

### Cold / api-site
- Central guard `check_asset_in_active_session` (`library/application/commands.py:29-43`) raises `AssetInUseError` → 409; used by grid (`:562-563`), fog (`:610-611`), image-config (`:755-756`) etc. In-play detection extends this pattern in the new tokens command only.
- Session row already has `map_token_state` JSONB (`campaign/model/session_model.py:61-67`); `map_token_seed` is a sibling column (autogenerate migration).
- ETL wiring: `StartSession` restores boards via `_restore_map_token_state` (`session/application/commands.py:388-423`, orphan pruning + per-token revalidation — the merge slots in here); pause/finish extraction at `:689-883` (boards travel whole at `:861-864`). At pause time the baseline cannot have drifted since seed for *active* periods (workshop hard-blocked while active), but CAN drift while paused (decision 26) — which is why the merge compares against the stored seed, never the current baseline.
- Image subtype: `ImageAssetModel` (`library/model/image_asset_model.py:18`) already carries `visual_overlays`/`motion` JSONB (`:47-48`) — `focal_areas` JSONB joins them. Aggregate `ImageAsset` (`image_asset_aggregate.py:29`); command precedent `UpdateImageConfig` (`commands.py:711-785`) with PATCH `/{asset_id}/image-config` (`endpoints.py:1006`).
- MapAsset already stores map authoring config (`grid_*` columns + `fog_config` JSONB, `map_asset_model.py:40-53`) — `token_config` JSONB joins it, same aggregate pattern (`update_*_config` mutator + contract build).

### Workshop / frontend
- Adding a tool touches **two** `VALID_TOOLS` lists: `(authenticated)/workshop/map-config/page.js:12` and `MapConfigTool.js:28`. Toolbar is FontAwesome solid icons (`MapConfigToolbar.js:6-13`, `ToolButton` at `:39-52`); right-panel switches on derived flags (`MapConfigTool.js:407-409, 535-622`); center preview is `MapDisplay` (`:503-531`).
- The workshop is asset-scoped, not campaign-scoped (no campaign/session context anywhere in it) — the in-play check is server-side, surfaced via the PATCH response.
- 409s surface as **inline panel text** today, not toasts (`useUpdateGridConfig.js:26-28` throws; rendered at `MapConfigTool.js:551, 613-615`). The `board_in_play` flow adds a confirm dialog on top of this pattern.
- Reuse: `AssetPicker` (`workshop/components/AssetPicker.js`, props `{assetType, onSelect, allowUpload}`, image upload already enabled in its config map) is the image picker; `useUploadAsset`/`AssetUploadModal` are the upload rails; grid/fog `useMutation` hooks are the save-hook template.
- Chip drag/drop conversion: `screenPointToSpace` (`shared/utils/screenToImage.js`); the silent gates live in `useMapTokens.dropCarriedToken` (`hooks/useMapTokens.js:289-302`).

### Contracts
- `MapToken` in `rollplay-shared-contracts/shared_contracts/map_token.py:20-30`; `ContractModel` is `extra="forbid"` (`base.py:9-18`) — **new fields must land in the contract and both services together.** Dev images `pip install -e` the package AND bind-mount it (`docker-compose.dev.yml:34,50`), so contract edits hot-reload in dev; prod images bake it (`docker/prod/*/Dockerfile`) and need rebuilds. Bump `pyproject.toml` version for traceability.

## 3. Design

### 3.1 Contract changes (`shared_contracts/map_token.py`)

```python
class MapToken(ContractModel):
    # ... existing fields unchanged ...
    hidden: bool = False          # players never receive hidden tokens; DM sees ghosted
    locked: bool = False          # move/remove refused for everyone (incl. DM) until unlocked
    image_asset_id: Optional[str] = None  # library image asset; crop = that image's focal_areas["token"]
```

- Contract-level defaults are `False`/`None` for wire compatibility (existing stored boards revalidate cleanly; pc tokens are always unlocked/visible). **`hidden=True` as a default is a UI decision** at NPC draft creation (decision 17), not a contract default.
- Model validator: `kind == "pc"` requires `hidden == False and locked == False` (decision 19).
- `CONFIGURABLE_TOKEN_FIELDS` grows to `("label", "footprint", "hidden", "locked")`. `image_asset_id` is **not** runtime-configurable (workshop-only, decision 27); it enters play only via baseline seeding.
- New shared helpers: `shared_contracts/grid_math.py` — `cell_at_point(x, y, grid)`, `cell_center(col, row, grid, footprint)`, `resnap_token(token, old_grid, new_grid)` implementing decision 20 (exact cell → clamp → nearest). Consumed by api-game (runtime re-snap) and api-site (workshop-grid-save re-snap of baseline tokens). The JS mirror stays in `map_tokens/config.js`/`GridOverlay` (precedent: `grid_cell_label` already mirrors `cellAtPoint`).
- New contract `TokenImageRef {url: str, token_area: Optional[FocalArea]}` + `FocalArea {x: float, y: float, size: float}`; `SessionStartPayload` gains `token_images: Dict[str, TokenImageRef] = {}` keyed by image asset id (§3.6).

### 3.2 Runtime ACL + lock + hidden (api-game)

**One enforcement point per lane**, beside the existing validation:

- `map_token_update` (`websocket_events.py:1561`): resolve the target token's `kind` (incoming token for place; board lookup for move/remove/configure). `kind == "npc"` and sender is not DM (`GameService.is_dm`) → deny (new `map_token_op_denied` personal send via `send_to_player`, mirroring the drag-deny shape). Target `locked == True` and op is move/remove → deny for everyone. Configure passes lock (decision 18) but hidden/locked toggles require DM.
- `map_token_drag` (`:1661`): grab on an npc token by a non-DM → deny (`map_token_drag_denied`, existing snap-back rail). Grab on a locked token → deny for everyone including the DM (no drag affordance client-side; the deny is the backstop).
- **Per-recipient filtering** (decision 17): a `filter_board_for(user_id)` helper drops `hidden` tokens unless the recipient is DM. Applied at:
  1. `initial_state` (`app_websocket.py:48`) — already per-socket, filter in place.
  2. `map_token_state_update` — replace the single `update_room_data` call (`app_websocket.py:450`) with a per-user loop: DM connections get the full array, others the filtered one. Only this dispatch site changes; the handler still builds one canonical message.
  3. Drag relay: grab/move/release frames and hold notifications for hidden tokens go to DM connections only.
  4. GET room hydration (`app.py:271`): filter by requesting user, or drop tokens from the payload if the endpoint has no user context (clients hydrate via `initial_state` anyway) — decide at implementation after reading the endpoint's auth.
- **Adventure-log leak prevention**: ops on hidden tokens produce **no** log lines (a "placed Goblin at D7" line is the ambush on a plate). New line on reveal: configure flipping `hidden` true→false logs "*Matt revealed Goblin at D7*" (cell suffix per existing `grid_cell_label` rules). Hiding, locking, unlocking: no log lines. Existing pc social-correction line unchanged.
- Holds cleanup, staleness, disconnect paths: unchanged (lock/ACL denials happen before a hold is granted).

### 3.3 Runtime UI (frontend)

- **Draft row** (`MapTokenCreator.js:102-121`): hidden toggle (eye / eye-slash, default hidden per decision 17) next to the discard ✕; lock icon rendered disabled with "place to lock" tooltip (decision 18 invariant). Placement carries the draft's `hidden` into the `place` op.
- **Placed npc chips** (`MapTokenCreator.js:78-101` list): lock and hidden toggle buttons per chip → `configure` ops. Panel-housed controls per decision 14; no new floating UI.
- **Disc rendering** (`MapTokenLayer.js`): hidden tokens (DM only receives them) render ghosted (~50% opacity + eye-slash glyph). Locked tokens show a small padlock glyph; pointerdown on a locked token is inert client-side (server deny is the backstop). Players get no drag affordance on npc discs (cursor default, no grab), since ACL would deny anyway.
- Players never receive hidden tokens, so no player-side render/interaction logic for them exists at all.

### 3.4 Phase 0 preen (independent of the feature, ships first)

1. **Stack cycling + badge** (decision 21): on pointerup with `!drag.moved`, collect tokens whose discs contain the point; if >1, advance a local z-override (component state keyed by token id, layered over the `updated_at` sort at `MapTokenLayer.js:311-316`). Hover on a multi-token point shows a count badge.
2. **Exact-cell re-snap** (decision 20): in the `map_config_update` handler, before `MapService.update_map_config` applies, capture the old grid (already read at `mapservice.py:147-149`); after the grid `$set`, re-snap the map's board via `resnap_token(old_grid, new_grid)` per token, persist with one atomic board `$set` (new `GameService` method), and broadcast a `map_token_state_update` fragment alongside the `map_config_update` broadcast. Grid→disabled: no re-snap. (When PR 8 lands, the workshop grid save does the same for `token_config` baselines in the `UpdateGridConfig` command, using the same shared math.)
3. **Silent-drop instrumentation**: `dropCarriedToken` returns a reason (`no-carry`, `no-layer-metrics`, `no-active-map`, `outside-image`, `send-failed`); the chip animates the ghost back to itself on failure instead of vanishing, and logs `console.debug('[map-tokens] drop refused:', reason)`. This is the diagnostic for the unresolved no-grid placement report (traced 2026-07-23: no gate in the path is grid-dependent; prime suspect is layer metrics before image load).

### 3.5 Workshop token tool + baseline (api-site + workshop frontend)

**Cold model.** `map_assets.token_config` JSONB: `{"version": 1, "tokens": [MapToken-shaped dicts]}` — npc-only, `owner_user_id: None`, stable ids minted at authoring (these ids are the merge identity; a re-seeded baseline token keeps its id across sessions). `MapAsset` aggregate gains `update_token_config(tokens)` (validates each through `MapToken`, enforces npc-only) and `build_token_baseline()` for ETL. Autogenerate migration.

**Command + endpoint.** `UpdateTokenConfig` command; `PATCH /api/library/{asset_id}/tokens` with body `{token_config, force: bool = False}`. Guards in order (decision 26):
1. Ownership + asset-type checks (grid-command pattern, `commands.py:507-576`).
2. `check_asset_in_active_session` → 409 `asset_in_active_session` (never overridable).
3. In-play check: for each associated campaign's non-FINISHED sessions, compare `map_token_state[asset_id]` vs `map_token_seed[asset_id]` (equality helper ignoring `updated_at`/`created_by`; missing seed with a non-empty board counts as in-play — pre-migration sessions preserve, never destroy). Diverged and not `force` → 409 `board_in_play` with a distinguishing error code in the payload.

No NGINX changes (`/api/library` is routed). Also: apply the same two-guard set to `SetImageFocalArea` (§3.6) for consistency with every other asset-editing command.

**Workshop frontend.**
- `'tokens'` joins both `VALID_TOOLS` lists; toolbar button uses `faMapPin` (`@fortawesome/free-solid-svg-icons`, already installed), shortcut T.
- Right panel: token list editor — "+ Add token" (label + footprint, MapTokenCreator's row pattern), per-token hidden toggle (default true), lock toggle, avatar button (§3.6), delete. Save via a `useUpdateTokenConfig` mutation hook (grid-hook template, `authFetch`, 409 special-casing for **both** codes: `asset_in_active_session` → inline error text as today; `board_in_play` → confirm dialog → retry with `force: true`).
- Center: baseline tokens render on the `MapDisplay` preview as discs and drag-place/move exactly like the runtime (reuse the disc rendering and pointer-capture mechanics from `MapTokenLayer`/`MapTokenChip` against local state instead of WS sends — extract the shared pieces rather than duplicating; the layer's render/drag core becomes the shared unit, its WS commit wiring stays runtime-only).
- Grid save in the workshop re-snaps baseline tokens (decision 20, shared `grid_math`), inside `UpdateGridConfig`.
- Stretch, not core scope: read-only ghost overlay of a paused session's live board so "un-conflicting" is visible rather than guessed.

### 3.6 Token images + focal areas (api-site + shared frontend)

**Cold model.** `image_assets.focal_areas` JSONB, purpose-keyed (decision 27): `{"token": {"x": 340, "y": 120, "size": 512}}`, native px of the source image. `ImageAsset` aggregate gains `set_focal_area(purpose, area)` with bounds sanity (non-negative, size > 0). Command `SetImageFocalArea`; `PATCH /api/library/{asset_id}/focal-area` body `{purpose, area}`. Autogenerate migration.

**Reusable area-select.** `app/shared/components/FocalAreaModal.js`: `react-easy-crop` (aspect 1, `cropShape="round"`), props `{imageUrl, initialArea, onConfirm, onCancel, title}` — purpose-agnostic; the caller owns persistence. This is the component `character_image_area` reuses later; nothing character-specific in this PR.

**Workshop flow** (decision 27): avatar button on a baseline token → `AssetPicker` (`assetType: 'image'`, `allowUpload: true`, existing upload rails) → on select **or** upload-complete, open `FocalAreaModal` pre-filled from the image's existing `token` area → confirm saves via `SetImageFocalArea` and sets the token's `image_asset_id` in the draft config. Changing a token's image always re-prompts for the new image; the old image keeps its own area. A "remove avatar" action clears `image_asset_id`.

**Runtime delivery.** Baseline tokens carry `image_asset_id` into boards via seeding. The image set is **fixed at session start** (images are workshop-only + workshop is hard-blocked while active), so: `StartSession` collects distinct `image_asset_id`s from the merged boards, resolves each image asset (regardless of campaign association — a shared map's baseline may reference images outside this campaign), signs URLs in the existing parallel-presign pass, and ships `SessionStartPayload.token_images` (§3.1). api-game stores it on the session doc and includes it in `initial_state`; URLs ride the existing `urls_expire_at` regime. Unresolvable image ids degrade to color discs (log, don't fail the start).

**Rendering.** Disc becomes a CSS background crop (decision 28) in both the runtime layer and the workshop preview; the source image's `naturalWidth` is read from the loaded element (no extra storage). No image → color disc exactly as today. Hidden+image tokens ghost the image like they ghost the disc.

### 3.7 ETL: seeding, merge, seed snapshot (api-site)

- **Migration:** `sessions.map_token_seed` JSONB, default `{}` (autogenerate).
- **`StartSession`** (`_restore_map_token_state` extends): for every campaign map asset with a baseline **and** every board present on the session row, produce `merged = merge_token_boards(seed=row.map_token_seed.get(asset_id), board=row.map_token_state.get(asset_id), baseline=asset.token_config)` per decision 24. Ship merged boards in `SessionStartPayload.map_token_state` (existing field); write the new seed (`{asset_id: baseline_copy}`) onto the session row in the same transaction that flips status. Existing orphan pruning and per-token revalidation stay.
- **`merge_token_boards`** is a pure function in the session module (unit-test target): per-token whole-token, play-wins, equality ignoring `updated_at`/`created_by`. ~30 lines plus the equality helper (shared with the in-play check in §3.5).
- **Pause/finish:** byte-for-byte unchanged — boards extract to `map_token_state` as in v1; the seed column is untouched by extraction (it only changes at start). Auto-pause sweeper rides for free (v1 precedent).
- **Back-compat:** rows predating the seed column read as empty seed; merge semantics then treat every existing board token as play-touched (preserved) — the conservative correct default.

## 4. PR sequence

Continues v1 numbering (PRs 1–5 shipped/built per 01-token-system.md).

| PR | Contents | Ships on |
|---|---|---|
| **6 — Board preen** | §3.4 in full: stack cycling + badge; exact-cell re-snap (shared `grid_math.py` + runtime wiring + JS mirror alignment); silent-drop feedback + instrumentation. Contract *package* change (new module) but no model changes. | `small-fixes` (Matt: "fixes first") |
| **7 — DM token controls** | §3.1 contract fields + validator + `CONFIGURABLE_TOKEN_FIELDS`; §3.2 ACL/lock/filtering/log rules; §3.3 runtime UI. One coherent unit: the flags, their enforcement, and their controls. | feature branch |
| **8 — Workshop token tool + baseline + seeding v1** | §3.5 minus the in-play distinction: `token_config` column + aggregate + `UpdateTokenConfig` + PATCH (hard 409 for active; **interim conservative rule** — 409 for any paused session with a non-empty board on this map, no force); workshop tool UI (toolbar, panel, preview placement); `StartSession` seeds clean boards (board absent → baseline; board present → restore as-is). No seed column yet. | feature branch |
| **9 — Seed merge + in-play flow** | §3.7: `map_token_seed` column + merge + seed writes; §3.5 guard refinement: in-play = board≠seed, `force` override + workshop confirm dialog (replaces PR 8's interim rule). | feature branch |
| **10 — Token images** | §3.6 + §3.1 image fields: `focal_areas` column + command + PATCH; `FocalAreaModal` + `react-easy-crop` dep; workshop avatar flow; `image_asset_id` + `token_images` contract fields; ETL URL resolution; CSS-crop rendering. | feature branch |

Every PR: GPL headers on new files, autogenerate-only migrations ([[feedback_alembic_autogenerate]]), contract-touching PRs (6, 7, 8, 9, 10) verified against both services (dev bind-mount hot-reloads contracts; prod images rebuild). New frontend hooks use `authFetch` (workshop PATCHes); runtime token traffic stays WS-only. No NGINX changes anywhere.

## 5. What we will NOT build

- No occupancy/cell-exclusivity rules (decision 13/21: stacking is legal; conflicts are narrative).
- No lock/hidden on pc tokens, no player-facing token-image controls, and no character focal-area UI (the modal + storage are purpose-ready; the character flow is a later PR).
- No per-token crop (the area is the image's attribute; divergent crops = duplicate the image).
- No field-level merge; per-token whole-token only, play wins.
- No stored `in_play` flag, no api-game knowledge of baselines/seeds.
- No runtime "reset board to baseline" action (the data model supports it for free; future affordance).
- No workshop ghost-overlay of live boards in core scope (stretch item in §3.5).
- No runtime editing of `image_asset_id` (workshop-only by decision 27).

## 6. Verification (desktop, two-browser where relevant)

- **PR 6:** stack two tokens → click cycles, badge counts, drag-off still works; grid resize/offset change → tokens land in the same lettered cell (check via log labels), row-removal clamps, gridless→gridded snaps to nearest; failed chip drop → ghost returns + console reason. Unit: `grid_math` (exact cell, clamp, nearest, disabled), re-snap board op.
- **PR 7:** player browser: cannot grab/move npc tokens (deny snaps back), hidden tokens absent from DOM *and* WS frames (inspect network tab — the leak test); DM browser: ghosted hidden tokens, lock blocks own drag, unlock restores; reveal emits the log line, hidden ops emit none; pc flows byte-identical to v1. Unit: ACL matrix (kind × role × op × locked), filter helper, pc-flag validator.
- **PR 8:** author baseline (tokens + hidden/lock) → fresh session shows it seeded; pause → workshop edit on that map 409s (interim rule); active session → 409 both codes; unrelated map stays editable; npc-only enforced. Unit: `UpdateTokenConfig` guards, npc-only validation, seeding rule.
- **PR 9:** the walkthrough matrix from design discussion — mid-battle pause resumes byte-for-byte; paused-time trap-in-next-room lands on resume; trap-under-PC lands stacked (dialog accepted); play-touched NPC keeps play state, edit applies next session; PC placed-then-removed → board not in play → no dialog; FINISH → next session clean-seeds. Unit: `merge_token_boards` (the full case table), equality helper, in-play derivation incl. missing-seed back-compat.
- **PR 10:** upload → area prompt → circular token shows the chosen face at all zoom levels; re-select image → re-prompt; shared-crop edit moves every token using that image; non-campaign-associated image still resolves in-session; missing image degrades to color disc; hidden image-token invisible to players. Unit: focal-area command guards + bounds, `token_images` assembly.
- **Process:** `/code-review` before each commit is proposed; Matt runs all git writes and alembic commands ([[feedback_never_git_write_commands]]); HMR-in-Docker caveat applies to frontend QA loops.

## 7. Open items

1. GET room hydration (`api-game/app.py:271`): filter tokens by requesting user vs drop tokens from the HTTP payload — decide when reading the endpoint's auth context (PR 7).
2. PR 8's interim paused-board rule is deliberately stricter than the final semantics; if it bites during the gap, pull PR 9 forward rather than softening PR 8.
3. Stretch: workshop ghost overlay of paused live boards (§3.5).

## 8. Relationship to the MediaSource/MediaAsset split

[TODO-media-source-asset-split.md](../TODO-media-source-asset-split.md) (instances referencing raw media; config lives only on the per-campaign instance) is not a conflict with this plan; it retroactively improves it (noted 2026-07-23):

- `token_config` and `focal_areas` are ordinary asset config: at split time they fold into the alias `config` JSONB exactly like the `grid_*` columns, `fog_config`, and `visual_overlays`/`motion`. Nothing in this plan's storage shape resists the fold.
- **Decision 22's accepted caveat dissolves.** Today campaigns sharing a map share its authored token baseline (as they share fog/grid). Under the split, each campaign's map alias carries its own baseline, so campaign B can never collide with campaign A. The same applies to focal areas: they become per-instance, so two campaigns may crop the same art differently — a feature under "config on the instance", not drift.
- The in-play guard (§3.5) simplifies from a `campaign_ids` array scan to the alias's single `campaign_id`, matching the split plan's `check_alias_locked` shape.
- PR 10's "resolve token images regardless of campaign association" exists *because* baselines are shared cross-campaign today; under the split, a per-campaign baseline can reference campaign-local or library aliases and the special case softens.
- One obligation this plan adds to the split's Step 6 migration: session JSONB keyed by asset id (`map_token_state` from v1, `map_token_seed` from PR 9, and `image_asset_id` refs inside stored tokens) must be remapped when a multi-campaign asset explodes into per-campaign aliases — the same remap the `map_config` `{"asset_id"}` thin ref already requires. Recorded in the split TODO.

Sequencing verdict: build this plan now, on the current model. The cost the split inherits is two more config keys to fold and JSONB key remaps it already owed; waiting for the split would gate live features on a large migration for no functional gain.
