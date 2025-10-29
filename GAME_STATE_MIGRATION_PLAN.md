# 🎯 Game State Migration Implementation Plan
**Version:** 1.2 - Final
**Updated:** 2025-10-27
**Status:** Ready for Implementation

---

## 📋 Executive Summary

Implement data migration bridge between **api-site (PostgreSQL)** and **api-game (MongoDB)** to enable game session lifecycle management using direct HTTP calls with async status tracking.

**Architecture:** Direct HTTP + Async status polling + Background cleanup
**Key Innovation:** Fail-safe two-phase commit prioritizing data preservation over clean transitions
**Cleanup Strategy:** Background async cleanup + hourly cron safety net

---

## 🔑 Critical Design Decisions

### **1. Seat Layout = Ephemeral Runtime State (No Persistence)**

**Current Usage:**
- Stored in MongoDB as `["player1", "player2", "empty", ...]`
- Updated via WebSocket `seat_change` events during gameplay
- Only used for UI rendering (PlayerCard components, lobby)

**Decision:**
✅ **Do NOT persist seat_layout to/from PostgreSQL**
✅ **Do NOT include in session start payload**
✅ Players choose seats each session (acceptable UX)

**Implementation:**
- Session start: Initialize as `["empty"] * max_players`
- Players join and select seats dynamically via WebSocket
- Session end: Ignore seat_layout entirely

**Benefits:**
- Reduced coupling between services
- Eliminates validation complexity
- Simpler error handling
- Better UX (flexible seating between sessions)

---

### **2. Fail-Safe Game End: Two-Phase Commit with MongoDB Retention**

**Problem:** If MongoDB returns final state but PostgreSQL write fails, we lose player progress.

**Solution: Three-Phase Pattern**

#### **Phase 1: Fetch State (Non-Destructive)**
```python
# Fetch final state from MongoDB WITHOUT deleting
response = await client.post(
    "http://api-game:8081/game/session/end?validate_only=true",
    json={"game_id": str(game_id)}
)
final_state = response.json()["final_state"]
```

#### **Phase 2: Write to PostgreSQL (With Rollback)**
```python
try:
    with self.db.begin():  # Transaction
        # Update character HP/stats
        for player in final_state["players"]:
            char = self.character_repo.get_by_id(player["character_id"])
            char.hp_current = player["hp_current"]
            self.character_repo.save(char)

        # Mark game INACTIVE
        game.mark_inactive()
        self.game_repo.save(game)

except Exception as pg_error:
    # PostgreSQL failed - MongoDB still has session
    raise DataPersistenceError(
        message="Failed to save game data. Session preserved for retry.",
        game_id=game_id,
        mongo_session_id=game.session_id,
        error=str(pg_error)
    )
```

#### **Phase 3: Background Cleanup (Fire-and-Forget)**
```python
# Try cleanup asynchronously (doesn't block response)
asyncio.create_task(self._async_cleanup(game_id))

return game  # Return immediately

async def _async_cleanup(self, game_id: UUID):
    """Background task - no blocking"""
    try:
        await client.delete(f"http://api-game:8081/game/session/{game_id}")
        # Success - clear session_id reference
        game = self.game_repo.get_by_id(game_id)
        game.session_id = None
        self.game_repo.save(game)
    except:
        # Failed - cron will handle it
        pass
```

#### **Safety Net: Hourly Cron Cleanup**
```python
# scripts/cleanup_orphaned_sessions.py
# Runs independently, not part of api-site

def find_orphaned_games():
    """Games marked INACTIVE but still have session_id"""
    return db.execute("""
        SELECT id, session_id
        FROM games
        WHERE status = 'INACTIVE'
          AND session_id IS NOT NULL
          AND stopped_at < NOW() - INTERVAL '1 hour'
    """)

for game in find_orphaned_games():
    # Delete MongoDB session
    requests.delete(f"http://api-game:8081/game/session/{game.session_id}")
    # Clear PostgreSQL reference
    db.execute("UPDATE games SET session_id = NULL WHERE id = :id", id=game.id)
```

---

## 📊 MongoDB Schema (Minimal Payload)

### **active_sessions Collection**
```python
{
    "_id": "game-uuid-string",  # From PostgreSQL Game.id
    "max_players": 6,
    "seat_layout": ["empty", "empty", ...],  # Initialized empty
    "seat_colors": {"0": "#3b82f6", ...},  # Default colors
    "created_at": datetime,
    "moderators": [],  # Empty initially
    "dungeon_master": "host_username",
    "room_host": "host_username"
}
```

**What's NOT included:**
- ❌ Campaign assets - loaded on-demand
- ❌ Player characters - managed via WebSocket
- ❌ Seat assignments - chosen during gameplay

---

## 🏗️ Implementation Phases

### **Phase 1: api-game Session Endpoints** (1-2 days)

#### **File Structure**
```
api-game/
├── session_service.py          # NEW
├── schemas/
│   └── session_schemas.py      # NEW
└── app.py                       # MODIFIED
```

#### **New Endpoint 1: POST /game/session/start**
```python
@app.post("/game/session/start")
async def create_session(request: SessionStartRequest):
    """
    Create minimal MongoDB active_session.
    Players join and select seats via WebSocket.

    Request:
    {
        "game_id": "uuid-string",
        "dm_username": "player_name",
        "max_players": 6
    }

    Response:
    {
        "success": true,
        "session_id": "uuid-string",
        "message": "Session created"
    }
    """
    # Validate not already active
    existing = GameService.get_room(request.game_id)
    if existing:
        raise HTTPException(409, "Session already exists")

    # Create minimal session
    settings = GameSettings(
        max_players=request.max_players or 6,
        seat_layout=["empty"] * (request.max_players or 6),
        seat_colors={str(i): get_default_color(i) for i in range(request.max_players or 6)},
        created_at=datetime.utcnow(),
        moderators=[],
        dungeon_master=request.dm_username,
        room_host=request.dm_username
    )

    # Use game_id as MongoDB _id
    session_id = GameService.create_room(settings, room_id=request.game_id)

    return {"success": True, "session_id": session_id}
```

#### **New Endpoint 2: POST /game/session/end?validate_only=true**
```python
@app.post("/game/session/end")
async def end_session(request: SessionEndRequest, validate_only: bool = False):
    """
    Return final state from MongoDB.
    If validate_only=true: Do NOT delete session (Phase 1).
    If validate_only=false: Deprecated, use DELETE endpoint.

    Request:
    {
        "game_id": "uuid-string"
    }

    Response:
    {
        "success": true,
        "final_state": {
            "players": [{
                "character_id": "uuid",
                "character_name": "Gandalf",
                "hp_current": 75,
                "seat_position": 2
            }],
            "session_stats": {
                "duration_minutes": 180,
                "maps_used": ["dungeon.jpg"]
            }
        }
    }
    """
    room = GameService.get_room(request.game_id)
    if not room:
        raise HTTPException(404, "Session not found")

    # Extract player data from seat_layout
    players = []
    for idx, seat in enumerate(room.get("seat_layout", [])):
        if seat != "empty":
            players.append({
                "player_name": seat,
                "seat_position": idx,
                "seat_color": room.get("seat_colors", {}).get(str(idx))
            })

    final_state = {
        "players": players,
        "session_stats": {
            "duration_minutes": _calculate_duration(room),
            "maps_used": _get_maps_used(request.game_id),
            "total_logs": adventure_log.get_room_log_count(request.game_id)
        }
    }

    # Only delete if NOT validate_only
    if not validate_only:
        logger.warning("Using deprecated delete flow")
        _delete_session(request.game_id)

    return {"success": True, "final_state": final_state}
```

#### **New Endpoint 3: DELETE /game/session/{game_id}**
```python
@app.delete("/game/session/{game_id}")
async def delete_session(game_id: str, keep_logs: bool = True):
    """
    Delete MongoDB active_session.
    Called after PostgreSQL write succeeds (Phase 3).

    Query params:
    - keep_logs: If true, preserve adventure_logs and active_maps (default: true)

    Response:
    {
        "success": true,
        "message": "Session deleted"
    }
    """
    room = GameService.get_room(game_id)
    if not room:
        return {"success": True, "message": "Already deleted"}

    # Delete active_session
    collection = GameService._get_active_session()
    collection.delete_one({"_id": game_id})

    # Optionally delete logs/maps
    if not keep_logs:
        adventure_log.delete_room_logs(game_id)
        map_service.clear_active_map(game_id)

    return {"success": True, "message": "Session deleted"}
```

---

### **Phase 2: api-site Game Commands** (2-3 days)

#### **File Structure**
```
api-site/
├── modules/game/
│   ├── application/
│   │   └── commands.py          # MODIFIED (add StartGame, EndGame)
│   └── api/
│       └── endpoints.py         # MODIFIED (add /start, /end routes)
├── shared/
│   └── exceptions.py            # MODIFIED (add DataPersistenceError)
└── requirements.txt             # MODIFIED (add httpx)
```

#### **New Exception**
```python
# shared/exceptions.py
class DataPersistenceError(Exception):
    """PostgreSQL write failed but MongoDB preserved"""
    def __init__(self, message, game_id, mongo_session_id, error):
        self.message = message
        self.game_id = game_id
        self.mongo_session_id = mongo_session_id
        self.error = error
        super().__init__(self.message)
```

#### **StartGame Command**
```python
# modules/game/application/commands.py

class StartGame:
    def __init__(self, game_repo, campaign_repo, user_repo):
        self.game_repo = game_repo
        self.campaign_repo = campaign_repo
        self.user_repo = user_repo

    async def execute(self, game_id: UUID, host_id: UUID):
        # 1. Load and validate game
        game = self.game_repo.get_by_id(game_id)
        if not game:
            raise ValueError("Game not found")

        if game.host_id != host_id:
            raise ValueError("Only host can start game")

        # 2. Call domain method (sets status = STARTING)
        game.start_game()
        self.game_repo.save(game)

        # 3. Get DM username
        host_user = self.user_repo.get_by_id(host_id)

        # 4. Build minimal payload
        payload = {
            "game_id": str(game.id),
            "dm_username": host_user.username,
            "max_players": 6  # Could make this configurable
        }

        # 5. Call api-game
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "http://api-game:8081/game/session/start",
                json=payload,
                timeout=10.0
            )

        # 6. Handle response
        if response.status_code == 200:
            result = response.json()
            game.mark_active()
            game.session_id = result["session_id"]
            self.game_repo.save(game)
            return game
        else:
            # Rollback on failure
            game.status = GameStatus.INACTIVE
            self.game_repo.save(game)
            raise ValueError(f"Failed to start session: {response.text}")
```

#### **EndGame Command (Three-Phase Pattern)**
```python
class EndGame:
    def __init__(self, game_repo, character_repo):
        self.game_repo = game_repo
        self.character_repo = character_repo

    async def execute(self, game_id: UUID, host_id: UUID):
        # 1. Load and validate
        game = self.game_repo.get_by_id(game_id)
        if not game or game.host_id != host_id:
            raise ValueError("Game not found or unauthorized")

        # 2. Set status = STOPPING
        game.stop_game()
        self.game_repo.save(game)

        # 3. PHASE 1: Fetch final state (MongoDB NOT deleted)
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "http://api-game:8081/game/session/end",
                params={"validate_only": True},
                json={"game_id": str(game.id)},
                timeout=10.0
            )

        if response.status_code != 200:
            # Can't fetch state - rollback
            game.status = GameStatus.ACTIVE
            self.game_repo.save(game)
            raise ValueError(f"Cannot fetch game state: {response.text}")

        final_state = response.json()["final_state"]

        # 4. PHASE 2: Write to PostgreSQL (with transaction)
        try:
            with self.db.begin():
                # Update character stats (if needed in future)
                # Currently just marking game INACTIVE

                game.mark_inactive()
                self.game_repo.save(game)

        except Exception as pg_error:
            # PostgreSQL failed - MongoDB still has session
            logger.error(f"PostgreSQL write failed: {pg_error}")
            raise DataPersistenceError(
                message="Failed to save game data. Session preserved for retry.",
                game_id=game_id,
                mongo_session_id=game.session_id,
                error=str(pg_error)
            )

        # 5. PHASE 3: Background cleanup (fire-and-forget)
        asyncio.create_task(self._async_cleanup(game.id))

        return game  # Return immediately

    async def _async_cleanup(self, game_id: UUID):
        """Background task - doesn't block response"""
        try:
            async with httpx.AsyncClient() as client:
                await client.delete(
                    f"http://api-game:8081/game/session/{game_id}",
                    timeout=5.0
                )

            # Success - clear session_id
            game = self.game_repo.get_by_id(game_id)
            if game:
                game.session_id = None
                self.game_repo.save(game)

        except Exception as e:
            # Failed - cron will handle it
            logger.warning(f"Background cleanup failed for {game_id}: {e}")
```

#### **New API Endpoints**
```python
# modules/game/api/endpoints.py

@router.post("/{game_id}/start", response_model=GameResponse)
async def start_game(
    game_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    game_repo: GameRepository = Depends(get_game_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    user_repo: UserRepository = Depends(get_user_repository)
):
    """Start game session (INACTIVE → STARTING → ACTIVE)"""
    command = StartGame(game_repo, campaign_repo, user_repo)
    game = await command.execute(game_id, current_user.id)
    return _to_game_response(game)

@router.post("/{game_id}/end", response_model=GameResponse)
async def end_game(
    game_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    game_repo: GameRepository = Depends(get_game_repository),
    character_repo: CharacterRepository = Depends(get_character_repository)
):
    """End game session (ACTIVE → STOPPING → INACTIVE)"""
    try:
        command = EndGame(game_repo, character_repo)
        game = await command.execute(game_id, current_user.id)
        return _to_game_response(game)
    except DataPersistenceError as e:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "DATA_PERSISTENCE_ERROR",
                "message": e.message,
                "game_id": str(e.game_id),
                "mongo_session_id": e.mongo_session_id
            }
        )
```

---

### **Phase 3: Frontend Polling & Error Handling** (1-2 days)

#### **File Structure**
```
rollplay/app/
├── dashboard/components/
│   └── GameCard.js              # MODIFIED (add Start button)
└── game/
    ├── components/
    │   └── DMControlCenter.js   # MODIFIED (add End button)
    └── hooks/
        └── useGameStatus.js     # NEW (polling hook)
```

#### **Start Game Flow**
```javascript
// app/dashboard/components/GameCard.js

const handleStartGame = async (gameId) => {
  try {
    const response = await fetch(`/api/games/${gameId}/start`, {
      method: 'POST',
      credentials: 'include'
    });

    if (!response.ok) {
      showError("Failed to start game");
      return;
    }

    // Poll until ACTIVE
    setGameStatus('starting');

    const pollInterval = setInterval(async () => {
      const statusRes = await fetch(`/api/games/${gameId}`);
      const gameData = await statusRes.json();

      if (gameData.status === 'ACTIVE') {
        clearInterval(pollInterval);
        router.push(`/game?room_id=${gameData.session_id}`);
      } else if (gameData.status === 'INACTIVE') {
        clearInterval(pollInterval);
        showError("Game failed to start");
      }
    }, 2000);

    // Timeout after 30 seconds
    setTimeout(() => {
      clearInterval(pollInterval);
      showError("Game start timeout");
    }, 30000);

  } catch (error) {
    showError("Network error");
  }
};
```

#### **End Game Flow (with DataPersistenceError handling)**
```javascript
// app/game/components/DMControlCenter.js

const handleEndGame = async () => {
  try {
    const response = await fetch(`/api/games/${gameId}/end`, {
      method: 'POST',
      credentials: 'include'
    });

    if (!response.ok) {
      const error = await response.json();

      if (error.detail?.code === 'DATA_PERSISTENCE_ERROR') {
        // PostgreSQL failed, MongoDB preserved
        showModal({
          title: "Game Data Preserved",
          message: `Your session is still active. Player data has been preserved.
                   Please try ending the game again.`,
          actions: [
            {
              label: "Retry End Game",
              onClick: () => handleEndGame()
            },
            {
              label: "Stay in Game",
              onClick: () => closeModal()
            }
          ]
        });
      } else {
        showError("Failed to end game");
      }
      return;
    }

    // Success - poll until INACTIVE
    setGameStatus('stopping');

    const pollInterval = setInterval(async () => {
      const statusRes = await fetch(`/api/games/${gameId}`);
      const gameData = await statusRes.json();

      if (gameData.status === 'INACTIVE') {
        clearInterval(pollInterval);
        router.push('/dashboard');
      }
    }, 2000);

  } catch (error) {
    showError("Network error");
  }
};
```

---

### **Phase 4: Cleanup Cron Job** (1 day)

#### **File Structure**
```
scripts/
├── cleanup_orphaned_sessions.py  # NEW
└── requirements.txt              # NEW (requests, sqlalchemy, psycopg2)
```

#### **Cleanup Script**
```python
#!/usr/bin/env python3
"""
Cleanup orphaned MongoDB sessions hourly.
Runs independently via cron - NOT part of api-site.
"""

import os
import sys
import requests
import logging
from sqlalchemy import create_engine, text
from datetime import datetime, timedelta

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database connection (independent of api-site)
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    logger.error("DATABASE_URL not set")
    sys.exit(1)

engine = create_engine(DATABASE_URL)

def find_orphaned_games():
    """Find games marked INACTIVE but still have session_id (orphaned)"""
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT id, session_id, stopped_at
            FROM games
            WHERE status = 'INACTIVE'
              AND session_id IS NOT NULL
              AND stopped_at < :cutoff
        """), {"cutoff": datetime.utcnow() - timedelta(hours=1)})

        return result.fetchall()

def cleanup_session(game_id, session_id):
    """Delete MongoDB session and clear PostgreSQL reference"""
    try:
        # Delete from MongoDB
        response = requests.delete(
            f"http://api-game:8081/game/session/{session_id}",
            timeout=5.0
        )

        if response.status_code in [200, 404]:  # 404 = already deleted
            # Clear session_id from PostgreSQL
            with engine.connect() as conn:
                conn.execute(text("""
                    UPDATE games
                    SET session_id = NULL
                    WHERE id = :game_id
                """), {"game_id": game_id})
                conn.commit()

            logger.info(f"✅ Cleaned up orphaned session {game_id}")
            return True
        else:
            logger.error(f"❌ api-game returned {response.status_code} for {game_id}")
            return False

    except Exception as e:
        logger.error(f"❌ Failed cleanup for {game_id}: {e}")
        return False

if __name__ == "__main__":
    logger.info("Starting orphaned session cleanup")

    orphaned = find_orphaned_games()
    logger.info(f"Found {len(orphaned)} orphaned sessions")

    success_count = 0
    for game in orphaned:
        if cleanup_session(str(game.id), game.session_id):
            success_count += 1

    logger.info(f"Cleaned up {success_count}/{len(orphaned)} sessions")
```

#### **Crontab Setup**
```bash
# Option 1: System cron (if not using Docker)
# /etc/cron.d/rollplay-cleanup
0 * * * * cd /home/matt/rollplay && python3 scripts/cleanup_orphaned_sessions.py >> /var/log/rollplay/cleanup.log 2>&1

# Option 2: Docker container with cron
# Add to docker-compose.yml:
services:
  cleanup-cron:
    build: ./scripts
    container_name: "cleanup-cron"
    env_file: .env
    volumes:
      - ./scripts:/scripts
    command: sh -c "echo '0 * * * * python3 /scripts/cleanup_orphaned_sessions.py' | crontab - && crond -f"
    depends_on:
      - postgres
      - api-game
    networks:
      - default
```

---

## ✅ Testing Checklist

### **Happy Path**
- [ ] Create game in PostgreSQL (via dashboard)
- [ ] Start game: INACTIVE → STARTING → ACTIVE
- [ ] MongoDB session created with game_id as _id
- [ ] Can join game via WebSocket using session_id
- [ ] Players can select seats (ephemeral state)
- [ ] End game: ACTIVE → STOPPING → INACTIVE
- [ ] MongoDB session deleted (background task succeeds)
- [ ] session_id cleared from PostgreSQL

### **Error Scenarios - Start**
- [ ] api-game unreachable → Game stays INACTIVE, error shown
- [ ] MongoDB creation fails → Game stays INACTIVE, error shown
- [ ] Frontend timeout (30s) → Show error, allow retry

### **Error Scenarios - End (CRITICAL)**
- [ ] PostgreSQL write fails → MongoDB preserved, DataPersistenceError shown
- [ ] User can retry end game
- [ ] MongoDB DELETE fails → session_id stays set, cron cleans up
- [ ] api-game unreachable → Game stays ACTIVE, error shown

### **Cleanup Script**
- [ ] Script detects orphaned sessions (INACTIVE + session_id set)
- [ ] Script deletes MongoDB sessions
- [ ] Script clears PostgreSQL session_id
- [ ] Script handles api-game being down gracefully
- [ ] Cron job runs every hour successfully

---

## 📈 Success Metrics

- **Zero data loss** on PostgreSQL failure
- **< 5s** average start time (INACTIVE → ACTIVE)
- **< 3s** average end time (ACTIVE → INACTIVE)
- **< 1%** orphaned sessions requiring cron cleanup
- **100%** session cleanup within 1 hour (via cron)

---

## 🚧 Known Limitations & Future Work

### **Current Limitations**
- Manual retry on failure (no auto-retry)
- Polling every 2s (acceptable, could use WebSocket events)
- Orphaned sessions cleaned up hourly (not real-time)
- Seat layout reset between sessions

### **Future Enhancements**
- Redis Pub/Sub for real-time status updates (replace polling)
- Exponential backoff retry logic for transient failures
- Session snapshots (periodic PostgreSQL backups of active sessions)
- Adventure log export (PDF download after game ends)
- Persistent seat preferences per player

---

## 🎯 Implementation Priority

1. **Phase 1** (Critical): api-game endpoints
2. **Phase 2** (Critical): api-site commands with fail-safe pattern
3. **Phase 3** (High): Frontend UI with error handling
4. **Phase 4** (Medium): Cleanup cron job
5. **Testing** (Critical): Comprehensive error scenario testing

---

## 📦 Dependencies

### **api-game**
- No new dependencies (uses existing pymongo, fastapi)

### **api-site**
- `httpx` - Async HTTP client for api-game calls

### **scripts**
- `requests` - HTTP client for api-game calls
- `sqlalchemy` - PostgreSQL queries
- `psycopg2` - PostgreSQL driver

### **Infrastructure**
- No NGINX changes (existing routes work)
- No Docker Compose changes (unless adding cleanup container)

---

**Estimated Total Time:** 5-7 development days
**Risk Level:** Low (fail-safe design prevents data loss)
**Ready to Implement:** ✅ Yes
