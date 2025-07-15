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
campaigns:
- id (UUID)
- name (String)
- description (String)
- dm_id (UUID)
- party_members (JSON) -- List of invited user_ids with character assignments
- moderators (JSON) -- List of user_ids with moderator permissions
- available_maps (JSON) -- List of map_ids available for this campaign
- audio_presets (JSON) -- Named audio configurations
- created_at (DateTime)
- updated_at (DateTime)
- is_deleted (Boolean)
- deleted_at (DateTime)

-- Game instance (one-to-one relationship with campaigns)
games:
- id (UUID)
- campaign_id (UUID) -- FK to campaigns (one-to-one)
- name (String) -- Game instance name
- dm_id (UUID) -- FK to users.id
- status (ENUM: 'inactive', 'starting', 'active', 'closing')
- max_players (Integer, default 8)
- current_session_number (Integer, default 1)
- total_play_time (Integer, default 0) -- Total minutes played
- started_at (DateTime)
- ended_at (DateTime)
- last_activity_at (DateTime)
```

### MongoDB (Hot Storage)
```javascript
// Active game session - mirrors PostgreSQL structure but optimized for real-time
active_sessions: {
  _id: "game_id", // Same as PostgreSQL games.id
  campaign_id: "uuid",
  session_name: "string",
  dm_id: "uuid", // DM is always the host
  
  // Real-time game state
  seats: [...],
  party: [...],
  seat_colors: {...},
  moderators: [...], // Additional moderators beyond DM
  
  // Game state
  current_turn: "player_name",
  combat_active: false,
  initiative_order: [...],
  
  // Session metadata
  created_at: ISODate,
  last_activity: ISODate,
  players_online: [...],
  
  // Map and audio state
  active_map: {...},
  audio_state: {...}
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

#### Repository Layer (api-site/repositories/)
```python
# repositories/game_log_repository.py
class GameLogRepository:
    async def create_log_entry(self, game_id: UUID, log_data: dict) -> GameLog
    async def get_logs_by_game(self, game_id: UUID, limit: int = 100) -> List[GameLog]
    async def get_logs_by_type(self, game_id: UUID, log_type: str) -> List[GameLog]
    async def archive_old_logs(self, game_id: UUID, before_date: datetime) -> int

# repositories/game_session_repository.py
class GameSessionRepository:
    async def create_session_snapshot(self, game_id: UUID, session_data: dict) -> GameSession
    async def get_latest_session(self, game_id: UUID) -> GameSession
    async def get_session_history(self, game_id: UUID) -> List[GameSession]
    async def update_session_end_time(self, session_id: UUID, end_time: datetime) -> GameSession

# repositories/active_map_repository.py
class ActiveMapRepository:
    async def create_active_map(self, game_id: UUID, map_data: dict) -> ActiveMap
    async def get_current_map(self, game_id: UUID) -> ActiveMap
    async def update_map_config(self, map_id: UUID, config: dict) -> ActiveMap
    async def set_current_map(self, game_id: UUID, map_id: UUID) -> ActiveMap

# repositories/combat_state_repository.py
class CombatStateRepository:
    async def create_combat_state(self, game_id: UUID, combat_data: dict) -> CombatState
    async def get_active_combat(self, game_id: UUID) -> CombatState
    async def update_turn_order(self, combat_id: UUID, initiative: dict) -> CombatState
    async def end_combat(self, combat_id: UUID) -> CombatState

# repositories/audio_channel_repository.py
class AudioChannelRepository:
    async def create_audio_channel(self, game_id: UUID, channel_data: dict) -> AudioChannel
    async def get_game_channels(self, game_id: UUID) -> List[AudioChannel]
    async def update_channel_state(self, channel_id: UUID, state: dict) -> AudioChannel
    async def delete_channel(self, channel_id: UUID) -> bool
```

#### Command Layer (api-site/commands/)
```python
# commands/migration_commands.py
class MigrationCommands:
    async def migrate_to_hot_storage(self, game_id: UUID) -> dict
    async def migrate_to_cold_storage(self, game_id: UUID) -> dict
    async def validate_migration_integrity(self, game_id: UUID) -> bool
    async def rollback_failed_migration(self, game_id: UUID) -> bool

# commands/game_state_commands.py
class GameStateCommands:
    async def start_game_session(self, game_id: UUID, session_config: dict) -> dict
    async def end_game_session(self, game_id: UUID) -> dict
    async def create_session_snapshot(self, game_id: UUID) -> dict
    async def restore_from_snapshot(self, game_id: UUID, snapshot_id: UUID) -> dict

# commands/combat_commands.py
class CombatCommands:
    async def start_combat(self, game_id: UUID, participants: list) -> dict
    async def update_initiative(self, game_id: UUID, initiative_order: list) -> dict
    async def advance_turn(self, game_id: UUID) -> dict
    async def end_combat(self, game_id: UUID) -> dict
```

#### Application Layer (api-site/services/)
```python
# services/hot_cold_migration_service.py
class HotColdMigrationService:
    def __init__(self, game_repo, session_repo, log_repo, map_repo, combat_repo, audio_repo):
        self.game_repo = game_repo
        self.session_repo = session_repo
        self.log_repo = log_repo
        self.map_repo = map_repo
        self.combat_repo = combat_repo
        self.audio_repo = audio_repo
    
    async def execute_cold_to_hot_migration(self, game_id: UUID) -> dict
    async def execute_hot_to_cold_migration(self, game_id: UUID) -> dict
    async def validate_migration_success(self, game_id: UUID) -> bool
    async def handle_migration_failure(self, game_id: UUID, error: Exception) -> dict

# services/game_state_service.py
class GameStateService:
    async def initialize_game_session(self, campaign_id: UUID) -> dict
    async def finalize_game_session(self, game_id: UUID) -> dict
    async def create_periodic_snapshot(self, game_id: UUID) -> dict
    async def recover_from_failure(self, game_id: UUID) -> dict
```

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