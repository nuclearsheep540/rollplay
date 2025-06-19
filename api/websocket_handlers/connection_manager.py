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

    async def remove_player_from_party(self, room_id: str, player_name: str):
        """Remove a player from party and move them to lobby"""
        if room_id in self.room_users and player_name in self.room_users[room_id]:
            self.room_users[room_id][player_name]["is_in_party"] = False
            print(f"🚪 Moved {player_name} from party to lobby in room {room_id}")
            # Broadcast lobby update after status change
            await self.broadcast_lobby_update(room_id)

    async def send_to_player(self, room_id: str, player_name: str, message: dict):
        """Send a message to a specific player"""
        if (room_id in self.room_users and 
            player_name in self.room_users[room_id] and 
            self.room_users[room_id][player_name]["websocket"]):
            
            websocket = self.room_users[room_id][player_name]["websocket"]
            try:
                await websocket.send_json(data=message)
            except Exception:
                # Connection is dead, remove it
                self.remove_connection(websocket, room_id, player_name)

    async def broadcast_to_room(self, room_id: str, message: dict):
        """Broadcast a message to all players in a room"""
        await self.update_data_for_room(room_id, message)

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

    async def _broadcast_globally(self, data):
        """PRIVATE: Send data to all connected clients across all rooms
        
        WARNING: This broadcasts to ALL clients regardless of room.
        Only use for server-wide events like maintenance announcements.
        For normal game events, use RoomManager.broadcast() instead.
        """
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

class RoomManager:
    """
    Room-scoped manager that ensures all broadcasts stay within a specific room.
    This is the preferred way to handle WebSocket events - it prevents accidental
    cross-room message leakage.
    """
    def __init__(self, connection_manager: ConnectionManager, room_id: str):
        self.connection_manager = connection_manager
        self.room_id = room_id
    
    async def broadcast(self, data):
        """Broadcast data to all clients in this room only"""
        await self.connection_manager.update_data_for_room(self.room_id, data)
    
    async def send_to_player(self, player_name: str, message: dict):
        """Send message to a specific player in this room"""
        await self.connection_manager.send_to_player(self.room_id, player_name, message)
    
    async def broadcast_lobby_update(self):
        """Send lobby update to all clients in this room"""
        await self.connection_manager.broadcast_lobby_update(self.room_id)
    
    async def remove_player_from_party(self, player_name: str):
        """Remove a player from party and move them to lobby in this room"""
        await self.connection_manager.remove_player_from_party(self.room_id, player_name)
    
    def update_party_status(self, player_name: str, is_in_party: bool):
        """Update whether a player is in the party or lobby in this room"""
        self.connection_manager.update_party_status(self.room_id, player_name, is_in_party)


# Create manager instance to be imported by other modules
manager = ConnectionManager()