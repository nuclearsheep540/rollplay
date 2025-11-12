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

## Backend Architecture - Aggregate-Centric Modules

### 🚨 CRITICAL ARCHITECTURAL PRINCIPLES

#### **Aggregate-Centric Structure**
**Organize by domain/aggregate, not by technical layers**

**Pattern**: Each aggregate gets its own module with all layers contained within
**Benefit**: Vertical cohesion - everything related to User/Campaign lives together

#### **DDD Principles Within Each Aggregate**
- **API → Application → Domain → Adapters** (maintained within each module)
- **Repository Injection**: Inject repositories directly to endpoints
- **Clean Boundaries**: Domain layer pure, no infrastructure dependencies
- **Reference by ID**: Aggregates reference other aggregates by ID only

#### **Entity Relationships**
- **Root Aggregates**: User, Campaign (each gets own module)
- **Entities**: Game is an entity within Campaign aggregate
- **Structure**: Game lives under `/campaign/game/` since Campaign is root

#### **Naming Conventions**
- **Commands**: No "Command" suffix (e.g., `GetOrCreateUser`)
- **Aggregates**: Suffix with "Aggregate" (e.g., `UserAggregate`)
- **Repositories**: Suffix with "Repository" (e.g., `UserRepository`)
- **Modules**: Use aggregate name as directory (e.g., `user/`, `campaign/`)

#### **🚨 IMPLEMENTATION COMPLETE**
- **ARCHITECTURAL PATTERN**: Aggregate-Centric Modules (vertical slicing) - FULLY IMPLEMENTED
- **KEY PRINCIPLE**: Feature-focused cohesion over layer-focused separation
- **RULE**: All code related to an aggregate lives in its module
- **LESSON LEARNED**: Removed over-engineered patterns (adapters layer, mappers, routers.py) - simplicity won

### Backend Directory Structure (Aggregate-Centric) - CURRENT STATE
```
api-site/
├── main.py                        # FastAPI app setup, imports routers directly from modules
├── alembic/                       # Database migrations
│   ├── versions/                  # Migration files
│   └── env.py                     # Alembic environment configuration
├── modules/                       # All aggregates live under modules/ parent directory
│   ├── user/
│   │   ├── api/
│   │   │   └── endpoints.py       # FastAPI route handlers for user actions
│   │   ├── schemas/
│   │   │   └── user_schemas.py    # Pydantic models: UserRequest, UserResponse
│   │   ├── application/
│   │   │   ├── commands.py        # GetOrCreateUser, UpdateUserLogin
│   │   │   └── queries.py         # GetUserById, GetUserByEmail (CQRS pattern)
│   │   ├── domain/
│   │   │   └── user_aggregate.py  # UserAggregate with business rules
│   │   ├── repositories/
│   │   │   └── user_repository.py # UserRepository (handles ORM ↔ Domain directly)
│   │   ├── model/
│   │   │   └── user_model.py      # SQLAlchemy model for User
│   │   ├── dependencies/
│   │   │   └── repositories.py    # get_user_repository (module-specific DI)
│   │   └── tests/
│   │       └── test_user.py
│   ├── campaign/
│   │   ├── api/
│   │   │   └── endpoints.py       # Campaign & Game endpoints (CRUD + lifecycle)
│   │   ├── schemas/
│   │   │   ├── campaign_schemas.py # CampaignRequest, CampaignResponse
│   │   │   └── game_schemas.py     # GameRequest, GameResponse, GameStartRequest
│   │   ├── application/
│   │   │   ├── commands.py        # CreateCampaign, UpdateCampaign, DeleteCampaign
│   │   │   │                      # CreateGame, StartGame, EndGame, DeleteGame
│   │   │   │                      # AddPlayerToCampaign, RemovePlayerFromCampaign
│   │   │   └── queries.py         # GetUserCampaigns, GetCampaignById, GetGameById (CQRS)
│   │   ├── domain/
│   │   │   ├── campaign_aggregate.py # CampaignAggregate with Game entities
│   │   │   └── services.py           # Domain services (minimal, most logic in aggregate)
│   │   ├── game/                  # Game ENTITY within Campaign aggregate
│   │   │   ├── domain/
│   │   │   │   ├── entities.py    # GameEntity (not root), state transitions
│   │   │   │   └── game_status.py # GameStatus enum (INACTIVE, STARTING, ACTIVE, etc.)
│   │   │   ├── dependencies/
│   │   │   │   └── access.py      # Game participation checks
│   │   │   └── tests/
│   │   │       └── test_game_logic.py
│   │   ├── repositories/
│   │   │   └── campaign_repository.py # CampaignRepository (includes Game persistence)
│   │   ├── model/
│   │   │   ├── campaign_model.py  # Campaign SQLAlchemy model
│   │   │   └── game_model.py      # Game SQLAlchemy model
│   │   ├── dependencies/
│   │   │   ├── repositories.py    # campaign_repository DI
│   │   │   └── auth_checks.py     # Campaign access control
│   │   └── tests/
│   │       └── test_campaign_flow.py
│   └── characters/
│       ├── api/
│       │   └── endpoints.py       # Character CRUD endpoints
│       ├── schemas/
│       │   └── character_schemas.py
│       ├── application/
│       │   ├── commands.py        # CreateCharacter, UpdateCharacter, DeleteCharacter
│       │   └── queries.py         # GetCharacterById, GetUserCharacters (CQRS)
│       ├── domain/
│       │   └── character_aggregate.py
│       ├── repositories/
│       │   └── character_repository.py
│       ├── model/
│       │   └── character_model.py
│       ├── dependencies/
│       │   └── repositories.py
│       └── tests/
├── shared/
│   ├── config.py                  # Settings + LOGGING_CONFIG (dictConfig)
│   ├── jwt_helper.py              # JWT utilities (decode, verify, etc.)
│   └── dependencies/
│       ├── auth.py                # get_current_user_from_token (JWT → UserAggregate)
│       └── db.py                  # get_db(), engine setup, configure_mappers()
```

**KEY SIMPLIFICATIONS FROM ORIGINAL PLAN:**
- ❌ **Removed `adapters/` layer** - Repositories handle ORM translation directly
- ❌ **Removed `mappers.py` files** - Over-engineered for this scale
- ❌ **Removed `routers.py`** - Routers imported directly in main.py
- ❌ **No `legacy/` directory** - Migration complete, legacy code removed
- ✅ **Added CQRS pattern** - Separate commands.py and queries.py (not in original plan)
- ✅ **Added `/modules/` parent** - Better organization than aggregates at root
- ✅ **Renamed `orm/` → `model/`** - Simpler, clearer naming
```

## ✅ Refactor Complete - Current Implementation Patterns

### **Aggregate-Centric Pattern - IMPLEMENTED**

**All Three Aggregates Complete:**
- ✅ **User Module** - Full CRUD, authentication integration
- ✅ **Campaign Module** - Full CRUD + Game entity management + player management
- ✅ **Characters Module** - Basic CRUD (minimal implementation)

### **Cross-Aggregate Coordination Rules**

**✅ IMPLEMENTED Patterns:**
- **Application Layer Orchestration**: Commands inject multiple repositories when needed
- **Repository DI**: All repositories available via module dependencies
- **Reference by ID**: Aggregates reference other aggregates by ID only (no direct imports)
- **CQRS Separation**: Commands for writes, Queries for reads

**❌ FORBIDDEN Patterns:**
- Direct imports between aggregate modules
- Aggregate-to-aggregate direct calls
- Business logic in shared layer
- Repository logic in domain layer

### **Development Workflow - Adding New Features**

#### **1. Identify Aggregate Ownership**
Which module owns this feature? User, Campaign, or Characters?

#### **2. Domain First**
Add business rules to aggregate:
```python
# modules/campaign/domain/campaign_aggregate.py
class CampaignAggregate:
    def add_player(self, player_id: UUID):
        if player_id in self.player_ids:
            raise ValueError("Player already in campaign")
        self.player_ids.append(player_id)
        self.updated_at = datetime.utcnow()
```

#### **3. Create Command (Write) or Query (Read)**
```python
# modules/campaign/application/commands.py
class AddPlayerToCampaign:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, campaign_id: UUID, player_id: UUID, dm_id: UUID):
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign.is_owned_by(dm_id):
            raise ValueError("Only DM can add players")
        campaign.add_player(player_id)
        self.repository.save(campaign)
        return campaign
```

#### **4. Add API Endpoint**
```python
# modules/campaign/api/endpoints.py
@router.post("/{campaign_id}/players/{player_id}")
async def add_player_to_campaign(
    campaign_id: UUID,
    player_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo: CampaignRepository = Depends(campaign_repository)
):
    command = AddPlayerToCampaign(campaign_repo)
    campaign = command.execute(campaign_id, player_id, current_user.id)
    return _to_campaign_response(campaign)
```

### **Cross-Aggregate Features Pattern**

When a feature needs multiple aggregates:

```python
# Example: Dashboard needs User + Campaign data
# modules/user/application/queries.py
class GetUserDashboard:
    def __init__(self, user_repo: UserRepository, campaign_repo: CampaignRepository):
        self.user_repo = user_repo
        self.campaign_repo = campaign_repo

    def execute(self, user_id: UUID):
        user = self.user_repo.get_by_id(user_id)
        campaigns = self.campaign_repo.get_by_member_id(user_id)
        return {
            'user': user,
            'campaigns': campaigns,
            'total_campaigns': len(campaigns)
        }
```

### **Key DDD Patterns - ACTUAL IMPLEMENTATION**

#### **1. Aggregates Define Business Rules**
```python
# modules/campaign/domain/campaign_aggregate.py
class CampaignAggregate:
    def add_game(self, name: str, max_players: int = 6):
        # Business rule: Validate game can be added
        game = GameEntity.create(
            name=name,
            campaign_id=self.id,
            dm_id=self.dm_id,
            max_players=max_players
        )
        self.games.append(game)
        self.updated_at = datetime.utcnow()
        return game
```

#### **2. Commands Orchestrate, Don't Execute Business Logic**
```python
# modules/campaign/application/commands.py
class CreateGame:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, campaign_id: UUID, dm_id: UUID, name: str, max_players: int):
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign.is_owned_by(dm_id):
            raise ValueError("Only DM can create games")

        game = campaign.add_game(name, max_players)  # Aggregate handles rules
        self.repository.save(campaign)
        return game
```

#### **3. Repositories Abstract Data Access (No Separate Mappers)**
```python
# modules/campaign/repositories/campaign_repository.py
class CampaignRepository:
    def __init__(self, db_session: Session):
        self.db = db_session

    def get_by_id(self, id: UUID) -> Optional[CampaignAggregate]:
        model = self.db.query(CampaignModel).filter_by(id=id).first()
        if not model:
            return None

        # Repository handles ORM → Domain translation directly (no separate mapper)
        return CampaignAggregate.from_persistence(
            id=model.id,
            name=model.name,
            description=model.description,
            dm_id=model.dm_id,
            games=[self._game_to_entity(g) for g in model.games],
            # ... other fields
        )
```

#### **4. CQRS Pattern - Commands vs Queries**
```python
# modules/campaign/application/commands.py - WRITES
class CreateCampaign:
    def execute(self, dm_id: UUID, name: str) -> CampaignAggregate:
        campaign = CampaignAggregate.create(name=name, dm_id=dm_id)
        self.repository.save(campaign)
        return campaign

# modules/campaign/application/queries.py - READS
class GetUserCampaigns:
    def execute(self, user_id: UUID) -> List[CampaignAggregate]:
        return self.repository.get_by_member_id(user_id)
```

### **FastAPI + Pydantic Integration**

#### **API Schemas for Type Safety**
```python
# modules/campaign/schemas/campaign_schemas.py
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
# modules/campaign/api/endpoints.py
@router.post("/", response_model=CampaignResponse)
async def create_campaign(
    request: CreateCampaignRequest,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo: CampaignRepository = Depends(campaign_repository)
):
    command = CreateCampaign(campaign_repo)
    campaign = command.execute(current_user.id, request.name)
    return _to_campaign_response(campaign)
```

#### **Authentication at API Boundary Only**
```python
# shared/dependencies/auth.py
async def get_current_user_from_token(
    request: Request,
    user_repo: UserRepository = Depends(get_user_repository)
) -> UserAggregate:
    token = jwt_helper.get_token_from_cookie(request)
    if not token:
        raise HTTPException(status_code=401, detail="No auth token")

    email = jwt_helper.verify_auth_token(token)
    user = user_repo.get_by_email(email)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user  # Returns domain aggregate, not JWT payload
```

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
- **Cold Storage (PostgreSQL via api-site)**:
  - Persistent campaign/game metadata, users, configurations
  - Game lifecycle states (INACTIVE, STARTING, ACTIVE, STOPPING)
  - All prerequisites for game (maps, music, sound effects, campaign data)
- **Hot Storage (MongoDB via api-game)**:
  - **Active game sessions only** - ephemeral real-time state
  - Atomic game state + atomic player states
  - WebSocket-broadcasted state updates
  - Deleted when session ends and ETL completes
- **The Gap (Not Yet Implemented)**:
  - No ETL pipeline between cold ↔ hot storage
  - Event-driven service/middleware planned (possibly RabbitMQ)
  - Game creation partially broken due to incomplete lifecycle
- **Critical Rule**: api-game and api-site are completely isolated - no direct communication

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
uvicorn main:app --reload        # Start FastAPI server on port 8082

# API Game (Game Service)
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

## Service Boundaries & Responsibilities

### **Three Independent Services**

#### **api-auth (Authentication Service)**
**Responsibility**: Magic link generation, OTP creation, JWT token generation
- **Does**: Creates JWT tokens, sends magic link emails, manages OTP verification
- **Does NOT**: Create/update users, know about campaigns/games
- **Technology**: Redis (OTP storage), minimal PostgreSQL if needed
- **Pattern**: "Dumb" auth service - only knows about tokens, not user domain logic

#### **api-site (Main DDD Application)**
**Responsibility**: All business domain logic, cold storage, user/campaign/game metadata
- **Does**:
  - User aggregate management (create, update, persist users)
  - Campaign aggregate management (CRUD campaigns)
  - Game entity management (create game metadata, track game lifecycle state)
  - JWT validation (verifies tokens WITHOUT calling api-auth - shared secret pattern)
  - Prepares ALL prerequisites for game to exist (maps, music, sound effects, campaign data)
  - Cold storage management (PostgreSQL)
- **Does NOT**:
  - Handle active game sessions
  - Manage WebSocket connections
  - Store real-time game state
- **Technology**: PostgreSQL (cold storage), SQLAlchemy ORM, DDD aggregates
- **Pattern**: Domain-driven design with aggregate-centric modules

#### **api-game (Game Session Service)**
**Responsibility**: ONLY active game sessions - real-time multiplayer state
- **Does**:
  - Manage atomic game state in MongoDB during active sessions
  - Handle WebSocket connections for all players
  - Broadcast state changes to connected clients
  - Maintain atomic player state per session
  - Server-authoritative state updates (HTTP → MongoDB → WebSocket broadcast)
- **Does NOT**:
  - Know about campaigns, users, or site concepts
  - Read from PostgreSQL
  - Persist to cold storage
  - Handle game lifecycle (INACTIVE/STARTING/STOPPING states are api-site's concern)
- **Technology**: MongoDB (hot storage), WebSocket, atomic state objects
- **Pattern**: Stateful service managing ephemeral session data

### **Service Integration - Current State**

#### **✅ What Works Today:**
1. **Authentication Flow**: Frontend → api-auth (JWT/OTP) → api-site validates JWT (shared secret)
2. **Campaign/Game Metadata**: Frontend → api-site (CRUD via DDD aggregates) → PostgreSQL
3. **Active Game Sessions**: Frontend → api-game (WebSocket + MongoDB `active_sessions`)
4. **Game Lifecycle**: Full game start/end flow with HTTP-based ETL (Cold ↔ Hot migration)
5. **Game Entity**: Fully integrated into Campaign aggregate with working commands

#### **✅ HTTP-Based ETL Solution (Short-Term Implementation)**

**Pattern**: Direct HTTP communication between api-site and api-game for state migration

**Game Start Flow (Cold → Hot)**:
1. DM clicks "Start Game" in frontend
2. Frontend → api-site: `POST /api/campaigns/games/{game_id}/start`
3. api-site: Updates game status to STARTING
4. api-site: Gathers all game state from PostgreSQL (campaign data, maps, music, etc.)
5. **api-site → api-game HTTP**: Sends complete state payload via HTTP request
6. api-game: Creates MongoDB `active_sessions` document with complete game state
7. api-game: Responds with success confirmation
8. api-site: Updates game status to ACTIVE
9. Frontend can now connect WebSocket to active game session

**Game End Flow (Hot → Cold)**:
1. DM clicks "End Game" in frontend
2. Frontend → api-site: `POST /api/campaigns/games/{game_id}/end`
3. api-site: Updates game status to STOPPING
4. **api-site → api-game HTTP**: Requests final game state via HTTP
5. api-game: Sends complete atomic state as HTTP response
6. api-site: Updates PostgreSQL with final state (players, game data, adventure log)
7. api-site: Confirms persistence complete
8. **api-site → api-game HTTP**: Sends delete confirmation via HTTP
9. api-game: Deletes MongoDB `active_sessions` document
10. api-site: Updates game status to INACTIVE

**Why HTTP Instead of Event-Driven?**:
- **Simpler**: No message broker (RabbitMQ/Kafka) required
- **Synchronous**: Easier error handling and debugging
- **Good Enough**: Works well for current scale
- **Future Path**: Can migrate to event-driven architecture when scaling requires it

**Trade-offs Accepted**:
- Tight coupling between api-site and api-game (acceptable for monolith-like deployment)
- Synchronous blocking calls (acceptable given current traffic patterns)
- No retry/queue mechanism (handle failures with try-catch and rollback)

### **Key Design Decisions**

#### **JWT Validation Pattern**
**Current**: api-site validates JWT using shared secret (NO call to api-auth)
- **Pros**: Fast, no network call, stateless
- **Cons**: If api-auth revokes token, api-site doesn't know immediately
- **Trade-off**: Accepted for performance, rely on JWT expiration

#### **Service Isolation**
**Current**: api-game and api-site communicate via HTTP for ETL only
- api-game has NO knowledge of campaigns, users, site concepts
- api-game ONLY receives/returns state payloads via HTTP requests
- Clean separation maintained despite HTTP coupling
- HTTP endpoints on api-game are ETL-specific (not exposed to frontend)

#### **Game Entity Relationship**
**Rule**: You cannot have a Game without a Campaign
- Game is entity within Campaign aggregate (not root)
- Game entity lives under `/modules/campaign/game/` as part of Campaign aggregate
- Game entity fully integrated with working lifecycle commands
- Game lifecycle tied to Campaign existence
- Game metadata (INACTIVE/ACTIVE status) lives in api-site PostgreSQL
- Active game sessions live in api-game MongoDB

## Docker Services
- **rollplay**: Next.js frontend application (single SPA, NOT split)
- **nginx**: Reverse proxy with service discovery and SSL termination
- **api-site**: Main DDD application (PostgreSQL-based, all business logic)
- **api-game**: Game session service (MongoDB-based, WebSocket, stateful)
- **api-auth**: Authentication service (JWT/magic links only, "dumb" auth)
- **postgres**: Primary database for cold storage (business data)
- **mongodb**: Hot storage for active game sessions (ephemeral state)
- **redis**: Session storage and caching (OTP for magic links)
- **certbot-renewer**: Automated SSL certificate renewal (production)

## Current Branch Context
- **Main branch**: `main` (use for PRs)
- **Current branch**: `auth-to-game`
- **Recent work**: Completed DDD refactor (User, Campaign, Characters aggregates), CQRS implementation, removed over-engineered patterns
- **Status**: Refactor complete, ready for feature development

---

## ✅ Current Implementation Status - CRITICAL REFERENCE

### **✅ Fully Working Features**
- **User Authentication**: Magic link, OTP, JWT (full flow works)
- **User Aggregate**: Complete CRUD operations
- **Campaign Aggregate**: Full CRUD + player management + Game entity management
- **Game Entity**: Fully integrated into Campaign aggregate with working lifecycle
- **Game Lifecycle**: Complete start/end flow with HTTP-based ETL (Cold ↔ Hot migration)
- **Active Game Sessions**: WebSocket connections, MongoDB state management, real-time gameplay
- **Infrastructure**: NGINX, PostgreSQL, MongoDB, Redis, Docker

### **⚠️ Minimal Implementation - Works But Basic**
- **Characters Aggregate**: Basic CRUD exists but minimally tested

### **🔧 Local Development Expectations**

**Works**: ✅ Auth, User dashboard, Campaign CRUD, Game creation/start/end, Active game sessions
**Minimal**: ⚠️ Characters (basic CRUD only)

**Safe to work on**: All features - User/Campaign/Game features, Auth improvements, Frontend UI, Active game sessions

---

## 📚 Lessons Learned - Over-Engineering Removed

### **What We Removed and Why**

During the 3-month refactor (human time), we learned valuable lessons about over-engineering. Here's what we removed:

#### **1. Adapters Layer - REMOVED**
- **Planned**: Separate `/adapters/` directory with `repositories.py` and `mappers.py`
- **Reality**: Unnecessary abstraction layer for this scale
- **Solution**: Repositories handle ORM translation directly
- **Lesson**: Don't add layers "because DDD says so" - add them when needed

#### **2. Mapper Pattern - REMOVED**
- **Planned**: Separate `mappers.py` files with `to_domain()` / `from_domain()` functions
- **Reality**: Extra boilerplate with no benefit
- **Solution**: Repositories call `Aggregate.from_persistence()` directly
- **Lesson**: If a pattern adds code without adding value, remove it

#### **3. Centralized routers.py - REMOVED**
- **Planned**: Single `routers.py` file mapping all aggregate routers
- **Reality**: Unnecessary indirection for 3 aggregates
- **Solution**: Import routers directly in `main.py`
- **Lesson**: Premature abstraction is worse than duplication

#### **4. Frontend Split - NOT IMPLEMENTED**
- **Planned**: Separate `app-site` and `app-game` Next.js applications
- **Reality**: Premature optimization, adds deployment complexity
- **Solution**: Single Next.js app serves all functionality
- **Lesson**: Split when you have real scaling problems, not hypothetical ones

#### **5. Domain Services - MINIMAL USE**
- **Planned**: Separate `services.py` files for domain logic
- **Reality**: Most logic belongs directly in aggregates
- **Solution**: Keep services.py files but use sparingly
- **Lesson**: Aggregates ARE the domain services in most cases

### **What We Added (Not in Original Plan)**

#### **1. CQRS Pattern - ADDED**
- Separate `commands.py` (writes) and `queries.py` (reads)
- Clear separation of concerns
- **Why**: Improves code organization and intent clarity

#### **2. /modules/ Parent Directory - ADDED**
- All aggregates under `/modules/` instead of at root
- **Why**: Better organization, clearer separation from infrastructure

#### **3. Game Status Enum - ADDED**
- Explicit `GameStatus` enum (INACTIVE, STARTING, ACTIVE, STOPPING, etc.)
- **Why**: Type safety and clear state machine logic

### **Key Takeaways**

✅ **Do**:
- Start simple, add complexity when needed
- Question every layer: "What value does this add?"
- Remove patterns that add boilerplate without benefit
- Trust your repository to handle ORM translation

❌ **Don't**:
- Add layers because "the pattern says to"
- Split services/frontends before you have scaling problems
- Create separate mappers when repositories can do it
- Over-abstract for hypothetical future requirements

**Remember**: The goal is maintainable, understandable code - not perfect adherence to patterns.