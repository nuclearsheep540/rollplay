# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rollplay is a virtual D&D/tabletop gaming platform called "Tabletop Tavern" that enables real-time multiplayer dice rolling and campaign management. The application supports room creation, party management, DM tools, initiative tracking, and comprehensive adventure logging.

## 🚨 CRITICAL ARCHITECTURAL PRINCIPLES

### **Server-Authoritative Design (Game Sessions Only)**
**This principle applies ONLY to live game sessions, NOT to general application features.**

**Applies to**: Active game sessions in **MongoDB** during live multiplayer gameplay
**Does not apply to**: Regular app features (users, campaigns, authentication) in **PostgreSQL**

**Game Service Rule**: The game service backend controls ALL active session state changes. Never send state updates via WebSocket directly.

**Correct Flow**: User Action → HTTP API → MongoDB Update → WebSocket Broadcast to game clients
**Incorrect Flow**: User Action → WebSocket Message → Direct State Change

#### Game Service Examples:
✅ **CORRECT**: DM applies grid config → `PUT /game/{room_id}/map` → MongoDB update → Broadcast to game clients
❌ **WRONG**: DM applies grid config → WebSocket `map_config_update` → Direct state change

### **For Game Service Only - Atomic State Updates**  
**Always send complete game objects to MongoDB, never fragmented updates.**

**Applies to**: Active game session data in **MongoDB** only
**Does not apply to**: Regular application data using PostgreSQL aggregates

**Atomic means**: Send the entire updated game object as one unit to MongoDB, replacing complete state
**Non-atomic means**: Send partial updates (individual fields) that fragment MongoDB game state

#### Game Service Examples:
✅ **ATOMIC**: `{ game_session: { ...completeGameObject, map: { ...completeMapObject, grid_config: newConfig } } }`
❌ **FRAGMENTED**: `{ grid_config: newConfig }` (missing rest of game session data)

### Why These Principles Matter for Game Service:
- **Game State Consistency**: All game clients receive identical MongoDB state
- **Real-time Sync**: Prevents race conditions in live game sessions
- **WebSocket Reliability**: Clear flow of game state changes through HTTP → MongoDB → WebSocket
- **Session Integrity**: MongoDB transactions ensure atomic game state updates

**⚠️ IMPORTANT**: Violating these principles leads to game state desync, real-time session failures, and hard-to-debug multiplayer issues.

**🔄 Note**: These principles are specific to the **game service managing active sessions in MongoDB**. Regular application features (users, campaigns, etc.) follow standard DDD patterns with PostgreSQL.

## Backend Architecture - Domain-Driven Design (DDD)

### 🚨 CRITICAL DDD PRINCIPLES

#### **Proper Layer Architecture**
**API → Application → Domain → Adapters**

**Correct Flow**: HTTP Request → Command → Aggregate → Repository → Database
**Incorrect Flow**: API → Direct Database Access (bypassing domain logic)

#### **Aggregate Design Rules**
- **Single Responsibility**: Each aggregate protects one set of business invariants
- **Reference by ID**: Aggregates reference other aggregates by ID only, never direct object references
- **Transaction Boundaries**: One aggregate per transaction
- **Small and Focused**: Keep aggregates as small as possible while maintaining consistency

#### **Clean Boundaries**
- **Domain Layer**: Pure business logic, no infrastructure dependencies
- **Application Layer**: Orchestration only, no business rules
- **Adapters Layer**: Infrastructure concerns (databases, external APIs)
- **API Layer**: HTTP concerns, input validation, response formatting

### Backend Directory Structure (DDD)
```
api-site/
├── api/                       # FastAPI route handlers
│   ├── users.py              # User endpoints 
│   ├── campaigns.py          # Campaign endpoints
│   └── schemas/              # Pydantic request/response models
│       ├── user_schemas.py   # UserResponse, UserRequest
│       └── campaign_schemas.py
├── application/              # Orchestration layer
│   └── commands/             # Use case implementations
│       ├── user_commands.py
│       └── campaign_commands.py
├── domain/                   # Pure business logic
│   ├── aggregates/           # Business entities with invariants
│   │   ├── user_aggregate.py
│   │   ├── campaign_aggregate.py
│   │   └── game_aggregate.py
│   └── services/             # Domain policies and cross-aggregate rules
│       └── campaign_policies.py
├── adapters/                 # Infrastructure layer
│   ├── repositories/         # Data access abstraction
│   │   ├── user_repository.py
│   │   └── campaign_repository.py
│   ├── mappers/              # ORM ↔ Aggregate translation
│   │   ├── user_mapper.py
│   │   └── campaign_mapper.py
│   └── db/
│       └── session.py        # Database session management
├── dependencies/             # FastAPI dependency injection
│   ├── repositories.py      # Repository DI setup
│   └── auth.py              # Authentication DI
├── orm/                      # SQLAlchemy models (data layer only)
│   ├── user_model.py
│   └── campaign_model.py
└── legacy/                   # OLD - Being removed
    ├── services/             # OLD - These were actually repositories
    └── models/               # OLD - Moving to orm/
```

### **Key DDD Patterns**

#### **1. Aggregates Define Business Rules**
```python
# domain/aggregates/campaign_aggregate.py
class CampaignAggregate:
    def add_game(self, game_name: str):
        if len(self.games) >= self.max_games:
            raise DomainError("Campaign cannot exceed maximum games")
        # Business logic here
```

#### **2. Commands Orchestrate, Don't Execute Business Logic**
```python
# application/commands/campaign_commands.py
class CreateGame:
    def execute(self, campaign_id: UUID, game_name: str):
        campaign = self.campaign_repo.get_by_id(campaign_id)
        campaign.add_game(game_name)  # Aggregate handles rules
        self.campaign_repo.save(campaign)
```

#### **3. Repositories Abstract Data Access**
```python
# adapters/repositories/campaign_repository.py
class CampaignRepository:
    def get_by_id(self, id: UUID) -> CampaignAggregate:
        model = self.db.query(CampaignModel).filter_by(id=id).first()
        return to_domain(model)  # Mapper handles conversion
```

#### **4. Mappers Handle ORM ↔ Domain Translation**
```python
# adapters/mappers/campaign_mapper.py
def to_domain(model: CampaignModel) -> CampaignAggregate:
    return CampaignAggregate.from_persistence(
        id=model.id,
        name=model.name,
        # No ORM objects leak to domain
    )
```

### **FastAPI + Pydantic Integration**

#### **API Schemas for Type Safety**
```python
# api/schemas/campaign_schemas.py
class CampaignResponse(BaseModel):
    id: str
    name: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class CreateCampaignRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
```

#### **Dependency Injection Pattern**
```python
# api/campaigns.py
@router.post("/", response_model=CampaignResponse)
async def create_campaign(
    request: CreateCampaignRequest,
    user: AuthenticatedUser = Depends(verify_jwt_token),
    repo: CampaignRepository = Depends(get_campaign_repository)
):
    command = CreateCampaign(repo)
    campaign = command.execute(user.id, request.name)
    return CampaignResponse(
        id=str(campaign.id),
        name=campaign.name,
        created_at=campaign.created_at
    )
```

#### **Authentication at API Boundary Only**
```python
# dependencies/auth.py
@dataclass
class AuthenticatedUser:
    user_id: UUID
    email: str
    roles: List[str]

async def verify_jwt_token(token: str = Depends(security)) -> AuthenticatedUser:
    # JWT processing happens here, domain never sees JWT
```

### **Migration Strategy**
- **Phase 1**: Users (Complete DDD implementation)
- **Phase 2**: Campaigns/Games (You implement)
- **Phase 3**: Hot/Cold Migration (Event-driven with RabbitMQ)
- **Legacy**: Old `services/` directory being phased out

### **Rules for New Development**
1. **Always create aggregates first** - Define business rules before data access
2. **Commands orchestrate only** - No business logic in application layer
3. **Use mappers** - Never pass ORM objects to domain layer
4. **Pydantic for API boundaries** - Type-safe request/response models
5. **Reference by ID** - Aggregates never hold direct references to other aggregates

## Frontend Architecture - Functional Slice Pattern

### **Principle: Organize by Business Domain, Not Technical Layers**
Instead of traditional `components/`, `hooks/`, `utils/` directories, we organize by **business functionality**.

### **Directory Structure**
```
rollplay/                          # Next.js 13 App Router
├── app/
│   ├── page.js                   # Landing page (room creation/joining)
│   ├── dashboard/                # 🏠 Campaign Management Domain
│   │   ├── page.js              # Main dashboard interface
│   │   └── components/
│   │       ├── CampaignManager.js
│   │       ├── DashboardLayout.js
│   │       └── GameCard.js
│   ├── auth/                     # 🔐 Authentication Domain
│   │   ├── magic/
│   │   │   ├── page.js          # Magic link auth page
│   │   │   └── components/
│   │   │       └── OTPInput.js
│   │   └── verify/
│   │       └── page.js          # Token verification
│   ├── game/                     # 🎲 Active Game Session Domain
│   │   ├── page.js              # Main game interface
│   │   ├── components/          # Game-specific UI components
│   │   │   ├── PlayerCard.js    # Player status and info
│   │   │   ├── DMControlCenter.js  # DM tools and controls
│   │   │   ├── AdventureLog.js  # Chat and roll history
│   │   │   ├── DiceActionPanel.js  # Dice rolling interface
│   │   │   ├── InitiativeTracker.js
│   │   │   └── GameStatusBar.js
│   │   ├── hooks/               # Game-specific state management
│   │   │   ├── useWebSocket.js  # WebSocket connection for game
│   │   │   ├── webSocketEvent.js  # Game event handling
│   │   │   ├── useGameState.js  # Local game state management
│   │   │   └── useDiceRolling.js
│   │   └── types/               # Game-related TypeScript definitions
│   │       └── gameTypes.js
│   ├── audio_management/         # 🎵 Audio System Domain
│   │   ├── components/          # Audio-specific UI
│   │   │   ├── AudioMixerPanel.js
│   │   │   ├── AudioTrack.js
│   │   │   ├── VolumeSlider.js
│   │   │   └── AudioControls.js
│   │   ├── hooks/               # Audio state and functionality
│   │   │   ├── useUnifiedAudio.js
│   │   │   ├── useWebAudio.js
│   │   │   ├── webSocketAudioEvents.js
│   │   │   └── useAudioSync.js
│   │   ├── types/               # Audio type definitions
│   │   │   └── audioTypes.js
│   │   └── index.js             # Exports all audio functionality
│   ├── map_management/           # 🗺️ Map System Domain
│   │   ├── components/          # Map-specific UI
│   │   │   ├── MapManager.js
│   │   │   ├── MapEditor.js
│   │   │   ├── GridOverlay.js
│   │   │   ├── MapUploader.js
│   │   │   └── GridControls.js
│   │   ├── hooks/               # Map state and functionality
│   │   │   ├── useMapState.js
│   │   │   ├── useGridEditor.js
│   │   │   ├── webSocketMapEvents.js
│   │   │   └── useMapUpload.js
│   │   ├── types/               # Map type definitions
│   │   │   └── mapTypes.js
│   │   └── index.js             # Exports all map functionality
│   └── shared/                   # 🎨 Cross-Domain Resources
│       ├── components/          # Reusable UI components
│       │   ├── Button.js
│       │   ├── Modal.js
│       │   └── LoadingSpinner.js
│       ├── hooks/               # Cross-domain hooks
│       │   ├── useAuth.js
│       │   └── useApi.js
│       ├── styles/              # Shared styling
│       │   ├── constants.js     # UI styling constants
│       │   └── globals.css
│       └── utils/               # Cross-domain utilities
│           ├── seatColors.js
│           └── apiHelpers.js
```

### **Functional Slice Benefits**

#### **🎯 Domain-Focused Development**
- **Clear boundaries**: Each slice owns its complete functionality
- **Easy navigation**: Find all audio/map/game features in one place
- **Reduced coupling**: Changes to audio don't affect map functionality
- **Team scalability**: Different developers can own different slices

#### **🔄 Self-Contained Slices**
Each functional slice contains:
- **Components**: UI specific to that domain
- **Hooks**: State management and business logic for that domain  
- **Types**: TypeScript definitions for that domain
- **WebSocket events**: Real-time functionality specific to that domain
- **Index file**: Clean exports for other slices to import

#### **🎮 Game Session Example**
```javascript
// game/hooks/useWebSocket.js - Game-specific WebSocket handling
export const useGameWebSocket = (roomId) => {
  // Handles: dice_roll, seat_change, combat_state events
}

// game/components/DiceActionPanel.js - Game UI component
import { useGameWebSocket } from '../hooks/useWebSocket'
import { useDiceRolling } from '../hooks/useDiceRolling'
```

#### **🎵 Audio System Example**
```javascript
// audio_management/index.js - Clean domain exports
export { AudioMixerPanel } from './components/AudioMixerPanel'
export { useUnifiedAudio } from './hooks/useUnifiedAudio'
export { useAudioSync } from './hooks/useAudioSync'

// game/page.js - Importing audio functionality
import { AudioMixerPanel, useAudioSync } from '../audio_management'
```

### **Cross-Slice Communication**

#### **Event-Driven Integration**
```javascript
// Slices communicate through WebSocket events and shared state
// audio_management/hooks/webSocketAudioEvents.js
export const useAudioEvents = () => {
  // Listens for: remote_audio_play, remote_audio_batch
}

// game/hooks/webSocketEvent.js  
export const useGameEvents = () => {
  // Listens for: dice_roll, combat_state, seat_change
}
```

#### **Shared Resources**
- **Authentication**: `shared/hooks/useAuth.js` used across all slices
- **Styling**: `shared/styles/constants.js` for consistent UI
- **API helpers**: `shared/utils/apiHelpers.js` for HTTP requests

### **Functional Slice Rules**

#### **✅ Do:**
- **Group by business domain** (audio, maps, game sessions)
- **Keep slices self-contained** with their own components/hooks/types
- **Export cleanly** through index.js files
- **Share common utilities** through shared/ directory
- **Use WebSocket events** for cross-slice communication

#### **❌ Don't:**
- **Mix domains** - don't put map components in audio slice
- **Create circular dependencies** between slices
- **Bypass the slice boundary** - import directly from deep paths
- **Duplicate functionality** - use shared/ for common code
- **Tightly couple slices** - use events and shared state

This architecture makes the frontend highly maintainable and allows different team members to work on different functional areas without conflicts.

### Database Architecture

#### **PostgreSQL (Primary Storage)**
- **Location**: Primary database for aggregates
- **Tables**: Users, Campaigns, Games, etc.
- **Migrations**: Alembic-managed schema changes
- **Connection**: SQLAlchemy ORM models in `orm/` directory

#### **MongoDB (Hot Storage - Game Service Only)**
- **Purpose**: **Active game session state only** during live gameplay
- **Manages**: Real-time multiplayer game state with server-authoritative design
- **Collections**:
  - `active_sessions` - **Complete game state objects** (atomic updates only)
  - `adventure_logs` - Game events (chat, rolls, system messages)
- **State Management**: All game state changes go through HTTP API → MongoDB → WebSocket broadcast
- **Migration Pattern**: ETL from PostgreSQL → MongoDB (game start) → PostgreSQL (game end)

#### **Hot/Cold Storage Pattern**
- **Cold Storage (PostgreSQL)**: Persistent campaign/game metadata, users, configurations
- **Hot Storage (MongoDB)**: **Active game sessions only** with real-time multiplayer requirements
- **Server-Authoritative**: MongoDB maintains authoritative game state during sessions
- **Migration**: Event-driven ETL process (future: RabbitMQ-based) for session start/end

## Development Commands

### Local Development Setup
```bash
# Start development environment
docker-compose -f docker-compose.dev.yml build
docker-compose -f docker-compose.dev.yml up

# Individual service development
cd rollplay && npm run dev  # Frontend on port 3000
cd api && python app.py     # API on port 8081
```

### Frontend Commands
```bash
cd rollplay
npm install           # Install dependencies
npm run dev          # Development server
npm run build        # Production build
npm run start        # Start production build
```

### Backend Commands  
```bash
# API Site (Main DDD Application)
cd api-site
pip install -r requirements.txt  # Install dependencies
uvicorn app:app --reload         # Start FastAPI server on port 8082

# API Game (Legacy Game Service)  
cd api-game
python app.py                    # Start FastAPI server on port 8081

# API Auth (Authentication Service)
cd api-auth
uvicorn app:app --reload         # Start FastAPI server on port 8083
```

### Database Commands
```bash
# Alembic Migrations (PostgreSQL)
cd api-site
alembic upgrade head             # Apply all migrations
alembic revision --autogenerate -m "Description"  # Create new migration
alembic current                  # Check current migration

# Database Access
docker exec postgres-dev psql -U postgres -d rollplay
docker exec mongo-dev mongosh
```

### Production Deployment
```bash
docker-compose build            # Build all services
docker-compose up -d           # Deploy with SSL/Nginx
```

### Development Troubleshooting
```bash
# Verify environment variables
docker-compose config

# Container inspection
docker exec -it db-dev mongosh -u admin
docker logs api-dev

# Rebuild specific services
docker-compose -f docker-compose.dev.yml build api
```

## Environment Configuration

Required `.env` file in project root:
```env
# Environment Configuration
environment=<dev|prod>

# Frontend Configuration  
NEXT_PUBLIC_API_URL=<your-api-url>

# Database Configuration
MONGO_INITDB_ROOT_USERNAME=<mongodb-username>
MONGO_INITDB_ROOT_PASSWORD=<mongodb-password>
MONGO_INITDB_DATABASE=<database-name>

# PostgreSQL Configuration
POSTGRES_USER=<postgres-username>
POSTGRES_PASSWORD=<postgres-password>
POSTGRES_DB=<postgres-database>

# Authentication & Security
JWT_SECRET=<your-jwt-secret-key>
JWT_ALGORITHM=<algorithm-type>

# Email/SMTP Configuration
SMTP_HOST=<smtp-server-host>
SMTP_PORT=<smtp-port>
SMTP_USERNAME=<smtp-username>
SMTP_PASSWORD=<smtp-password>
SMTP_FROM_EMAIL=<sender-email-address>

# Redis Configuration
REDIS_URL=<redis-connection-url>

# API Keys & External Services
API_KEY_SECRET=<api-key-for-external-services>
```

**⚠️ Security**: Replace `<placeholder>` values with your actual configuration. Never commit secrets to version control.

### Environment Variable Validation
- Use `docker-compose config` to verify .env variable substitution
- Check that mongo-init templates use `${MONGO_INITDB_ROOT_USERNAME}` and `${MONGO_INITDB_ROOT_PASSWORD}`
- Ensure GameService reads from `os.environ` for database credentials

## WebSocket Architecture & Event System

### **Connection Management**
- **Backend**: Centralized ConnectionManager in `api/app.py`
- **Frontend**: `app/game/hooks/useWebSocket.js` manages connection lifecycle
- **URL Pattern**: `/ws/{room_id}?player_name={player_name}`

### **Atomic Event Publishing & Handling**
- **Event Structure**: `{event_type: string, data: object}`
- **Backend Validation**: All events validated before broadcasting in `websocket_events.py`
- **Frontend Routing**: Events routed to domain-specific handlers via event_type switch
- **Error Handling**: Malformed events logged and ignored, never crash the system

### **Event Types by Domain**
**Game Events**: `seat_change`, `dice_roll`, `combat_state`, `player_connection`, `system_message`, `role_change`
**Audio Events**: `remote_audio_play`, `remote_audio_resume`, `remote_audio_batch`

### **Audio Batch Processing System**
- **Atomic Operations**: Multiple track operations executed as single batch
- **Synchronized Playback**: Audio context timing ensures perfect sync across clients
- **Batch Structure**: 
  ```javascript
  {
    event_type: "remote_audio_batch",
    data: {
      operations: [
        {trackId: "audio_channel_A", operation: "play", filename: "boss.mp3", fade: true},
        {trackId: "audio_channel_B", operation: "stop", fade: true}
      ],
      fade_duration: 2000,
      triggered_by: "player_name"
    }
  }
  ```
- **Fade Transitions**: 60Hz requestAnimationFrame interpolation for smooth volume changes
- **Conflict Resolution**: New batch operations automatically cancel active fades
- **Validation**: Server validates all operations before broadcasting to prevent client desync

## Key Development Patterns

### UI Styling & Constants System
- **Always use tailwind css styles where possible**
- **CRITICAL**: Use `/rollplay/app/styles/constants.js` for all UI component styling
- **Single Source of Truth**: All colors, spacing, fonts controlled via constants.js

#### 4 Core Style Elements (MUST use these):
1. **PANEL_TITLE** / **DM_TITLE** / **MODERATOR_TITLE**
   - Main collapsible panel titles (e.g., "DM Command Center", "Moderator Controls")
   - Use: `className={DM_TITLE}` or `className={MODERATOR_TITLE}`

2. **PANEL_HEADER** / **DM_HEADER** / **MODERATOR_HEADER** 
   - Section headers within panels (e.g., "Map Controls", "Combat Management")
   - Use: `className={DM_HEADER}` or `className={MODERATOR_HEADER}`

3. **PANEL_SUB_HEADER** / **DM_SUB_HEADER** / **MODERATOR_SUB_HEADER**
   - Sub-section headers (e.g., "Attack Rolls", "Ability Checks")
   - Use: `className={DM_SUB_HEADER}` or `className={MODERATOR_SUB_HEADER}`

4. **PANEL_CHILD** / **DM_CHILD** / **MODERATOR_CHILD**
   - Interactive child elements (buttons, inputs, etc.)
   - Use: `className={DM_CHILD}` or `className={MODERATOR_CHILD}`
   - Variant: `PANEL_CHILD_LAST` for elements without bottom margin

#### When NOT to use core elements:
- Special UI elements with unique design purposes (e.g., combat toggles, dice modals)
- These can have hardcoded styles for their specific function
- But still prefer constants over inline hardcoded values when possible

#### Primary Color System:
- Theme controlled by `PRIMARY_COLOR` variable in constants.js
- Currently set to "sky" (blue theme)
- All core elements automatically inherit this color scheme
- Change `PRIMARY_COLOR` to instantly retheme entire application

#### Adding New Styles:
- Add new constants to constants.js rather than hardcoding in components
- Follow existing naming patterns (e.g., `MODAL_CONTAINER`, `COMBAT_TOGGLE_ACTIVE`)
- Import and use constants in components: `import { DM_TITLE } from '../styles/constants'`

### License Headers
- All new source files must include GPL-3.0 license headers
- JavaScript files: `/* Copyright (C) 2025 Matthew Davey */` and `/* SPDX-License-Identifier: GPL-3.0-or-later */`
- Python files: `# Copyright (C) 2025 Matthew Davey` and `# SPDX-License-Identifier: GPL-3.0-or-later`

## DDD Development Guidelines

### **Adding New Features (DDD Flow)**
1. **Start with Domain**: Create aggregate with business rules first
2. **Add Repository**: Implement data access with mapper
3. **Create Command**: Orchestrate the use case in application layer
4. **Build API**: Add FastAPI endpoint with Pydantic schemas
5. **Setup DI**: Configure dependency injection
6. **Test Flow**: Verify domain → repository → API integration

### **Aggregate Development Rules**
- **Business Logic First**: Define what the aggregate can do before how it's stored
- **Invariants Protection**: Aggregate methods should enforce business rules
- **No Infrastructure**: Domain layer imports no external dependencies
- **Small and Focused**: One aggregate per transaction boundary
- **Factory Methods**: Use `create()` and `from_persistence()` class methods

### **Repository Implementation**
- **Interface First**: Define what operations are needed
- **Use Mappers**: Never pass ORM objects to domain layer
- **Handle Not Found**: Return `None` or raise domain exceptions
- **Transaction Management**: Let SQLAlchemy handle database transactions
- **Query in Repository**: Don't expose ORM query details to commands

### **Command Design**
- **Single Responsibility**: One command per use case
- **No Business Logic**: Only orchestration and coordination
- **Error Handling**: Let domain exceptions bubble up to API layer
- **Dependency Injection**: Receive repositories as constructor parameters
- **Return Aggregates**: Commands return domain objects, not data structures

### **FastAPI + Pydantic Patterns**
- **Request/Response Models**: Always use Pydantic schemas for API boundaries
- **Type Safety**: Leverage FastAPI's automatic validation
- **Dependency Injection**: Use `Depends()` for repositories and auth
- **Error Handling**: Convert domain exceptions to HTTP status codes
- **Authentication**: Handle JWT at API boundary, pass clean DTOs to commands

### **Migration from Legacy Code**
- **Gradual Approach**: Implement new features with DDD, migrate existing gradually
- **Keep Both**: Legacy `services/` and new `adapters/repositories/` can coexist
- **Update Imports**: Change imports from old services to new repositories
- **Preserve Behavior**: Maintain exact same API responses during migration
- **Test Compatibility**: Ensure new implementation matches old behavior

## Infrastructure Architecture

### **NGINX Reverse Proxy - Service Discovery**

#### **🚨 CRITICAL: All API routes must be configured in NGINX**
NGINX acts as the service discovery layer, routing requests to appropriate backend services.

#### **Service Routing Pattern**
```
Client Request → NGINX → Backend Service
https://localhost/api/users → nginx → api-site:8082
https://localhost/game/123 → nginx → api-game:8081  
https://localhost/auth/login → nginx → api-auth:8083
```

#### **Backend Services Map**
- **api-site** (Port 8082): Main DDD application (users, campaigns, games metadata)
- **api-game** (Port 8081): Game sessions, WebSocket, hot storage (MongoDB)
- **api-auth** (Port 8083): Authentication, JWT, magic links

#### **NGINX Configuration Files**
```
docker/
├── dev/
│   └── nginx/
│       └── nginx.conf          # Development configuration
└── prod/
    └── nginx/
        └── nginx.conf          # Production configuration (with SSL)
```

#### **Adding New API Routes - Required Steps**

**1. Update Development Config**
```bash
# Edit docker/dev/nginx/nginx.conf
location /api/new-feature {
    proxy_pass http://api-site:8082/api/new-feature;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

**2. Update Production Config**
```bash
# Edit docker/prod/nginx/nginx.conf
# Same location block but with SSL certificates and security headers
```

**3. Restart NGINX Container**
```bash
# Development
docker-compose -f docker-compose.dev.yml restart nginx

# Production  
docker-compose restart nginx
```

#### **Current Route Mappings**

**Main Application Routes** (→ api-site:8082)
```nginx
location /api/users { proxy_pass http://api-site:8082; }
location /api/campaigns { proxy_pass http://api-site:8082; }
location /api/migration { proxy_pass http://api-site:8082; }
```

**Game Session Routes** (→ api-game:8081)
```nginx
location /game { proxy_pass http://api-game:8081; }
location /ws { proxy_pass http://api-game:8081; }  # WebSocket
```

**Authentication Routes** (→ api-auth:8083)
```nginx
location /auth/magic-link { proxy_pass http://api-auth:8083; }
location /auth/verify-otp { proxy_pass http://api-auth:8083; }
location /auth/login-request { proxy_pass http://api-auth:8083; }
```

#### **Route Priority Rules**
```nginx
# Most specific routes first
location /auth/magic-link { ... }
location /auth/verify-otp { ... }
location /auth { ... }               # Catch-all for auth

# Order matters - specific before general
location /api/campaigns { ... }
location /api/users { ... }
location /api { ... }                # Catch-all for api-site
```

#### **WebSocket Configuration**
```nginx
location /ws {
    proxy_pass http://api-game:8081;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

#### **Development vs Production Differences**

**Development (docker/dev/nginx/nginx.conf)**
- HTTP only (port 80)
- CORS headers for local development
- No SSL certificates
- Simpler security headers

**Production (docker/prod/nginx/nginx.conf)**  
- HTTPS with SSL certificates (port 443)
- Strict security headers
- Rate limiting
- Gzip compression
- Static file caching

#### **⚠️ NGINX Restart Required**
**Any route changes require NGINX container restart:**
```bash
# After updating nginx.conf files
docker-compose -f docker-compose.dev.yml restart nginx
```

#### **Troubleshooting Route Issues**
```bash
# Check NGINX logs
docker logs nginx-dev

# Test route mapping
curl -v https://localhost/api/users/me

# Verify container connectivity
docker exec nginx-dev ping api-site
docker exec nginx-dev ping api-auth
docker exec nginx-dev ping api-game
```

#### **Route Development Checklist**
- [ ] Add route to development nginx.conf
- [ ] Add route to production nginx.conf  
- [ ] Restart NGINX container
- [ ] Test route accessibility
- [ ] Verify correct backend service receives request
- [ ] Check NGINX logs for any errors

## Docker Services
- **rollplay**: Next.js frontend application
- **nginx**: Reverse proxy with service discovery and SSL termination
- **api-site**: Main DDD application (PostgreSQL-based)
- **api-game**: Game sessions with WebSocket support (MongoDB-based)
- **api-auth**: Authentication service (Redis + PostgreSQL)
- **postgres**: Primary database for business data
- **mongodb**: Hot storage for active game sessions  
- **redis**: Session storage and caching
- **certbot-renewer**: Automated SSL certificate renewal (production)

## Current Branch Context
- **Main branch**: `main` (use for PRs)
- **Feature branch**: `dice_rolls` (current active development)
- **Recent focus**: Dice rolling UI improvements and DM control center enhancements