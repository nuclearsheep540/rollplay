# Remove Legacy `moderators` Array — Use `campaign_role` as Single Source of Truth

## Context

The campaign roles refactor added `CampaignRole` (`invited`, `spectator`, `player`, `mod`, `dm`) to `campaign_members` in PostgreSQL. When a session starts, each player's `campaign_role` is ETL'd into `player_metadata` in MongoDB. The frontend already derives `isModerator` from `playerMetadata[userId].campaign_role === 'mod'`.

However, a legacy `moderators` array still exists on the MongoDB session document. The "Add Moderator" UI action updates this array — but nothing reads it. So clicking "Add Moderator" appears to do nothing. The `/roles` endpoint also reads from this dead array.

**Goal:** Remove the `moderators` array entirely. "Add Moderator" should update `campaign_role` in both PostgreSQL (persistent) and MongoDB `player_metadata` (live session).

## Design Decision: Frontend-Orchestrated Dual Update

ModeratorControls makes two sequential HTTP calls:
1. `PUT /api/campaigns/{campaignId}/members/{userId}/role` → api-site → PostgreSQL (persistent)
2. `POST /api/game/{roomId}/moderators` → api-game → MongoDB `player_metadata` (live) + WebSocket broadcast

This avoids introducing inter-service HTTP coupling (api-game → api-site), which doesn't exist today.

## ETL Analysis: Why No Migration Changes Are Needed

The existing ETL already handles `campaign_role` correctly at every stage:

**Cold → Hot (StartSession):** `_build_player_characters()` in `api-site/modules/session/application/commands.py` already extracts `campaign_role` from each user's `campaign_members` row in PostgreSQL and includes it in the `PlayerCharacter` DTO sent to api-game. api-game stores this verbatim in `player_metadata`. The only change needed here is removing the redundant `moderators` array seeding loop (Phase 3, item 2).

**Hot → Cold (PauseSession / FinishSession):** These commands extract audio/map/image configs but do NOT extract `campaign_role` back to PostgreSQL. This is **correct** for our design because:
- The dual-update pattern persists role changes to PostgreSQL **at change time** (the api-site PUT call in step 1)
- There's nothing to extract back — PostgreSQL is already up to date

**Resume (restart after pause):** Runs `StartSession` again, which re-extracts `campaign_role` fresh from PostgreSQL. Any role changes made during the session or while paused are correctly picked up because they were already persisted to PostgreSQL by the api-site endpoint.

**Mid-session changes:** Our dual-update ensures both stores stay in sync:
1. api-site PUT → PostgreSQL updated (persistent, survives session end)
2. api-game POST → MongoDB `player_metadata.campaign_role` updated (live) + WebSocket broadcast

**Net result:** The SHELVED plan's ETL concern is fully addressed. No changes to `_build_player_characters()`, `_extract_and_sync_game_state()`, `PauseSession`, or `FinishSession` are required.

---

## Phase 1: api-site — New Role Update Endpoint

**`api-site/modules/campaign/api/schemas.py`** — Add `RoleUpdateRequest`:
```python
class RoleUpdateRequest(BaseModel):
    role: str  # 'spectator', 'player', 'mod'
```

**`api-site/modules/campaign/api/endpoints.py`** — Add endpoint:
```
PUT /{campaign_id}/members/{member_id}/role
```
- Verify caller is DM (`campaign.is_dm(user_id)`)
- Call `campaign.set_role(member_id, CampaignRole.from_string(request.role))`
- Save campaign
- No NGINX changes needed — `/api/campaigns/` already routes to api-site

## Phase 2: api-game — GameService Methods

**`api-game/gameservice.py`**:

1. **Remove** `moderators: list = []` from `GameSettings` model (line 32)

2. **Rewrite `is_moderator()`** (lines 257-267) — read `player_metadata[user_id].campaign_role` instead of `moderators` array. Keep DM check.

3. **Rewrite `add_moderator()`** (lines 292-313) — `$set` `player_metadata.{user_id}.campaign_role` to `"mod"` instead of `$addToSet` on moderators. Keep validation (no seated players, no adventurers).

4. **Rewrite `remove_moderator()`** (lines 316-330) — `$set` `player_metadata.{user_id}.campaign_role` to `"spectator"`.

5. **Update seat validation in `update_seat_layout()`** (lines 128-138) — derive mod user IDs from `player_metadata` campaign_role instead of `moderators` array.

## Phase 3: api-game — Endpoints & WebSocket

**`api-game/app.py`**:

1. **`build_role_change_payload()`** (lines 51-63) — remove `"moderators"` from payload. Add `"updated_campaign_role"` and `"updated_player_metadata_entry"` so clients can update `playerMetadata` state.

2. **Session creation** (lines 470-477) — remove moderators seeding loop and `moderators=moderators` param. `campaign_role` is already on each player's metadata.

3. **`POST/DELETE /game/{room_id}/moderators`** — calls now go to rewritten `add_moderator()`/`remove_moderator()` which update `player_metadata`. Pass `new_campaign_role` to payload builder.

4. **`GET /game/{room_id}/roles`** (lines 282-300) — `is_moderator()` now reads from `player_metadata` internally. No signature change needed.

5. **Seat-layout endpoint** (lines 851-857) — replace `moderators` array check with `player_metadata` campaign_role check.

**`api-game/websocket_handlers/app_websocket.py`**:

6. **`initial_state` broadcast** (line 42) — remove `"moderators"` field. Frontend derives moderators from `player_metadata`.

## Phase 4: Frontend — webSocketEvent.js

**`rollplay/app/game/hooks/webSocketEvent.js`**:

1. **`handleInitialState()`** — remove `moderators` from destructured data, remove `setModerators` call (lines 35, 51-52)

2. **`handleRoleChange()`** (lines 436-450) — remove `moderators` from destructured data, remove `setModerators` call. Instead, update `playerMetadata` with the new `campaign_role` for the target user:
```js
if (setPlayerMetadata && target_player && updated_campaign_role) {
  setPlayerMetadata(prev => ({
    ...prev,
    [target_player]: { ...prev[target_player], campaign_role: updated_campaign_role }
  }));
}
```

## Phase 5: Frontend — page.js

**`rollplay/app/game/page.js`**:

1. **Remove** `const [moderators, setModerators] = useState([])` (line 70)

2. **Add** derived `moderatorIds` from `playerMetadata`:
```js
const moderatorIds = useMemo(() =>
  Object.entries(playerMetadata)
    .filter(([_, meta]) => meta.campaign_role === 'mod')
    .map(([userId]) => userId),
  [playerMetadata]
);
```

3. **Remove** `setModerators` from `gameContext` useMemo

4. **Update DMChair** call — `moderators={moderatorIds}` (instead of `moderators={moderators}`)

5. **Pass `campaignId`** to ModeratorControls: `campaignId={campaignId}`

6. **`handleRoleChange`** — add unseat logic for new moderators (mods can't sit in party seats)

## Phase 6: Frontend — ModeratorControls.js

**`rollplay/app/game/components/ModeratorControls.js`**:

1. **Add props**: `campaignId`, `playerMetadata` (already passed), `dmUserId`

2. **Remove**: `roomData` state, `fetchRoomRoles()`, both `useEffect` hooks that call it, `roleChangeTrigger` prop

3. **Derive moderator list** from `playerMetadata`:
```js
const currentModeratorIds = useMemo(() =>
  Object.entries(playerMetadata || {})
    .filter(([_, meta]) => meta.campaign_role === 'mod')
    .map(([userId]) => userId),
  [playerMetadata]
);
```

4. **Update `handleRoleAction()`** for `add_moderator`/`remove_moderator` — make dual calls:
   - First: `authFetch` to `PUT /api/campaigns/${campaignId}/members/${userId}/role` (api-site, JWT-protected)
   - Then: `fetch` to `POST/DELETE /api/game/${roomId}/moderators` (api-game, broadcast)

5. **Replace** all `roomData.moderators` references with `currentModeratorIds`
6. **Replace** `roomData.dungeon_master` with `dmUserId` prop
7. **Replace** `roomData.room_host` with `dmUserId` prop (DM = host)

## Phase 7: Cleanup

- **`docker/dev/mongo/mongo-init.js`** and **`docker/prod/db/mongo-init.js`** — remove `moderators: []` from test document
- Existing MongoDB session documents still have the dead `moderators` field — harmless, deleted when session ends

---

## Verification

1. **Build**: `cd rollplay && npm run build` — no errors
2. **Containers**: `docker-compose -f docker-compose.dev.yml restart api-site api-game`
3. **Test flow**:
   - Start a game session
   - As DM, open Moderator Controls → Add Moderator → select a player
   - Verify the player's role changes to MOD in the UI (moderator badge appears on DMChair, player can access moderator tools)
   - Verify the player is unseated if they were sitting
   - Refresh the page — MOD status should persist (came from PostgreSQL via player_metadata)
   - Remove the moderator — verify they revert to spectator
4. **Check PostgreSQL**: `SELECT role FROM campaign_members WHERE user_id = '...'` — should be `'mod'` after add, `'spectator'` after remove
5. **Check MongoDB**: Verify no `moderators` field on active session document, verify `player_metadata[userId].campaign_role` is `'mod'`
