# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rollplay is a virtual D&D/tabletop gaming platform called "Tabletop Tavern" that enables real-time multiplayer dice rolling and campaign management. The application supports room creation, party management, DM tools, initiative tracking, and comprehensive adventure logging.

## Plan Files
When in plan mode, write plan files to the repository working directory `./.claude-plans/` rather than the default `~/.claude/plans/` location. This keeps plans version-controlled alongside the codebase, enabling:
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
│   └── characters/                # Basic CRUD (minimal implementation)
│       ├── api/
│       │   ├── endpoints.py
│       │   └── schemas.py
│       ├── application/
│       │   ├── commands.py
│       │   └── queries.py
│       ├── domain/character_aggregate.py
│       ├── model/character_model.py
│       ├── repositories/character_repository.py
│       └── dependencies/providers.py
├── shared/
│   ├── jwt_helper.py
│   ├── error_handlers.py
│   ├── services/s3_service.py
│   └── dependencies/
│       ├── auth.py                # get_current_user_from_token (JWT → UserAggregate)
│       └── db.py                  # get_db(), engine setup
```

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

# api-game (Game Service) — port 8081
cd api-game && python app.py

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

Required `.env` file in project root:
```env
environment=<dev|prod>
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

# SMTP
SMTP_HOST=<host>
SMTP_PORT=<port>
SMTP_USERNAME=<username>
SMTP_PASSWORD=<password>
SMTP_FROM_EMAIL=<email>

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
- **Does NOT**: Know about campaigns/users/site concepts, read from PostgreSQL
- **Tech**: MongoDB, WebSocket

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

### Anti-Patterns (Removed During Refactor)
- No separate `adapters/` layer — repositories handle ORM translation directly
- No separate `mappers.py` — repositories call `Aggregate.from_persistence()` directly
- No centralized `routers.py` — routers imported directly in `main.py`
- No frontend split — single Next.js app, not separate site/game apps
- Minimal domain services — aggregates contain most business logic

### Patch Notes
When making patch notes, check `rollplay/patch_notes/` for naming conventions and style. Keep things simple and feature-led on the bullet points.
