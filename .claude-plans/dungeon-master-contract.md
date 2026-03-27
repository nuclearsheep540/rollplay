# DungeonMaster Shared Contract

## Context

The user-id refactor replaced player_name-based identity with UUIDs. The DM's display name is now blank because:
- `dungeon_master` in MongoDB is a bare userId string
- The DM is correctly excluded from `player_metadata` (that's for players with characters)
- The frontend tries `displayNameMap[dmSeat]` which returns undefined — the DM isn't in playerMetadata

**Fix:** Create a `DungeonMaster` shared contract (like `PlayerCharacter`), hydrated by api-site during ETL, stored by api-game, consumed directly by the frontend.

---

## Phase 1: Shared Contract

### `rollplay-shared-contracts/shared_contracts/character.py`
- Add `DungeonMaster(ContractModel)` alongside `PlayerCharacter`
- Fields: `user_id: str`, `player_name: str`, `campaign_role: str = "dm"`
- No character fields — the DM doesn't have a playable character

### `rollplay-shared-contracts/shared_contracts/session.py`
- On `SessionStartPayload`: replace `dm_user_id: str` with `dungeon_master: DungeonMaster`
- Import `DungeonMaster` from `character.py`

---

## Phase 2: api-site ETL

### `api-site/modules/session/application/commands.py`
- Add `_build_dungeon_master()` method on `StartSession`:
  - `host_user` is already fetched at line 445
  - Build `DungeonMaster(user_id=str(campaign.dm_id), player_name=host_user.screen_name or host_user.email)`
- Update payload construction (~line 472):
  - Replace `dm_user_id=str(campaign.dm_id)` with `dungeon_master=dm_contract`

---

## Phase 3: api-game — Storage & Identity

### `api-game/gameservice.py`

**`GameSettings` model (line 33):**
- `dungeon_master: str = ""` → `dungeon_master: dict = {}`

**`is_dm(room_id, user_id)` (line 275):**
- `room.get("dungeon_master", "") == user_id` → `room.get("dungeon_master", {}).get("user_id") == user_id`

**`is_moderator(room_id, user_id)` (line 264):**
- Same pattern — extract `.get("user_id")` for comparison

**`update_seat_layout()` (line 131):**
- `dm_user_id = room.get("dungeon_master", "")` → `dm_user_id = room.get("dungeon_master", {}).get("user_id", "")`

**`set_dm(room_id, user_id)` (line 341):**
- Currently writes bare string. Needs `player_name` to build the object.
- Change signature: `set_dm(room_id, user_id, player_name)`
- Write `{"$set": {"dungeon_master": {"user_id": user_id, "player_name": player_name, "campaign_role": "dm"}}}`

**`unset_dm(room_id)` (line 358):**
- `{"$set": {"dungeon_master": ""}}` → `{"$set": {"dungeon_master": {}}}`

### `api-game/app.py`

**Session start (line 486):**
- `dungeon_master=request.dm_user_id` → `dungeon_master=request.dungeon_master.model_dump()`

**`build_role_change_payload()` (line 61):**
- `room.get("dungeon_master", "")` — now returns a dict, passes through correctly

**Seat layout validation (line 843):**
- `room_dm = str(check_room.get("dungeon_master", ""))` → `room_dm = check_room.get("dungeon_master", {}).get("user_id", "")`

**Unset DM endpoint (line 401):**
- `current_dm = check_room.get("dungeon_master", "")` → `current_dm = check_room.get("dungeon_master", {}).get("user_id", "")`

**Set DM endpoint:**
- Needs to pass `player_name` to `GameService.set_dm()` — look up from `player_metadata` or request body

### `api-game/websocket_handlers/app_websocket.py`

**Initial state (line 41):**
- `"dungeon_master": room.get("dungeon_master", "")` → `"dungeon_master": room.get("dungeon_master", {})`
- Frontend now receives the full object

---

## Phase 4: Frontend

### `rollplay/app/game/page.js`

**State (line 85):**
- `const [dmSeat, setDmSeat] = useState("")` → `const [dungeonMaster, setDungeonMaster] = useState(null)`
- This holds the full DM object `{ user_id, player_name, campaign_role }`

**Load game room (line 323):**
- `const currentDM = res["dungeon_master"] || ""` → `const currentDM = res["dungeon_master"] || null`
- `setDmSeat(currentDM)` → `setDungeonMaster(currentDM)`

**DMChair props (line 1697-1698):**
- Replace `dmUserId={dmSeat}` and `dmDisplayName={displayNameMap[dmSeat] || ''}` with `dungeonMaster={dungeonMaster}`
- DMChair extracts `user_id` and `player_name` from the object directly

**isDM derivation:**
- `dmSeat === thisUserId` → `dungeonMaster?.user_id === thisUserId`

**handleRoleChange (lines 862, 883):**
- set_dm action: build object from broadcast data
- unset_dm action: `setDungeonMaster(null)`

### `rollplay/app/game/hooks/webSocketEvent.js`

**handleInitialState (line 34, 56-57):**
- `dungeon_master` is now an object — pass directly to `setDungeonMaster`

**handleRoleChange:**
- Update to build/clear DM object from broadcast

### `rollplay/app/game/components/DMChair.js`

**Props (line 8):**
- Replace `dmUserId, dmDisplayName, isEmpty` with `dungeonMaster`
- Derive internally: `const isEmpty = !dungeonMaster?.user_id`
- Display: `dungeonMaster.player_name`
- Moderator filtering: compare against `dungeonMaster.user_id`

### `rollplay/app/game/components/ModeratorControls.js`

**Lines 273-296:**
- `roomData?.dungeon_master` → check `dungeonMaster?.user_id`
- Display: `dungeonMaster?.player_name` instead of `displayNameMap[roomData.dungeon_master]`
- Pass `dungeonMaster.user_id` to `handleRoleAction('unset_dm', ...)`

---

## Files Modified

| File | Change |
|------|--------|
| `rollplay-shared-contracts/shared_contracts/character.py` | Add `DungeonMaster` contract |
| `rollplay-shared-contracts/shared_contracts/session.py` | Replace `dm_user_id: str` with `dungeon_master: DungeonMaster` |
| `api-site/modules/session/application/commands.py` | Build DungeonMaster in ETL, update payload |
| `api-game/gameservice.py` | `dungeon_master` → dict, update all identity methods |
| `api-game/app.py` | Update session start, role payloads, seat validation, DM endpoints |
| `api-game/websocket_handlers/app_websocket.py` | Pass full DM object in initial_state |
| `rollplay/app/game/page.js` | `dmSeat` → `dungeonMaster` object, update props and derivations |
| `rollplay/app/game/hooks/webSocketEvent.js` | Handle DM object in initial_state and role_change |
| `rollplay/app/game/components/DMChair.js` | Consume `dungeonMaster` object prop |
| `rollplay/app/game/components/ModeratorControls.js` | Use `dungeonMaster` object for display and identity |

---

## Verification

1. **Build**: `cd rollplay && npm run build` — no errors
2. **Containers**: `docker-compose -f docker-compose.dev.yml build && docker-compose -f docker-compose.dev.yml up`
3. **Start a game session** — DM name should display on the DM chair
4. **Set/unset DM** via ModeratorControls — name updates correctly
5. **Refresh page** — DM name persists (comes from MongoDB object)
6. **Check MongoDB**: `db.active_sessions.findOne()` — `dungeon_master` is `{ user_id, player_name, campaign_role }` not a bare string
