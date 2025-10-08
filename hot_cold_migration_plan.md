# Hot/Cold Storage Migration Plan

## Overview

This document outlines the architecture and implementation plan for separating hot storage (MongoDB) for active game sessions from cold storage (PostgreSQL) for persistent campaign data. The goal is to achieve atomic state management during gameplay while maintaining data persistence and integrity.

## Problem Statement

### Current Issues
- **Dual Source of Truth**: Both PostgreSQL and MongoDB claim ownership of game state
- **Performance**: Constant dual-writes during gameplay create bottlenecks
- **Data Integrity**: Risk of desynchronization between databases
- **Atomic State**: No single source of truth for real-time game operations
- **Instant Game Access**: No clear separation between campaign configuration and active gameplay

### Solution Goals
- **Single Source of Truth**: MongoDB during gameplay, PostgreSQL during configuration
- **Atomic Operations**: All game state changes in hot storage without constant cold storage writes
- **Performance**: Optimized real-time operations with minimal database overhead
- **Data Integrity**: Graceful migration with validation and rollback capabilities
- **Natural Access Control**: Game access only possible when hot storage exists

## Architecture Overview

### Data Flow
```
Campaign Lifecycle:
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   CAMPAIGN      │    │   GAME INSTANCE  │    │   CAMPAIGN      │
│   (PostgreSQL)  │───▶│   (MongoDB)      │───▶│   (PostgreSQL)  │
│   Cold Storage  │    │   Hot Storage    │    │   Cold Storage  │
│   READ/WRITE    │    │   READ/WRITE     │    │   READ/WRITE    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
     Configure              Active Game           Save Changes
     Campaign               Session Only          Back to Campaign
```

### State Management
```
Game States:
INACTIVE → STARTING → ACTIVE → CLOSING → INACTIVE
           ↓         ↓        ↓
       (Migration)  (Hot)   (Migration)
```

**Campaign Configuration Rule**: A campaign can only be configured when ALL associated games have `status = 'inactive'`

## Data Models

### PostgreSQL (Cold Storage) - Pragmatic Design

```sql
-- Campaign data with atomic state configuration
campaign:
- id (UUID)
- name (String)
- description (String)
- dm_id (UUID)
- invited_players (JSON) -- List of invited user_ids with character assignments
- moderators (JSON) -- List of user_ids with moderator permissions
- maps (JSON) -- Aggregate: List of map_ids (serialized via repository layer)
- audio (JSON) -- Aggregate: Named audio configurations (serialized via repository layer)
- media (JSON) -- Aggregate: Static media for storytelling (serialized via repository layer)
- scenes (JSON) -- Aggregate: Preset collections of audio/media (serialized via repository layer)
- created_at (DateTime)
- updated_at (DateTime)
- is_deleted (Boolean)
- deleted_at (DateTime)

-- Game instance (one-to-one relationship with campaigns)
game:
- id (UUID)
- campaign_id (UUID) -- FK to campaigns (one-to-one)
- name (String) -- Game instance name
- dm_id (UUID) -- FK to users.id
- status (ENUM: 'inactive', 'starting', 'active', 'stopping')
- current_session_number (Integer, default 1)
- total_play_time (Integer, default 0) -- Total minutes played
- started_at (DateTime)
- ended_at (DateTime)
- last_activity_at (DateTime)
- location (String) -- Current in-game location
- party (JSON) -- List of user_ids who actually played in this game session
- max_players (Integer, default 8)
- adventure_logs (JSON) -- Chat messages, dice rolls, system events from this game session
- combat_active (Boolean, default false) -- Whether combat is currently active
- turn_order (JSON) -- Collection of party members - Initiative order for combat turns
```

### MongoDB (Hot Storage)
```javascript
// Active game session - mirrors PostgreSQL structure but optimized for real-time
active_sessions: {
  _id: "game_id", // Same as PostgreSQL games.id
  campaign_id: "uuid",
  name: "string", // Game instance name
  dm_id: "uuid", // DM is always the host
  location: "string", // Current in-game location
  
  // Real-time game state
  seats: [...], // Current seat assignments during gameplay
  party: [...], // Players who actually joined this game session
  seat_colors: {...},
  moderators: [...], // Additional moderators beyond DM
  
  // Game state
  current_turn: "player.id",
  combat_active: false,
  turn_order: [...], // Initiative order for combat turns
  
  // Session metadata
  created_at: ISODate,
  last_activity: ISODate,
  players_connected: [...], // Players currently connected to this game session
  
  // Map, audio, and media state
  active_map: {...},
  audio_state: {...},
  media_state: {...}
}
```

## Migration Process

### 1. Game Start Migration (Cold → Hot)

#### API Endpoint: `POST /api/campaigns/{campaign_id}/start-game`

```javascript
async function startGameSession(campaignId, sessionConfig) {
  // 1. Get the game for this campaign (one-to-one relationship)
  const game = await getGameByCampaignId(campaignId);
  if (!game) {
    throw new Error('No game found for campaign');
  }
  
  // 2. Validate game state
  if (game.status !== 'inactive') {
    throw new Error(`Game not in inactive state. Current status: ${game.status}`);
  }
  
  // 3. Set game to 'starting' state (locks campaign configuration)
  await updateGameStatus(game.id, 'starting');
  
  try {
    // 4. Get campaign data for migration
    const campaign = await getCampaign(campaignId);
    
    // 5. Migrate campaign data to MongoDB
    const hotStorageData = await migrateToHotStorage(campaign, game.id);
    
    // 6. Validate migration success
    await validateHotStorageMigration(game.id, hotStorageData);
    
    // 7. Set game to 'active' state
    await updateGameStatus(game.id, 'active');
    
    return { gameId: game.id, status: 'active' };
    
  } catch (error) {
    // Rollback on failure
    await updateGameStatus(game.id, 'inactive');
    throw error;
  }
}
```

#### Migration Data Structure:
```javascript
function migrateToHotStorage(campaign, gameId) {
  return {
    _id: gameId,
    campaign_id: campaign.id,
    session_name: campaign.configuration.session_name,
    dm_id: campaign.dm_id, // DM is always the host
    
    // Initialize real-time state
    seats: campaign.configuration.seats || [],
    party: campaign.configuration.party || [],
    seat_colors: campaign.configuration.seat_colors || {},
    moderators: campaign.configuration.moderators || [], // Additional moderators beyond DM
    
    // Default game state
    current_turn: null,
    combat_active: false,
    initiative_order: [],
    
    // Session metadata
    created_at: new Date(),
    last_activity: new Date(),
    players_online: [],
    
    // Map and audio state
    active_map: campaign.configuration.active_map || null,
    audio_state: campaign.configuration.audio_state || {}
  };
}
```

### 2. Game End Migration (Hot → Cold)

#### API Endpoint: `POST /api/games/{game_id}/end-game`

```javascript
async function endGameSession(gameId) {
  // 1. Validate game exists and is active
  const hotStorage = await getHotStorage(gameId);
  if (!hotStorage) {
    throw new Error('Game session not found in hot storage');
  }
  
  const game = await getGame(gameId);
  if (!game || game.status !== 'active') {
    throw new Error(`Game not in active state. Current status: ${game?.status || 'not found'}`);
  }
  
  // 2. Set game to 'closing' state (prevents new operations)
  await updateGameStatus(gameId, 'closing');
  
  try {
    // 3. Migrate hot storage changes back to PostgreSQL
    await migrateToColdStorage(hotStorage);
    
    // 4. Update game record as completed
    await updateGameRecord(gameId, {
      status: 'inactive',
      ended_at: new Date(),
      session_data: hotStorage
    });
    
    // 5. Validate cold storage migration
    await validateColdStorageMigration(hotStorage);
    
    // 6. Delete hot storage (creates natural 404)
    await deleteHotStorage(gameId);
    
    return { status: 'ended', campaign_id: hotStorage.campaign_id };
    
  } catch (error) {
    // Log error but don't rollback game state
    // Manual intervention may be required
    console.error('Game end migration failed:', error);
    throw error;
  }
}
```

#### Migration Back to Cold Storage:
```javascript
async function migrateToColdStorage(hotStorage) {
  const campaignUpdates = {
    configuration: {
      seats: hotStorage.seats,
      party: hotStorage.party,
      seat_colors: hotStorage.seat_colors,
      moderators: hotStorage.moderators, // DM is always host, so no need to store
      active_map: hotStorage.active_map,
      audio_state: hotStorage.audio_state,
      last_session_ended: new Date()
    },
    updated_at: new Date()
  };
  
  // Atomic update of campaign configuration
  await updateCampaign(hotStorage.campaign_id, campaignUpdates);
}
```

## Access Control

### Game Room Access
```javascript
// Modified game page access
async function validateGameAccess(gameId) {
  // Check if hot storage exists
  const hotStorage = await getHotStorage(gameId);
  if (!hotStorage) {
    return { valid: false, reason: 'game_not_active' };
  }
  
  // Validate user permissions
  const userPermissions = await checkUserPermissions(gameId);
  if (!userPermissions.canJoin) {
    return { valid: false, reason: 'insufficient_permissions' };
  }
  
  return { valid: true, gameData: hotStorage };
}
```

### Campaign Access
```javascript
// Campaign configuration access
async function validateCampaignAccess(campaignId) {
  const campaign = await getCampaign(campaignId);
  
  // Get the game for this campaign (one-to-one relationship)
  const game = await getGameByCampaignId(campaignId);
  if (!game) {
    return { valid: false, reason: 'no_game_found' };
  }
  
  // Block access if game is not inactive
  if (game.status !== 'inactive') {
    return { 
      valid: false, 
      reason: 'game_active',
      gameStatus: game.status 
    };
  }
  
  return { valid: true, campaign, game };
}
```

## Error Handling & Recovery

### Graceful Shutdown Process
```javascript
// Ensure all writes complete before shutdown
async function gracefulShutdown(gameId, timeoutMs = 30000) {
  const timeout = setTimeout(() => {
    throw new Error('Shutdown timeout exceeded');
  }, timeoutMs);
  
  try {
    // 1. Stop accepting new operations
    await setGameState(gameId, 'closing');
    
    // 2. Wait for pending operations to complete
    await waitForPendingOperations(gameId);
    
    // 3. Execute end game migration
    await endGameSession(gameId);
    
    clearTimeout(timeout);
    return { success: true };
    
  } catch (error) {
    clearTimeout(timeout);
    // Log for manual intervention
    await logShutdownFailure(gameId, error);
    throw error;
  }
}
```

### Failure Recovery Procedures

#### 1. Stuck in 'starting' State
```javascript
// Recovery job for games stuck in starting state
async function recoverStuckStarting() {
  const stuckGames = await findGamesByStatus('starting');
  
  for (const game of stuckGames) {
    const timeSinceStart = Date.now() - game.updated_at.getTime();
    
    if (timeSinceStart > 5 * 60 * 1000) { // 5 minutes
      console.log(`Recovering stuck game: ${game.id}`);
      
      // Check if hot storage was created
      const hotStorage = await getHotStorage(game.id);
      if (hotStorage) {
        // Migration completed, update status
        await updateGameStatus(game.id, 'active');
      } else {
        // Migration failed, rollback
        await updateGameStatus(game.id, 'inactive');
      }
    }
  }
}
```

#### 2. Stuck in 'closing' State
```javascript
// Recovery job for games stuck in closing state
async function recoverStuckClosing() {
  const stuckGames = await findGamesByStatus('closing');
  
  for (const game of stuckGames) {
    const timeSinceEnd = Date.now() - game.updated_at.getTime();
    
    if (timeSinceEnd > 10 * 60 * 1000) { // 10 minutes
      console.log(`Recovering stuck closing game: ${game.id}`);
      
      // Check if hot storage still exists
      const hotStorage = await getHotStorage(game.id);
      if (!hotStorage) {
        // Migration completed, update status
        await updateGameStatus(game.id, 'inactive');
      } else {
        // Retry migration
        try {
          await endGameSession(game.id);
        } catch (error) {
          console.error(`Failed to recover game ${game.id}:`, error);
          // Flag for manual intervention
          await flagForManualIntervention(game.id, error);
        }
      }
    }
  }
}
```

#### 3. Orphaned Sessions
```javascript
// Cleanup job for orphaned MongoDB sessions
async function cleanupOrphanedSessions() {
  const activeSessions = await getAllHotStorageSessions();
  
  for (const session of activeSessions) {
    const game = await getGame(session._id);
    
    if (!game || game.status !== 'active') {
      console.log(`Cleaning up orphaned session: ${session._id}`);
      
      // Save session data before cleanup
      await archiveOrphanedSession(session);
      
      // Delete orphaned session
      await deleteHotStorage(session._id);
    }
  }
}
```

## Implementation Phases

### Phase 1: Basic Migration (MVP)
- [ ] Implement campaign state management
- [ ] Create basic start/end game endpoints
- [ ] Implement simple hot/cold migration
- [ ] Add game access validation
- [ ] Update UI to show campaign vs game states
- [ ] **NOTE**: Character stats (current/max HP, etc.) will migrate naturally via the `game.party` collection during hot→cold migration. Character model design to be addressed in later phase to ensure seamless integration.

### Phase 2: Error Handling
- [ ] Add graceful shutdown procedures
- [ ] Implement timeout mechanisms
- [ ] Create recovery jobs for stuck states
- [ ] Add comprehensive logging

### Phase 3: Advanced Features
- [ ] Implement two-phase commit for critical operations
- [ ] Add real-time migration progress tracking
- [ ] Create admin tools for manual intervention
- [ ] Add performance monitoring and metrics

### Phase 4: Production Hardening
- [ ] Comprehensive failure testing
- [ ] Load testing with concurrent migrations
- [ ] Backup and restore procedures
- [ ] Documentation and runbooks

## API Endpoints

### Campaign Management
```
POST   /api/campaigns/{id}/start-game     # Start game session
POST   /api/games/{id}/end-game           # End game session
GET    /api/campaigns/{id}/status         # Check campaign status
POST   /api/campaigns/{id}/force-reset    # Admin: Reset stuck campaigns
```

### Game Session Access
```
GET    /api/games/{id}/access-check       # Validate game access
GET    /api/games/{id}/health             # Check hot storage health
```

### Admin/Recovery
```
POST   /api/admin/recovery/stuck-starting  # Recover stuck starting games
POST   /api/admin/recovery/stuck-closing   # Recover stuck closing games
POST   /api/admin/recovery/orphaned        # Clean orphaned sessions
GET    /api/admin/migration-status         # View migration system status
```

## Monitoring & Metrics

### Key Metrics to Track
- Migration success/failure rates
- Average migration time (cold→hot and hot→cold)
- Number of stuck campaigns by state
- Recovery job execution frequency
- Active session count vs campaign count

### Alerting
- Game stuck in starting/closing state > 5 minutes
- Migration failure rate > 5%
- Orphaned sessions detected
- Recovery job failures

## Security Considerations

### Access Control
- Validate user permissions before migration
- Ensure only DM can start/end games
- Rate limiting on migration endpoints
- Audit logging for all migration operations

### Data Protection
- Encrypt sensitive data in hot storage
- Secure backup procedures for migration failures
- Data retention policies for archived sessions

## Testing Strategy

### Unit Tests
- Migration logic validation
- Error handling scenarios
- State transition validation
- Data integrity checks

### Integration Tests
- End-to-end migration flows
- Concurrent migration scenarios
- Recovery procedure validation
- Performance under load

### Chaos Testing
- Network failures during migration
- Database failures during critical operations
- Server crashes during shutdown
- Timeout scenarios

## Conclusion

This hot/cold storage migration architecture provides a robust solution for atomic state management during gameplay while maintaining data persistence. The key benefits include:

1. **Performance**: Real-time operations optimized with hot storage
2. **Integrity**: Clear migration boundaries prevent data corruption
3. **Scalability**: Independent scaling of hot and cold storage systems
4. **Maintainability**: Clear separation of concerns and responsibilities

The implementation complexity is manageable with proper error handling, monitoring, and recovery procedures. The phased approach allows for gradual deployment and validation of each component.

## Schema Gap Analysis: Required PostgreSQL Models

### Critical Missing Models
Based on MongoDB hot storage analysis, the following PostgreSQL models must be created to support proper state persistence:

#### 1. GameLogs Model
```sql
-- Store adventure log entries (chat, dice rolls, system events)
game_logs:
- id (UUID, primary key)
- game_id (UUID, foreign key to games.id)
- log_type (ENUM: 'chat', 'dice_roll', 'system_event')
- player_id (UUID, foreign key to users.id, nullable)
- player_name (String) -- Display name at time of log
- message (Text) -- Chat message or system event description
- roll_data (JSON) -- Dice roll details (dice_type, result, modifier, etc.)
- timestamp (DateTime with timezone, UTC)
- created_at (DateTime with timezone, UTC)
```

#### 2. GameSessions Model
```sql
-- Store complete session state snapshots
game_sessions:
- id (UUID, primary key)
- game_id (UUID, foreign key to games.id)
- session_number (Integer) -- Incremental session counter
- seat_configuration (JSON) -- Final seat layout
- party_members (JSON) -- Final party composition
- combat_state (JSON) -- Initiative order, turn tracking
- map_state (JSON) -- Current map config, grid settings
- audio_state (JSON) -- Audio channel configurations
- session_started_at (DateTime with timezone, UTC)
- session_ended_at (DateTime with timezone, UTC)
- created_at (DateTime with timezone, UTC)
```

#### 3. ActiveMaps Model
```sql
-- Store current map state and configurations
active_maps:
- id (UUID, primary key)
- game_id (UUID, foreign key to games.id)
- campaign_map_id (UUID, foreign key to campaign_maps.id)
- grid_config (JSON) -- Grid size, offset, colors
- viewport_config (JSON) -- Zoom, position, bounds
- annotations (JSON) -- Markers, drawings, notes
- is_current (Boolean, default false) -- Only one current map per game
- created_at (DateTime with timezone, UTC)
- updated_at (DateTime with timezone, UTC)
```

#### 4. CombatStates Model
```sql
-- Store combat initiative and turn tracking
combat_states:
- id (UUID, primary key)
- game_id (UUID, foreign key to games.id)
- is_active (Boolean, default false)
- current_turn (String) -- Current player's turn
- initiative_order (JSON) -- Ordered list of participants
- turn_number (Integer, default 1)
- round_number (Integer, default 1)
- combat_started_at (DateTime with timezone, UTC)
- created_at (DateTime with timezone, UTC)
- updated_at (DateTime with timezone, UTC)
```

#### 5. AudioChannels Model
```sql
-- Store audio channel configurations
audio_channels:
- id (UUID, primary key)
- game_id (UUID, foreign key to games.id)
- channel_id (String) -- Channel identifier (e.g., 'ambient', 'music')
- track_filename (String) -- Audio file name
- volume (Float, default 1.0) -- Volume level (0.0 to 1.0)
- is_playing (Boolean, default false)
- is_looping (Boolean, default false)
- fade_duration (Integer, default 0) -- Fade time in milliseconds
- created_at (DateTime with timezone, UTC)
- updated_at (DateTime with timezone, UTC)
```

### Enhanced Existing Models

#### Game Model Updates
```sql
-- Add missing fields to existing games table
ALTER TABLE games ADD COLUMN:
- current_map_id (UUID, foreign key to active_maps.id, nullable)
- current_session_number (Integer, default 1)
- total_play_time (Integer, default 0) -- Total minutes played
- last_activity_at (DateTime with timezone, UTC)
- metadata (JSON) -- Additional game configuration
```

### Domain-Driven Architecture Implementation

#### Domain Models (api-site/domain/)
```python
# domain/game_domain.py
@dataclass
class Player:
    user_id: UUID
    character_id: Optional[UUID]
    character_name: Optional[str]
    joined_at: datetime
    character_stats: Dict[str, Any]
    
    def update_character_stats(self, stats: Dict[str, Any]) -> None
    def to_dict(self) -> Dict[str, Any]
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Player'

@dataclass
class Game:  # Aggregate Root
    id: UUID
    campaign_id: UUID
    name: str
    dm_id: UUID
    status: GameStatus
    location: Optional[str]
    party: List[Player]
    max_players: int
    adventure_logs: List[Dict[str, Any]]
    combat_active: bool
    turn_order: List[TurnEntry]
    
    def add_player(self, player: Player) -> None
    def remove_player(self, user_id: UUID) -> None
    def start_combat(self, initiative_order: List[TurnEntry]) -> None
    def end_combat(self) -> None
    def change_location(self, new_location: str) -> None
    def add_adventure_log(self, log_entry: Dict[str, Any]) -> None
    def transition_to(self, target_status: GameStatus) -> None
    def to_hot_storage(self) -> Dict[str, Any]
    @classmethod
    def from_hot_storage(cls, data: Dict[str, Any]) -> 'Game'

# domain/campaign_domain.py
@dataclass
class Campaign:  # Aggregate Root
    id: UUID
    name: str
    description: Optional[str]
    dm_id: UUID
    invited_players: List[InvitedPlayer]
    moderators: List[Moderator]
    maps: List[UUID]
    audio: Dict[str, Any]
    media: Dict[str, Any]
    scenes: Dict[str, Any]
    
    def invite_player(self, user_id: UUID, character_id: Optional[UUID]) -> None
    def add_moderator(self, user_id: UUID, granted_by: UUID) -> None
    def add_map(self, map_id: UUID) -> None
    def update_audio_config(self, audio_config: Dict[str, Any]) -> None
    def to_dict(self) -> Dict[str, Any]
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Campaign'
```

#### Repository Layer (api-site/repositories/)
```python
# repositories/campaign_repository.py
class CampaignRepository:
    def to_domain(self, model: CampaignModel) -> Campaign
    def from_domain(self, domain: Campaign) -> Dict[str, Any]
    async def get_by_id(self, campaign_id: UUID) -> Optional[Campaign]
    async def create(self, campaign: Campaign) -> Campaign
    async def update(self, campaign: Campaign) -> Campaign

# repositories/game_repository.py
class GameRepository:
    def to_domain(self, model: GameModel) -> Game
    def from_domain(self, domain: Game) -> Dict[str, Any]
    async def get_by_id(self, game_id: UUID) -> Optional[Game]
    async def create(self, game: Game) -> Game
    async def update(self, game: Game) -> Game
```

#### Command Layer (api-site/commands/)
```python
# commands/migration_commands.py
class MigrationCommands:
    async def migrate_to_hot_storage(self, campaign_id: UUID, game_id: UUID) -> Dict[str, Any]:
        # Get domain objects
        campaign = await self.campaign_repo.get_by_id(campaign_id)
        game = await self.game_repo.get_by_id(game_id)
        
        # Use business logic to transform
        game.transition_to(GameStatus.ACTIVE)
        
        # Serialize using domain method
        return game.to_hot_storage()
    
    async def migrate_to_cold_storage(self, game_id: UUID, hot_storage_data: Dict[str, Any]) -> Dict[str, Any]:
        # Deserialize using domain method
        game = Game.from_hot_storage(hot_storage_data)
        
        # Use business logic to finalize
        game.transition_to(GameStatus.INACTIVE)
        
        # Save using repository
        await self.game_repo.update(game)
```

#### Application Layer (api-site/services/)
```python
# services/hot_cold_migration_service.py
class HotColdMigrationService:
    async def start_game_session(self, campaign_id: UUID, session_config: Dict[str, Any]) -> Dict[str, Any]:
        # Returns success/failure - no complex state tracking
        # Uses domain objects and business logic
        
    async def end_game_session(self, game_id: UUID) -> Dict[str, Any]:
        # Returns success/failure - no complex state tracking
        # Uses domain objects and business logic
        
    async def validate_game_access(self, game_id: UUID) -> Dict[str, Any]:
        # Simple validation - hot storage exists = game active
```

#### Key Design Principles:
1. **Domain Objects**: Rich objects with business logic, not JSON blobs
2. **Repository Pattern**: `to_domain()` and `from_domain()` for serialization
3. **Aggregate Roots**: `Game` and `Campaign` as aggregate roots
4. **Type Safety**: Strong typing with enums and dataclasses
5. **Business Logic**: Domain objects contain business rules and validation
6. **No Over-Engineering**: Simple success/failure responses, no complex state tracking

### Alembic Migration Strategy

#### 1. Create Migration Files
```bash
# Generate migration for new models
alembic revision --autogenerate -m "add_hot_cold_storage_models"
```

#### 2. Migration Dependencies
```python
# In the generated migration file
depends_on = ['existing_game_model_revision']

def upgrade():
    # Create new tables in dependency order
    op.create_table('game_logs', ...)
    op.create_table('game_sessions', ...)
    op.create_table('active_maps', ...)
    op.create_table('combat_states', ...)
    op.create_table('audio_channels', ...)
    
    # Add new columns to existing tables
    op.add_column('games', sa.Column('current_map_id', UUID))
    op.add_column('games', sa.Column('current_session_number', Integer))
    op.add_column('games', sa.Column('total_play_time', Integer))
    op.add_column('games', sa.Column('last_activity_at', DateTime))
    op.add_column('games', sa.Column('metadata', JSON))
    
    # Create indexes for performance
    op.create_index('idx_game_logs_game_id', 'game_logs', ['game_id'])
    op.create_index('idx_game_logs_timestamp', 'game_logs', ['timestamp'])
    op.create_index('idx_active_maps_game_id', 'active_maps', ['game_id'])
    op.create_index('idx_combat_states_game_id', 'combat_states', ['game_id'])
    op.create_index('idx_audio_channels_game_id', 'audio_channels', ['game_id'])

def downgrade():
    # Reverse order for downgrade
    op.drop_table('audio_channels')
    op.drop_table('combat_states')
    op.drop_table('active_maps')
    op.drop_table('game_sessions')
    op.drop_table('game_logs')
    
    # Remove added columns
    op.drop_column('games', 'current_map_id')
    op.drop_column('games', 'current_session_number')
    op.drop_column('games', 'total_play_time')
    op.drop_column('games', 'last_activity_at')
    op.drop_column('games', 'metadata')
```

## Next Steps

1. **Create PostgreSQL Models**: Implement the 5 missing models using domain-driven architecture
2. **Generate Alembic Migration**: Create database migration with proper indexing
3. **Implement Repository Layer**: Create repositories for all new models
4. **Build Command Layer**: Implement migration and state management commands
5. **Create Application Services**: Build high-level orchestration services
6. **Review and approve this architecture plan**
7. **Set up development environment for testing**
8. **Begin implementation of basic migration functionality**
9. **Establish monitoring and alerting infrastructure**