# Remove Legacy `moderators[]` — Service-Call Pattern

## Context

The user-id refactor introduced `CampaignRole` and `campaign_role` on `player_metadata` in MongoDB, but left the legacy `moderators[]` array in place on the session document. The "Add Moderator" UI writes to this dead array while the frontend derives `isModerator` from `playerMetadata[userId].campaign_role` — so clicking "Add Moderator" appears to do nothing.

**Goal:** Remove the `moderators[]` array entirely. Role changes during live sessions go through a service-call pattern where api-game (dumb hot-state) asks api-site (domain authority) for permission before updating.

## Supersedes

Remove these old plans during implementation:
- `.claude-plans/remove-legacy-moderators-array.md`
- `.claude-plans/SHELVEDmoderator-cold-state-persistence.md`

## Architecture

```
Frontend → api-game (HTTP) → api-site (async httpx, internal endpoint) → PostgreSQL
                                         ↓ (returns success/failure)
                            api-game updates MongoDB player_metadata.campaign_role
                            api-game broadcasts via WebSocket
                            Frontend updates from WebSocket
```

- **api-site** = authority for role decisions, domain validation, and persistence (PostgreSQL)
- **api-game** = dumb hot-state mirror, asks api-site for permission before acting
- **Frontend** = only talks to api-game during live sessions
- **No inter-service loop** — api-game initiates, awaits, acts on response

### Validation Split

- **api-game validates** (hot-state only): target not seated — only api-game knows seat layout
- **api-site validates** (domain authority): requesting user is DM, target is a member, target is not DM, role is valid, **target doesn't have a selected character** (when promoting to MOD)

api-game is dumb — it asks api-site "can I do this?" and api-site says yes or no with a reason. Business rules live in api-site, not api-game.

Sequence: api-game checks seat layout → calls api-site → api-site validates all domain rules → if rejected, api-game passes error through → if approved, api-game updates MongoDB + broadcasts.

**Reverse direction**: api-site's existing `SelectCharacterForCampaign` command should also reject users with `role=MOD` — mods can't select characters, even outside a live session.

### Established Internal Endpoint Pattern

This follows the existing pattern: `api-auth` calls `api-site:/api/users/internal/resolve-user` via async httpx. No JWT, no API key — Docker-network-only, not exposed via NGINX. See `api-auth/auth/passwordless.py` lines 187-208 and `api-site/modules/user/api/endpoints.py` line 108.

---

## Phase 1: api-site — Internal Role Change Endpoint

### `api-site/modules/campaign/api/schemas.py`
- Add `InternalSetRoleRequest(campaign_id, requesting_user_id, target_user_id, new_role)`
- Add `InternalSetRoleResponse(success, campaign_id, target_user_id, new_role)`

### `api-site/modules/campaign/application/commands.py`
- Add `SetMemberRole` command:
  - Accepts `campaign_id, requesting_user_id, target_user_id, new_role`
  - Loads campaign, verifies `campaign.is_dm(requesting_user_id)`
  - **If promoting to MOD**: check target doesn't have a selected character (role is currently PLAYER). If they do, reject with "Players with selected characters cannot be moderators"
  - Calls `campaign.set_role(target_user_id, new_role)` (existing method on CampaignAggregate — handles DM immutability, membership checks)
  - Saves campaign
  - Returns campaign aggregate

- Update `SelectCharacterForCampaign` command:
  - Add check: if user's current role is MOD, reject with "Moderators cannot select characters"
  - This enforces the rule even outside live sessions (e.g., via dashboard)

### `api-site/modules/campaign/api/endpoints.py`
- Add `POST /internal/set-role` endpoint
  - No JWT auth — internal Docker-network only (same pattern as `/api/users/internal/resolve-user`)
  - Injects `CampaignRepository` via `Depends()`
  - Creates `SetMemberRole` command, executes, returns response
  - ValueError → 400, Exception → 500

---

## Phase 2: api-game — httpx Client for api-site

### `api-game/config/settings.py`
- Add `API_SITE_INTERNAL_URL: str = "http://api-site:8082"` to `Settings` class (line 20)
- Add to `get_settings()` dict (line 79)

### `api-game/site_client.py` (new file)
- Thin async httpx client following `api-auth/auth/passwordless.py` pattern
- `async def request_role_change(campaign_id, requesting_user_id, target_user_id, new_role) -> dict`
- `httpx.AsyncClient(timeout=10.0)` — same timeout as api-auth uses
- POST to `{API_SITE_URL}/api/campaigns/internal/set-role`
- Returns parsed JSON on 200
- Raises `ValueError` on 400 (api-site rejected — detail message passed through)
- Raises `Exception` on network error or unexpected status

---

## Phase 3: api-game — Rewrite Moderator Endpoints

### `api-game/app.py` — `POST /game/{room_id}/moderators`
Rewrite to proxy pattern:
1. Get room, extract `campaign_id` from room doc
2. Hot-state validation: seated check only (api-game's only responsibility — is target in a seat?)
3. `await site_client.request_role_change(campaign_id, requesting_user_id, user_id, "mod")` — api-site handles all domain validation (DM auth, membership, character conflicts)
4. On success: `GameService.update_player_role(room_id, user_id, "mod")`
5. Build and broadcast role_change payload
6. Error handling: `ValueError` → 409 (api-site rejection passed through), `Exception` → 502

### `api-game/app.py` — `DELETE /game/{room_id}/moderators`
Same proxy pattern, sets role to `"spectator"`.

### `api-game/app.py` — Request body change
Both endpoints now need `requesting_user_id` in the request body (the DM's user_id) alongside `user_id` (the target).

### `api-game/gameservice.py` — New method
- Add `update_player_role(room_id, user_id, new_role)` — `$set` on `player_metadata.{user_id}.campaign_role`

### `api-game/gameservice.py` — Remove old methods
- Remove `add_moderator()` (lines 292-313) — business logic (character check) moves to api-site, seat check stays in endpoint
- Remove `remove_moderator()` (lines 316-330)

---

## Phase 4: api-game — Rewrite `is_moderator` and Seat Validation

### `api-game/gameservice.py` — `is_moderator()`
Rewrite to read `player_metadata[user_id].campaign_role == "mod"` instead of `moderators` array. Keep DM implicit check.

### `api-game/gameservice.py` — `update_seat_layout()` (lines 128-138)
Replace `moderators = set(room.get("moderators", []))` with `player_metadata` campaign_role check.

### `api-game/app.py` — `build_role_change_payload()`
Remove `moderators` from payload. Include full `player_metadata` dict so the frontend can update state from a single source.

### `api-game/app.py` — `GET /game/{room_id}/roles`
No signature change — `is_moderator()` now reads from `player_metadata` internally.

---

## Phase 5: api-game — Remove `moderators` Field

### `api-game/gameservice.py` — `GameSettings`
Remove `moderators: list = []` from the model (line 32).

### `api-game/app.py` — Session creation (lines 470-477)
Remove moderators seeding loop and `moderators=moderators` param. `campaign_role` is already on each player's metadata — that's the source of truth.

### `api-game/websocket_handlers/app_websocket.py` — Initial state broadcast
Remove `"moderators"` from the `initial_state` payload (line 43).

---

## Phase 6: Frontend Cleanup

### `rollplay/app/game/page.js`
- Remove `const [moderators, setModerators] = useState([])` (line 70)
- Remove `setModerators` from `gameContext` useMemo
- `isModerator` already derived from `playerMetadata` (lines 213-218) — no change needed
- Derive `moderatorIds` from `playerMetadata` for any component that needs the list

### `rollplay/app/game/hooks/webSocketEvent.js`
- `handleInitialState()`: Remove `moderators` destructure and `setModerators` call (lines 35, 51-52)
- `handleRoleChange()`: Remove `moderators` destructure and `setModerators` call (lines 442-444). Instead update `playerMetadata` from the broadcast's `player_metadata` field

### `rollplay/app/game/components/ModeratorControls.js`
- Pass `thisUserId` as `requesting_user_id` in request body to api-game endpoints
- Replace `roomData.moderators` references with derivation from `playerMetadata` (filter for `campaign_role === 'mod'`)
- Remove `fetchRoomRoles()` and `roleChangeTrigger` pattern — WebSocket broadcast handles reactivity
- Replace `roomData.room_host` / `roomData.dungeon_master` with `dmUserId` prop

### `rollplay/app/game/hooks/useWebSocket.js`
- `sendRoleChange` is currently unused by ModeratorControls — verify and remove if confirmed unused

---

## Phase 7: Cleanup

### Old plan files
- Delete `.claude-plans/remove-legacy-moderators-array.md`
- Delete `.claude-plans/SHELVEDmoderator-cold-state-persistence.md`

### MongoDB seed files
- `docker/dev/mongo/mongo-init.js` and `docker/prod/db/mongo-init.js` — remove `moderators: []` from seed documents if present

### Existing MongoDB session documents
- Still have dead `moderators` field — harmless, deleted when session ends

---

## Error Handling

| Failure | Behavior | Recovery |
|---------|----------|----------|
| api-site rejects (400) | api-game returns 409 with detail message | User sees error, retries or corrects |
| api-site unreachable | api-game returns 502 "Service unavailable" | User retries; no state corruption |
| api-site succeeds, MongoDB fails | Log error, return 500 | PostgreSQL has correct state; next session start re-seeds from ETL |

No retry logic — user can retry manually, and ETL at session start always re-seeds from authoritative PostgreSQL state.

---

## Verification

1. **Build**: `cd rollplay && npm run build` — no errors
2. **Containers**: `docker-compose -f docker-compose.dev.yml build && docker-compose -f docker-compose.dev.yml up`
3. **Test flow**:
   - Start a game session
   - As DM, open Moderator Controls → Add Moderator → select a player
   - Verify player's role changes to MOD in UI (badge, controls)
   - Verify player is rejected from sitting if attempted
   - Refresh page — MOD status persists (came from PostgreSQL via player_metadata re-seed)
   - Remove moderator — verify they revert to spectator
4. **Check PostgreSQL**: `SELECT role FROM campaign_members WHERE user_id = '...'` — `'mod'` after add, `'spectator'` after remove
5. **Check MongoDB**: No `moderators` field on session doc. `player_metadata[userId].campaign_role` is `'mod'`
6. **Error case**: Stop api-site container, attempt add moderator — should get 502, no state corruption
7. **Character guard**: As MOD, try to select a character via dashboard — should be rejected
8. **Reverse guard**: As PLAYER with character, DM tries to promote to MOD — should be rejected by api-site

---

## Files Modified

| File | Change |
|------|--------|
| `api-site/modules/campaign/api/schemas.py` | Add `InternalSetRoleRequest`, `InternalSetRoleResponse` |
| `api-site/modules/campaign/application/commands.py` | Add `SetMemberRole` command, update `SelectCharacterForCampaign` to reject MODs |
| `api-site/modules/campaign/api/endpoints.py` | Add `POST /internal/set-role` endpoint |
| `api-game/config/settings.py` | Add `API_SITE_INTERNAL_URL` |
| `api-game/site_client.py` | **NEW** — async httpx client for api-site |
| `api-game/gameservice.py` | Remove `moderators` field + old methods, add `update_player_role()`, rewrite `is_moderator()`, fix seat validation |
| `api-game/app.py` | Rewrite moderator endpoints to proxy pattern, update `build_role_change_payload()`, remove moderator seeding |
| `api-game/websocket_handlers/app_websocket.py` | Remove `moderators` from initial_state |
| `rollplay/app/game/page.js` | Remove `moderators` state, derive from `playerMetadata` |
| `rollplay/app/game/hooks/webSocketEvent.js` | Remove `moderators` handling, update `playerMetadata` from role_change |
| `rollplay/app/game/components/ModeratorControls.js` | Pass `requesting_user_id`, derive mods from `playerMetadata`, remove fetch/trigger pattern |
| `rollplay/app/game/hooks/useWebSocket.js` | Remove unused `sendRoleChange` if confirmed |
| `docker/dev/mongo/mongo-init.js` | Remove `moderators: []` from seed |
| `docker/prod/db/mongo-init.js` | Remove `moderators: []` from seed |
