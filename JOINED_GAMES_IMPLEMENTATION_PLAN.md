# Implementation Plan: Joined Games Section & Invite Acceptance Flow

## Overview
Add "Joined Games" section to dashboard and restructure the invite/join flow to properly distinguish between:
- **GAME** (cold storage config) - Campaign roster
- **ACTIVE_SESSION** (hot storage) - Live play session
- **USER** (human player) - Joins games
- **CHARACTER** (game entity) - Enters sessions

## Core Concepts

### The Sports Team Analogy
- **GAME** = The team/season (permanent roster)
- **joined_users** = Players on the roster
- **ACTIVE_SESSION** = A single match/game
- **active_players** = Players currently on the field

### Key Distinctions
1. **USER joins GAME** (accepts invite, joins roster)
2. **CHARACTER enters ACTIVE_SESSION** (plays in specific session)
3. Characters lock to GAME (not individual sessions)
4. Users can swap characters between sessions (if not currently in-session)

## User Flows

### Flow 1: Accept Invite & First Session
```
1. USER receives invite → Game in "Invited Games" section
2. USER clicks "Accept Invite" → Moves to "Joined Games" (no character needed)
3. DM starts ACTIVE_SESSION
4. USER clicks "Enter" button
5. System checks: game_joined_users.selected_character_id IS NULL?
6. IF NULL → Show modal: "Select character for this game"
7. USER selects character
8. Backend validates character not locked (active_in_game_id IS NULL)
9. Updates:
   - game_joined_users.selected_character_id = character_id
   - characters.active_in_game_id = game_id
10. Navigate to /game/{session_id}
11. api-game adds character to active_session.active_players
```

### Flow 2: Subsequent Sessions (Character Already Selected)
```
1. DM starts new ACTIVE_SESSION
2. USER clicks "Enter" button
3. System checks: game_joined_users.selected_character_id EXISTS
4. Navigate directly to /game/{session_id}
5. api-game adds character to active_session.active_players
```

### Flow 3: Change Character (Between Sessions)
```
1. USER in "Joined Games" section
2. USER clicks "Change Character" button
3. System validates: CHARACTER not currently in active_session
4. Show modal: "Select new character"
5. USER selects new character
6. Backend:
   - Old character: SET active_in_game_id = NULL (unlock)
   - New character: SET active_in_game_id = game_id (lock)
   - Update game_joined_users.selected_character_id = new_character_id
7. Success message
```

### Flow 4: Change Character (Mid-Session - User Must Leave First)
```
1. USER wants to change character while session is active
2. USER currently IN active_session with old character
3. USER clicks "Change Character" → Warning: "You must leave the active session first"
4. USER closes game window (disconnect)
5. api-game detects disconnect:
   a. Captures character state from MongoDB
   b. POST /api/games/{game_id}/disconnect {user_id, character_id, character_state}
   c. api-site performs partial ETL (CHARACTER only)
   d. api-site returns 200 OK
   e. api-game removes character from active_session.active_players
6. Now USER can click "Change Character" (Flow 3)
7. USER enters with new character
```

### Flow 5: Leave Session (Disconnect)
```
1. USER closes game window or clicks "Leave Session"
2. WebSocket disconnects
3. api-game detects disconnect:
   a. Identifies user_id + character_id from closed socket
   b. Snapshots character state from active_session.active_players
   c. POST /api/games/{game_id}/disconnect {user_id, character_id, character_state}
4. api-site performs partial ETL:
   a. Updates characters table (HP, XP, position, etc.)
   b. Returns 200 OK
5. api-game receives 200 OK:
   a. Removes character from active_session.active_players
   b. Updates game state (initiative, party composition, etc.)
6. USER remains in game_joined_users (can rejoin next session)
```

### Flow 6: Leave Game Permanently
```
1. USER in dashboard "Joined Games" section
2. USER clicks "Leave Game" button
3. System checks: Is character in active_session?
4. IF YES → Must trigger disconnect flow first (Flow 5)
5. IF NO → Proceed with leave:
   a. DELETE FROM game_joined_users WHERE game_id = ? AND user_id = ?
   b. UPDATE characters SET active_in_game_id = NULL WHERE id = selected_character_id
6. Game removed from "Joined Games" section
```

## Database Changes

### PostgreSQL Schema Updates

#### 1. New Table: `game_joined_users`
```sql
CREATE TABLE game_joined_users (
  game_id UUID NOT NULL,
  user_id UUID NOT NULL,
  joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
  selected_character_id UUID NULL,
  PRIMARY KEY (game_id, user_id),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (selected_character_id) REFERENCES characters(id) ON DELETE SET NULL
);

CREATE INDEX idx_game_joined_users_game_id ON game_joined_users(game_id);
CREATE INDEX idx_game_joined_users_user_id ON game_joined_users(user_id);
```

#### 2. Modify Table: `characters`
```sql
ALTER TABLE characters
ADD COLUMN active_in_game_id UUID NULL,
ADD COLUMN is_alive BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE characters
ADD CONSTRAINT fk_characters_active_game
FOREIGN KEY (active_in_game_id) REFERENCES games(id) ON DELETE SET NULL;

CREATE INDEX idx_characters_active_game ON characters(active_in_game_id);
```

#### 3. Remove Table: `game_characters` (if exists)
```sql
DROP TABLE IF EXISTS game_characters CASCADE;
```

### Count Calculations (Dynamic from Domain State)

**In api-site response schemas:**
```python
# GameResponse schema
pending_invites_count = len(game.invited_users)      # COUNT(game_invites)
player_count = len(game.joined_users)                # COUNT(game_joined_users)
# active_players_count tracked separately in MongoDB (only during session)
```

**When invite accepted:**
- User removed from `game_invites` → `pending_invites_count` decreases
- User added to `game_joined_users` → `player_count` increases
- No hardcoding - counts derived from table row counts

## Backend API Changes

### New/Modified Endpoints

#### 1. Accept Invite (No Character Required)
```
POST /api/games/{game_id}/invites/accept
Headers: {Authorization: Bearer token}
Body: {} (empty - no character_id needed)

Response: {
  "message": "Invite accepted",
  "game": GameResponse
}

Logic:
- Verify user in game.invited_users
- DELETE FROM game_invites WHERE game_id = ? AND user_id = ?
- INSERT INTO game_joined_users (game_id, user_id, joined_at) VALUES (?, ?, NOW())
- Return updated game
```

#### 2. Select Character for Game
```
POST /api/games/{game_id}/select-character
Headers: {Authorization: Bearer token}
Body: {
  "character_id": "uuid"
}

Response: {
  "message": "Character selected",
  "character": CharacterResponse
}

Logic:
- Verify user in game_joined_users
- Verify character.user_id = current_user.id (ownership)
- Verify character.active_in_game_id IS NULL (not locked)
- UPDATE characters SET active_in_game_id = game_id WHERE id = character_id
- UPDATE game_joined_users SET selected_character_id = character_id WHERE game_id = ? AND user_id = ?
- Return character
```

#### 3. Change Character
```
PUT /api/games/{game_id}/change-character
Headers: {Authorization: Bearer token}
Body: {
  "new_character_id": "uuid"
}

Response: {
  "message": "Character changed",
  "old_character": CharacterResponse,
  "new_character": CharacterResponse
}

Logic:
- Get current character from game_joined_users.selected_character_id
- Verify current character NOT in active_session (check MongoDB or session state)
- Verify new character ownership and not locked
- UPDATE characters SET active_in_game_id = NULL WHERE id = old_character_id (unlock)
- UPDATE characters SET active_in_game_id = game_id WHERE id = new_character_id (lock)
- UPDATE game_joined_users SET selected_character_id = new_character_id
- Return both characters
```

#### 4. Disconnect from Session (Partial ETL)
```
POST /api/games/{game_id}/disconnect
Headers: {Authorization: Bearer token, X-Session-ID: session_id}
Body: {
  "user_id": "uuid",
  "character_id": "uuid",
  "character_state": {
    "current_hp": 25,
    "current_position": {"x": 10, "y": 15},
    "status_effects": [...],
    ...
  }
}

Response: {
  "message": "Character state saved",
  "character": CharacterResponse
}

Logic (Partial ETL):
- Verify user in game and character in session
- UPDATE characters SET
    current_hp = character_state.current_hp,
    position = character_state.position,
    ... (other session-specific state)
  WHERE id = character_id
- Return 200 OK (signals api-game to remove from active_players)
```

#### 5. Leave Game Permanently
```
DELETE /api/games/{game_id}/leave
Headers: {Authorization: Bearer token}

Response: {
  "message": "Left game successfully"
}

Logic:
- Get user's character: SELECT selected_character_id FROM game_joined_users
- Verify character NOT in active_session (or trigger disconnect first)
- DELETE FROM game_joined_users WHERE game_id = ? AND user_id = ?
- UPDATE characters SET active_in_game_id = NULL WHERE id = selected_character_id
- Return success
```

#### 6. Get My Games (Fix to Include Joined Games)
```
GET /api/games/my-games
Headers: {Authorization: Bearer token}

Response: {
  "games": [GameResponse],
  "total": int
}

Logic (CRITICAL FIX):
- Query games where:
  a. user.id = game.host_id (DM)
  b. user.id IN game.invited_users (pending invite)
  c. user.id IN game.joined_users (accepted invite)
- Return all three categories
```

## Character Locking Rules

### Lock Behavior
```
Character locked when:
- selected_character_id set in game_joined_users
- active_in_game_id set in characters table

Character locked prevents:
- Selecting for another game
- Editing character stats (outside of session)
- Deleting character

Character lock does NOT prevent:
- Viewing character
- Using character in sessions of the SAME game
- Character death (is_alive flag independent)
```

### Unlock Scenarios
```
1. User changes character in game → Old character unlocked
2. User leaves game permanently → Character unlocked
3. DM removes user from game → Character unlocked
4. Game deleted → All characters unlocked (CASCADE)
```

## Character Death Handling

### Death Flow
```
1. Character HP reaches 0 in session
2. Character gets 3 death saving throws (D&D rules)
3. IF all 3 fail → DM marks character as dead
4. api-game updates: character.is_alive = false
5. Character state saved in next ETL (disconnect or session end)
6. Character remains locked to game (user can still view)
7. User must select new character before next session
```

## Migration Plan

### Phase 1: Database Schema (Alembic) ✅
1. Create migration `a69fcd0b2b6b_game_joined_users_and_character_locks`
2. Create `game_joined_users` table
3. Add `active_in_game_id` to `characters`
4. Add `is_alive` to `characters`
5. Drop `game_characters` table (if exists)

### Phase 2: Backend Domain & Repositories
1. Update `GameAggregate` (add `joined_users`, remove `player_characters`)
2. Update `CharacterAggregate` (add locking methods)
3. Update `GameRepository` to handle joined_users
4. Update `CharacterRepository` for locking

### Phase 3: Backend Commands & Queries
1. Update `AcceptGameInvite` command (remove character_id requirement)
2. Create `SelectCharacterForGame` command
3. Create `ChangeCharacterForGame` command
4. Create `DisconnectFromSession` command (partial ETL)
5. Update `GetUserGames` query to include joined games
6. Update `LeaveGame` command to handle unlocking

### Phase 4: Backend API Endpoints
1. Modify `POST /api/games/{game_id}/invites/accept`
2. Create `POST /api/games/{game_id}/select-character`
3. Create `PUT /api/games/{game_id}/change-character`
4. Create `POST /api/games/{game_id}/disconnect`
5. Update `DELETE /api/games/{game_id}/leave`
6. Update `GET /api/games/my-games`

### Phase 5: Frontend Components
1. Update `GamesManager.js`:
   - Add helper functions
   - Split games into three sections
   - Update button logic
2. Create `CharacterSelectionModal.js`
3. Update game card rendering
4. Add "Change Character" flow

### Phase 6: api-game WebSocket Integration
1. Update disconnect detection
2. Add partial ETL trigger on disconnect
3. Update active_players array management
4. Add broadcast for player disconnect events

### Phase 7: Testing & Validation
1. Test invite → accept → join flow
2. Test character selection modal
3. Test character locking (can't use in two games)
4. Test change character flow
5. Test disconnect → partial ETL
6. Test leave game → unlock character
7. Test character death handling

## Success Criteria

- [ ] User can accept invite without selecting character
- [ ] Accepted invites appear in "Joined Games" section
- [ ] First time entering session prompts character selection
- [ ] Character locks to game and can't be used elsewhere
- [ ] User can change character between sessions
- [ ] Disconnect triggers partial ETL (character only)
- [ ] Leave game unlocks character
- [ ] Dead characters marked with is_alive=false
- [ ] Counts update dynamically (no hardcoding)
- [ ] All ETL scenarios work correctly
