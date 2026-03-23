# Refactor: User ID Identity + Campaign Roles

## Context

**Production bug:** Two users both named "matt" joined the same game session. Because api-game uses lowercased `player_name` (derived from `screen_name` or `email`) as the sole identity key, both users mapped to the same key. DM controls showed for the wrong user, spectator banners disappeared, general state corruption.

**Root cause:** `player_name` is not unique. `user_id` (UUID) is the correct unique identifier — already present in the ETL payload (`PlayerCharacter.user_id`) but never used as a key.

**Opportunity:** While touching every identity surface, also introduce **campaign-level roles** to replace the scattered role model (`host_id`, hot-state `moderators[]`, `dungeon_master`, implicit spectator detection). This was previously shelved (see `.claude-plans/SHELVEDmoderator-cold-state-persistence.md`) but the refactor makes it the right time.

**Two parallel concerns, one refactor:**
1. **Identity** — `player_name` → `user_id` as the primary key everywhere
2. **Authorization** — Introduce `CampaignRole` enum, persist on `CampaignMember`, hydrate into game sessions

---

## Design Principles

1. **`user_id` is the key, `player_name` is the label.** Every dict, array, comparison, and WebSocket message that uses `player_name` for identity switches to `user_id`. Display names are looked up from metadata.
2. **Campaign roles are the authority.** DM, MOD, PLAYER, SPECTATOR are persisted at the campaign level. Sessions inherit them. api-game receives them via ETL and uses them for authorization decisions (spectator banner, seat eligibility, DM controls).
3. **Host = DM.** No separate "host" concept for gameplay. Campaign keeps a `created_by` field for audit/ownership, but the gameplay role is DM — tracked as a `CampaignMember` row with `role='dm'`.
4. **No backward compatibility needed.** Internal system, all services deploy together.

---

## Part A: Campaign Roles

### A1. Domain — CampaignRole Enum

New file: `api-site/modules/campaign/domain/campaign_role.py`

```python
class CampaignRole(str, Enum):
    INVITED = "invited"      # Pending invite acceptance
    SPECTATOR = "spectator"  # Accepted invite, default state — can watch, cannot select character
    PLAYER = "player"        # Has character locked to campaign — can sit in party seats
    MOD = "mod"              # Assigned by DM — can moderate, cannot have a character
    DM = "dm"                # Campaign creator — runs sessions, full control
```

**Invariant: One user = one role per campaign.** Enforced by the existing `UniqueConstraint('campaign_id', 'user_id')` on `CampaignMember`. A user cannot be both PLAYER and MOD — promoting to MOD overwrites the role and strips their character. This is the mechanism that enforces "a player can't be a moderator."

**Role lifecycle:**
```
Campaign created     →  creator gets role='dm'
User invited         →  role='invited'
Accept invite        →  role='spectator'  (was 'player' — this is the key change)
Select character     →  role='player'     (automatic promotion)
DM sets role to mod  →  role='mod'        (overwrites role, strips character)
DM sets role back    →  role='spectator'  (must re-select character to become player)
```

### A2. CampaignMember Model Update

**`api-site/modules/campaign/model/campaign_member_model.py`:**
- Widen CheckConstraint: `IN ('invited', 'spectator', 'player', 'mod', 'dm')`
- Column `String(10)` is sufficient — "spectator" is 9 chars
- No structural change — same `(campaign_id, user_id, role)` shape

### A3. Campaign Model Update

**`api-site/modules/campaign/model/campaign_model.py`:**
- Rename `host_id` column → `created_by` (keeps FK to users, audit/ownership only)
- Remove `host` relationship (or rename to `creator`)
- DM identity derived from members with `role='dm'`

### A4. CampaignAggregate Refactor

**`api-site/modules/campaign/domain/campaign_aggregate.py`:**

Replace three separate fields:
```python
# Before
host_id: UUID
invited_player_ids: List[UUID]
player_ids: List[UUID]

# After
created_by: UUID                              # Audit/ownership — who made the campaign
members: Dict[UUID, CampaignRole]             # All membership — keyed by user_id
```

Derived properties replace the old lists:
```python
@property
def dm_id(self) -> Optional[UUID]:
    return next((uid for uid, role in self.members.items() if role == CampaignRole.DM), None)

@property
def player_ids(self) -> List[UUID]:
    return [uid for uid, role in self.members.items() if role == CampaignRole.PLAYER]

@property
def spectator_ids(self) -> List[UUID]:
    return [uid for uid, role in self.members.items() if role == CampaignRole.SPECTATOR]

@property
def invited_player_ids(self) -> List[UUID]:
    return [uid for uid, role in self.members.items() if role == CampaignRole.INVITED]

@property
def mod_ids(self) -> List[UUID]:
    return [uid for uid, role in self.members.items() if role == CampaignRole.MOD]
```

Method updates:
- `is_owned_by(user_id)` → `return self.created_by == user_id` (audit ownership)
- `is_dm(user_id)` → `return self.members.get(user_id) == CampaignRole.DM` (gameplay authority)
- `accept_invite()` → transitions `INVITED → SPECTATOR` (not `PLAYER`)
- `is_member()` → checks for any role that isn't `INVITED`
- New: `set_role(user_id, role)` — overwrites the user's current role (enforced by unique constraint). Single method for all non-DM role transitions. **Rejects `CampaignRole.DM` as a target** — DM is set once at campaign creation and is immutable. Also rejects changing the DM's role to something else. This prevents any path back to "DM might not equal owner."
- New: `get_role(user_id)` → returns `CampaignRole` or `None`

### A5. Campaign Repository Update

**`api-site/modules/campaign/repositories/campaign_repository.py`:**
- `_model_to_aggregate()` — build `members` dict from CampaignMember rows, extract `created_by` from model
- `_sync_members()` — handle all roles (dm, spectator, player, mod, invited)
- `get_by_host_id()` → rename to `get_by_creator_id()` or query CampaignMember for `role='dm'`
- `save()` — persist `created_by` instead of `host_id`

### A6. Campaign Commands Update

**`api-site/modules/campaign/application/commands.py`:**
- `CreateCampaign` — creates campaign with `created_by`, inserts DM member row
- All `campaign.is_owned_by(host_id)` checks → `campaign.is_dm(user_id)` (gameplay authority checks)
- `SelectCharacterForCampaign` — after locking character, `set_role(user_id, PLAYER)`
- `ReleaseCharacterFromCampaign` — after unlocking character, `set_role(user_id, SPECTATOR)`
- Event broadcasts — `campaign.dm_id` replaces `campaign.host_id`, recipient lists built from `campaign.members`

### A7. Campaign API Response

**`api-site/modules/campaign/api/schemas.py`** — Response schemas keep `host_id` field (populated from `dm_id`) for frontend compatibility. Add `campaign_role` field to `CampaignMemberResponse`:
```python
class CampaignMemberResponse(BaseModel):
    user_id: str
    username: str
    campaign_role: str  # NEW — "dm", "player", "spectator", "mod"
    # ... existing character fields
```

**`api-site/modules/campaign/api/endpoints.py`** — Response builders populate `host_id` from `campaign.dm_id`. No frontend schema break.

### A8. Session Implications

**`SessionEntity.host_id` stays** — Sessions denormalize the DM's user_id at creation time. This is intentional for historical data. Rename conceptually to think of it as "dm_id" but no column rename needed immediately.

**`CreateSession`** — auto-enrolls from `campaign.members` (all non-INVITED roles). Session `host_id` set from `campaign.dm_id`.

**`StartSession`** — builds ETL payload using `campaign.dm_id` instead of `campaign.host_id`.

### A9. Alembic Migration

1. Add new role values to CheckConstraint: `IN ('invited', 'spectator', 'player', 'mod', 'dm')`
2. Insert DM member row for every existing campaign: `INSERT INTO campaign_members (campaign_id, user_id, role) SELECT id, host_id, 'dm' FROM campaigns`
3. Rename `campaigns.host_id` → `campaigns.created_by`

---

## Part B: Shared Contracts

### B1. PlayerCharacter — Add campaign_role

**`rollplay-shared-contracts/shared_contracts/character.py`:**
```python
class PlayerCharacter(ContractModel):
    user_id: str
    player_name: str          # Display only
    campaign_role: str        # NEW — "dm", "player", "spectator", "mod"
    character_id: str
    character_name: str
    character_class: List[str]
    character_race: str
    level: int
    hp_current: int
    hp_max: int
    ac: int
```

### B2. PlayerState — Add user_id

**`rollplay-shared-contracts/shared_contracts/session.py`:**
```python
class PlayerState(ContractModel):
    user_id: str              # NEW — UUID string
    player_name: str          # Display only
    seat_position: int
    seat_color: str
```

---

## Part C: api-game Backend — Identity Refactor

### C1. MongoDB Document Structure

**`seat_layout`**: `["matt", "empty", "alice"]` → `["uuid-1", "empty", "uuid-2"]`

**`player_metadata`** — Keys change from `player_name` to `user_id`, gains `campaign_role`:
```python
# Before
{"matt": {"player_name": "matt", "character_id": "...", ...}}

# After
{"uuid-1": {"user_id": "uuid-1", "player_name": "matt", "campaign_role": "player", "character_id": "...", ...}}
```

**`moderators`**: `["matt", "alice"]` → `["uuid-1", "uuid-2"]`

**`dungeon_master`** and **`room_host`** — Merge into single `dungeon_master` field containing user_id. Remove `room_host`.

### C2. `api-game/gameservice.py`

**`GameSettings` model:**
- Remove `room_host` field — DM is the host
- `dungeon_master`: stores user_id (UUID string)
- `moderators`: list of user_ids
- `seat_layout`: list of user_ids or "empty"
- `player_metadata`: keyed by user_id, each entry includes `campaign_role`

**All methods** — rename `player_name` param to `user_id`:
- `is_host()` → remove (use `is_dm()`)
- `is_moderator(room_id, user_id)` — check `moderators` list
- `is_dm(room_id, user_id)` — compare against `dungeon_master`
- `add_moderator(room_id, user_id)` — append to moderators + update `player_metadata[user_id].campaign_role`
- `remove_moderator(room_id, user_id)` — remove from moderators + revert campaign_role
- `set_dm(room_id, user_id)` — set dungeon_master
- `player_has_selected_character(room_id, user_id)` — check `player_metadata[user_id]`

**Remove `.lower()` normalization** — UUIDs don't need case normalization.

**`create_room()`** — key `player_metadata` by `player_character.user_id`. Populate `seat_layout` with user_ids. Set `dungeon_master` from the PlayerCharacter with `campaign_role='dm'`. Seed `moderators` from PlayerCharacters with `campaign_role='mod'`.

### C3. `api-game/websocket_handlers/connection_manager.py`

**`room_users` dict** — keyed by `user_id` instead of `player_name`.

All methods (`add_player`, `remove_player`, `send_to_player`, etc.) — rename `player_name` param to `user_id`.

### C4. `api-game/websocket_handlers/app_websocket.py`

**WebSocket endpoint** — query param `?player_name=X` → `?user_id=X`:
```python
@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket, client_id, user_id: str):
```

### C5. `api-game/websocket_handlers/websocket_events.py`

All event handlers — replace `player_name` with `user_id` for identity fields. Keep `player_name` where it's purely display (adventure log messages). Seat change broadcasts use user_id arrays.

### C6. `api-game/adventure_log_service.py`

`from_player` → `from_user_id`. Display name resolution happens on frontend.

### C7. `api-game/app.py` (HTTP endpoints)

- `GET /game/{room_id}/roles` — query param `playerName` → `userId`
- Role mutation endpoints — request body `{"player_name": "matt"}` → `{"user_id": "uuid-1"}`
- Remove `/game/{room_id}/host` concept if it exists — DM is the authority
- Initial state response includes `campaign_role` in player_metadata

---

## Part D: api-site ETL Adjustments

### D1. StartSession

**`_build_player_characters()`** — already builds `PlayerCharacter` with `user_id`. Add `campaign_role` field:
```python
campaign_role = campaign.get_role(user_id)  # Look up from CampaignMember
PlayerCharacter(
    user_id=str(user_id),
    player_name=player_name,
    campaign_role=campaign_role.value,  # NEW
    ...
)
```

**DM seeding** — instead of looking up `campaign.host_id` for the DM username, use `campaign.dm_id`.

### D2. PauseSession / FinishSession

When reading back `PlayerState` from api-game's final state, use `user_id` field for PostgreSQL lookups instead of player_name matching.

---

## Part E: Frontend — Game UI

### E1. `rollplay/app/game/page.js`

**State variable rename:**
```javascript
const [thisPlayer, setThisPlayer] = useState()     →  const [thisUserId, setThisUserId] = useState()
```

**Identity initialization:**
```javascript
setThisUserId(currentUser?.id)  // Not screen_name
```

**`playerSeatMap`** — key by userId.

**All identity comparisons** — `seat.playerName === thisPlayer` → `seat.userId === thisUserId`

**Spectator detection** — currently implicit (no character = spectator). Now explicit:
```javascript
// Before: spectator if not seated and not DM
// After: spectator if campaign_role === 'spectator'
const isSpectator = playerMetadata[thisUserId]?.campaign_role === 'spectator'
```

**DM detection** — currently checks hot-state `dungeon_master` name. Now:
```javascript
const isDM = playerMetadata[thisUserId]?.campaign_role === 'dm'
```

**Moderator detection** — currently checks hot-state `moderators[]` by name. Now:
```javascript
const isModerator = playerMetadata[thisUserId]?.campaign_role === 'mod'
```

**Display name map** — derive from player_metadata:
```javascript
const displayNameMap = useMemo(() => {
    const map = {};
    Object.entries(playerMetadata).forEach(([userId, meta]) => {
        map[userId] = meta.player_name || userId;
    });
    return map;
}, [playerMetadata]);
```

### E2. `rollplay/app/game/hooks/useWebSocket.js`

**WebSocket URL:** `?player_name=${thisPlayer}` → `?user_id=${thisUserId}`

**`createSendFunctions`** — pass `userId`. All outbound messages embed `user_id` for identity.

### E3. `rollplay/app/game/hooks/webSocketEvent.js`

**Seat object shape:**
```javascript
{ userId: "uuid-1", playerName: "matt", campaignRole: "player", characterData: {...} }
```

All event handlers — replace `player_name` identity checks with `user_id`.

### E4. Components

**`PlayerCard.js`** — `currentSeat.userId === thisUserId` for identity. Display via `currentSeat.playerName`.

**`DMChair.js`** — `dmUserId` prop + `displayNameMap` for rendering. Filter moderators by userId.

**`ModeratorControls.js`** — all identity operations use userId. Role action payloads use `{"user_id": ...}`. Can use `campaign_role` from metadata to determine who can be promoted/demoted.

**`DiceActionPanel.js`** — turn/prompt checks use userId.

**`CombatControlsPanel.js`** — player identity by userId.

**`AdventureLog.js`** — log keying by `user_id`, display names from `displayNameMap`.

### E5. Spectator Banner

Currently the spectator banner logic is implicit. With `campaign_role` available in player_metadata, the banner shows when `campaign_role === 'spectator'` — explicit and correct regardless of name collisions.

---

## Files Modified

| File | Change |
|------|--------|
| **Campaign Roles** | |
| `api-site/modules/campaign/domain/campaign_role.py` | NEW — CampaignRole enum |
| `api-site/modules/campaign/domain/campaign_aggregate.py` | `host_id` → `created_by` + `members` dict, role-based methods |
| `api-site/modules/campaign/model/campaign_model.py` | `host_id` → `created_by` column |
| `api-site/modules/campaign/model/campaign_member_model.py` | Extend CheckConstraint for new roles |
| `api-site/modules/campaign/repositories/campaign_repository.py` | Role-based member queries, sync logic |
| `api-site/modules/campaign/application/commands.py` | `is_owned_by` → `is_dm`, role transitions on character select/release |
| `api-site/modules/campaign/api/endpoints.py` | Populate `host_id` from `dm_id`, add `campaign_role` to member response |
| `api-site/modules/campaign/api/schemas.py` | Add `campaign_role` to `CampaignMemberResponse` |
| `api-site/modules/session/application/commands.py` | Use `campaign.dm_id`, build player list from members, add campaign_role to ETL |
| `api-site/alembic/versions/` | Migration: extend roles, insert DM rows, rename host_id |
| **Shared Contracts** | |
| `rollplay-shared-contracts/shared_contracts/character.py` | Add `campaign_role` to `PlayerCharacter` |
| `rollplay-shared-contracts/shared_contracts/session.py` | Add `user_id` to `PlayerState` |
| **api-game Identity** | |
| `api-game/gameservice.py` | All identity → user_id, remove room_host, campaign_role in metadata |
| `api-game/app.py` | HTTP params/body → user_id, merge host/DM endpoints |
| `api-game/websocket_handlers/connection_manager.py` | `room_users` keyed by user_id |
| `api-game/websocket_handlers/app_websocket.py` | WebSocket query param → `user_id` |
| `api-game/websocket_handlers/websocket_events.py` | All event identity fields → user_id |
| `api-game/adventure_log_service.py` | `from_player` → `from_user_id` |
| **Frontend Game UI** | |
| `rollplay/app/game/page.js` | `thisPlayer` → `thisUserId`, role checks from campaign_role, displayNameMap |
| `rollplay/app/game/hooks/useWebSocket.js` | WebSocket URL `user_id=`, send functions |
| `rollplay/app/game/hooks/webSocketEvent.js` | All event handlers, seat shape with userId + campaignRole |
| `rollplay/app/game/components/PlayerCard.js` | Identity checks → userId |
| `rollplay/app/game/components/DMChair.js` | `dmName` → `dmUserId`, display lookup |
| `rollplay/app/game/components/ModeratorControls.js` | All identity → userId, role-aware UI |
| `rollplay/app/game/components/DiceActionPanel.js` | Turn/prompt checks → userId |
| `rollplay/app/game/components/CombatControlsPanel.js` | Player identity → userId |
| `rollplay/app/game/components/AdventureLog.js` | Log keying → user_id |

---

## Implementation Order

1. **Campaign domain** — CampaignRole enum, aggregate refactor, model update
2. **Alembic migration** — extend roles, insert DM rows, rename host_id → created_by
3. **Campaign repository + commands** — role-based queries, command updates
4. **Shared contracts** — `campaign_role` on PlayerCharacter, `user_id` on PlayerState
5. **api-game backend** — identity + role refactor across all files
6. **api-site ETL** — hydrate campaign_role, use user_id for lookups
7. **Frontend game UI** — page.js core, hooks, components

All changes ship in a single coordinated deployment.

---

## Verification

1. **Two users with same screen_name** — Join same session, each gets unique seat, correct roles, correct character data
2. **DM controls** — Only the user with `campaign_role='dm'` sees DM controls, regardless of display name
3. **Spectator banner** — Shows for users with `campaign_role='spectator'`, not based on name matching
4. **Moderator controls** — Add/remove moderators by user_id, MOD role persists across sessions
5. **Character select flow** — Accepting invite → SPECTATOR, selecting character → PLAYER
6. **Kick player** — Targets correct user even with duplicate names
7. **Adventure log** — Entries attributed to correct user, correct seat color
8. **Dice rolls** — Turn tracking by user_id, prompts reach correct user
9. **Reconnection** — WebSocket reconnect with user_id restores correct state
10. **Session start/stop ETL** — PlayerCharacter round-trips with user_id + campaign_role correctly
11. **Host/DM merge** — No separate host concept in game UI, DM is the authority
