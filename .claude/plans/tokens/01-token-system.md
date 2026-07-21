# Map Tokens v1 — Plan

> **Status:** COMPLETE on `map-tokens` (2026-07-20). Preen track (PRs 1–2) shipped to main via PR #148. Token track (PRs 3+4+5) built, code-reviewed, and QA'd on the branch — pending merge. Decisions 11–15 settled 2026-07-20 (hold-lock, markers-only v1, stacking allowed, panel-housed chips, NPC = DM-rose); spike PR 0 dissolved (§3.3). Remaining open: §6.4 cross-session clean-board confirmation, §6.5 seat_layout persistence (optional preen), and the live-drag fast-follow (§3.3 gate).
> **Scope:** physical representations of character/NPC positions on the battle map, live-synced across the table, persisted across pause/resume.
> **Governing philosophy:** [product-principles.md](../core/product-principles.md) — inform maximally, constrain minimally. A token system is the purest test of it: the entire feature is "a shared board everyone can touch."

---

## 1. Product decisions (settled with Matt, 2026-07-19)

1. **One token system, no PC-vs-DM split.** Players get tokens; the DM gets ad-hoc tokens for monsters/NPCs. Same object, same rules.
2. **Anyone can move any token.** Like a real table — you *can* pick up the wrong mini. Ownership is **annotation, not ACL**: we attribute ("Matt moved Elara's token"), we never block.
3. **Appearance v1:** a disc in the owner's **character color** (see decision 9 — colors are character-owned), with the **character name** subtitled beneath on a 50%-opacity background. No token art in v1.
4. **No combat/initiative linkage.** Tokens are purely positional.
5. **Tokens render above fog of war.** Consequence accepted: a token inside a fogged region is still visible — a DM stages an ambush by *not placing* the monster token until reveal (exactly like a real table). Related fix folded in: **grid must render above fog** (today fog covers grid — see §3.5).
6. **Tokens persist** across pause/resume via the session ETL.
7. **One coordinate system.** Positions are `{x, y}` in **map-image-native pixels**, center-anchored. Grid snapping is a *client-side interaction affordance* at drag-end, not a storage format. Rationale: gridless maps force x,y to exist anyway; cell storage would couple positions to mutable/deletable `grid_config` (retune ⇒ every token teleports; grid off ⇒ positions undefined). x,y drift after a grid retune is cosmetic and self-heals on next move. No auto re-snap (that would be the app moving pieces nobody touched); a manual "re-snap all" DM convenience is a *future* affordance if ever missed.
8. **Sizing:** `diameter = footprint × cellPx`. `footprint` ∈ {1, 2, 3, 4} cells per side, labeled with D&D size names ("Medium — 5 ft", "Large — 10 ft", "Huge — 15 ft", "Gargantuan — 20 ft"; Small shares 1 with Medium). `cellPx` = `grid_config.grid_cell_size` when a grid exists, else `GRIDLESS_ASSUMED_CELL_PX = 100` (modern VTT convention: Roll20 70px, Foundry 100px default) clamped to `[smallerMapDim/50, smallerMapDim/10]`. PC tokens default footprint 1; DM ad-hoc tokens get a footprint picker.
9. **Colors belong to characters, not seat indexes** (Matt, 2026-07-19: "we're setting character's colors, and the seat represents the color of the character, *not the other way around*"). The current seat-index color system predates having any character data shape and is now backwards. Folded into this work as its own PR (§3.8): `characters.color` is the cold authority; seats and tokens *display* the sitter's/owner's character color.
10. **The concept is named `MapToken`** (agreed 2026-07-19). Bare "token" collides with auth/Spotify tokens throughout the codebase, `CharacterToken` misnames NPC pieces, and `EntityToken` overloads DDD's "entity". **Boundary rule:** the qualified name is canonical at every shared surface — contract class `MapToken`, WS events `map_token_update`/`map_token_drag`/`map_token_state_update`, hot/cold field `map_token_state`, slice `app/map_tokens/`, components `MapTokenLayer`/`MapTokenChip`/`MapTokenCreator`. *Inside* the slice, contextually-obvious short names (`token`, `token_id`) are fine — readability over stutter.
11. **Hold-lock on interaction** (Matt, 2026-07-20). While a token is actively grabbed, other players' grabs are **denied** — first hand on the mini wins; the loser's optimistic drag snaps back. This is a **concurrency lock, not an ownership check**: decision 2 stands untouched (anyone can still move any token — just not one currently in someone's hand). Server keeps an ephemeral in-memory per-room hold map (no Mongo); holds clear on release, holder disconnect, or staleness timeout.
12. **v1 is markers-only** (Matt, 2026-07-20). Lane 2 sends `grab`/`release` only — token lifts with the "held by *name*" nameplate on remote clients, and lands at the committed position on release. Mid-drag `move` streaming is a **fast-follow**, not v1: the event contract reserves the `move` phase, and the client work on top is small (~throttled sends + remote lerp + staleness timer). The known relay risk to test before enabling it: `update_room_data` sends serially per client, so one slow client head-of-line-blocks the room (see §3.3).
13. **Stacking allowed** (Matt, 2026-07-20). Two tokens on one square is legal — rejecting or resetting a deliberate drop would be movement-rule enforcement (axis 2). Last-moved renders on top so a stack is always separable; a cosmetic render-only fan-out is a future affordance if overlap annoys.
14. **Placement homes in existing panels — no floating tray** (Matt, 2026-07-20). Player tokens live as chips in the **party drawer** (showing on-map/off-map state); placement is **drag from the drawer onto the map**. The DM's "+ Add token" (label + footprint) lives in **`CombatControlsPanel`** — UI housing only, no combat/initiative data linkage (decision 4 stands). Supersedes the §3.6 map-edge strip.

### Facilitate-don't-enforce, applied to tokens

| Axis | Ruling |
|---|---|
| **Completeness** | A token needs an identity (owner ref or label) and a position to exist. That's it. |
| **Canon-correctness** | Movement range, walls, opportunity attacks, "whose turn is it" — **never enforced, never warned**. Future inform-affordances (distance dragged, "that's 6 cells ≈ 30 ft") are welcome but out of v1 scope. |
| **Data invariants** | Hard-block only: valid op shape, finite numeric x/y, footprint ∈ 1–4, token id uniqueness within the session, known `asset_id` key format. Bounds are *soft* (client clamps to the image; server doesn't know image dimensions and doesn't pretend to). |

**Inform-maximally deliverables shipped in the same PRs as the freedom** (per [[wire-the-hint]]): the "held by *name*" nameplate while someone drags (social-correction signal — you *see* someone grab the wrong token), and the attribution log line when a mover ≠ owner. These are not polish; they're the other half of the feature.

---

## 2. Current-system facts the design rests on (researched 2026-07-19)

### Hot storage (api-game / MongoDB)
- Map state is **not** in `active_sessions` — it lives in the separate **`active_maps`** collection, one doc *per map* per room, one `active: True` at a time (`api-game/mapservice.py:16-22, 55-59`). Each doc nests the full shared `MapConfig` contract, including `grid_config` and `fog_config`.
- The session doc (`active_sessions`, `GameSettings` at `api-game/gameservice.py:25-39`) holds the **people/table state**: `seat_layout`, `seat_colors` (index→hex), `player_metadata` (per-user: `character_id`, **`character_name`**, class, HP…), `audio_state`, `spotify`, `campaign_id`.
- **All map mutation is WebSocket, not HTTP** — `map_load`, `map_clear`, `map_config_update`, `fog_config_update` are client→server WS events whose handlers do a server-side Mongo write then broadcast (`api-game/app_websocket.py:82-417`). The server stays authoritative; WS is just the transport. Fog's handler is the model: one atomic `$set` on a nested path, then broadcast a **fragment** `{filename, fog_config, updated_by}` (`websocket_events.py:1470-1501`, `mapservice.py:200-203`).
- **Ephemeral relay precedent exists:** `remote_audio_resume` validates and broadcasts with **no Mongo write, no log** (`websocket_events.py:871-906`). `combat_state` similarly relays a flag that is never persisted.
- **Broadcast echoes to the sender** — `ConnectionManager.update_room_data` has no exclude-sender option (`connection_manager.py:182-204`). Clients must filter their own echoes.
- WS `initial_state` on connect carries the session-doc fields (seats, colors, player_metadata, audio…) but **no map** — clients hydrate maps via `map_request`/GET (`app_websocket.py:36-52`).

### Cold storage & ETL (api-site / PostgreSQL)
- The `sessions` row keeps **thin JSONB pointers** (`map_config = {asset_id}`, `audio_config`) *except* `spotify_config`, which stores a **full state dump** (`campaign/model/session_model.py:50-65`) — the precedent for storing real state on the session row.
- Grid + fog cold-persist on the **MapAsset** row via `MapAsset.to_contract / update_from_contract` (`library/domain/map_asset_aggregate.py:369-406`). **Tokens must NOT follow this path:** `asset_model.py:54` shows `campaign_ids` is an **ARRAY** — assets are many-to-many with campaigns, so people-referencing token state on the asset would leak between campaigns sharing a map.
- ETL wiring points: cold→hot is `StartSession` building `SessionStartPayload` (`session/application/commands.py:520-546`); hot→cold is `_extract_and_sync_game_state` POSTing `/game/session/end?validate_only=True` then `PauseSession`/`FinishSession` phase 2 writing the session row (`commands.py:618-780, 860-873, 999-1007`). The **auto-pause sweeper reuses `PauseSession` wholesale** (`expired_session_cleanup.py:46-60`), so tokens ride it for free.
- Contracts are typed Pydantic models in **`rollplay-shared-contracts/shared_contracts/`** with `extra="forbid"` (`base.py:9-18`) — new fields must be added to the contract or the wire rejects them, and **both services must pick up the bump together**. ⚠️ Per [[dev-images-stale-deps]]: check how `shared_contracts` is installed in the dev images; if baked at image build, rebuild **both** api-site and api-game images after the contract change.
- `final_state.players` (seat_position/seat_color) is fetched at pause and **discarded** (`commands.py:648`) — seat colors do not survive cold. `DisconnectFromGame` carries a commented-out TODO for position tracking (`commands.py:1221-1223`) — this feature fills that hole at the session level.

### Frontend (game runtime)
- The map scene is composed by `MapDisplay` (`map_management/components/MapDisplay.js`). Pan/zoom is a CSS `translate3d(...) scale(...)` on **`contentRef`** (`:249-257`), written straight to the DOM during gestures (`:83-87`). **Everything that must move with the map lives inside `contentRef`.** ⚠️ The `{/* Future: Position markers */}` comment at `MapDisplay.js:376` is **outside** `contentRef` — do not build there.
- Current z-order inside `contentRef` (bottom→top): map image (auto) → **grid 5** (20 in edit mode) → **fog canvas 25** → fog cursor 26 → fog labels 30 (`GridOverlay.js:291`, `FogRegionStack.js:220`, `MapDisplay.js:350`, `FogRegionLabels.js:130`). **Fog covers grid today** — the DOM comment at `MapDisplay.js:317` claims the opposite of what the z-indices do.
- Alignment pattern: overlays never read camera x/y/scale. They size to the rendered image box (`mapImageRef.clientWidth`), convert with `renderScale = clientWidth / naturalWidth` (`GridOverlay.js:118-158`), and inherit the transform by being `contentRef` children. Screen→local mapping uses `getBoundingClientRect()` ratios (`FogRegionStack.screenToMask`, `FogRegionStack.js:68-79`).
- Grid math helpers are already exported "for future placement/token features": `cellBounds`, `cellAtPoint` (`GridOverlay.js:34-60`).
- Drag precedent to copy: **FogRegionStack** — pointer events + `setPointerCapture` + refs (not state) for the hot path + sub-pixel threshold skip (`FogRegionStack.js:140-190`). `MapImageEditor.js` is dead code (imported nowhere); ignore it.
- WS routing: one connection (`game/hooks/useWebSocket.js`), **handler registry first** (`registerHandler(eventType, fn)`), then a legacy switch. Map and fog register handlers and expose typed `send*` functions (`useMapWebSocket.js:91-166`, `fogWebSocketEvents.js:44-76`). Fog is its own slice (`app/fog_management/`) — the structural template for a token slice.
- Seat color lookup: `playerSeatMap[userId] → {seatIndex, seatColor}` (`GameContent.js:134-145`), CSS vars `--seat-color-${seatIndex}` set on `:root` (`:501-506`). Colors are backend hex; `getSeatColor()` returns Tailwind *names* — mind the two representations.
- Adventure log: `addToLog(message, type, userId)` (`GameContent.js:946-964`); system lines render in LobbyPanel, attributed lines in AdventureLog with seat-color borders.

### Pre-existing defects folded into this work
1. **`api-game/app.py:847` calls `connection_manager.broadcast_to_room(...)` — that method does not exist** (only `update_room_data`). The character hot-sync endpoint's broadcast path would raise `AttributeError`. Adjacent to tokens (it's how `character_name` changes reach `player_metadata` mid-session). Fix: one line, in PR 1.
2. **Grid-under-fog z-order** (product decision #5). Fix in PR 2 alongside the token layer so the stack is re-ordered once, deliberately.
3. **`audio_track_config` ETL asymmetry.** Hot→cold reads the stash: `_extract_and_sync_game_state` syncs per-track tweaks from BOTH active channels *and* `audio_track_config` onto the asset rows (`commands.py:654-671`). Cold→hot never refills it: `SessionStartPayload.audio_track_config` exists in the contract but `StartSession` leaves it `{}`. Net effect: no data is lost cold, but after a resume the hot stash starts empty, and a track that isn't re-loaded through `_restore_audio_config` (i.e. wasn't sitting in a channel at pause) re-enters play without its saved tweaks — the client builds its config from `AssetRef`, which carries no audio fields. Fix in PR 3: populate `audio_track_config` at StartSession from the campaign audio assets' saved configs, mirroring the extract.

---

## 3. Design

### 3.1 Data model

New shared contract `shared_contracts/map_token.py`:

```python
class MapToken(ContractModel):
    id: str                      # uuid4 string, minted client-side at placement
    kind: Literal["pc", "npc"]   # rendering/default hints only — NOT a permission class
    owner_user_id: Optional[str] # pc: the seated user; npc: None
    character_id: Optional[str]  # pc convenience ref; display still resolves live
    label: Optional[str]         # npc display name; pc fallback if owner absent
    x: float                     # map-image-native px, center anchor
    y: float
    footprint: int = 1           # cells per side, 1–4
    created_by: str              # user_id, attribution
    updated_at: str              # ISO-8601, stamped server-side on each committed op
```

**Hot:** new field on the session doc — `active_sessions.map_token_state: dict[asset_id → list[MapToken]]` (`GameSettings` gains `map_token_state: dict = {}`). Keyed **per map asset**, so every map in the session keeps its own board; switch maps and each retains its pieces (multiple battle mats). Lives on the *session* doc, not `active_maps`, because tokens are people/table state (like `seat_layout`, `player_metadata`), the session doc already hydrates via `initial_state`, and it keeps us out of `MapConfig`'s contract surgery (`extra="forbid"`, `_merge_preserved_map_fields`, MapAsset round-trip — none of which we touch).

**Cold:** new JSONB column `sessions.map_token_state`, same shape, default `{}`. Same thin-row philosophy as `spotify_config` (full state dump precedent). Migration via autogenerate **only** (see §5, PR 3).

**Derived at render, never stored** (field-drift rule): color and display name resolve live from `player_metadata[owner_user_id]` — `.color` (the **character's** color, §3.8) and `.character_name` (fallback `label`, fallback "Unknown Adventurer"). Because `player_metadata` is seeded from *all* campaign members at session start, a persisted token keeps its owner's character color even while the owner is offline; neutral graphite is only the last-resort fallback (owner left the campaign, no color chosen). NPC tokens use `label` + the NPC default tone.

### 3.2 Realtime: two lanes

**Lane 1 — committed state (authoritative).** New WS event **`map_token_update`**, following the fog handler shape exactly:

```
client → { event_type: "map_token_update",
           data: { asset_id, op: "place"|"move"|"remove"|"configure",
                   token: MapToken (or token_id for remove), updated_by } }
```

Server handler (`websocket_events.py`): validate shape + invariants → apply the op to `map_token_state.<asset_id>` as **one atomic Mongo update** (`$push` / `$pull` / positional `$set` — per-op array surgery, *not* whole-array replace from the client, so two players committing different tokens simultaneously never clobber each other; same-token races are last-write-wins, resolved socially like a real table) → broadcast fragment:

```
server → { event_type: "map_token_state_update",
           data: { asset_id, tokens: [<full array for that map>], op, token_id, updated_by } }
```

Full-array-per-map fragment = atomic truth (fog's "no-flicker" philosophy; the array is tiny), while `op`/`updated_by` metadata drives attribution. Sender receives its own echo and treats it as authoritative reconciliation.

**Lane 2 — ephemeral gesture stream (hold-lock + relay).** New WS event **`map_token_drag`** — **no Mongo write, no log**, but (per decision 11) no longer a pure stateless relay: the server keeps an **in-memory per-room hold map** `{room_id: {token_id: holder_user_id}}` in api-game:

```
{ event_type: "map_token_drag",
  data: { asset_id, token_id, phase: "grab"|"release", x, y, holder_user_id } }
  # phase "move" is RESERVED for the live-drag fast-follow (decision 12), not sent in v1
```

- **`grab`** → if the token is unheld, server records the hold and broadcasts; if held, server sends a **deny** to just the requester (`map_token_drag_denied {token_id, held_by}`), no broadcast.
- **Client grab is optimistic:** the local drag starts on pointerdown (no round-trip wait); on the rare deny, the drag cancels and the token snaps home. First hand on the mini wins.
- **`release`** → server clears the hold and broadcasts; the client immediately commits via lane 1 (`op: "move"` — or `"place"` for a first drop from the drawer). Both messages ride the same WS connection, so per-sender ordering is preserved.
- Remote clients: `grab` → lift affordance + "✋ held by *name*" nameplate + locally refuse grabs on that token; `release` → hold rendering until the lane-1 fragment lands, then reconcile.
- Sender filters its own echo (`holder_user_id === thisUserId` → ignore).
- **Ghost-hold cleanup** (server + client mirror): a hold clears on (a) `release`, (b) holder disconnect (hook the existing disconnect path), or (c) a staleness timeout (~10 s server-side; clients also revert the lift on the same signal). A dropped stream loses nothing — the token stays at its last committed position.
- **Fast-follow (live streaming):** enable throttled `move` frames (~30–50 ms) + remote lerp (~10 lines) + a ~2 s frame-staleness revert. Gate on the §3.3 head-of-line test, driven with devtools network throttling.

**Why this respects the server-authoritative principle:** the rule protects *state*. Lane 2 is presence — "what someone's hand is doing" — and can never become state without the lane-1 commit, which the server alone writes. The hold map is presence too: ephemeral, in-memory, dies with the process, never persisted. This is the same distinction the codebase already draws for `remote_audio_resume` and `combat_state`. The CLAUDE.md "HTTP API → MongoDB → broadcast" flow is, in the map domain's practice, "WS event → server Mongo write → broadcast" (`map_load`, `fog_config_update`) — same authority, different transport. Tokens follow the domain idiom.

**Hydration:** `map_token_state` joins the WS `initial_state` payload (`app_websocket.py:36-52`) and the GET `/game/{room_id}` response (`app.py:271`) — late joiners and the initial HTTP room load both get the full board; no extra fetch. (No NGINX changes: everything rides existing `/ws/` and `/api/game/` routes.)

### 3.3 ~~Spike — PR 0~~ Dissolved (decided 2026-07-20)

**PR 0 no longer exists.** Matt chose markers-only for v1 outright (decision 12), which removes the latency question from the v1 critical path — `grab`/`release` at human hand frequency is far below any relay concern. What the spike would have measured becomes the **gate on the live-drag fast-follow**, recorded here:

- **Finding (code-read, 2026-07-20):** the original acceptance criterion ("no unbounded asyncio send-queue growth") watched the wrong failure mode. `ConnectionManager.update_room_data` (`connection_manager.py:182-204`) has **no send queue** — it's a serial loop of `await websocket.send_json(...)` per client. The real risk at 20–30 Hz is **head-of-line blocking**: one slow client's TCP backpressure delays every other client's frames.
- **Fast-follow gate:** with the `move` phase enabled behind a config flag, Matt drives two browsers + one devtools-throttled third client; healthy clients' relay RTT must stay comfortably under ~150 ms p95 despite the throttled peer. If it degrades, fix candidates are per-connection send tasks or drop-stale-frames for lane 2 — decided then, not now.

### 3.4 New frontend slice: `app/map_tokens/`

Structural template: `fog_management` (hook-owned state at GameContent level, components mounted by MapDisplay, WS events file, `index.js`).

```
app/map_tokens/
├── components/
│   ├── MapTokenLayer.js      # contentRef child; renders discs + name subtitles; owns drag
│   ├── MapTokenChip.js       # party-drawer chip: on-map/off-map state; drag-out placement (see 3.6)
│   └── MapTokenCreator.js    # DM "+ Add token" (label + footprint), mounted in CombatControlsPanel
├── hooks/useMapTokens.js     # map_token_state slice of client state; per-map selector; hold map mirror
├── mapTokenWebSocketEvents.js # registerHandler('map_token_state_update'|'map_token_drag'|'map_token_drag_denied'), send fns
├── config.js              # TOKEN_FOOTPRINTS, GRIDLESS_ASSUMED_CELL_PX, clamp, staleness timeouts
└── index.js
```

- **MapTokenLayer** mounts inside `contentRef` (`MapDisplay.js` ~`:373`, beside GridOverlay — **not** the `:376` placeholder), sized to `mapImageRef`'s rendered box, `renderScale` math per GridOverlay. Screen→image via the `getBoundingClientRect` ratio pattern; drag via pointer capture + refs + threshold (FogRegionStack model). Absolutely-positioned divs per token (seat-color disc, name subtitle at 50% opacity) — a handful of DOM nodes; no canvas needed at this scale.
- **Snapping** at drag-end when `grid_config?.enabled`: nearest cell center for footprint 1, nearest cell-corner alignment for even footprints — via `cellAtPoint`/`cellBounds`. No grid → no snap. Purely client-side; the server never judges positions.
- **Drag-vs-pan disambiguation:** pointerdown on a token → token drag (capture + `stopPropagation` so MapDisplay's container pan never starts); pointerdown elsewhere → pan as today. Same coexistence contract fog painting already negotiates.
- **Desktop-first, touch not a target.** Rollplay is a desktop application; iPad support is an ongoing struggle, not a commitment (Matt, 2026-07-19) — we do **not** gate this feature on touch QA or do touch-specific engineering. That said, the drag implementation uses pointer events because that's what the codebase already uses (fog, pan) — and since pointer events unify mouse/touch/pen anyway, we add the one-line `touch-action: none` on tokens as free insurance that touch *degrades gracefully* rather than half-working. Nothing more.
- **Z-order re-stack (one deliberate pass, PR 2):** image (auto) → fog canvas **25** → grid **28** (display; edit mode joins at 28) → fog cursor/labels **29/30** (DM-edit affordances only) → **MapTokenLayer 35**. Grid clears fog per product decision #5; tokens clear everything.

### 3.5 Attribution & inform surfaces (same-PR deliverables)

- **Held-by nameplate** (lane 2 `grab`): token lifts (scale/shadow) and shows "✋ *held by Matt*" to everyone else.
- **Adventure log lines** (lane 1, server-side via `add_log_entry` + new `MESSAGE_TEMPLATES` entries, `LogType.SYSTEM`):
  - `place` → "*Matt placed Elara at D7*" (cell label only when a grid exists — reuse `colIndexToLabel`; gridless omits it)
  - `remove` → "*Matt removed Goblin 3*"
  - `move` → logged **only when mover ≠ owner**: "*Matt moved Elara's token*" — the social-correction signal. Routine own-token moves are NOT logged (they'd flood the 200-line log cap and inform nobody of anything).
- Names resolved server-side via the existing `_display_name` helpers (never raw UUIDs in messages).

### 3.6 Placement UX — existing panels, no floating tray (decision 14)

- **Players — `MapTokenChip` in the party drawer:** each party member's entry shows their token chip with on-map/off-map state. Placement is **drag from the drawer onto the map**: pointer capture on the chip, drop coordinates convert via the shared rect-ratio util (§7), drop commits lane 1 `place`. Drop outside the map = no-op snap-back. Removal: right-click a placed token → `remove` (returns it to off-map state in the drawer).
- **DM — `MapTokenCreator` in `CombatControlsPanel`:** "+ Add token" with label + footprint picker (D&D size names) → creates an `npc` token chip ready to drag out the same way. UI housing only — no combat/initiative data linkage (decision 4). NPC discs default to **DM-rose** (Matt, 2026-07-20), distinct from character colors.
- No token library, no search, no art.

### 3.7 ETL & persistence (split: PR 2 ships the preens, PR 5 ships token persistence)

All items here are the same move — a contract field pair (`SessionStartPayload` / `SessionEndFinalState`) + a JSONB column on `sessions` + extract/restore wiring. Per Matt (2026-07-19): the **adventure-log and audio fixes ship first as standalone preen work (PR 2)**, ahead of any token code — independently releasable, and they prove the exact ETL wiring token persistence (PR 5) later extends.

| State | PR | Contract fields (both directions) | Cold storage | Notes |
|---|---|---|---|---|
| **Adventure log** | **2** | `adventure_log: List[LogEntry] = []` — new `LogEntry` contract mirroring the Mongo doc `{message, type, timestamp (ISO), from_player, log_id, prompt_id?}` | `sessions.adventure_log` JSONB | Bounded: collection is already capped at 200/room (`adventure_log_service.py:118-174`), so the payload and column stay small. `end_session` reads via `get_room_logs(limit=200)`; `create_session` bulk re-seeds the collection. Frontend needs zero changes — `GET /logs` reads the re-seeded collection after resume. `_async_cleanup_game`'s `keep_logs=False` delete stays as-is (logs are now safe cold). Datetimes serialize to ISO at the contract boundary; `log_id` ints preserved for ordering. |
| **`audio_track_config` restore fix** | **2** | field already exists — populate it | none needed (asset rows already hold it) | §2 defect 3: StartSession builds `{asset_id: TrackConfig}` from campaign audio assets' saved configs, mirroring extract (`commands.py:654-671`). Closes the resume asymmetry. Paired with the log work because both edit the same two functions (`StartSession`, `_extract_and_sync_game_state`). |
| **Tokens** | **5** | `map_token_state: Dict[str, List[MapToken]] = {}` | `sessions.map_token_state` JSONB | Prune entries whose `asset_id` no longer resolves to a campaign asset at restore (deleted maps → orphan boards dropped, logged). By this PR the wiring pattern is already proven by PR 2 — this is a field-for-field repeat. |
| ~~Seat colors~~ | — | — | — | **Superseded by §3.8** (product decision 9): colors persist on `characters.color`, not a session JSONB. Color sync-back rides PR 1. |

- **api-game:** `create_session` seeds logs (PR 2) and `GameSettings.map_token_state` (PR 5); `end_session` returns each in `final_state` (straight reads).
- **api-site:** `_ExtractedGameState` + `_extract_and_sync_game_state` gain the new fields (`commands.py:607-616, 765-772`); `PauseSession`/`FinishSession` phase 2 writes (`:860-873, 999-1007`); `StartSession` restores (`:520-546`). Auto-pause sweeper needs zero changes.
- **Deploy coupling:** every contract bump lands in both services together; rebuild both dev images if contracts are baked (§2 ⚠️).
- **Not persisted (explicit):** `seat_layout` (who sits where) could ride the same train for seat-reclaim on resume, but it changes join-flow behavior — flagged as an open question, not assumed. `final_state.players` remains display-only.
- **Cross-session-entity carry:** NOT in v1. Tokens persist across pause/resume of one session entity; a brand-new session starts with a clean board (grid/fog persist via the MapAsset — the mat keeps its drawings; the minis come off when the box closes). If wanted later, it's a cheap copy of `map_token_state` from the campaign's latest FINISHED session inside `CreateSession` — noted as **open option, not built**.
- **Migrations (autogenerate per PR, never hand-written — [[feedback_alembic_autogenerate]]):** PR 2 `-m "add adventure_log to sessions"`; PR 5 `-m "add map_token_state to sessions"` (PR 1 carries its own: `-m "add color to characters"`).

### 3.8 Character-owned color (replaces the seat-index color system)

**Model.** The seat-index `seat_colors` dict got the ownership backwards — it predates having character data at all (product decision 9). New model: **`characters.color`** (nullable String hex) is the single cold authority. A seat *displays* the color of the character whose player sits in it; a token *displays* the color of its owner's character. Nobody "has a seat color" anymore.

**Why this is cheap — color rides the existing character rails end-to-end:**
- **Cold → hot:** add `color` to the `PlayerCharacter` contract (`shared_contracts/character.py:19-32`) → it flows through `_build_session_users` (`commands.py:270-284`) into `player_metadata` at session start, through the seat-change refresh (`seat_change` handler already calls `site_client.fetch_character_summary`, `websocket_events.py:200` — add `color` to the summary endpoint response), and through the existing mid-session hot-sync (PUT `/game/{game_id}/player/character`).
- **In-session change:** the existing `color_change` WS event is re-pointed — payload becomes `{user_id, color}`; the handler writes `player_metadata[user_id].color` (instead of `update_seat_colors`) and broadcasts. Same UI affordance the players already use, new semantics: you're painting *your character*, and it follows you between seats.
- **Hot → cold:** at pause/finish, character colors sync back onto `characters.color` via `character_repo` — the exact precedent of audio tweaks → asset rows and HP → character row (`DisconnectFromGame`). `PlayerState` in `final_state` already carries a color field to ride (`shared_contracts/session.py:18-23`); its `seat_color` becomes `color`, and pause/finish commands gain a `character_repo` injection (in-module precedent: `DisconnectFromGame`).
- **Frontend:** `playerSeatMap` derives `color` from `player_metadata` instead of the `seat_colors` dict. The `--seat-color-${seatIndex}` CSS vars remain as *derived render state* (recomputed on `seat_change`/`color_change`), so PlayerCard and AdventureLog consumers need no structural change. The 8-color `SEAT_COLORS` palette (`app/utils/seatColors.js`) demotes to the **fallback** for empty seats and characters with `color = null`. DM keeps the fixed DM theme (no character, unchanged).
- **Removed:** `GameSettings.seat_colors`, `update_seat_colors`, the `seat_colors` field in `initial_state` and room GET, and PUT `/game/{room_id}/colors` (no external callers — pre-users, no compat shims).

**Inform, don't enforce (point-of-choice hint):** the color picker shows which colors other characters in the campaign already use (small "in use by Elara" badge) — and lets you pick them anyway. Two identical minis on one table is your table's business; we just make sure you know.

**Durability bonus:** character-owned color survives across session *entities* (and any future session of the campaign) automatically — stronger than the session-JSONB version this replaces. No session column, one `characters` column: `docker exec api-site-dev alembic revision --autogenerate -m "add color to characters"`.

---

## 4. PR sequence

Two tracks. The **preen track (PRs 1–2) is SHIPPED** — landed on main via PR #148, verified 2026-07-20; the ETL wiring tokens lean on is proven. The **token track (PRs 3–5)** remains. PR 0 (spike) is dissolved per §3.3.

| PR | Contents | Pattern fit |
|---|---|---|
| **1 — Character color** ✅ *shipped (PR #148)* | §3.8 in full: `characters.color` column (autogenerate); `color` on `PlayerCharacter` + `PlayerState` contracts and the character-summary endpoint; `color_change` re-pointed to `player_metadata` + seat-colors dict/endpoint removal; hot→cold color sync at pause/finish; frontend derivation swap + picker "in use by X" hint. | character rails: `_build_session_users`, `fetch_character_summary`, HP-sync precedent (`DisconnectFromGame`) |
| **2 — ETL preen: adventure log + audio fix** ✅ *shipped (PR #148)* | Adventure log hot+cold per §3.7 (`LogEntry` contract, `sessions.adventure_log` JSONB, seed/extract); `audio_track_config` restore fix. Both edit the same two ETL functions — one PR, one migration. | `spotify_config` full-dump precedent (`session_model.py:62`); `_extract_and_sync_game_state` |
| ~~0 — Spike~~ | **Dissolved 2026-07-20** (§3.3): markers-only v1 removes the latency question; the measurement becomes the live-drag fast-follow gate. | — |
| **3 — Tokens: contracts + hot backend** | `shared_contracts/map_token.py`; `GameSettings.map_token_state`; `map_token_update` handler (place/move/remove/configure, atomic array ops) + `map_token_state_update` broadcast; `map_token_drag` grab/release handler + **in-memory hold map** (grab-deny, disconnect/staleness cleanup — decision 11); `initial_state` + GET room hydration; log templates + attribution rules. *(`broadcast_to_room` AttributeError already fixed on main via PR #148.)* | fog handler (`websocket_events.py:1470-1501`), `mapservice.update_fog_config`, `remote_audio_resume` relay shape |
| **4 — Tokens: frontend slice** | `map_tokens` slice; MapTokenLayer (render, drag, snap, echo-filter, reconciliation, optimistic-grab + deny snap-back, last-moved-on-top stacking) + MapTokenChip (party drawer, drag-out placement) + MapTokenCreator (CombatControlsPanel); held-by nameplate; **z-order re-stack incl. grid-above-fog**; character-color/name derivation. Markers-only (decision 12) — no `move` streaming. | `fog_management` slice; FogRegionStack drag (`:140-190`); GridOverlay math (`:34-60`) |
| **5 — Tokens: session persistence** | `map_token_state` ETL fields + `sessions.map_token_state` JSONB + orphan pruning (§3.7) — a field-for-field repeat of the pattern PR 2 proved; resume verified through manual pause **and** the expiry sweeper. | PR 2's own wiring |

Each PR is independently shippable: 1 and 2 preen the product on their own; 3+4 deliver the live token feature (tokens work, vanish at pause); 5 completes persistence. GPL headers on all new source files. No NGINX changes. No `authFetch` concern for tokens (WS-only); the color picker's only cold write happens server-side via ETL, so no new authenticated frontend calls there either.

## 5. What we will NOT build (v1 discipline)

- No movement-range/wall/turn **enforcement of any kind**, and no reactive warnings (axis 2 is fully open) — including **no stacking rejection**: two tokens on one square is legal (decision 13)
- No permission checks on moving others' tokens — attribution only (the decision-11 hold-lock is transient concurrency while a token is in someone's hand, not permission)
- No mid-drag position streaming in v1 (decision 12) — `move` phase reserved; fast-follow gated on the §3.3 head-of-line test
- No combat/initiative integration
- No token artwork/images (seat-color discs only)
- No auto re-snap on grid retune (manual DM "re-snap all" is a *future* affordance at most)
- No fog-token visibility logic (tokens always visible above fog; hidden monsters = unplaced monsters)
- No cross-session-entity carry-forward (open option recorded in §3.7)
- No HTTP write endpoints for tokens (WS is the map-domain idiom) and no new generic "overlay framework" — MapTokenLayer is a concrete sibling of GridOverlay/FogRegionStack

## 6. Open questions for Matt

1. ~~Spike gate~~ **Resolved 2026-07-20:** markers-only chosen for v1 outright (decision 12); streaming is a gated fast-follow (§3.3).
2. ~~MapTokenTray placement~~ **Resolved 2026-07-20:** party-drawer chips + DM creator in CombatControlsPanel, drag-from-drawer placement (decision 14, §3.6).
3. ~~NPC default color~~ **Resolved 2026-07-20:** DM-rose.
4. Confirm cross-session-entity behavior (clean board on a brand-new session) matches your reading of "save between session."
5. **Persist `seat_layout`?** (Colors are resolved — they live on the character, §3.8.) Persisting the *layout* would let returning players find their seats pre-assigned on resume — but it changes the join flow (a seat shows its absent owner until they reconnect). PR 2 shipped without it, so if wanted it becomes its own small preen PR (same contract-bump + ETL wiring pattern).

---

## 7. Reuse manifest (no-bulk discipline — calibrated)

The rule, in Matt's calibration (2026-07-19): the anti-pattern being guarded against is **rebuilding a function that differs only by a gate/condition while the work underneath is identical** — adjust the existing function to take the variation instead. It is *not* a moratorium on new code: tokens are a new slice, so new modules/classes/functions that make the work clearer are expected and correct. Never contort code into forced reuse at the cost of single-responsibility or Zen-of-Python simplicity/readability/explicitness — a clear new function beats a mangled shared one.

House style while we're at it: descriptive loop variables (no single-character loops), imports at module top (no lazy imports).

The inventory below is therefore a *map of what already serves*, not a ban list — per surface:

**api-game — new code is two WS handlers and one service method.**
- `map_token_update` / `map_token_drag` handlers live in `websocket_events.py` beside the fog handlers and reuse wholesale: `RoomManager.update_room_data` (broadcast), `add_log_entry` + `MESSAGE_TEMPLATES`/`format_message` (logging), `_display_name` (name resolution). Token state ops are **one method on the existing `GameService`** (precedent: `update_spotify_state`). No new service class, no new manager, no new schema files.
- Dispatch: two new `elif` arms in the existing `app_websocket.py` chain — the established extension point.

**api-site — zero new commands, zero new modules.**
- Color (PR 1): extend `_build_session_users`, the character-summary endpoint, and `_extract_and_sync_game_state`; the character aggregate gains a `set_color` method. The picker's cold write rides ETL — no new endpoint.
- Persistence (PR 4): extend `_ExtractedGameState`, the existing phase-2 writes, and `SessionRepository.save`'s field list. No new repository.

**Frontend — new files are confined to the `map_tokens` slice (the fog_management template: ~5 files, justified by new domain).**
- The one **95% case, per the rule:** `FogRegionStack.screenToMask`'s rect-ratio math (`FogRegionStack.js:68-79`) is the coordinate conversion tokens need. Tokens are its **second concrete consumer** — the agreed threshold for extraction — so the core lifts into a small shared util in `map_management/utils/`, and fog is adjusted to call it. Not copied, not reinvented.
- Reused as-is: `registerHandler` WS pattern + typed `send*` functions, `GridOverlay.cellAtPoint`/`cellBounds` (exported for exactly this), `playerSeatMap`, `--seat-color-*` CSS vars as derived render state, `SEAT_COLORS` demoted to fallback palette, `addToLog`, and the **existing color-picker UI re-pointed** (PR 1 ships no new picker component).
- Not built: overlay framework, animation library (remote lerp is ~10 lines in the hook), state library, any generic "draggable" abstraction.

**Contracts** — genuinely new data only: `MapToken`, `LogEntry`; `PlayerCharacter`/`PlayerState` gain a `color` field.

## 8. Verification — how we secure results (desktop)

Rollplay is a desktop app (§3.4) — QA is desktop-browser, two-window/two-machine. Per PR:

- **PR 1 (color):** unit-test the aggregate change; two-browser QA: change color mid-session → both browsers repaint seat + log borders; swap seats → **color follows the character, not the seat**; pause/resume → color survives; new session → color still there (character-owned durability).
- **PR 2 (ETL preen):** pause → inspect `sessions.adventure_log` via `docker exec postgres-dev psql` → resume → log history returns in the drawer; audio: tweak a track, swap it out of its channel, pause, resume, re-load the track → tweaks intact (the §2-defect-3 repro, now fixed); both paths repeated via the **expiry sweeper** (short `urls_expire_at`).
- **PR 3 (token hot backend):** unit-test the token op application (place/move/remove/configure against the array, including same-token last-write-wins and different-token non-clobber); hold-map behavior (grab-deny while held, clear on release/disconnect/staleness); contract round-trip serialization.
- **PR 4 (token frontend):** two-browser QA checklist: drag chip from party drawer onto map syncs; drag a placed token → remote lifts with "held by" nameplate, lands on release commit; second browser grabs a held token → denied, snaps home; echo reconciliation doesn't double-move the dragger's token; snap on gridded map / free placement on gridless; two tokens dropped on one cell → both stay, last-moved on top; wrong-token move → attribution log line; z-order — grid visibly above fog, tokens above all; footprint sizes render at cell multiples. *(Live-drag fast-follow, when attempted: devtools-throttled third client per §3.3.)*
- **PR 5 (token persistence):** pause → inspect `sessions.map_token_state` via psql → resume → board returns; expiry-sweeper repeat; deleted-map orphan pruning logged.
- **Process:** `/code-review` runs before each commit is proposed; Matt runs all git writes and the alembic autogenerate commands; every contract-touching PR (1, 2, 3, 5) requires rebuilding **both** api images (stale-deps gotcha). Dev-loop caveat: HMR is broken in Docker dev — frontend QA iterations need the cache-clear+restart cycle or a local `npm run dev`.
