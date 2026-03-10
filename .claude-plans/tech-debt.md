# Tech Debt Registry

Catalogue of code smells, architectural inconsistencies, and patterns that contradict the intended design. These aren't bugs — the app works — but they create confusion when reasoning about architecture and make refactors harder than they should be.

**Purpose:** When a pattern in the codebase contradicts what we're trying to build towards, document it here so we don't lose confidence in the plan or get derailed mid-implementation.

---

## api-site: Session Module

### ~~1. `_to_session_response` — endpoint doing query-layer work~~ ✅ DONE

**Location:** [endpoints.py:56-112](api-site/modules/session/api/endpoints.py#L56-L112)

**Smell:** The endpoint helper `_to_session_response` takes a raw `db: Session` and runs SQL joins across User and Character tables to enrich roster data. This is read-side query work that belongs in the application layer (`queries.py`), not in the API layer.

**Why it matters:** Every session endpoint passes `db: Session` as a dependency just to feed this helper. FastAPI's `response_model` should handle serialization on its own — the fact that we need a manual conversion function means the application layer isn't returning enriched-enough data.

**What "fixed" looks like:** `GetSessionById` (and similar queries) return an already-enriched object with host name, roster details, and character info. Endpoints return the query result directly, `response_model` serializes it. No `_to_session_response`, no `db` dependency on endpoints.

**Resolution:** Resolved in `72cc2bf`. Enrichment logic moved to `_build_response()` in `queries.py`. Endpoints no longer take `db: Session` — they call query objects and return the result directly.

---

### ~~2. Over-returning on session action endpoints~~ ✅ DONE

**Location:** [endpoints.py:223-264](api-site/modules/session/api/endpoints.py#L223-L264) (start), also pause/finish

**Smell:** Start, pause, and finish endpoints all return the full `SessionResponse` (roster, host name, joined users, etc.) when the frontend only needs `active_game_id` and `status` for the start action. The same `_to_session_response` + full response pattern is used everywhere regardless of what the consumer actually needs.

**Why it matters:** Couples all mutation endpoints to the same heavy response shape. Makes it look like the frontend needs all that data after every action, when it doesn't.

**What "fixed" looks like:** Action endpoints return a lean response (`SessionActionResponse` with `status` + `active_game_id`). TanStack Query invalidates the session cache to trigger a refetch if the full shape is needed.

**Resolution:** All action endpoints (start, pause, finish, update, remove_player, select-character, disconnect) now return `204 No Content`. Frontend mutation hooks updated to not parse response body — they already relied on TanStack Query cache invalidation.

---

### ~~3. `GetUserSessions` loads all sessions into memory~~ ✅ DONE

**Location:** [queries.py:47-70](api-site/modules/session/application/queries.py#L47-L70)

**Smell:** `GetUserSessions.execute()` calls `self.session_repo.get_all()` then filters in Python. This loads every session in the database into memory to check if the user is host or participant.

**Why it matters:** O(n) over all sessions for every user query. Fine with 10 sessions, problematic at scale. The filtering should be a SQL query, not Python iteration.

**What "fixed" looks like:** Repository method `get_by_user_id(user_id)` with a SQL query that joins `sessions` with `session_joined_users` and filters by `host_id = user_id OR user_id IN (joined_users)`.

**Resolution:** Resolved in `72cc2bf`. `GetUserSessions` now uses a SQL subquery on `SessionJoinedUser` with `or_()` filter instead of loading all sessions into memory.

---

### ~~4. SessionEntity uses `dict` for warehoused state~~ ✅ DONE

**Location:** [session_aggregate.py:90-93](api-site/modules/session/domain/session_aggregate.py#L90-L93)

**Smell:** `audio_config: Optional[dict]`, `map_config: Optional[dict]`, `image_config: Optional[dict]` — the domain aggregate holds untyped dicts for the state it warehouses from api-game.

**Why it matters:** The aggregate's `remove_asset_references()` method (line 177-206) uses raw `.get()` chains on these dicts to find and remove asset references. There's no structural guarantee about what's in these dicts.

**Resolution:** Typing applied at the application layer (session commands) rather than the aggregate. `_extract_and_sync_game_state()` parses api-game responses as `SessionEndResponse` → typed `SessionEndFinalState`. `StartSession` builds typed `SessionStartPayload`. The aggregate fields stay as `Optional[dict]` because they hold thin JSONB references (`{"asset_id": "..."}`) — typing at the boundary gives structural confidence without adding complexity to persistence.

---

### ~~5. Read endpoints authenticate but don't authorize~~ ✅ DONE

**Locations:**
- [endpoints.py:131-145](api-site/modules/session/api/endpoints.py#L131-L145) (`get_session`)
- [endpoints.py:148-162](api-site/modules/session/api/endpoints.py#L148-L162) (`get_campaign_sessions`)

**Smell:** Both endpoints inject `user_id` via `Depends(get_current_user_id)` but never use it. The dependency ensures the request is authenticated (valid JWT), but no authorization check verifies the user is the host or a member of the session/campaign. Any authenticated user can fetch any session by ID.

**Why it matters:** Access control gap. A user in Campaign A could fetch session details for Campaign B if they know the session UUID. The `user_id` is there as an auth guard but should also be used for authorization.

**What "fixed" looks like:** `get_session` checks `user is host or user in joined_users`. `get_campaign_sessions` checks `user is host or user in campaign.player_ids`. Return 403 if unauthorized.

**Resolution:** Inline authorization checks added to API layer. `get_session` returns 403 if user is not host or in `joined_users`. `get_campaign_sessions` returns 403 if user is not a campaign member via `campaign.is_member()`.

---

### ~~6. StartSession command is ~270 lines of procedural code~~ ✅ DONE

**Location:** [commands.py:248-522](api-site/modules/session/application/commands.py#L248-L522)

**Smell:** `StartSession.execute()` does everything in one method: validation, campaign lookup, session conflict check, host user lookup, asset fetching, parallel URL generation, audio config restoration, map config restoration, image config restoration, payload construction, HTTP call, response parsing, status update, event broadcasting, and error recovery.

**Resolution:** Extracted three restoration helpers (`_restore_audio_config`, `_restore_map_config`, `_restore_image_config`) as class methods. Payload built as typed `SessionStartPayload`. Response parsed as `SessionStartResponse`. Audio restoration expanded to include `SfxAsset` (was `MusicAsset` only).

---

### ~~7. PauseSession duplicates StartSession's structure~~ ✅ DONE

**Location:** [commands.py:525-776](api-site/modules/session/application/commands.py#L525-L776) and [commands.py:808-1095](api-site/modules/session/application/commands.py#L808-L1095) (FinishSession)

**Smell:** PauseSession and FinishSession are near-identical ~250-line methods. Both do: validate ownership → set STOPPING → fetch final state from api-game → extract audio/map/image state → sync back to PostgreSQL → deactivate/finish → broadcast events → background cleanup. The ETL extraction logic (lines 606-696 in PauseSession) is copy-pasted into FinishSession.

**Why it matters:** Bug fixes or ETL changes need to be applied in two places. If one gets updated and the other doesn't, hot→cold ETL behaves differently for pause vs finish.

**What "fixed" looks like:** Extract the shared ETL logic (fetch final state, extract and sync configs, cleanup) into a shared method or class. PauseSession and FinishSession call it, differing only in the final status transition.

**Resolution:** Extracted three module-level helpers: `_ExtractedGameState` dataclass, `_extract_and_sync_game_state()` async function (handles HTTP fetch, asset sync, config extraction, rollback on failure), and `_async_cleanup_game()` async function (background MongoDB deletion). Both PauseSession and FinishSession now call these shared helpers, differing only in status transitions (`deactivate()` vs `mark_finished()`) and event broadcasts (`session_paused` vs `session_finished`). FinishSession retains its INACTIVE→FINISHED shortcut branch.

---

## api-site: Library Module (ETL Methods)

### ~~8. `build_*_for_game()` methods return raw dicts~~ ✅ DONE

**Locations:**
- [music_asset_aggregate.py:180-213](api-site/modules/library/domain/music_asset_aggregate.py#L180-L213) (`build_effects_for_game`, `build_channel_state_for_game`)
- [map_asset_aggregate.py:145-164](api-site/modules/library/domain/map_asset_aggregate.py#L145-L164) (`build_grid_config_for_game`)

**Resolution:** `build_effects_for_game()` → `AudioEffects`, `build_channel_state_for_game()` → `AudioChannelState`, `build_grid_config_for_game()` → `GridConfig | None`. Added `SfxAsset.build_channel_state_for_game()` → `AudioChannelState` (was missing). `update_grid_config_from_game()` now accepts `GridConfig` instead of `dict`.

---

### ~~9. Duplicate constraint validation between aggregates and schemas~~ ✅ DONE

**Locations:**
- [music_asset_aggregate.py:140](api-site/modules/library/domain/music_asset_aggregate.py#L140): `if not 0.0 <= default_volume <= 1.3`
- [sfx_asset_aggregate.py:120](api-site/modules/library/domain/sfx_asset_aggregate.py#L120): `if not 0.0 <= default_volume <= 1.3`
- [schemas.py:106](api-site/modules/library/api/schemas.py#L106): `Field(None, ge=0.0, le=1.3)`
- [map_asset_aggregate.py:117-128](api-site/modules/library/domain/map_asset_aggregate.py#L117-L128): grid width/height 1-100, opacity 0.0-1.0
- [schemas.py:74-76](api-site/modules/library/api/schemas.py#L74-L76): same constraints on `UpdateGridConfigRequest`

**Resolution:** Contract types (`AudioChannelState`, `GridConfig`, `GridColorMode`) now define constraints once. Builder methods produce contract types — Pydantic validates at construction time. Domain aggregate constraints remain for mutation guards (`update_audio_config`, `update_grid_config`). API schema constraints remain for inbound user input validation. The boundary duplication (builder fallback defaults) is eliminated.

---

### ~~10. Hardcoded presentation defaults in domain aggregates~~ ✅ DONE

**Locations:**
- [music_asset_aggregate.py:207](api-site/modules/library/domain/music_asset_aggregate.py#L207): `"volume": self.default_volume or 0.8`
- [music_asset_aggregate.py:208](api-site/modules/library/domain/music_asset_aggregate.py#L208): `"looping": ... if ... is not None else True`
- [map_asset_aggregate.py:155-163](api-site/modules/library/domain/map_asset_aggregate.py#L155-L163): `"line_color": "#d1d5db"`, `"opacity": opacity`, `"line_width": 1`

**Resolution:** Builder methods now construct contract types (`AudioChannelState`, `GridColorMode`) and omit fields when domain values are None — Pydantic fills in contract defaults (`volume=0.8`, `looping=True`, `line_color="#d1d5db"`, `opacity=0.5`, `line_width=1`). Grid opacity default changed from 0.3 → 0.5 (contract default wins).

---

## api-game: Service Layer

### ~~11. ObjectId conversion repeated 17 times~~ ✅ DONE

**Location:** [gameservice.py](api-game/gameservice.py) — lines 65, 90, 132, 181, 214, 233, 266, 332, 357, 382, 404, 440, 516, 532, 545, 561, 573

**Smell:** Every GameService method that queries MongoDB repeats the same try/except pattern:
```python
try:
    oid = ObjectId(oid=room_id)
    filter_criteria = {"_id": oid}
except Exception:
    filter_criteria = {"_id": room_id}
```

**What "fixed" looks like:** Extract to `_room_filter(room_id)` static method — called from 17 places, defined once. Already noted in shared-contracts-acl PR 2.

**Resolution:** Added `GameService.room_filter()` static method. All 18 instances (including 2 nested variants in `get_room` and `delete_room`) replaced with calls to the helper.

---

### ~~12. Seat color palette duplicated~~ ✅ DONE

**Locations:**
- [app.py:430-440](api-game/app.py#L430-L440) — list format inside `create_session`
- [gameservice.py:276-287](api-game/gameservice.py#L276-L287) — dict format inside `get_seat_colors`

**Smell:** Same 8 colors defined in two places in different data structures.

**What "fixed" looks like:** Module-level constant `DEFAULT_SEAT_COLORS`, referenced by both.

**Resolution:** Added `DEFAULT_SEAT_COLORS` list constant to `gameservice.py`. Both `get_seat_colors()` and `app.py`'s `get_default_color()` now reference the constant instead of inline color lists.

---

### 13. GameSettings uses `dict` for all nested state

**Location:** [gameservice.py:14-27](api-game/gameservice.py#L14-L27)

**Smell:** `audio_state: dict = {}`, `audio_track_config: dict = {}`, `available_assets: list = []` — no typed structure for the most important data in the game session.

**Why it matters:** This is the receiving end of the ETL pipeline. Whatever api-site sends gets stored here with zero structural validation.

**What "fixed" looks like:** PR 2 of shared-contracts-acl — `audio_state: Dict[str, AudioChannelState] = {}` etc.

---

### 14. MapSettings and ImageSettings duplicate shared shapes

**Locations:**
- [mapservice.py:14-31](api-game/mapservice.py#L14-L31) — `MapSettings` Pydantic model
- [imageservice.py:15-30](api-game/imageservice.py#L15-L30) — `ImageSettings` Pydantic model

**Smell:** Both define overlapping fields (`room_id`, `asset_id`, `filename`, `original_filename`, `file_path`) with identical `.lower()` normalization. These are local definitions of shapes that should come from shared contracts.

**What "fixed" looks like:** Import `MapConfig` and `ImageConfig` from contracts. Local settings add only runtime fields (`room_id`, `uploaded_by`, `active`).

**Blocked by:** shared-contracts-acl PR 2.

---

## api-game: WebSocket Handlers

### 15. 149 raw `.get()` chains with no type safety

**Location:** [websocket_events.py](api-game/websocket_handlers/websocket_events.py) — throughout

**Smell:** Every WebSocket handler extracts data from `event_data` using `.get()` with varied defaults. No Pydantic schemas for incoming WebSocket payloads.

**Examples:**
- `roll_data.get("player", "Unknown")` — no type validation
- `event_data.get("volume", 1.0)` vs `track.get("volume", 0.8)` — inconsistent defaults
- `op.get("trackId")` — no validation that it's a string

**Why it matters:** Silent failures, inconsistent defaults, impossible to know what shape the frontend should send without reading each handler.

**What "fixed" looks like:** Pydantic schemas for each WebSocket event type. Validate at handler entry, operate on typed objects.

**Blocked by:** Partially addressed by shared-contracts-acl PR 2 (audio events). Full fix would need WebSocket event schemas (separate effort).

---

### 16. Inconsistent volume defaults

**Locations:**
- [websocket_events.py:715](api-game/websocket_handlers/websocket_events.py#L715): `volume = event_data.get('volume', 1.0)`
- [websocket_events.py:741](api-game/websocket_handlers/websocket_events.py#L741): `'volume': track.get('volume', 0.8)`
- [websocket_events.py:868](api-game/websocket_handlers/websocket_events.py#L868): `volume = op.get('volume', 1.0)`

**Smell:** Two different defaults (0.8 vs 1.0) for the same concept. One is a track default, the other appears to be a per-event override — but there's no documentation or constant distinguishing them.

**What "fixed" looks like:** Single `DEFAULT_VOLUME` constant from contracts: `AudioChannelState.model_fields['volume'].default` → `0.8`.

---

### ~~17. Silent failure on invalid WebSocket messages~~ ✅ DONE

**Location:** [websocket_events.py:702-832](api-game/websocket_handlers/websocket_events.py#L702-L832)

**Smell:** Invalid WebSocket messages return `WebsocketEventResult(broadcast_message={})` — an empty broadcast. The client gets no error feedback, the server logs a print statement. No structured error response.

**Why it matters:** Debugging live game issues is difficult when invalid messages are silently swallowed. The DM has no idea why their action didn't work.

**What "fixed" looks like:** Return a structured error message to the sender (not broadcast) with what was wrong. Log with proper logger, not `print()`.

**Resolution:** Added `WebsocketEventResult.error()` static factory method that logs via `logger.warning` and returns `{"event_type": "error", "data": {"detail": message}}`. All `print` + empty broadcast patterns replaced. Centralized error check in `app_websocket.py` sends error messages to the sender only (not broadcast) and skips further processing.

---

### ~~18. Character action endpoints return raw dicts with no response_model~~ ✅ DONE

**Locations:**
- [endpoints.py:357-379](api-site/modules/session/api/endpoints.py#L357-L379) (`select_character_for_session`)
- [endpoints.py:382-407](api-site/modules/session/api/endpoints.py#L382-L407) (`disconnect_from_game`)

**Smell:** Both endpoints return hand-built dicts (`{"message": ..., "character_id": ...}`) with no `response_model` on the decorator. FastAPI doesn't validate or filter the response, and the response shape is only knowable by reading the code.

**Why it matters:** The responses echo back data the frontend already has (it sent the character_id, it sent the character_state). These are mutation endpoints — in CQRS, commands don't return query data.

**What "fixed" looks like:** Return `204 No Content` with no body. The command succeeded — that's all the caller needs to know. If the frontend needs fresh state, it re-queries through the read path.

**Resolution:** Resolved alongside #2. Both `select_character_for_session` and `disconnect_from_game` now return `204 No Content`. Frontend `useSelectCharacter` hook updated to not parse response body.

---

## Terminology

### ~~19. "Partial ETL" is vague~~ ✅ DONE

**Locations:**
- [endpoints.py:390](api-site/modules/session/api/endpoints.py#L390)
- [commands.py:1167, 1187, 1236, 1239](api-site/modules/session/application/commands.py#L1167)

**Smell:** The disconnect flow uses "partial ETL" in docstrings and log messages. This doesn't specify what's being transferred — it's actually character-level ETL (syncing a single character's HP/alive state from MongoDB to PostgreSQL on disconnect). If other partial ETL patterns emerge, the term becomes ambiguous.

**What "fixed" looks like:** Replace "partial ETL" with "character-level ETL" in all 5 references. Establish consistent terminology: "session ETL" for full pause/finish, "character ETL" for per-player disconnect.

**Resolution:** All 4 references in `commands.py` renamed from "partial ETL" to "character-level ETL". The `endpoints.py` docstring was already updated in the #2/#18 work.

---

## Cross-Cutting

### ~~20. `_set_active_display` duplicated across services~~ ✅ DONE

**Locations:**
- [mapservice.py:263-281](api-game/mapservice.py#L263-L281)
- [imageservice.py:151-169](api-game/imageservice.py#L151-L169)

**Smell:** Both MapService and ImageService have identical `_set_active_display` methods that import GameService, do the ObjectId conversion dance, and update the same MongoDB field. Tight coupling + code duplication.

**What "fixed" looks like:** Move `set_active_display` to GameService (it owns the session document). MapService and ImageService call `GameService.set_active_display()`.

**Resolution:** Added `GameService.set_active_display()` static method. Removed duplicate methods from MapService and ImageService. All callers (MapService, ImageService, app.py) updated to use `GameService.set_active_display()`.

---

## Summary: What Blocks Shared Contracts?

Items that should ideally be cleaned up **before** or **alongside** shared contracts work:

| Item | Effort | Pre-req for contracts? | Why |
|------|--------|----------------------|-----|
| ~~#11 ObjectId helper~~ | ~~Small~~ | ✅ Done (`room_filter()`) | ~~Reduces PR 2 diff noise~~ |
| ~~#12 Color palette constant~~ | ~~Tiny~~ | ✅ Done (`DEFAULT_SEAT_COLORS`) | ~~Independent~~ |
| ~~#9 Duplicate constraints~~ | ~~—~~ | ✅ Done (PR 3) | ~~Contracts eliminate the duplication~~ |
| ~~#10 Hardcoded defaults~~ | ~~—~~ | ✅ Done (PR 3) | ~~Contract defaults replace inline fallbacks~~ |
| ~~#8 Raw dict returns~~ | ~~—~~ | ✅ Done (PR 3) | ~~Builder methods return contract types~~ |

Items that are independent cleanup (do anytime):

| Item | Effort | Notes |
|------|--------|-------|
| ~~#1 `_to_session_response`~~ | ~~Medium~~ | ✅ Done (`72cc2bf`) |
| ~~#2 Over-returning~~ | ~~Medium~~ | ✅ Done (204 No Content) |
| ~~#3 `GetUserSessions`~~ | ~~Small~~ | ✅ Done (`72cc2bf`) |
| ~~#4 SessionEntity dict fields~~ | ~~Medium~~ | ✅ Done (PR 3 — typed at application layer) |
| ~~#5 Auth without authorization~~ | ~~Small~~ | ✅ Done (inline 403 checks) |
| ~~#6 StartSession size~~ | ~~Medium~~ | ✅ Done (PR 3 — extracted restoration helpers) |
| ~~#7 Pause/Finish duplication~~ | ~~Medium~~ | ✅ Done (shared ETL helpers) |
| ~~#17 Silent WebSocket failures~~ | ~~Small~~ | ✅ Done (structured errors to sender) |
| ~~#18 Raw dict returns on char endpoints~~ | ~~Small~~ | ✅ Done (204 No Content) |
| ~~#19 "Partial ETL" terminology~~ | ~~Tiny~~ | ✅ Done (renamed to "character-level ETL") |
| ~~#20 `_set_active_display` dup~~ | ~~Small~~ | ✅ Done (moved to GameService) |
