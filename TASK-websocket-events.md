# Plan: Real-Time Event System via WebSocket

## Executive Summary

Replace polling (5-second intervals) with WebSocket-based real-time event system for friend requests, campaign invites, and game session events. This provides instant state synchronization, reduces server load by ~99%, and enables optional toast notifications.

**Critical Architecture Decision**: This is NOT a "notification system" - it's a **real-time state synchronization system** that happens to support optional notifications.

**Security Note**: Current api-game WebSocket has NO authentication (separate task to fix).

---

## Core Architecture Principles (CRITICAL - READ FIRST)

### 1. State Changes Drive Everything, Not Notifications

**Correct Mental Model:**
```
Domain Event → PostgreSQL Update → WebSocket Broadcast → Client State Update → Optional Toast
```

**NOT:**
```
Notification → State Change  (WRONG!)
```

**Key Points:**
- HTTP commands modify PostgreSQL (source of truth)
- After DB commit, broadcast event to affected users
- WebSocket is read-only (no commands, only events)
- Events trigger state updates (always) + optional toasts (conditional)

### 2. Module Naming: `modules/events` (Not "notifications")

**Rationale:**
- Accurate: Broadcasting domain events to clients
- Distinct: Separates concept from "notifications" (which are a subset)
- DDD-aligned: Domain is "event synchronization"
- Clear API: `/ws/events` conveys purpose

**What This Module Does:**
- WebSocket connection management (per-user)
- Event broadcasting to connected clients
- Optional notification persistence (if event warrants it)
- Toast trigger flags (frontend decides whether to show)

### 3. Event Message Structure

```python
{
    "event_type": "friend_request_received",  # What happened
    "data": {...},                            # Event payload
    "show_toast": True,                       # Should frontend show toast?
    "timestamp": "2026-01-04T..."             # When it happened
}
```

**Persistence happens backend-side** (if needed):
- `EventManager` optionally saves to `notifications` table
- Frontend doesn't know/care about persistence
- Notification history is backend concern

### 4. Event Configuration Lives in Domain

**Per-Aggregate Event Definitions:**

```python
# modules/friendship/domain/friendship_events.py
class FriendshipEvents:
    @staticmethod
    def friend_request_received(recipient_id, requester):
        return {
            "user_id": recipient_id,
            "event_type": "friend_request_received",
            "data": {"requester_id": str(requester.id), ...},
            "show_toast": True,         # Domain decision
            "save_notification": True   # Domain decision
        }

    @staticmethod
    def friend_removed(removed_friend_id, removed_by_id):
        return {
            "user_id": removed_friend_id,
            "event_type": "friend_removed",
            "data": {"removed_by_id": str(removed_by_id)},
            "show_toast": False,        # Silent update
            "save_notification": False  # Don't persist
        }
```

**Benefits:**
- Event config close to domain logic
- Easy to find: "What events does Friendship raise?"
- Type-safe (Python enforces structure)
- No magic config files

### 5. Frontend: Single Event Handler Per Event Type

```javascript
const eventHandlers = {
  'friend_request_received': (message) => {
    // 1. ALWAYS update state
    setRefreshTrigger(prev => prev + 1)

    // 2. Conditionally show toast
    if (message.show_toast) {
      showToast(`Friend request from ${message.data.requester_screen_name}`)
    }

    // Persistence already handled by backend
  }
}
```

**No separation between "state update handler" and "toast handler" - same handler does both.**

### 6. Authentication: WebSocket Waits for User to Exist

**Problem:** Race condition on new user signup

**Solution:**
```python
# WebSocket uses read-only query (no create)
user = GetUserByEmail(user_repo).execute(email)

if not user:
    await websocket.close(code=1008, reason="User not initialized")
    # Frontend retries after delay
```

**HTTP endpoints still use GetOrCreateUser** - they're guaranteed to run first.

### 7. NGINX Routing: Specific Before General

```nginx
# SPECIFIC: api-site events WebSocket
location /ws/events {
    proxy_pass http://api-site:8082/ws/events;
    # WebSocket headers...
}

# GENERAL: api-game WebSockets (catch-all)
location /ws/ {
    proxy_pass http://api-game:8081;
    # WebSocket headers...
}
```

**NGINX matches most specific route first.**

---

## Security Analysis

### Current State: api-game WebSocket (UNSAFE)

**Endpoint**: `/ws/{room_id}?player_name={player_name}`

**Authentication**: NONE
- No JWT validation
- No user verification
- Only checks if `player_name` query parameter is provided
- Anyone can connect with any player name to any room

**Vulnerability Assessment**:
```
Severity: HIGH
Attack Vector: Unauthenticated WebSocket connection
Impact:
  - Impersonation: Attacker can join any game as any player
  - Data leakage: View game state of any room
  - Disruption: Send malicious events, kick players, change game state
Mitigation: Add JWT validation to WebSocket handshake
```

**Why it's unsafe:**
```python
# api-game/websocket_handlers/app_websocket.py line 18-26
@app.websocket("/ws/{client_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    client_id: str,      # room_id - no validation
    player_name: str     # Query param - NO AUTHENTICATION!
):
    player_name = player_name.lower()
    await manager.connect(websocket, client_id, player_name)
    # ... continues without any auth check
```

### HTTP Authentication (SECURE - Reference Pattern)

**How api-site HTTP endpoints work:**

1. **Frontend sends request with JWT cookie:**
   ```javascript
   fetch('/api/campaigns/', {
     credentials: 'include'  // Sends auth_token cookie
   })
   ```

2. **Backend validates JWT:**
   ```python
   # shared/dependencies/auth.py
   async def get_current_user_from_token(request: Request):
       token = jwt_helper.get_token_from_cookie(request)  # Extract from cookie
       email = jwt_helper.verify_auth_token(token)        # Validate JWT
       user = GetOrCreateUser(user_repo).execute(email)   # Load user
       return user  # Returns UserAggregate
   ```

3. **Endpoint uses dependency injection:**
   ```python
   @router.get("/campaigns/")
   async def get_campaigns(
       current_user: UserAggregate = Depends(get_current_user_from_token)
   ):
       # current_user is guaranteed authenticated
   ```

**JWT Structure:**
- Secret: `JWT_SECRET_KEY` environment variable (shared between api-auth and api-site)
- Algorithm: HS256
- Payload: `{"type": "access", "email": "user@example.com", "exp": timestamp}`
- Storage: HttpOnly cookie named `auth_token`

---

## Proposed Solution: Secure WebSocket Authentication

### Pattern: JWT Cookie + WebSocket Header

**WebSocket connections CAN'T send cookies directly in browser**, so we need a workaround:

#### Option A: Token in Query Parameter (Simplest)
```javascript
// Frontend
const token = getCookie('auth_token')
const ws = new WebSocket(`wss://localhost/ws/notifications?token=${token}`)
```

```python
# Backend
@app.websocket("/ws/notifications")
async def notifications_endpoint(
    websocket: WebSocket,
    token: str,  # Query parameter
    user_repo: UserRepository = Depends(user_repository)
):
    # Validate JWT
    jwt_helper = JWTHelper()
    email = jwt_helper.verify_auth_token(token)
    if not email:
        await websocket.close(code=1008, reason="Unauthorized")
        return

    # Get user
    user = GetOrCreateUser(user_repo).execute(email)

    # Connect with validated user_id
    await notification_manager.connect(websocket, str(user.id))
```

**Pros:**
- Simple to implement
- Works in all browsers
- Minimal code changes

**Cons:**
- Token visible in URL (server logs, browser history)
- Slightly less secure than header-based auth

#### Option B: Token via First Message (More Secure)
```javascript
// Frontend
const ws = new WebSocket('wss://localhost/ws/notifications')
ws.onopen = () => {
  const token = getCookie('auth_token')
  ws.send(JSON.stringify({
    event_type: 'authenticate',
    data: { token }
  }))
}
```

```python
# Backend
@app.websocket("/ws/notifications")
async def notifications_endpoint(websocket: WebSocket):
    await websocket.accept()

    # Wait for auth message (timeout 5 seconds)
    try:
        auth_message = await asyncio.wait_for(
            websocket.receive_json(),
            timeout=5.0
        )

        if auth_message.get('event_type') != 'authenticate':
            await websocket.close(code=1008, reason="Authentication required")
            return

        token = auth_message.get('data', {}).get('token')
        email = jwt_helper.verify_auth_token(token)

        if not email:
            await websocket.close(code=1008, reason="Invalid token")
            return

        user = GetOrCreateUser(user_repo).execute(email)
        await notification_manager.connect(websocket, str(user.id))

    except asyncio.TimeoutError:
        await websocket.close(code=1008, reason="Authentication timeout")
```

**Pros:**
- Token not in URL
- More secure (no logging of tokens)
- Clean separation of auth and data

**Cons:**
- More complex handshake
- Requires timeout handling

**Recommendation**: Use **Option A** for initial implementation (simpler), migrate to **Option B** in future security pass.

---

## Notification Types & Triggers

### 1. Friend Requests

| Event | Trigger Location | Who Gets Notified | Payload |
|-------|-----------------|-------------------|---------|
| **friend_request_received** | `SendFriendRequest` command | Recipient | `{requester_id, requester_screen_name, request_id}` |
| **friend_request_accepted** | `AcceptFriendRequest` command | Requester | `{friend_id, friend_screen_name, friendship_id}` |
| **friend_request_declined** | `DeclineFriendRequest` command | Requester | `{declined_by_id, declined_by_screen_name}` |
| **friend_removed** | `RemoveFriend` command | Removed friend | `{removed_by_id, removed_by_screen_name}` |

### 2. Campaign Invitations

| Event | Trigger Location | Who Gets Notified | Payload |
|-------|-----------------|-------------------|---------|
| **campaign_invite_received** | `AddPlayerToCampaign` command | Invited player | `{campaign_id, campaign_name, host_id, host_screen_name}` |
| **campaign_invite_accepted** | `AcceptCampaignInvite` command | Campaign host + all players | `{campaign_id, player_id, player_screen_name, auto_added_to_games: [game_ids]}` |
| **campaign_invite_declined** | `DeclineCampaignInvite` command | Campaign host | `{campaign_id, player_id, player_screen_name}` |
| **campaign_player_removed** | `RemovePlayerFromCampaign` command (if exists) | Removed player | `{campaign_id, campaign_name, removed_by_id}` |

### 3. Game Session Events

| Event | Trigger Location | Who Gets Notified | Payload |
|-------|-----------------|-------------------|---------|
| **game_started** | `StartGame` command | All campaign players | `{game_id, game_name, campaign_id, session_id, dm_id, dm_screen_name}` |
| **game_ended** | `EndGame` command | All active participants | `{game_id, game_name, ended_by_id, ended_by_screen_name}` |
| **game_finished** | `FinishGame` command | Campaign DM + participants | `{game_id, game_name, campaign_id}` |

---

## Architecture Design

### Backend: NotificationManager (api-site)

**New File**: `/api-site/modules/notifications/websocket_manager.py`

```python
from fastapi import WebSocket
from typing import Dict, Set
import logging

logger = logging.getLogger(__name__)

class NotificationConnectionManager:
    """
    Manages per-user WebSocket connections for dashboard notifications.
    Similar to api-game ConnectionManager but user-scoped instead of room-scoped.
    """

    def __init__(self):
        # user_id (str) -> Set[WebSocket] (supports multiple tabs/devices)
        self.user_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        """Register new WebSocket connection for user"""
        await websocket.accept()

        if user_id not in self.user_connections:
            self.user_connections[user_id] = set()

        self.user_connections[user_id].add(websocket)
        logger.info(f"User {user_id} connected (total connections: {len(self.user_connections[user_id])})")

    async def disconnect(self, websocket: WebSocket, user_id: str):
        """Remove WebSocket connection for user"""
        if user_id in self.user_connections:
            self.user_connections[user_id].discard(websocket)

            # Clean up empty sets
            if not self.user_connections[user_id]:
                del self.user_connections[user_id]

            logger.info(f"User {user_id} disconnected")

    async def send_to_user(self, user_id: str, event_type: str, data: dict):
        """
        Send notification to specific user (all their connections).
        Handles dead connections gracefully.
        """
        if user_id not in self.user_connections:
            logger.debug(f"User {user_id} not connected, skipping notification")
            return

        message = {
            "event_type": event_type,
            "data": data,
            "timestamp": datetime.utcnow().isoformat()
        }

        dead_connections = []
        for connection in self.user_connections[user_id]:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send to user {user_id}: {e}")
                dead_connections.append(connection)

        # Clean up dead connections
        for dead in dead_connections:
            await self.disconnect(dead, user_id)

    async def broadcast_to_users(self, user_ids: list[str], event_type: str, data: dict):
        """Send notification to multiple users"""
        for user_id in user_ids:
            await self.send_to_user(user_id, event_type, data)

# Singleton instance
notification_manager = NotificationConnectionManager()
```

### Backend: WebSocket Endpoint

**New File**: `/api-site/modules/notifications/api/websocket_endpoint.py`

```python
from fastapi import WebSocket, WebSocketDisconnect, Depends
from starlette.websockets import WebSocketState
from modules.notifications.websocket_manager import notification_manager
from shared.jwt_helper import JWTHelper
from shared.dependencies.db import get_db
from modules.user.repositories.user_repository import UserRepository
from modules.user.application.queries import GetUserByEmail
import logging

logger = logging.getLogger(__name__)
jwt_helper = JWTHelper()

async def websocket_notifications(
    websocket: WebSocket,
    token: str  # Query parameter
):
    """
    WebSocket endpoint for user dashboard notifications.
    Validates JWT and maintains persistent connection for push notifications.
    """

    # Validate JWT token
    email = jwt_helper.verify_auth_token(token)
    if not email:
        await websocket.close(code=1008, reason="Unauthorized: Invalid or expired token")
        return

    # Get user from database
    db = next(get_db())
    user_repo = UserRepository(db)
    query = GetUserByEmail(user_repo)
    user = query.execute(email)

    if not user:
        await websocket.close(code=1008, reason="Unauthorized: User not found")
        return

    user_id = str(user.id)

    # Connect user
    await notification_manager.connect(websocket, user_id)

    try:
        # Send welcome message
        await websocket.send_json({
            "event_type": "connected",
            "data": {
                "user_id": user_id,
                "message": "Notification service connected"
            }
        })

        # Keep connection alive (heartbeat)
        while True:
            # Wait for messages (client can send heartbeat pings)
            try:
                message = await websocket.receive_json()

                # Handle ping/pong for keep-alive
                if message.get("event_type") == "ping":
                    await websocket.send_json({"event_type": "pong"})

            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.error(f"Error in WebSocket loop for user {user_id}: {e}")
                break

    finally:
        await notification_manager.disconnect(websocket, user_id)
```

### Backend: Integration into Commands

**Example: SendFriendRequest Command**

```python
# modules/friendship/application/commands.py

from modules.notifications.websocket_manager import notification_manager

class SendFriendRequest:
    def execute(self, requester_id: UUID, recipient_identifier: str):
        # ... existing logic ...

        request = self.repository.save(friend_request)

        # NEW: Send WebSocket notification to recipient
        asyncio.create_task(
            notification_manager.send_to_user(
                user_id=str(recipient_id),
                event_type="friend_request_received",
                data={
                    "request_id": str(request.id),
                    "requester_id": str(requester_id),
                    "requester_screen_name": requester.screen_name,
                    "created_at": request.created_at.isoformat()
                }
            )
        )

        return request
```

**Note**: Use `asyncio.create_task()` to avoid blocking the HTTP response. WebSocket notification happens asynchronously.

### Frontend: Notification Hook

**New File**: `/rollplay/app/shared/hooks/useNotifications.js`

```javascript
import { useEffect, useRef, useState } from 'react'

export const useNotifications = (userId, handlers) => {
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef(null)
  const reconnectTimerRef = useRef(null)

  // Get auth token from cookie
  const getAuthToken = () => {
    const match = document.cookie.match(/auth_token=([^;]+)/)
    return match ? match[1] : null
  }

  const connect = () => {
    const token = getAuthToken()
    if (!token) {
      console.warn('No auth token, cannot connect to notifications')
      return
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws/notifications?token=${token}`

    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      console.log('Notifications WebSocket connected')
      setIsConnected(true)

      // Clear reconnect timer
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
    }

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data)
      const { event_type, data } = message

      console.log('Notification received:', event_type, data)

      // Route to appropriate handler
      if (handlers[event_type]) {
        handlers[event_type](data)
      }
    }

    ws.onerror = (error) => {
      console.error('Notification WebSocket error:', error)
    }

    ws.onclose = () => {
      console.log('Notifications WebSocket disconnected')
      setIsConnected(false)
      wsRef.current = null

      // Reconnect after 3 seconds
      reconnectTimerRef.current = setTimeout(() => {
        console.log('Attempting to reconnect...')
        connect()
      }, 3000)
    }

    wsRef.current = ws
  }

  useEffect(() => {
    if (userId) {
      connect()
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
    }
  }, [userId])

  return { isConnected, ws: wsRef.current }
}
```

### Frontend: Dashboard Integration

**Modify**: `/rollplay/app/dashboard/page.js`

```javascript
import { useNotifications } from '../shared/hooks/useNotifications'

function DashboardContent() {
  const { user, ... } = useAuth()
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  // NEW: WebSocket notification handlers
  const notificationHandlers = {
    'friend_request_received': (data) => {
      console.log('New friend request from:', data.requester_screen_name)
      setRefreshTrigger(prev => prev + 1)  // Trigger refresh
      // TODO: Show toast notification
    },

    'friend_request_accepted': (data) => {
      console.log('Friend request accepted:', data.friend_screen_name)
      setRefreshTrigger(prev => prev + 1)
      // TODO: Show toast notification
    },

    'campaign_invite_received': (data) => {
      console.log('Campaign invite:', data.campaign_name)
      setRefreshTrigger(prev => prev + 1)
      // TODO: Show toast notification
    },

    'campaign_invite_accepted': (data) => {
      console.log('Player joined campaign:', data.player_screen_name)
      setRefreshTrigger(prev => prev + 1)
      // TODO: Show toast notification
    },

    'game_started': (data) => {
      console.log('Game started:', data.game_name)
      setRefreshTrigger(prev => prev + 1)
      // TODO: Show toast notification
    }
  }

  // Connect to notification WebSocket
  const { isConnected } = useNotifications(user?.id, notificationHandlers)

  // REMOVE: Polling interval (no longer needed)
  // useEffect(() => { ... setInterval ... }, [activeSection])

  // ... rest of component
}
```

---

## UI: Notification Toast Component (Optional Phase 2)

**New File**: `/rollplay/app/shared/components/NotificationToast.js`

```javascript
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export const NotificationToast = ({ message, type = 'info', duration = 5000, onClose }) => {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false)
      setTimeout(onClose, 300)  // Wait for fade animation
    }, duration)

    return () => clearTimeout(timer)
  }, [duration, onClose])

  const bgColor = {
    info: 'bg-blue-500',
    success: 'bg-green-500',
    warning: 'bg-yellow-500',
    error: 'bg-red-500'
  }[type]

  return createPortal(
    <div className={`fixed top-4 right-4 ${bgColor} text-white px-6 py-3 rounded-lg shadow-lg transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'} z-50`}>
      {message}
    </div>,
    document.body
  )
}
```

---

## NGINX Configuration

**Modify**: `/docker/dev/nginx/nginx.conf` and `/docker/prod/nginx/nginx.conf`

Add WebSocket support for notifications endpoint:

```nginx
# Notification WebSocket endpoint
location /ws/notifications {
    proxy_pass http://api-site:8082/ws/notifications;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;

    # WebSocket timeout (keep-alive)
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

---

## Implementation Phases (FINAL)

### Phase 1: Database & Notification Persistence
**Files to Create:**
- `/api-site/alembic/versions/XXXXX_add_notifications_table.py` - Database migration
- `/api-site/modules/events/model/notification_model.py` - SQLAlchemy model
- `/api-site/modules/events/domain/notification_aggregate.py` - Domain model
- `/api-site/modules/events/repositories/notification_repository.py` - Repository
- `/api-site/modules/events/application/commands.py` - CreateNotification, MarkAsRead
- `/api-site/modules/events/application/queries.py` - GetUnreadNotifications, GetNotificationHistory
- `/api-site/modules/events/__init__.py` - Module initialization

**Testing:**
- Run migration: `alembic upgrade head`
- Verify notifications table created
- Test CRUD via repository
- Query unread notifications

### Phase 2: WebSocket Infrastructure
**Files to Create:**
- `/api-site/modules/events/websocket_manager.py` - Per-user connection manager
- `/api-site/modules/events/api/websocket_endpoint.py` - WebSocket endpoint (token-via-message auth)
- `/api-site/modules/events/dependencies/providers.py` - DI for WebSocketManager
- `/rollplay/app/shared/hooks/useEvents.js` - Frontend WebSocket hook
- `/rollplay/app/shared/components/ToastNotification.js` - Toast component
- `/rollplay/app/shared/hooks/useToast.js` - Toast state management

**Files to Modify:**
- `/api-site/main.py` - Register `/ws/events` route
- `/docker/dev/nginx/nginx.conf` - Add `/ws/events` proxy (before `/ws/`)
- `/docker/prod/nginx/nginx.conf` - Add `/ws/events` proxy (before `/ws/`)

**Testing:**
- WebSocket connects with first-message auth
- JWT validation (valid/invalid/expired tokens)
- Auth timeout (5 seconds if no auth message)
- Multi-tab connections (same user, multiple browsers)
- Reconnection after disconnect
- Toast notifications display correctly

### Phase 3: EventManager & Domain Events
**Files to Create:**
- `/api-site/modules/events/event_manager.py` - Central event dispatcher
- `/api-site/modules/events/dependencies/providers.py` - get_event_manager DI
- `/api-site/modules/friendship/domain/friendship_events.py` - Friend event configs
- `/api-site/modules/campaign/domain/campaign_events.py` - Campaign event configs
- `/api-site/modules/game/domain/game_events.py` - Game event configs (if needed)

**EventManager Responsibilities:**
- Broadcast to WebSocket (if user online)
- Save to notifications table (if save_notification=True)
- Handle dead connections gracefully

**Testing:**
- EventManager broadcasts to connected users
- Events persist when save_notification=True
- Events don't persist when save_notification=False
- Multiple users receive broadcasts correctly

### Phase 4: Friend Request Notifications
**Files to Modify:**
- `/api-site/modules/friendship/application/commands.py`:
  - `SendFriendRequest` - Notify recipient
  - `AcceptFriendRequest` - Notify requester
  - `DeclineFriendRequest` - Notify requester
  - `RemoveFriend` - Notify removed friend

**Files to Modify:**
- `/rollplay/app/dashboard/page.js` - Add friend notification handlers
- `/rollplay/app/dashboard/components/FriendsManager.js` - Remove polling dependency

**Testing:**
- Send friend request between two users
- Accept/decline requests
- Verify both users see real-time updates
- Test edge cases (offline users, reconnect)

### Phase 3: Campaign Invite Notifications
**Files to Modify:**
- `/api-site/modules/campaign/application/commands.py`:
  - `AddPlayerToCampaign` - Notify invited player
  - `AcceptCampaignInvite` - Notify host + players
  - `DeclineCampaignInvite` - Notify host

**Files to Modify:**
- `/rollplay/app/dashboard/page.js` - Add campaign notification handlers
- `/rollplay/app/dashboard/components/CampaignManager.js` - Remove polling dependency

**Testing:**
- Invite players to campaigns
- Accept/decline invites
- Verify real-time updates for host and players
- Test auto-add to active games notification

### Phase 4: Game Session Notifications
**Files to Modify:**
- `/api-site/modules/game/application/commands.py`:
  - `StartGame` - Notify all campaign players
  - `EndGame` - Notify active participants
  - `FinishGame` - Notify DM and participants

**Files to Modify:**
- `/rollplay/app/dashboard/page.js` - Add game notification handlers
- `/rollplay/app/dashboard/components/GamesManager.js` - Remove polling dependency

**Testing:**
- Start game as DM
- Verify all campaign players see notification
- End game and verify participants notified
- Test Sessions tab updates instantly

### Phase 5: UI Polish (Optional)
**Files to Create:**
- `/rollplay/app/shared/components/NotificationToast.js` - Toast notifications
- `/rollplay/app/shared/components/NotificationBadge.js` - Unread count badge

**Files to Modify:**
- `/rollplay/app/dashboard/components/DashboardLayout.js` - Add notification badge to tabs
- `/rollplay/app/dashboard/page.js` - Integrate toast notifications

**Features:**
- Toast pop-ups for new notifications
- Unread count badges on Friends/Campaigns/Sessions tabs
- Sound effects for notifications (optional)
- Browser notifications (optional, requires permission)

---

## Phase 6: Comprehensive Testing

### Backend Testing

**Unit Tests:**
- **NotificationRepository Tests** (`/api-site/modules/events/tests/test_notification_repository.py`):
  - Test save() creates new notifications
  - Test get_unread_by_user() returns only unread
  - Test mark_as_read() updates read status
  - Test mark_all_as_read() bulk operation
  - Test delete_old_read_notifications() cleanup

- **NotificationAggregate Tests** (`/api-site/modules/events/tests/test_notification_aggregate.py`):
  - Test create() validation (user_id required, event_type validation)
  - Test mark_as_read() state transition
  - Test from_persistence() reconstitution

- **Commands Tests** (`/api-site/modules/events/tests/test_commands.py`):
  - Test CreateNotification command
  - Test MarkNotificationAsRead command
  - Test MarkAllNotificationsAsRead command

- **Queries Tests** (`/api-site/modules/events/tests/test_queries.py`):
  - Test GetUnreadNotifications query
  - Test GetNotificationHistory query
  - Test GetNotificationById query

**WebSocket Integration Tests:**
- **Authentication Tests** (`/api-site/modules/events/tests/test_websocket_auth.py`):
  - Test successful auth with valid JWT
  - Test auth rejection with invalid JWT
  - Test auth rejection with expired JWT
  - Test auth timeout (5 seconds)
  - Test missing auth message rejection
  - Test user not found rejection (GetUserByEmail returns None)

- **Connection Tests** (`/api-site/modules/events/tests/test_websocket_connection.py`):
  - Test connection establishment
  - Test multi-tab connections (same user, multiple websockets)
  - Test ping/pong keep-alive
  - Test graceful disconnection
  - Test dead connection cleanup

- **Event Broadcasting Tests** (`/api-site/modules/events/tests/test_event_broadcasting.py`):
  - Test send_to_user() delivers to all user connections
  - Test broadcast_to_users() delivers to multiple users
  - Test offline user (no delivery, no error)
  - Test message format validation

**EventManager Tests** (`/api-site/modules/events/tests/test_event_manager.py`):
- Test broadcast() with save_notification=True (persists to DB)
- Test broadcast() with save_notification=False (no persistence)
- Test broadcast() to online user (WebSocket delivery)
- Test broadcast() to offline user (DB persistence only)

### Frontend Testing

**Hook Tests:**
- **useEvents Tests** (`/rollplay/app/shared/hooks/__tests__/useEvents.test.js`):
  - Test connection establishment with auth message
  - Test reconnection after disconnect
  - Test event handler routing
  - Test cleanup on unmount
  - Test multi-tab behavior

- **useToast Tests** (`/rollplay/app/shared/hooks/__tests__/useToast.test.js`):
  - Test showToast() displays toast
  - Test toast auto-dismiss after duration
  - Test multiple toasts stacking

**Component Tests:**
- **ToastNotification Tests** (`/rollplay/app/shared/components/__tests__/ToastNotification.test.js`):
  - Test rendering with different types (info, success, warning, error)
  - Test auto-dismiss behavior
  - Test manual dismiss

### End-to-End Testing

**Manual Test Scenarios:**

1. **Friend Request Flow:**
   - User A sends friend request to User B
   - Verify User B receives WebSocket event instantly
   - Verify User B's Friends tab updates without refresh
   - Verify toast notification appears (if show_toast=true)
   - Verify notification persisted in database
   - User B accepts request
   - Verify User A receives acceptance notification instantly

2. **Campaign Invite Flow:**
   - DM invites player to campaign
   - Verify player receives WebSocket event instantly
   - Verify player's Campaigns tab updates without refresh
   - Player accepts invite
   - Verify DM and all players receive notification

3. **Game Session Flow:**
   - DM starts game
   - Verify all campaign players receive notification instantly
   - Verify Sessions tab updates for all players
   - DM ends game
   - Verify all participants receive notification

4. **Multi-Device Testing:**
   - Open dashboard in two browser tabs
   - Send friend request from another account
   - Verify both tabs receive event simultaneously
   - Verify state updates in both tabs

5. **Offline/Reconnection Testing:**
   - Disconnect WebSocket (simulate network loss)
   - Send events while disconnected
   - Reconnect WebSocket
   - Verify events were persisted and visible in notification history

6. **Authentication Edge Cases:**
   - Test connection with expired JWT
   - Test connection with invalid JWT
   - Test connection timeout (don't send auth message)
   - Verify all cases properly close connection with appropriate reason

### Performance Testing

**Load Tests:**
- 100 concurrent WebSocket connections
- 1,000 notifications/second broadcast rate
- Connection churn (rapid connect/disconnect)
- Memory usage monitoring

**Metrics to Validate:**
- WebSocket connection success rate >99%
- Event delivery latency <100ms
- Server load reduction >90% (vs polling)
- Memory usage <10MB for 1,000 users

### Test File Structure

```
api-site/modules/events/tests/
├── __init__.py
├── test_notification_repository.py
├── test_notification_aggregate.py
├── test_commands.py
├── test_queries.py
├── test_websocket_auth.py
├── test_websocket_connection.py
├── test_event_broadcasting.py
└── test_event_manager.py

rollplay/app/shared/hooks/__tests__/
├── useEvents.test.js
└── useToast.test.js

rollplay/app/shared/components/__tests__/
└── ToastNotification.test.js
```

### Testing Tools

**Backend:**
- pytest for unit/integration tests
- pytest-asyncio for async WebSocket tests
- WebSocket test client from Starlette

**Frontend:**
- Jest for unit tests
- React Testing Library for component tests
- Mock WebSocket for hook testing

---

## Critical Files Summary

### Backend (api-site)

**New Files:**
- `/api-site/modules/notifications/websocket_manager.py` - Connection manager
- `/api-site/modules/notifications/api/websocket_endpoint.py` - WebSocket endpoint
- `/api-site/modules/notifications/__init__.py` - Module initialization

**Modified Files:**
- `/api-site/main.py` - Register WebSocket route
- `/api-site/modules/friendship/application/commands.py` - Add friend notifications
- `/api-site/modules/campaign/application/commands.py` - Add campaign notifications
- `/api-site/modules/game/application/commands.py` - Add game notifications

### Frontend (rollplay)

**New Files:**
- `/rollplay/app/shared/hooks/useNotifications.js` - WebSocket connection hook
- `/rollplay/app/shared/components/NotificationToast.js` - Toast UI (optional)

**Modified Files:**
- `/rollplay/app/dashboard/page.js` - Remove polling, add WebSocket handlers
- `/rollplay/app/dashboard/components/FriendsManager.js` - Rely on notifications
- `/rollplay/app/dashboard/components/CampaignManager.js` - Rely on notifications
- `/rollplay/app/dashboard/components/GamesManager.js` - Rely on notifications

### Infrastructure

**Modified Files:**
- `/docker/dev/nginx/nginx.conf` - WebSocket proxy configuration
- `/docker/prod/nginx/nginx.conf` - WebSocket proxy configuration

---

## Security Recommendations

### Immediate (Critical)

1. **Fix api-game WebSocket authentication**
   - Add JWT validation to `/ws/{room_id}` endpoint
   - Verify user has access to requested room (check campaign membership)
   - Close connection if unauthorized

### Short-term (Important)

2. **Rate limiting on WebSocket connections**
   - Limit connections per user (prevent abuse)
   - Limit reconnection attempts (prevent DoS)

3. **Audit logging**
   - Log all WebSocket connection attempts
   - Log authentication failures
   - Monitor for suspicious patterns

### Long-term (Security Hardening)

4. **Migrate to token-in-message pattern**
   - Remove token from query parameters
   - Use first-message authentication
   - Reduce token exposure in logs

5. **Connection validation**
   - Periodic token refresh (detect revoked tokens)
   - Heartbeat with re-authentication
   - Automatic disconnect on token expiration

---

## Performance Considerations

### Load Reduction

**Current (Polling):**
- 100 users × 36 requests/minute = 3,600 requests/min
- 100 users × 5 seconds latency = poor UX

**Proposed (WebSocket):**
- 100 users × 1 persistent connection = 100 connections
- 100 users × <100ms latency = excellent UX
- Events only when needed (1-10 messages/min total)

**Load reduction: ~99%**

### Memory Usage

**Per Connection:**
- WebSocket: ~4KB RAM
- 100 connections: ~400KB RAM
- 1,000 connections: ~4MB RAM

**Negligible overhead for expected scale (<10,000 users)**

### Scalability

**Single Instance Limits:**
- FastAPI can handle 10,000+ concurrent WebSockets
- PostgreSQL easily handles notification queries

**When to Scale:**
- If you exceed 5,000 concurrent connections
- If you need multi-region deployment
- If you add more real-time features

**Future Scaling (if needed):**
- Add Redis Pub/Sub for multi-instance WebSocket
- Use sticky sessions (nginx ip_hash)
- Consider dedicated notification service

---

## Testing Plan

### Unit Tests

**Backend:**
- `NotificationConnectionManager.connect()` - Connection registration
- `NotificationConnectionManager.send_to_user()` - Message delivery
- `NotificationConnectionManager.disconnect()` - Cleanup
- JWT validation in WebSocket endpoint

**Frontend:**
- `useNotifications` hook - Connection lifecycle
- Event handler routing
- Reconnection logic

### Integration Tests

**End-to-End Flows:**
1. User A sends friend request → User B receives notification
2. User B accepts → User A receives notification
3. DM invites player → Player receives notification
4. Player accepts campaign → DM receives notification
5. DM starts game → All players receive notification

**Edge Cases:**
- User offline during notification (should see on reconnect via polling fallback)
- Multiple tabs open (all receive notifications)
- WebSocket disconnects mid-action (reconnect and sync)
- Invalid JWT (connection rejected)

### Load Tests

**Scenarios:**
- 100 concurrent connections
- 1,000 notifications/second
- Connection churn (rapid connect/disconnect)
- Multi-tab simulation

---

## Rollback Plan

If issues arise:

1. **Keep polling code** - Don't delete, just disable
2. **Feature flag** - Environment variable `ENABLE_WEBSOCKET_NOTIFICATIONS=true`
3. **Graceful degradation** - Fall back to polling if WebSocket fails
4. **Monitoring** - Alert on connection failures, authentication errors

**Quick rollback:**
```javascript
// In dashboard/page.js
const ENABLE_WEBSOCKET = process.env.NEXT_PUBLIC_ENABLE_WEBSOCKET === 'true'

if (ENABLE_WEBSOCKET) {
  useNotifications(user?.id, notificationHandlers)
} else {
  // Use existing polling
  useEffect(() => { ... }, [activeSection])
}
```

---

## Complete End-to-End Data Flow Example

### Scenario: User A sends friend request to User B

```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: User A initiates action (Frontend)                      │
└─────────────────────────────────────────────────────────────────┘

User A Browser:
  onClick={() => {
    fetch('/api/friends/request', {
      method: 'POST',
      body: JSON.stringify({ recipient_identifier: 'user-b-code' }),
      credentials: 'include'  // JWT cookie
    })
  }}

┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: HTTP endpoint executes command (Backend)                │
└─────────────────────────────────────────────────────────────────┘

api-site/modules/friendship/api/endpoints.py:
  @router.post("/request")
  async def send_friend_request(
      request: SendFriendRequestSchema,
      current_user: UserAggregate = Depends(get_current_user_from_token),
      friend_repo: FriendRequestRepository = Depends(...),
      event_manager: EventManager = Depends(get_event_manager)  # NEW
  ):
      # Execute domain command
      command = SendFriendRequest(friend_repo)
      friend_request = command.execute(current_user.id, request.recipient_identifier)

      # AFTER PostgreSQL commit, broadcast event
      event_config = FriendshipEvents.friend_request_received(
          recipient_id=friend_request.recipient_id,
          requester=current_user
      )
      await event_manager.broadcast(**event_config)

      return friend_request_response

┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: EventManager broadcasts to WebSocket (Backend)          │
└─────────────────────────────────────────────────────────────────┘

modules/events/event_manager.py:
  async def broadcast(self, user_id, event_type, data, show_toast, save_notification):
      message = {
          "event_type": event_type,
          "data": data,
          "show_toast": show_toast,
          "timestamp": datetime.utcnow().isoformat()
      }

      # 1. Send to WebSocket (if user online)
      await self.websocket_manager.send_to_user(user_id, message)

      # 2. Save to notifications table (if flagged)
      if save_notification:
          await self.notification_repo.create(
              user_id=user_id,
              event_type=event_type,
              data=data,
              read=False
          )

┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: User B receives WebSocket message (Frontend)            │
└─────────────────────────────────────────────────────────────────┘

User B Browser (useEvents hook already connected):
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data)
    // {
    //   event_type: "friend_request_received",
    //   data: {requester_id: "...", requester_screen_name: "User A"},
    //   show_toast: true,
    //   timestamp: "..."
    // }

    // Route to handler
    eventHandlers[message.event_type](message)
  }

  eventHandlers['friend_request_received'] = (message) => {
    // 1. Update state (triggers re-fetch)
    setRefreshTrigger(prev => prev + 1)

    // 2. Show toast
    if (message.show_toast) {
      showToast({
        type: 'info',
        message: `Friend request from ${message.data.requester_screen_name}`
      })
    }
  }

┌─────────────────────────────────────────────────────────────────┐
│ RESULT: User B sees friend request instantly                    │
└─────────────────────────────────────────────────────────────────┘

- State updated via refreshTrigger → FriendsManager re-fetches → shows pending request
- Toast notification appears in top-right corner
- Notification saved in database for history view
```

### Key Takeaways from Flow

1. **HTTP is source of truth** - WebSocket never modifies state
2. **Event broadcast happens AFTER database commit** - no race conditions
3. **Frontend receives one message** - single handler updates state + shows toast
4. **Persistence is transparent to frontend** - backend handles saving to notifications table
5. **If user offline** - notification persisted, sent on next login

---

## Database Schema for Notifications

### New Table: notifications

```sql
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    data JSONB NOT NULL,
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_notifications_user_id (user_id),
    INDEX idx_notifications_unread (user_id, read, created_at),
    INDEX idx_notifications_created (created_at)
);
```

**Fields:**
- `id`: Unique notification identifier
- `user_id`: Who this notification is for
- `event_type`: Type of notification (friend_request_received, etc.)
- `data`: JSON payload with event details
- `read`: Whether user has seen this notification
- `created_at`: Timestamp for ordering

**Usage:**
- When user offline: Store notification in database
- When user connects: Send unread notifications via WebSocket
- Dashboard shows unread count badge
- User can mark notifications as read
- Auto-cleanup old read notifications (30 days)

### Alembic Migration

**New File**: `/api-site/alembic/versions/XXXXX_add_notifications_table.py`

```python
def upgrade():
    op.create_table(
        'notifications',
        sa.Column('id', postgresql.UUID(), nullable=False),
        sa.Column('user_id', postgresql.UUID(), nullable=False),
        sa.Column('event_type', sa.String(100), nullable=False),
        sa.Column('data', postgresql.JSONB(), nullable=False),
        sa.Column('read', sa.Boolean(), server_default='false'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_index('idx_notifications_user_id', 'notifications', ['user_id'])
    op.create_index('idx_notifications_unread', 'notifications', ['user_id', 'read', 'created_at'])
    op.create_index('idx_notifications_created', 'notifications', ['created_at'])

def downgrade():
    op.drop_index('idx_notifications_created')
    op.drop_index('idx_notifications_unread')
    op.drop_index('idx_notifications_user_id')
    op.drop_table('notifications')
```

---

## User Decisions

1. **api-game WebSocket Security**: Defer to separate task
   - Focus on notification WebSocket implementation
   - Create separate security task for api-game auth fix

2. **Toast Notifications**: Include in initial implementation
   - Build NotificationToast component from the start
   - Better UX with visual feedback

3. **Offline Notifications**: Store in database
   - Create notifications table to persist missed events
   - Show unread count on dashboard load
   - Allows notification history and "mark as read" features

4. **WebSocket Authentication**: Token via first message
   - More secure (token not in URL)
   - Requires handshake timeout logic
   - Better for production security posture

---

## Pre-Implementation Checklist

Before starting implementation, verify these decisions are documented:

- [x] Module named `modules/events` (not "notifications")
- [x] WebSocket endpoint at `/ws/events` (api-site, not api-game)
- [x] Event messages have `show_toast` flag (frontend conditionally shows)
- [x] Event messages have `save_notification` flag (backend conditionally persists)
- [x] Domain events defined per-aggregate (e.g., FriendshipEvents.friend_request_received)
- [x] EventManager handles both WebSocket + persistence
- [x] Frontend: Single handler per event type (updates state + optional toast)
- [x] WebSocket auth: Token via first message (5 second timeout)
- [x] User initialization: WebSocket uses GetUserByEmail (read-only, no create)
- [x] NGINX routing: `/ws/events` before `/ws/` (specific wins)
- [x] Notifications table schema defined
- [x] Notification history UI included in scope
- [x] Toast component included in scope
- [x] End-to-end data flow documented

## Anti-Patterns to Avoid

**Don't:**
- ❌ Send WebSocket messages before database commit (race condition)
- ❌ Use WebSocket to modify state (HTTP only)
- ❌ Create separate "notification" and "state update" handlers (one handler does both)
- ❌ Put event config in global config file (use domain event classes)
- ❌ Use GetOrCreateUser in WebSocket endpoint (race condition)
- ❌ Route `/ws/events` to api-game (goes to api-site)
- ❌ Call it "notifications module" (it's "events module")

**Do:**
- ✅ Broadcast events AFTER PostgreSQL commit
- ✅ Use HTTP for all state changes
- ✅ Single event handler updates state + shows toast conditionally
- ✅ Define events in domain layer (per aggregate)
- ✅ Use GetUserByEmail in WebSocket (read-only)
- ✅ Route `/ws/events` to api-site before `/ws/` catch-all
- ✅ Call it "events module" or "event system"

---

## Success Metrics

### Technical

- WebSocket connection success rate: >99%
- Event delivery latency: <100ms
- Server load reduction: >90% (from eliminating polling)
- Memory usage: <10MB for 1,000 users

### User Experience

- Time to see notification: <1 second (vs 0-5 seconds polling)
- User reports: "feels instant"
- Reduced "refresh to see updates" complaints

### Business

- Increased engagement (faster notifications = more interaction)
- Reduced server costs (99% fewer requests)
- Foundation for future real-time features

---

## Next Steps

1. **Security Decision**: Fix api-game WebSocket auth now or defer?
2. **UI Decision**: Include toast notifications in Phase 1 or defer to Phase 5?
3. **Offline Notifications**: Store in database or rely on polling fallback?
4. **Timeline**: Proceed with implementation or need more clarification?
