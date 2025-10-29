# Game Lifecycle Testing Plan

## Overview
This document outlines comprehensive testing for the game state migration between PostgreSQL (api-site) and MongoDB (api-game).

## Prerequisites
- All services running (api-site, api-game, postgres, mongodb, nginx)
- User authenticated with valid JWT
- At least one campaign created

## Phase 1: Happy Path Testing

### Test 1.1: Create Game
**Steps:**
1. Navigate to dashboard
2. Click "Create Game" on a campaign
3. Enter game name
4. Submit

**Expected Results:**
- ✅ Game created in PostgreSQL with status='inactive'
- ✅ Game appears in campaign's game list
- ✅ "Start Game" button visible
- ✅ No MongoDB session created yet

**Verification:**
```sql
SELECT id, name, status, session_id FROM games WHERE campaign_id = '<campaign_id>';
-- Should show: status='inactive', session_id=NULL
```

### Test 1.2: Start Game Session
**Steps:**
1. Click "Start Game" on an inactive game
2. Wait for button state change

**Expected Results:**
- ✅ Button shows "Session Loading..." while processing
- ✅ Game status changes to 'active' in PostgreSQL
- ✅ MongoDB active_session created with correct game_id
- ✅ session_id stored in PostgreSQL game record
- ✅ Button changes to "Join Game"
- ✅ "End Game" button appears

**Verification:**
```sql
SELECT id, name, status, session_id, started_at FROM games WHERE id = '<game_id>';
-- Should show: status='active', session_id='<mongodb_session_id>', started_at=<timestamp>
```

```javascript
// In MongoDB
db.active_sessions.find({game_id: "<game_id>"})
// Should return one document with players array, dm_username, etc.
```

**API Logs to Check:**
- api-site: "Game {game_id} status set to STARTING"
- api-site: "Game {game_id} ACTIVE with session {session_id}"
- api-game: "Session created for game {game_id}"

### Test 1.3: Join Active Game
**Steps:**
1. Click "Join Game" button
2. Verify redirect to /game?room_id={session_id}

**Expected Results:**
- ✅ Redirects to game page with correct session_id
- ✅ WebSocket connects successfully
- ✅ Game UI loads with player list, dice panel, etc.

### Test 1.4: End Game Session
**Steps:**
1. From dashboard, click "End Game" on active game
2. Wait for confirmation

**Expected Results:**
- ✅ Game status changes to 'inactive' in PostgreSQL
- ✅ MongoDB active_session deleted (background cleanup)
- ✅ session_id cleared from PostgreSQL (set to NULL)
- ✅ stopped_at timestamp recorded
- ✅ "Start Game" button appears again

**Verification:**
```sql
SELECT id, name, status, session_id, stopped_at FROM games WHERE id = '<game_id>';
-- Should show: status='inactive', session_id=NULL, stopped_at=<timestamp>
```

```javascript
// In MongoDB
db.active_sessions.find({game_id: "<game_id>"})
// Should return empty (session deleted)
```

**API Logs to Check:**
- api-site: "Game {game_id} status set to STOPPING"
- api-site: "✅ Fetched final state for {game_id}: X players"
- api-site: "✅ Game {game_id} marked INACTIVE in PostgreSQL"
- api-site: "✅ Game {game_id} ended successfully, cleanup scheduled"
- api-game: "Session {session_id} deleted successfully"

## Phase 2: Error Scenario Testing

### Test 2.1: Start Game - api-game Service Down
**Setup:**
```bash
docker-compose stop api-game
```

**Steps:**
1. Click "Start Game" on inactive game

**Expected Results:**
- ✅ Error message displayed to user
- ✅ Game status rolls back to 'inactive'
- ✅ No MongoDB session created
- ✅ No session_id stored in PostgreSQL
- ✅ User can retry starting game

**Verification:**
```sql
SELECT status, session_id FROM games WHERE id = '<game_id>';
-- Should show: status='inactive', session_id=NULL
```

**API Logs to Check:**
- api-site: "Network error calling api-game: <error>"
- api-site: Game rolled back to INACTIVE

**Cleanup:**
```bash
docker-compose start api-game
```

### Test 2.2: Start Game - MongoDB Connection Failure
**Setup:**
```bash
docker-compose stop mongodb
```

**Steps:**
1. Click "Start Game" on inactive game

**Expected Results:**
- ✅ api-game returns error (can't connect to MongoDB)
- ✅ api-site rolls back game to 'inactive'
- ✅ Error message shown to user

**Cleanup:**
```bash
docker-compose start mongodb
```

### Test 2.3: End Game - api-game Service Down (Graceful Handling)
**Setup:**
1. Start a game successfully (api-game running)
2. Stop api-game: `docker-compose stop api-game`

**Steps:**
1. Click "End Game"

**Expected Results:**
- ✅ Fetch final state fails (api-game down)
- ✅ Game status rolls back to 'active'
- ✅ MongoDB session preserved (since api-game is down)
- ✅ Error message shown to user
- ✅ User can retry when api-game is back up

**API Logs to Check:**
- api-site: "Network error fetching state: <error>"
- api-site: Game rolled back to ACTIVE

**Cleanup:**
```bash
docker-compose start api-game
```

### Test 2.4: End Game - PostgreSQL Write Failure (Simulated)
**Note:** This is harder to test without modifying code. We'll verify the logic is in place.

**Expected Behavior (from code review):**
- ✅ MongoDB session preserved (not deleted)
- ✅ Game stays in 'stopping' status
- ✅ Error message indicates retry needed
- ✅ User can retry and complete successfully

**Code Location:** `/home/matt/rollplay/api-site/modules/game/application/commands.py` lines 509-519

### Test 2.5: Background Cleanup Fails
**Setup:**
1. Start and end a game successfully
2. Background cleanup attempts to delete MongoDB session but fails (network issue)

**Expected Results:**
- ✅ Game still marked INACTIVE in PostgreSQL
- ✅ session_id still present in PostgreSQL (not cleared yet)
- ✅ Cron job will find it in next hourly run (stopped_at > 1 hour ago)
- ✅ Cron job successfully cleans up orphaned session

**Verification:**
After 1+ hours, run cron script manually:
```bash
cd /home/matt/rollplay
python3 scripts/cleanup_orphaned_sessions.py
```

Should see: "Found 1 orphaned sessions" → "Cleanup complete: 1/1 sessions cleaned"

## Phase 3: Orphaned Session Cleanup Testing

### Test 3.1: Simulate Orphaned Session
**Setup:**
1. Start a game (creates MongoDB session)
2. Manually set game to inactive in PostgreSQL without deleting MongoDB session:
```sql
UPDATE games SET status = 'inactive', stopped_at = NOW() - INTERVAL '2 hours' WHERE id = '<game_id>';
```

**Steps:**
1. Run cleanup script manually:
```bash
cd /home/matt/rollplay
export POSTGRES_PASSWORD=<your_password>
export API_GAME_URL=http://localhost:8081
python3 scripts/cleanup_orphaned_sessions.py
```

**Expected Results:**
- ✅ Script finds 1 orphaned session
- ✅ Deletes MongoDB session via DELETE /game/session/{session_id}
- ✅ Clears session_id from PostgreSQL
- ✅ Logs show "✅ Cleaned up orphaned session for game..."

**Verification:**
```sql
SELECT session_id FROM games WHERE id = '<game_id>';
-- Should show: session_id=NULL
```

```javascript
db.active_sessions.find({game_id: "<game_id>"})
// Should return empty
```

### Test 3.2: Cron Job Dry Run
**Steps:**
1. Verify cron script has correct permissions:
```bash
chmod +x /home/matt/rollplay/scripts/cleanup_orphaned_sessions.py
```

2. Test script runs without errors:
```bash
cd /home/matt/rollplay
python3 scripts/cleanup_orphaned_sessions.py
```

**Expected Results:**
- ✅ Script connects to PostgreSQL successfully
- ✅ Script finds 0 orphaned sessions (if none exist)
- ✅ Logs show "No orphaned sessions found - all clean!"
- ✅ No errors or exceptions

## Phase 4: State Consistency Testing

### Test 4.1: Rapid Start/Stop Cycles
**Steps:**
1. Start game
2. Immediately end game
3. Immediately start game again
4. Immediately end game again

**Expected Results:**
- ✅ All state transitions succeed
- ✅ No race conditions or orphaned sessions
- ✅ Each cycle completes cleanly

### Test 4.2: Multiple Games in Same Campaign
**Steps:**
1. Create 3 games in same campaign
2. Start all 3 games
3. Verify all have unique session_ids
4. End all 3 games
5. Verify all cleaned up properly

**Expected Results:**
- ✅ Each game has unique MongoDB session
- ✅ All games can be started simultaneously
- ✅ All games can be ended independently
- ✅ No cross-contamination of session data

## Phase 5: Frontend UX Testing

### Test 5.1: Button State Transitions
**Steps:**
1. Observe button states through complete lifecycle

**Expected Button States:**
- Inactive game: "Start Game" (enabled)
- During start: "Session Loading..." (disabled)
- Active game: "Join Game" (enabled) + "End Game" (enabled)
- During end: "End Game" (disabled with loading indicator)
- After end: "Start Game" (enabled)

### Test 5.2: Error Message Display
**Steps:**
1. Trigger various errors (api-game down, etc.)

**Expected Results:**
- ✅ Clear error messages shown to user
- ✅ Buttons return to correct state after error
- ✅ User can retry failed operations

## Phase 6: Logging and Monitoring

### Test 6.1: Verify Logging Coverage
**Check logs contain:**
- ✅ Game status transitions (INACTIVE → STARTING → ACTIVE → STOPPING → INACTIVE)
- ✅ MongoDB session creation/deletion events
- ✅ Background cleanup start/completion
- ✅ Error scenarios with full context
- ✅ Cron job execution logs

### Test 6.2: Log Inspection Commands
```bash
# api-site logs
docker logs api-site | grep "Game.*status"
docker logs api-site | grep "cleanup"

# api-game logs
docker logs api-game | grep "Session"

# Check cron job logs (after setup)
tail -f /tmp/rollplay-cleanup.log
```

---

## Test Execution Checklist

- [ ] Phase 1: Happy Path (Tests 1.1-1.4)
- [ ] Phase 2: Error Scenarios (Tests 2.1-2.5)
- [ ] Phase 3: Orphaned Cleanup (Tests 3.1-3.2)
- [ ] Phase 4: State Consistency (Tests 4.1-4.2)
- [ ] Phase 5: Frontend UX (Tests 5.1-5.2)
- [ ] Phase 6: Logging (Tests 6.1-6.2)

## Notes and Issues Found

_(Document any issues discovered during testing here)_
