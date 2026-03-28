# DONE: User ID Identity, Campaign Roles & Service-Call Moderators

Consolidates three completed plans: `api-game-user-id-refactor`, `dungeon-master-contract`, `remove-legacy-moderators-service-call`.

## Context

**Production bug:** Two users both named "matt" joined the same game session. Because api-game used lowercased `player_name` as the sole identity key, both mapped to the same key — DM controls showed for the wrong user, spectator banners disappeared, general state corruption.

**Root cause:** `player_name` is not unique. `user_id` (UUID) is the correct unique identifier.

**Scope:** While touching every identity surface, we also:
1. Introduced `CampaignRole` enum (`DM`, `MOD`, `PLAYER`, `SPECTATOR`, `INVITED`) persisted on `CampaignMember`
2. Created `DungeonMaster` and `SessionUser` shared contracts for proper ETL hydration
3. Removed the legacy `moderators[]` array, replacing it with a service-call pattern where api-game proxies role changes through api-site (domain authority)

---

## Design Principles

1. **`user_id` is the key, `player_name` is the label.** Every dict, array, comparison, and WebSocket message uses `user_id` for identity. Display names are looked up from metadata.
2. **Campaign roles are the authority.** Persisted at the campaign level, inherited by sessions via ETL, used for authorization decisions.
3. **Host = DM.** No separate "host" concept. Campaign keeps `created_by` for audit, gameplay role is DM via `CampaignMember`.
4. **api-site is domain authority.** Role changes during live sessions: Frontend → api-game → api-site (validates) → api-game (mirrors to MongoDB + broadcasts).
5. **Atomic WebSocket broadcast.** State changes flow via WebSocket broadcast, not HTTP polling. Components consume props kept live by the broadcast.

---

## What Changed

### Campaign Domain (api-site)

- **`CampaignRole` enum** — `INVITED`, `SPECTATOR`, `PLAYER`, `MOD`, `DM` in `campaign_role.py`
- **CampaignAggregate** — `host_id` → `created_by` + `members: Dict[UUID, CampaignRole]` with derived properties (`dm_id`, `player_ids`, `spectator_ids`, `mod_ids`, `invited_player_ids`)
- **CampaignModel** — `host_id` column → `created_by`
- **CampaignMember** — CheckConstraint widened: `IN ('invited', 'spectator', 'player', 'mod', 'dm')`
- **Commands** — `is_dm()` replaces `is_owned_by()`, `SelectCharacterForCampaign` auto-promotes to PLAYER, `ReleaseCharacterFromCampaign` reverts to SPECTATOR, `SetMemberRole` for DM-initiated role changes with event broadcast
- **`SelectCharacterForCampaign`** rejects MOD users; **`SetMemberRole`** rejects PLAYER users with characters when promoting to MOD
- **`POST /set-role`** — internal endpoint (Docker-network only) for api-game to proxy role changes

### Role Lifecycle
```
Campaign created     →  creator gets role='dm'
User invited         →  role='invited'
Accept invite        →  role='spectator'
Select character     →  role='player'     (automatic)
DM promotes to mod   →  role='mod'        (character stripped)
DM demotes mod       →  role='spectator'  (must re-select character)
```

### Shared Contracts

- **`DungeonMaster`** — `user_id`, `player_name`, `campaign_role="dm"` (no character fields)
- **`SessionUser`** — `user_id`, `player_name`, `campaign_role` + optional `PlayerCharacter` (allows mods/spectators without characters)
- **`SessionStartPayload`** — `dm_user_id: str` → `dungeon_master: DungeonMaster`, `player_characters` → `session_users: List[SessionUser]`

### api-game Backend

- **Identity** — all dicts, arrays, WebSocket messages keyed by `user_id` (not `player_name`). Removed `.lower()` normalization.
- **`dungeon_master`** — stored as `{user_id, player_name, campaign_role}` dict, not bare string
- **`moderators[]`** — fully removed from `GameSettings`, initial_state broadcast, session creation, and seed data
- **`is_moderator()`** — reads `player_metadata[user_id].campaign_role == "mod"` instead of `moderators` array
- **`update_player_role()`** — new method, `$set` on `player_metadata.{user_id}.campaign_role`
- **`site_client.py`** — async httpx client for api-site internal calls (follows api-auth pattern)
- **Moderator endpoints** — rewritten to proxy pattern: hot-state seat check → `site_client.request_role_change()` → update MongoDB → broadcast

### ETL (api-site → api-game)

- `_build_session_users()` iterates ALL `joined_users` (not just those with characters), builds `SessionUser` for everyone
- `DungeonMaster` contract hydrated during session start from campaign data

### Frontend — Game UI

- **`thisPlayer` → `thisUserId`**, identity from `currentUser?.id`
- **`dmSeat` → `dungeonMaster`** object state (full contract, not bare string)
- **`moderators` state removed** — `moderatorIds` derived via `useMemo` from `playerMetadata`
- **Two name maps**: `displayNameMap` (player_name for lobby/moderator), `characterNameMap` (character_name for in-game)
- **All components** use `user_id`-based identity: PlayerCard, DMChair, ModeratorControls, DiceActionPanel, CombatControlsPanel, AdventureLog, LobbyPanel
- **ModeratorControls** — uses `playerMetadata` and `dungeonMaster` props (live via WebSocket), no HTTP polling. Passes `requesting_user_id` in request body.
- **`sendRoleChange`** WebSocket function removed (dead code — role changes go via HTTP to api-game)
- **`roleChangeTrigger` / `fetchRoomRoles`** polling removed — replaced by atomic WebSocket broadcast pattern

### Frontend — Dashboard

- **`campaign_role_changed`** WebSocket event handler — silent cache invalidation via `invalidation.invalidateCampaigns()`
- **`campaign_character_released`** — already handled, invalidates campaigns + notifications
- **"Select Character" button** — only visible for `spectator` campaign_role
- **"Moderator" badge** — blue pill shown for users with `mod` campaign_role (matching DM badge pattern)

### Service-Call Architecture

```
Frontend → api-game (HTTP) → api-site (async httpx, internal endpoint) → PostgreSQL
                                         ↓ (returns success/failure)
                            api-game updates MongoDB player_metadata.campaign_role
                            api-game broadcasts via WebSocket
                            Frontend updates from WebSocket broadcast
```

**Validation split:**
- api-game validates hot-state only (target not seated)
- api-site validates domain rules (DM auth, membership, character conflicts, role validity)

**Error handling:**
| Failure | Behavior | Recovery |
|---------|----------|----------|
| api-site rejects (400) | api-game returns 409 with detail | User sees error, retries |
| api-site unreachable | api-game returns 502 | User retries; no state corruption |
| api-site OK, MongoDB fails | 500 | PostgreSQL correct; next ETL re-seeds |

---

## Files Modified

| File | Change |
|------|--------|
| **Campaign Domain** | |
| `api-site/modules/campaign/domain/campaign_role.py` | NEW — CampaignRole enum |
| `api-site/modules/campaign/domain/campaign_aggregate.py` | `host_id` → `created_by` + `members` dict |
| `api-site/modules/campaign/domain/campaign_events.py` | Added `campaign_role_changed` silent event |
| `api-site/modules/campaign/model/campaign_model.py` | `host_id` → `created_by` |
| `api-site/modules/campaign/model/campaign_member_model.py` | Extended CheckConstraint |
| `api-site/modules/campaign/repositories/campaign_repository.py` | Role-based sync + queries |
| `api-site/modules/campaign/application/commands.py` | `SetMemberRole`, MOD guards on character commands |
| `api-site/modules/campaign/api/endpoints.py` | `POST /set-role`, event_manager injection |
| `api-site/modules/campaign/api/schemas.py` | `CampaignSetRoleRequest/Response`, `campaign_role` on members |
| `api-site/modules/session/application/commands.py` | `SessionUser` ETL, `DungeonMaster` contract |
| `api-site/alembic/versions/` | Migration: extend roles, insert DM rows, rename host_id |
| **Shared Contracts** | |
| `rollplay-shared-contracts/shared_contracts/character.py` | `DungeonMaster`, `SessionUser`, `campaign_role` on `PlayerCharacter` |
| `rollplay-shared-contracts/shared_contracts/session.py` | `session_users`, `dungeon_master` on payload |
| **api-game** | |
| `api-game/gameservice.py` | Identity → user_id, removed `moderators`, `dungeon_master` as dict |
| `api-game/app.py` | Proxy moderator endpoints, session creation with `SessionUser` |
| `api-game/site_client.py` | NEW — async httpx client for api-site |
| `api-game/config/settings.py` | `API_SITE_INTERNAL_URL` |
| `api-game/websocket_handlers/connection_manager.py` | `room_users` keyed by user_id |
| `api-game/websocket_handlers/app_websocket.py` | `user_id` query param, DM object in initial_state |
| `api-game/websocket_handlers/websocket_events.py` | All identity fields → user_id |
| `api-game/adventure_log_service.py` | `from_player` field (user_id internally) |
| **Frontend — Game** | |
| `rollplay/app/game/page.js` | `thisUserId`, name maps, derived moderatorIds, `dungeonMaster` object |
| `rollplay/app/game/hooks/useWebSocket.js` | `user_id=` in URL, removed `sendRoleChange` |
| `rollplay/app/game/hooks/webSocketEvent.js` | user_id identity, removed `sendRoleChange`, `playerMetadata` from broadcast |
| `rollplay/app/game/components/PlayerCard.js` | Identity → userId |
| `rollplay/app/game/components/DMChair.js` | `dungeonMaster` object prop |
| `rollplay/app/game/components/ModeratorControls.js` | Props-based (no HTTP polling), `dungeonMaster` + `playerMetadata` |
| `rollplay/app/game/components/DiceActionPanel.js` | Turn/prompt → userId |
| `rollplay/app/game/components/CombatControlsPanel.js` | Player identity → userId |
| `rollplay/app/game/components/AdventureLog.js` | `characterNameMap`, log keying by user_id |
| `rollplay/app/game/components/LobbyPanel.js` | `displayNameMap` for name resolution |
| **Frontend — Dashboard** | |
| `rollplay/app/dashboard/page.js` | `campaign_role_changed` WS handler |
| `rollplay/app/dashboard/components/CampaignManager.js` | Spectator-only "Select Character", Moderator badge |
| **Seed Data** | |
| `docker/dev/mongo/mongo-init.js` | `dungeon_master: {}`, no `moderators` |
| `docker/prod/db/mongo-init.js` | `dungeon_master: {}`, no `moderators` |

---

## Verification

1. **Two users with same screen_name** — unique seats, correct roles, correct character data
2. **DM controls** — only `campaign_role='dm'` user sees DM controls
3. **Spectator banner** — explicit via `campaign_role='spectator'`
4. **Add/remove moderator** — proxied through api-site, persists to PostgreSQL, broadcasts via WebSocket
5. **Character guard** — MOD cannot select character (dashboard or game), PLAYER with character cannot be promoted to MOD
6. **DM chair** — displays `player_name` from DungeonMaster contract object
7. **ETL** — mods/spectators (no character) included in `session_users`, full `DungeonMaster` hydrated
8. **MongoDB** — no `moderators` field, `dungeon_master` is `{user_id, player_name, campaign_role}`
9. **Dashboard** — role changes trigger silent cache invalidation, "Select Character" hidden for non-spectators
10. **No HTTP polling** — ModeratorControls uses WebSocket-broadcast props, no `fetchRoomRoles`
