# Moderator Cold-State Persistence — SHELVED

## Problem
Moderator state lives exclusively in api-game hot state (MongoDB `moderators[]` on `GameSettings`). This creates a split-authority gap: a user can be made moderator in an active session, leave, select a character via the dashboard, and rejoin — now holding both moderator status and a character, which violates the "moderators don't play" business rule.

## Why Shelved
The existing hot-state guards in `api-game/gameservice.py` already prevent the worst outcome:
- `update_seat_layout()` (lines 149-164) rejects moderators from sitting in party seats
- `add_moderator()` (lines 338-342) rejects players with selected characters from becoming moderators
- api-game reads seated player names to determine who is "playing" — a moderator who can't sit is effectively not playing

The actual exploit results in **UX confusion** (user has a character but can't sit), not a data integrity breach or gameplay-breaking state. The fix (full cold-state persistence) is disproportionate to the risk.

## Current Architecture
- **DM/Host**: Derived from `campaign.host_id` in cold state, seeded as `dm_username` in ETL payload at session start. No separate `dm_id` on session.
- **Moderators**: Hot-state only. `GameSettings.moderators: list` in MongoDB. Set/unset via `POST/DELETE /game/{room_id}/moderators`. Broadcast via `role_change` WebSocket event.
- **Enforcement**: Bidirectional in api-game — moderators can't sit, seated players can't be modded. But only enforced at action time in hot state, not across join/leave cycles.

## Planned Architecture (If Revived)

### Target
- api-site becomes single authority for moderator role decisions and persistence
- api-game becomes hot-state mirror and live fanout service for already-authorized changes
- Moderator treated as durable session config, not ETL-owned truth from hot state

### Data Model
Add a `role` column to the session roster (likely `session_joined_users`) using a Role enum:
- `Spectator` — default for all invited users, can select characters
- `Player` — has a character assigned to the campaign
- `DM` — campaign host, currently derived from `host_id`
- `Moderator` — assigned by DM/host, cannot have a character

This unifies what's currently scattered across `host_id`, hot-state `moderators[]`, `dungeon_master`, and implicit spectator detection.

### Data Flow
1. Client calls api-site for add/remove moderator (via `authFetch`)
2. api-site validates policies and writes Postgres
3. api-site calls api-game server-to-server (httpx) to apply hot-state update
4. api-game writes Mongo and broadcasts WebSocket `role_change`
5. Frontend updates from WebSocket; pending UI during request

### Operational Ordering (Open Question)
Two options were discussed, neither fully decided:
- **Option A**: Call api-game first → write Postgres on success. Simple, no rollback needed. Downside: transient hot-state write with no cold backing if Postgres fails (self-heals on next session start).
- **Option B**: Write Postgres first → call api-game → compensate on failure. Requires holding a DB connection across an HTTP call — risks timeouts, deadlocks, connection exhaustion.

Option A was leaning preferred. Holding a transaction open across an HTTP call is risky.

### ETL Seeding
- Cold-to-warm seeding at session start/resume (same as DM seeding today)
- Incremental changes during active play via api-site → api-game command path
- NOT governed by hot-to-cold ETL extraction

### Frontend Changes
- `ModeratorControls` calls api-site instead of api-game directly
- Dashboard shows moderator badge (similar to existing DM badge)
- "Select Character" suppressed for moderators
- Pending/disabled UI during role change requests
- WebSocket `role_change` remains the live convergence mechanism
- api-site WebSocket events push role changes reactively to connected dashboard clients

### Additional Policy Enforcement
- api-site can reject character selection for users who are moderators (cold-state aware)
- api-site can reject moderator assignment for users who already have characters (both directions)
- Character edit lock policy (already on this branch) could account for moderator status

## Key Files
- `api-game/gameservice.py` — current moderator CRUD and seat validation
- `api-game/app.py` — current moderator HTTP endpoints
- `api-game/websocket_handlers/websocket_events.py` — role_change broadcast
- `api-site/modules/session/application/commands.py` — StartSession ETL, DM seeding
- `api-site/modules/campaign/model/session_model.py` — session roster (where role column would go)
- `rollplay/app/game/components/ModeratorControls.js` — frontend moderator UI
- `rollplay/app/game/page.js` — role change handler, enter session flow
