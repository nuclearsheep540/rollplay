# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rollplay is a virtual D&D/tabletop gaming platform called "Tabletop Tavern" that enables real-time multiplayer dice rolling and campaign management. The application supports room creation, party management, DM tools, initiative tracking, and comprehensive adventure logging.

## Plan Files
When in plan mode, write plan files to the repository working directory `./.claude/plans/` rather than the default `~/.claude/plans/` location. This keeps plans version-controlled alongside the codebase, enabling:
- Audit trail of "what we intended" vs "what we implemented"
- Plan files committed with related code changes
- Project history that includes planning decisions

## CRITICAL ARCHITECTURAL PRINCIPLES

### Server-Authoritative Design (Game Sessions Only)
**Applies to**: Active game sessions in **MongoDB** during live multiplayer gameplay
**Does not apply to**: Regular app features (users, campaigns, authentication) in **PostgreSQL**

**Game Service Rule**: The game service backend controls ALL active session state changes. Never send state updates via WebSocket directly.

**Correct Flow**: User Action → HTTP API → MongoDB Update → WebSocket Broadcast
**Incorrect Flow**: User Action → WebSocket Message → Direct State Change

### Atomic State Updates (Game Service Only)
**Always send complete game objects to MongoDB, never fragmented updates.**

✅ **ATOMIC**: `{ game_session: { ...completeGameObject, map: { ...completeMapObject, grid_config: newConfig } } }`
❌ **FRAGMENTED**: `{ grid_config: newConfig }` (missing rest of game session data)

Violating these principles leads to game state desync, real-time session failures, and hard-to-debug multiplayer issues.

## Backend Architecture - Aggregate-Centric Modules

### Core Principles
- **Organize by domain/aggregate, not by technical layers** — vertical cohesion
- **API → Application → Domain → Repository** within each module
- **Repository Injection**: Inject repositories directly to endpoints
- **Reference by ID**: Aggregates reference other aggregates by ID only
- **CQRS**: Separate `commands.py` (writes) and `queries.py` (reads) in each module

### Naming Conventions
- **Commands**: No "Command" suffix (e.g., `GetOrCreateUser`)
- **Aggregates**: Suffix with "Aggregate" (e.g., `UserAggregate`)
- **Repositories**: Suffix with "Repository" (e.g., `UserRepository`)
- **Modules**: Use aggregate name as directory (e.g., `user/`, `campaign/`)

### Backend Directory Structure
```
api-site/
├── main.py                        # FastAPI app, imports routers directly from modules
├── conftest.py                    # Test configuration
├── alembic/                       # Database migrations
│   ├── versions/
│   └── env.py                     # Must import all models for autogenerate
├── modules/
│   ├── user/
│   │   ├── api/
│   │   │   ├── endpoints.py
│   │   │   └── schemas.py
│   │   ├── application/
│   │   │   ├── commands.py        # GetOrCreateUser, UpdateUserLogin
│   │   │   └── queries.py        # GetUserById, GetUserByEmail
│   │   ├── domain/user_aggregate.py
│   │   ├── model/user_model.py
│   │   ├── repositories/user_repository.py
│   │   └── dependencies/providers.py
│   ├── campaign/
│   │   ├── api/
│   │   │   ├── endpoints.py
│   │   │   └── schemas.py
│   │   ├── application/
│   │   │   ├── commands.py        # CreateCampaign, UpdateCampaign, DeleteCampaign
│   │   │   └── queries.py
│   │   ├── domain/
│   │   │   ├── campaign_aggregate.py
│   │   │   └── campaign_events.py
│   │   ├── model/
│   │   │   ├── campaign_model.py
│   │   │   └── session_model.py
│   │   ├── repositories/campaign_repository.py
│   │   └── dependencies/providers.py
│   ├── session/                   # Game session lifecycle (start/pause/finish)
│   │   ├── api/
│   │   │   ├── endpoints.py
│   │   │   └── schemas.py
│   │   ├── application/
│   │   │   ├── commands.py        # CreateSession, StartSession, PauseSession, FinishSession
│   │   │   └── queries.py
│   │   ├── domain/
│   │   │   ├── session_aggregate.py
│   │   │   └── session_events.py
│   │   ├── repositories/session_repository.py
│   │   └── dependencies/providers.py
│   ├── library/                   # Asset management (maps, music, SFX, images)
│   │   ├── api/
│   │   │   ├── endpoints.py
│   │   │   └── schemas.py
│   │   ├── application/
│   │   │   ├── commands.py        # ConfirmUpload, Delete, Associate, Rename, ChangeType
│   │   │   └── queries.py
│   │   ├── domain/
│   │   │   ├── asset_aggregate.py  # MediaAssetAggregate
│   │   │   ├── map_asset_aggregate.py
│   │   │   └── media_asset_type.py # Enum: MAP, MUSIC, SFX, IMAGE
│   │   ├── model/
│   │   │   ├── asset_model.py
│   │   │   ├── audio_asset_models.py
│   │   │   └── map_asset_model.py
│   │   ├── repositories/asset_repository.py
│   │   └── dependencies/providers.py
│   ├── friendship/                # Friend requests and friendships
│   │   ├── api/
│   │   │   ├── endpoints.py
│   │   │   └── schemas.py
│   │   ├── application/
│   │   │   ├── commands.py
│   │   │   └── queries.py
│   │   ├── domain/
│   │   │   ├── friendship_aggregate.py
│   │   │   ├── friend_request_aggregate.py
│   │   │   └── friendship_events.py
│   │   ├── model/
│   │   │   ├── friendship_model.py
│   │   │   └── friend_request_model.py
│   │   ├── repositories/
│   │   │   ├── friendship_repository.py
│   │   │   └── friend_request_repository.py
│   │   └── dependencies/providers.py
│   ├── events/                    # Notifications and WebSocket event system
│   │   ├── api/
│   │   │   ├── schemas.py
│   │   │   ├── websocket_endpoint.py
│   │   │   └── notification_endpoints.py
│   │   ├── application/
│   │   │   ├── commands.py
│   │   │   └── queries.py
│   │   ├── domain/notification_aggregate.py
│   │   ├── model/notification_model.py
│   │   ├── repositories/notification_repository.py
│   │   ├── dependencies/providers.py
│   │   ├── event_manager.py
│   │   └── websocket_manager.py
│   └── characters/                # Edition-aware characters (v2 schema)
│       ├── api/
│       │   ├── endpoints.py            # Draft / runtime / level-up / me / {id} routes
│       │   ├── edition_endpoints.py    # GET /api/editions, .../classes, /species, etc.
│       │   └── schemas.py
│       ├── application/
│       │   ├── commands.py        # CreateCharacterDraft, UpdateCharacterDraft, FinalizeCharacterDraft, DiscardCharacterDraft, DeleteCharacter, UpdateRuntimeState, LevelUpCharacter
│       │   └── queries.py         # GetCharacterById, GetCharactersByUser, GetCampaignParty
│       ├── domain/character_aggregate.py  # CharacterAggregate + AbilityScores, ClassEntry, SkillProficiency, FeatAcquisition value objects
│       ├── model/                 # SQLAlchemy: characters + 6 join tables + editions
│       │   ├── edition_model.py
│       │   ├── character_model.py
│       │   ├── character_class_model.py
│       │   ├── character_ability_model.py
│       │   ├── character_save_model.py
│       │   ├── character_skill_model.py
│       │   ├── character_feat_model.py
│       │   └── character_choices_log_model.py
│       ├── repositories/
│       │   ├── character_repository.py
│       │   └── edition_repository.py
│       ├── seed_data/srd_5_2_1/   # Parsed JSON: skills, feats, species, backgrounds, classes
│       └── dependencies/providers.py
├── shared/
│   ├── jwt_helper.py
│   ├── error_handlers.py
│   ├── services/s3_service.py
│   ├── rulesets/                  # Edition-aware D&D rules math (loaded at boot)
│   │   ├── models.py              # Pydantic shapes for the seed JSON (the schema authority)
│   │   ├── registry.py            # RulesetRegistry singleton — loads + validates seed data
│   │   ├── strategy.py            # RulesetStrategy abstract base
│   │   └── dnd_2024.py            # Dnd2024Ruleset concrete: XP table, prof bonus, ASIs, modifiers
│   └── dependencies/
│       ├── auth.py                # get_current_user_from_token (JWT → UserAggregate)
│       └── db.py                  # get_db(), engine setup
```

### Reference data lives in JSON, not PostgreSQL

Static D&D rules content (classes, species, backgrounds, feats, skills) is parsed once from the vendored SRD markdown via `api-site/scripts/parse_srd.py` and committed to `api-site/modules/characters/seed_data/<edition_code>/`. The app loads these files into `shared/rulesets/registry.py:RulesetRegistry` at FastAPI startup via the lifespan handler in `main.py`. Boot fails if any file is missing, fails Pydantic validation, or has dangling cross-refs.

Character rows reference content by **stable string codes** (`class_code = "barbarian"`), not by FK — class/species/feat lookups go through the registry, not the database. Adding a new edition = drop a new directory under `seed_data/`, add a row to the `editions` table, register a `RulesetStrategy` subclass for the new edition_code. No schema migrations.

Per-edition rules math (XP→level, proficiency bonus, ASI levels, skill/save modifiers) lives in `RulesetStrategy` subclasses keyed by edition code. The strategy is injected wherever derived stats need to be computed (`CharacterResponse.derived`, level-up preview, etc.).

### Cross-Aggregate Rules

**Allowed:**
- Application layer commands inject multiple repositories when needed
- Aggregates reference other aggregates by ID only
- Commands for writes, Queries for reads

**Forbidden:**
- Direct imports between aggregate modules
- Aggregate-to-aggregate direct calls
- Business logic in shared layer
- Repository logic in domain layer

### Development Workflow - Adding New Features

1. **Identify Aggregate Ownership** — which module owns this feature?
2. **Domain First** — add business rules to the aggregate
3. **Create Command or Query** — orchestrate in application layer (command calls aggregate methods, not the other way around)
4. **Add API Endpoint** — inject repository via `Depends()`, create command, call `execute()`

### DTOs and `schemas.py` — Let Pydantic do its job

**`schemas.py`** holds Pydantic DTO *declarations* — field types, constraints, `Optional[...]`. **`endpoints.py`** holds request handling. The boundary between them is where Pydantic earns its keep.

**Rule:** DTO construction has two shapes; pick based on whether you're enriching or just mapping.

- **Pure field-for-field mapping** (aggregate's attributes match the response's fields): declare `from_attributes = True` on the response's `Config` and return `SchemaName.model_validate(aggregate)` directly from the endpoint. No helper function. Pydantic handles nested hydration (child schemas with `from_attributes = True`) and type coercion (UUID → str) automatically.

- **Mapping + enrichment** (response includes data from other aggregates, signed S3 URLs, computed fields, etc.): keep a `_to_<thing>_response(aggregate, *repos, *services)` helper at the top of `endpoints.py`. This is what `_to_campaign_response(campaign, user_repo, s3_service)` is doing — it's performing a join the aggregate can't do on its own.

**Never put construction logic inside `schemas.py`** (no `@classmethod from_aggregate(...)`). The codebase's convention is that schemas.py is declarations only; enrichment helpers live in `endpoints.py` next to the consumer.

**Heuristic:** if your `_to_<thing>_response` helper is just copying fields from an aggregate (especially if the response already has `from_attributes = True`), delete the helper and call `model_validate(aggregate)`. The helper is dead weight.

**Gotcha — Pydantic v2 does NOT auto-coerce `UUID → str`.** Declaring `id: str` on a response and calling `model_validate(aggregate)` where `aggregate.id: UUID` raises a validation error. Two fixes:
- **Preferred:** declare the response field as `UUID` to match the aggregate. Pydantic's JSON serialiser stringifies UUIDs automatically on output, so the wire format is unchanged.
- **Alternative:** keep `id: str` and write a manual helper that does `id=str(aggregate.id)` — this is why the `campaign` and `user` modules still have `_to_<thing>_response` helpers even though `from_attributes = True` is set. They pre-date the cleaner UUID-typed approach, but work.

Same applies to any non-trivial type mismatch (e.g. `datetime` → ISO string). Mirror the aggregate's types in the response; Pydantic does the serialisation. Only diverge when the wire format genuinely needs to differ from the domain's internal representation.

### Domain Events Pattern

Events are defined as static factory methods in `domain/*_events.py` files within each module. They return `EventConfig` instances — a typed domain contract in `modules/events/domain/event_config.py`.

**EventConfig fields:**
- `user_id` (UUID) — recipient
- `event_type` (str) — frontend routing key (e.g., `'campaign_invite_received'`)
- `data` (Dict) — payload (all values stringified for JSON)
- `show_toast` (bool) — whether frontend shows a toast notification
- `save_notification` (bool) — whether to persist to the notifications table

**Flow:** Command executes business logic → calls `*Events.some_event(...)` → gets `EventConfig` → passes to `await event_manager.broadcast(event)`. Commands that publish events must be `async def execute()`.

**Single-recipient events** return `EventConfig`. **Multi-recipient events** return `List[EventConfig]` (one per recipient, looped in the command).

**Event classes:** `CampaignEvents`, `FriendshipEvents`, `SessionEvents` — each in their module's `domain/` directory. The events module (`modules/events/`) acts as infrastructure, not a peer aggregate — other modules may import `EventConfig` and `EventManager` from it.

## Game/Session Management Architecture

### Campaign-Level Invites Only
Users are invited to **campaigns** (accept/decline flow), not individual game sessions. Upon accepting, user is added to `campaign.player_ids` in PostgreSQL.

### Automatic Session Enrollment
When a DM creates a game session, all `campaign.player_ids` are automatically added to `game.invited_user_ids`. No player action required.

### Sessions Tab (Read-Only)
The Sessions tab only shows **active** game sessions. Players can view session info and enter via "Enter" button. Character selection modal triggers if no character is selected. All game management (create/start/stop/delete) happens in the Campaigns tab.

## Frontend Architecture - Functional Slice Pattern

**Principle**: Organize by business domain, not technical layers. Each slice owns its components, hooks, types, and WebSocket events.

### Rules
- Group by business domain — don't mix domains across slices
- Each slice exports cleanly through `index.js`
- Share common utilities through `shared/`
- No circular dependencies between slices

### Directory Structure
```
rollplay/app/                      # Next.js 15 App Router
├── dashboard/          # Campaign, character, social management + TanStack hooks/mutations
├── auth/               # Magic link + OTP authentication
├── game/               # Active game session UI + WebSocket
├── audio_management/   # Audio mixer, tracks, WebSocket sync
├── map_management/     # Map display, grid overlay
├── asset_library/      # Asset CRUD, S3 upload, filtering
├── shared/             # Headless UI components, providers, config, utils
└── styles/             # colorTheme.js (Tier 1) + constants.js (Tier 2)
```
Each slice follows the pattern: `components/`, `hooks/`, `index.js`.

## UI Styling & Frontend Frameworks

### Two-Tier Styling System

**Tier 1 — Color Theme** (`app/styles/colorTheme.js`):
- Raw color values (`COLORS`: carbon, smoke, onyx, graphite, silver)
- Semantic mappings (`THEME`: bgPrimary, textBold, borderDefault, hoverBg, etc.)
- Inline style objects (`STYLES`: card, button, tabActive, tabInactive)
- Integrated with Tailwind via custom tokens in `tailwind.config.js`: `surface-*`, `content-*`, `border-*`, `interactive-*`, `feedback-*`

**Tier 2 — Component Constants** (`app/styles/constants.js`):
- Predefined Tailwind class strings for 4 core UI elements:
  1. `PANEL_TITLE` — main collapsible panel titles
  2. `PANEL_HEADER` — section headers within panels
  3. `PANEL_SUB_HEADER` — sub-section headers
  4. `PANEL_CHILD` / `PANEL_CHILD_LAST` — interactive child elements
- Color-coded variants: `DM_*` (rose theme), `MODERATOR_*` (blue theme)
- Special constants: modal variants, color-coded buttons, combat toggles, audio indicators

**Always use Tailwind CSS** where possible. Use constants for panel hierarchy elements. Only hardcode styles for truly unique one-off UI elements.

### Headless UI (`@headlessui/react`)
Used for all accessible interactive components in `app/shared/components/`:
- **Modal** — Dialog + Transition (focus trap, escape-to-close, backdrop click)
- **Dropdown** — Menu with keyboard navigation
- **TabNav** — TabGroup with arrow key navigation
- **Combobox** — Searchable select with real-time filtering

### Authenticated Fetch (`authFetch`)
**All authenticated API calls MUST use `authFetch`** from `app/shared/utils/authFetch.js`, never plain `fetch`.

`authFetch` wraps `fetch` with automatic 401 → token refresh → retry logic. Without it, expired access tokens cause silent failures with no recovery path. When creating any new hook, component, or utility that calls our backend from an authenticated context, always verify it uses `authFetch`.

**Correct:**
```javascript
import { authFetch } from '@/app/shared/utils/authFetch'
const response = await authFetch('/api/campaigns/', { method: 'GET', credentials: 'include' })
```

**Incorrect:**
```javascript
const response = await fetch('/api/campaigns/', { method: 'GET', credentials: 'include' })
```

**Exceptions** (plain `fetch` is correct here):
- The token refresh endpoint itself (`/api/users/auth/refresh`) — using `authFetch` would cause infinite recursion
- Auth/login pages (magic link, OTP) — user isn't authenticated yet
- Public endpoints (patch notes) — no auth required
- Direct S3 uploads (`PUT` to presigned URL) — not our backend

### TanStack Query (`@tanstack/react-query`)
Centralized data fetching and caching via `app/shared/providers/QueryProvider.js`:
- Defaults: 30s stale time, 5min garbage collection, 1 retry
- Pattern: one hook per query/mutation, query key invalidation for cache updates
- **All `queryFn` and `mutationFn` functions must use `authFetch`**, not plain `fetch`
- Used across: dashboard (campaigns, characters, friends, notifications) and asset library

### Asset Library Framework (`app/asset_library/`)
Full domain for managing game assets with S3 integration:
- **Upload flow**: 3-step S3 presigned URL pattern (GET upload URL → PUT to S3 → POST confirm to backend)
- **Features**: multi-level filtering (Media/Objects → Maps/Music/SFX/Images), campaign association, context menu actions, grid scale persistence
- **Backend**: `api-site/modules/library/` with MediaAssetAggregate, asset type validation

## Database Architecture

### PostgreSQL (Primary/Cold Storage)
- All business domain data: users, campaigns, sessions, characters, assets, friendships, notifications
- Alembic-managed migrations (auto-run on api-site container startup)
- SQLAlchemy ORM models in each module's `model/` directory

### MongoDB (Hot Storage — Game Service Only)
- Active game session state only during live gameplay
- Collections: `active_sessions` (complete game state), `adventure_logs` (chat, rolls, events)
- All state changes: HTTP API → MongoDB → WebSocket broadcast

### Hot/Cold Storage Pattern
- **Cold** (PostgreSQL via api-site): Persistent metadata, game lifecycle states, all prerequisites for a game
- **Hot** (MongoDB via api-game): Ephemeral real-time state during active sessions, deleted when session ends
- **ETL**: HTTP-based migration between api-site and api-game at game start (cold→hot) and end (hot→cold)

### Alembic Migrations

**Always use `alembic revision --autogenerate`** to create migrations. This ensures migrations stay in sync with SQLAlchemy model changes rather than hand-writing DDL that may drift from the models.

The api-site container automatically runs `alembic upgrade head` on startup via `entrypoint.sh`. If migrations fail, the container won't start — check logs, fix the issue, rebuild.

**Creating new migrations:**
```bash
docker exec api-site-dev alembic revision --autogenerate -m "description of change"
docker-compose -f docker-compose.dev.yml restart api-site
```

**When adding new models**, you MUST import them in `/api-site/alembic/env.py` or autogenerate won't detect the new tables:
```python
from modules.your_module.model.your_model import YourModel
```

## WebSocket Architecture

### Connection Management
- **Backend**: ConnectionManager in api-game
- **Frontend**: `app/game/hooks/useWebSocket.js`
- **URL Pattern**: `/ws/{room_id}?player_name={player_name}`

### Event System
- **Structure**: `{event_type: string, data: object}`
- **Game Events**: `seat_change`, `dice_roll`, `combat_state`, `player_connection`, `system_message`, `role_change`
- **Audio Events**: `remote_audio_play`, `remote_audio_resume`, `remote_audio_batch`
- Events validated server-side before broadcasting; malformed events logged and ignored

## Development Commands

### Local Development
```bash
docker-compose -f docker-compose.dev.yml build
docker-compose -f docker-compose.dev.yml up
```

### Frontend
```bash
cd rollplay
npm install
npm run dev          # Dev server on port 3000
npm run build        # Production build
```

### Backend
```bash
# api-site (Main DDD Application) — port 8082
cd api-site && uvicorn main:app --reload

# api-game (Game Service) — port 8081. No `python app.py`: app.py defines the
# ASGI app and has no __main__ block, and the lifespan needs a running loop.
cd api-game && uvicorn app:app --reload --port 8081 --log-config ./config/log_conf.yaml

# api-auth (Authentication Service) — port 8083
cd api-auth && uvicorn app:app --reload
```

### Database
```bash
# Migrations (auto-run on startup, manual commands rarely needed)
docker exec api-site-dev alembic revision --autogenerate -m "Description"
docker exec api-site-dev alembic current
docker exec api-site-dev alembic downgrade -1

# Direct access
docker exec postgres-dev psql -U postgres -d rollplay
docker exec mongo-dev mongosh
```

### Production
```bash
docker-compose build && docker-compose up -d
```

## Environment Configuration

Per-environment runtime env files (see `env.example` for the full template): **`dev.env`** on the
dev box (used by `docker-compose.dev.yml`), **`prod.env`** on the prod box (used by
`docker-compose.yml`). Both are gitignored. A separate root **`.env`** holds compose
**parse-time** values only: the RELEASE/service version pins (written by
`scripts/set-release.sh`), `CFD_PRIVATE_KEY_PATH` (the signing-key rendezvous — single-sources
the compose mount target AND the app's env var so they can never drift), and build args for
locally-built dev images. Never put runtime config in `.env` — it belongs in the per-env files.

Runtime env file contents:
```env
ENVIRONMENT=<development|production>
NEXT_PUBLIC_API_URL=<your-api-url>

# PostgreSQL
POSTGRES_USER=<username>
POSTGRES_PASSWORD=<password>
POSTGRES_DB=<database>

# MongoDB
MONGO_INITDB_ROOT_USERNAME=<username>
MONGO_INITDB_ROOT_PASSWORD=<password>
MONGO_INITDB_DATABASE=<database>

# Auth & Security
JWT_SECRET=<secret>
JWT_ALGORITHM=<algorithm>

# Email (Mailtrap Sending API — no SMTP; api-auth uses MailtrapClient)
MAIL_TRAP_API_TOKEN=<token>
FROM_EMAIL=<email>

# Redis & External
REDIS_URL=<url>
API_KEY_SECRET=<key>
```

## NGINX — Service Routing

All API routes must be configured in NGINX. Config files: `docker/dev/nginx/nginx.conf` and `docker/prod/nginx/nginx.conf`.

### Service Map
- **api-site** (8082): Users, campaigns, sessions, characters, assets, friendships, notifications
- **api-game** (8081): Active game sessions, game WebSocket (`/ws/`)
- **api-auth** (8083): Magic links, OTP, JWT generation

### Current Routes
```nginx
# → api-site:8082
location /api/users { ... }
location /api/campaigns { ... }
location /api/sessions { ... }
location /api/assets { ... }
location /ws/events { ... }         # Site WebSocket (notifications)

# → api-game:8081
location /api/game { ... }
location /ws/ { ... }               # Game WebSocket

# → api-auth:8083
location /api/auth { ... }
```

### Adding New Routes
1. Add `location` block to `docker/dev/nginx/nginx.conf`
2. Add same block to `docker/prod/nginx/nginx.conf`
3. Restart: `docker-compose -f docker-compose.dev.yml restart nginx`

## Service Boundaries

### api-auth (Authentication)
- **Does**: JWT generation, magic link emails, OTP verification
- **Does NOT**: Create users, know about campaigns/games
- **Tech**: Redis (OTP storage)

### api-site (Main DDD Application)
- **Does**: All business domain logic, CRUD for all aggregates, JWT validation (shared secret, no call to api-auth), game session lifecycle orchestration, S3 presigned URLs
- **Does NOT**: Handle active game sessions, manage game WebSocket connections
- **Tech**: PostgreSQL, SQLAlchemy, DDD aggregates

### api-game (Game Session Service)
- **Does**: Manage atomic game state in MongoDB, handle game WebSocket connections, broadcast state changes
- **Does NOT**: Know about campaigns/users/site concepts, read from PostgreSQL, **block the event loop**
- **Tech**: MongoDB via PyMongo's async client (`AsyncMongoClient`), WebSocket

**Every database call in api-game is awaited.** One process, one event loop, every
client in every room served by it — so a synchronous driver call freezes the whole
service until it returns, including drag streams and broadcasts for players in
other games. Blocking pymongo was measured stalling the loop for the length of
each MongoDB round trip; a blocking call in a handler is now a bug, not a style
choice. Boot (the reachability ping and index creation) runs in `app.py`'s FastAPI
lifespan, because there is no event loop at import time to await on.

**Awaits are suspension points, so handlers interleave.** A handler no longer runs
start-to-finish uninterrupted; another client's message can run at any `await`.
In-memory presence state — the map-token hold registry, the hidden-token set,
`ConnectionManager.room_users` — is owned by the loop thread: read and mutate it
between awaits, never across one, and re-read anything a decision depends on. This
is why `map_token_update`'s read → write → read-back is no longer atomic (accepted:
per-token positional `$set`s, same-token races are last-write-wins by design).

### HTTP-Based ETL (Session Lifecycle)
**Game Start** (Cold→Hot): api-site gathers state from PostgreSQL → HTTP POST to api-game → MongoDB document created → game status set to ACTIVE
**Game End** (Hot→Cold): api-site requests final state via HTTP → persists to PostgreSQL → sends delete to api-game → MongoDB document removed → game status set to INACTIVE/FINISHED

## Docker Services
- **rollplay**: Next.js frontend (single SPA)
- **nginx**: Reverse proxy, service discovery, SSL termination
- **api-site**: Main DDD application (PostgreSQL)
- **api-game**: Game session service (MongoDB, WebSocket)
- **api-auth**: Authentication service (JWT, magic links)
- **postgres**: Primary database
- **mongodb**: Hot storage for active game sessions
- **redis**: OTP storage and caching
- **certbot-renewer**: SSL certificate renewal (production)

## Key Conventions

### License Headers
All new source files must include GPL-3.0 license headers:
- JS: `/* Copyright (C) 2025 Matthew Davey */` and `/* SPDX-License-Identifier: GPL-3.0-or-later */`
- Python: `# Copyright (C) 2025 Matthew Davey` and `# SPDX-License-Identifier: GPL-3.0-or-later`

### UUID Handling — Keep UUIDs as UUIDs
**All internal Python code (aggregates, commands, queries, events, repositories) must pass UUIDs as `UUID` objects, never pre-stringified.** Only stringify at serialization boundaries.

**Stringify at these boundaries:**
- `EventConfig.data` dicts (must be JSON-serializable)
- HTTP response payloads / JSON bodies
- ETL payloads sent to api-game

**Never stringify for:**
- Method parameters between commands, aggregates, events, and repositories
- `EventConfig.user_id` (expects `UUID`)
- Repository queries

```python
# Correct: UUID in, stringify only in the data dict
def session_created(campaign_player_ids: List[UUID], session_id: UUID, ...) -> List[EventConfig]:
    EventConfig(user_id=player_id, data={"session_id": str(session_id), ...})

# Wrong: caller stringifies, method wraps back to UUID
events = SessionEvents.session_created(campaign_player_ids=[str(pid) for pid in campaign.player_ids], ...)
# ... then inside: user_id=UUID(player_id)  # pointless round-trip
```

### Explicit Over Implicit — Library Behavior Must Be Visible

When our code relies on behavior defined inside an external module — an exception a call can
raise, a default parameter value, a lazy or idempotent semantic — that reliance must be written
into our code, not left in the library's documentation. A bare library call cannot tell a reader
"the author designed around this" from "the author had no idea it could happen".

- **Anticipated exceptions**: catch the named exception class at the call site, even when the
  design is to crash. A bare `raise` after logging is the explicit spelling of "anticipated,
  deliberately unhandled":

  ```python
  try:
      await self.client.admin.command('ping')  # forces a real round-trip
  except ServerSelectionTimeoutError:
      logger.critical("MongoDB unreachable — refusing to start")
      raise
  ```

  State the decision in a `Raises:` docstring section, including *why* it is unhandled, so the
  next reader doesn't "helpfully" wrap it in a recovery path.
- **Defaults we rely on**: pass them explicitly as kwargs (`serverSelectionTimeoutMS=5000`). If
  the design cares about a value, an invisible library default is not allowed to supply it.
- **Semantics we lean on**: implicit behaviors the design depends on get a one-line comment at
  the point of reliance — `AsyncMongoClient` connects lazily (constructing it proves nothing;
  the lifespan's ping is what establishes reachability), `create_index` is an idempotent no-op,
  Mongo auto-creates collections on first write, and `find()` returns a cursor *synchronously*
  while `aggregate()` must be awaited before you can drain it.

**Calibration**: this applies at I/O boundaries and designed failure paths — not to every line
(any Python line can raise; annotating everything buries the signal). The test: can a reader who
has not read the library's docs tell what we anticipate happening at this line, and what we have
decided to do about it?

**Origin (2026-08-28)**: `client.admin.command('ping')` in api-game's `mongo_service.py` was the
loud-crash half of boot — it raises when MongoDB is unreachable, and nothing in the code said so.
The failure path the architecture depended on was invisible at the call site. Moved into the
FastAPI lifespan on 2026-09-03 when api-game went async; the property it guards is unchanged.

### Variable Naming — Recognizable Words, Not Initials

A name is written once and read many times; its job is at the read site, not the assignment.
Compression may shorten a word but must keep it recognizable: `map_conf` for a map_config dict
is fine; `mc` is not. Initialisms fail twice — ambiguous in context (`mc` could plausibly be
map_config, mongo_client, or matched_count in the same file) and unsearchable (grepping `mc`
is useless). Single-character loop variables fall under the same rule: `for channel_id,
channel in ...`, never `for c in ...`.

**Test**: can a reader landing mid-function, on the read site alone, tell what the variable
holds?

**Calibration**: read-distance matters. `except Exception as e:` with `{e}` used on the next
line is conventional and stays; the same compression referenced forty lines from its
assignment is not acceptable.

### Testing — every test owns its own state

**The rule: a test must create everything it touches, and touch nothing it did not create.**

Order-independence is not the rule — it is how you *detect* whether you followed the rule. If tests
pass in one order and fail in another, that is the symptom; the disease is shared setup. Chasing the
symptom (adding sleeps, pinning order, renaming tests so they sort favourably) leaves the disease in
place.

**What "shared state" means here.** It is much wider than a fixture two tests both use:

- Module-level mutable objects — a `dict`/`list` constant, a default argument, a seed structure.
- Class attributes on the test class, or anything assigned to `self` in one test and read in another.
- Module singletons: registries, caches, connection pools, in-memory stores.
- Session- or module-scoped pytest fixtures (`scope="session"`), which exist precisely to be shared.
- The database, when a test commits and does not roll back.
- **State inside the code under test.** This is the one that bites, because no amount of careful
  fixture design prevents it — if the production code hands every caller the same object, a test
  mutating "its own" result is writing to a global.

**Practices:**

- **Build inputs per test, via a factory.** `make_note(**overrides)` returning a fresh object each
  call — not a module-level object that tests mutate in place. Function-scoped fixtures by default;
  reach for a wider scope only for genuinely read-only, expensive setup, and then never mutate it.
- **Prefer assertions that observe over assertions that mutate.** `a.thing is not b.thing` detects
  shared state while changing nothing, so it cannot leak into another test. Use a mutation-based
  assertion when the *consequence* is what deserves describing — and understand it writes to
  whatever the code under test shares.
- **Assert only on objects the test created.** Asserting on a module constant, or on anything a
  previous test could have touched, makes the result a function of the whole run.
- **Leave nothing behind.** If a test must mutate shared state, restore it in teardown — but treat
  needing that as a smell worth removing rather than managing. Against a real store this means
  deleting rows, not just deactivating them: `api-game/tests/test_services_roundtrip.py` learned
  this when `clear_active_map` turned out to only flip `active: false`, leaving a row per run.
- **Skip, don't fail, when infrastructure is absent.** A test that needs MongoDB or PostgreSQL
  should `pytest.skip` with a reason when it cannot reach it, so the suite still runs on a machine
  with no stack up.

**Verify a new test actually proves what you claim.** Run it alone against the *unfixed* code:

```bash
docker exec api-site-dev python -m pytest "path::TestClass::test_name" -q   # api-site
docker exec api-game-dev python -m pytest "path::TestClass::test_name" -q   # api-game
```

Both images carry pytest; run the suite in the container that owns the code, so it sees the same
dependencies and the same MongoDB/PostgreSQL the app talks to.

If it passes there, it does not prove the bug — whatever it does in a full run. Temporarily
reintroducing the bug to run this experiment is cheap and worth it (copy the file first, restore
after). **Never cite a collateral failure as evidence**: a test that fails only as a knock-on from an
earlier test's side effects proves nothing, and presenting it as proof is worse than not having it.

**Test-driven fixes:** write the test, run it, **show it failing**, then fix, then show it passing. A
test written after a fix proves only that the code does what it does.

**Why this is here (2026-08-20, notes).** Four tests were written to prove a shared-mutable-default
bug: `EMPTY_DOCUMENT` was a module constant copied with `dict()`, which duplicates the outer dict but
shares the nested list, so every new note in the process was handed the same `content` list. All four
tests failed in a full run and that was reported as proof. Run individually, **three failed and one
passed** — the fourth had only failed because earlier tests had already corrupted the shared constant.
The fixtures were fine; the leak was through production module state. Its docstring now says outright
that it is a shape regression guard and not evidence of independence.

### Anti-Patterns (Removed During Refactor)
- No separate `adapters/` layer — repositories handle ORM translation directly
- No separate `mappers.py` — repositories call `Aggregate.from_persistence()` directly
- No centralized `routers.py` — routers imported directly in `main.py`
- No frontend split — single Next.js app, not separate site/game apps
- Minimal domain services — aggregates contain most business logic

### Release Notes
Release notes are generated automatically: the ship workflow (`.github/workflows/deploy.yml`) publishes a GitHub Release with `--generate-notes` after each successful production deploy. The old in-app patch-notes feature (markdown files in `rollplay/patch_notes/` rendered at `/patch_notes`) was removed 2026-08-28 — do not reintroduce it.
