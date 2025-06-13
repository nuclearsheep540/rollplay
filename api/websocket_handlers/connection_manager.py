# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later
from fastapi import WebSocket

class ConnectionManager:
    """
    Manages the connect and disconnect of client websocket connections
    """
    def __init__(self):
        self.connections: list[WebSocket] = []
        self.room_users: dict[str, dict[str, dict]] = {}
        # Track disconnect timeouts
        self.disconnect_timeouts: dict[str, dict[str, any]] = {}

    async def connect(self, websocket: WebSocket, room_id: str, player_name: str):
        await websocket.accept()
        self.connections.append(websocket)
        
        # Initialize room tracking if not exists
        if room_id not in self.room_users:
            self.room_users[room_id] = {}
        
        # Cancel any existing disconnect timeout for this user
        if room_id in self.disconnect_timeouts and player_name in self.disconnect_timeouts[room_id]:
            timeout_handle = self.disconnect_timeouts[room_id][player_name]
            timeout_handle.cancel()
            del self.disconnect_timeouts[room_id][player_name]
        
        # Add user to room tracking
        self.room_users[room_id][player_name] = {
            "websocket": websocket,
            "is_in_party": False,  # Will be updated when they join a seat
            "status": "connected"
        }
        
        # Send lobby update to all clients in this room
        await self.broadcast_lobby_update(room_id)

    def remove_connection(self, websocket: WebSocket, room_id: str = None, player_name: str = None):
        """Remove a disconnected websocket from the connections list"""
        if websocket in self.connections:
            self.connections.remove(websocket)
        
        # Mark user as disconnected but keep in room tracking for 30 seconds
        if room_id and player_name and room_id in self.room_users:
            if player_name in self.room_users[room_id]:
                # Mark as disconnected instead of removing immediately
                self.room_users[room_id][player_name]["status"] = "disconnecting"
                self.room_users[room_id][player_name]["websocket"] = None
                
                # Set up 30-second timeout for complete removal
                self.schedule_user_removal(room_id, player_name)

    def schedule_user_removal(self, room_id: str, player_name: str):
        """Schedule a user for complete removal after 30 seconds"""
        import asyncio
        
        async def remove_user_after_timeout():
            await asyncio.sleep(30)  # 30 seconds
            
            # Only remove if user is still disconnecting (hasn't reconnected)
            if (room_id in self.room_users and 
                player_name in self.room_users[room_id] and 
                self.room_users[room_id][player_name].get("status") == "disconnecting"):
                
                del self.room_users[room_id][player_name]
                print(f"🕒 Removed {player_name} from room {room_id} after 30-second timeout")
                
                # Clean up empty rooms
                if not self.room_users[room_id]:
                    del self.room_users[room_id]
                
                # Send lobby update after removal
                await self.broadcast_lobby_update(room_id)
            else:
                print(f"🔄 {player_name} reconnected before timeout - keeping in room {room_id}")
            
            # Clean up timeout tracking
            if room_id in self.disconnect_timeouts and player_name in self.disconnect_timeouts[room_id]:
                del self.disconnect_timeouts[room_id][player_name]
        
        # Initialize timeout tracking for room if needed
        if room_id not in self.disconnect_timeouts:
            self.disconnect_timeouts[room_id] = {}
        
        # Cancel any existing timeout for this user
        if player_name in self.disconnect_timeouts[room_id]:
            self.disconnect_timeouts[room_id][player_name].cancel()
        
        # Create and store the timeout task
        timeout_task = asyncio.create_task(remove_user_after_timeout())
        self.disconnect_timeouts[room_id][player_name] = timeout_task

    def update_party_status(self, room_id: str, player_name: str, is_in_party: bool):
        """Update whether a player is in the party or lobby"""
        if room_id in self.room_users and player_name in self.room_users[room_id]:
            self.room_users[room_id][player_name]["is_in_party"] = is_in_party

    async def broadcast_lobby_update(self, room_id: str):
        """Send lobby update to all clients in a room"""
        if room_id not in self.room_users:
            return
        
        # Get users who are connected but not in party (including disconnecting users)
        lobby_users = []
        for user_name, user_data in self.room_users[room_id].items():
            if not user_data["is_in_party"]:
                lobby_users.append({
                    "name": user_name,
                    "id": user_name,  # Use name as ID for simplicity
                    "status": user_data.get("status", "connected")
                })
        
        lobby_message = {
            "event_type": "lobby_update",
            "data": {
                "lobby_users": lobby_users
            }
        }
        
        print(f"🏨 Broadcasting lobby update for room {room_id}: {len(lobby_users)} users")
        
        # Send to all connections in this room
        await self.update_data_for_room(room_id, lobby_message)

    async def update_data(self, data):
        """Send data to all connected clients, removing any dead connections"""
        dead_connections = []
        
        for connection in self.connections:
            try:
                await connection.send_json(data=data)
            except Exception:
                # Mark this connection as dead
                dead_connections.append(connection)
        
        # Remove all dead connections
        for dead_connection in dead_connections:
            self.remove_connection(dead_connection)

    async def update_data_for_room(self, room_id: str, data):
        """Send data only to clients in a specific room"""
        if room_id not in self.room_users:
            return
        
        dead_connections = []
        
        for user_name, user_data in self.room_users[room_id].items():
            websocket = user_data["websocket"]
            
            # Skip disconnected users (websocket is None)
            if websocket is None:
                continue
                
            try:
                await websocket.send_json(data=data)
            except Exception:
                # Mark this connection as dead
                dead_connections.append((room_id, user_name, websocket))
        
        # Remove all dead connections
        for room, user, ws in dead_connections:
            self.remove_connection(ws, room, user)

# Create manager instance to be imported by other modules
manager = ConnectionManager()