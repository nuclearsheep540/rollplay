# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later
import time
from typing import Optional, Dict, Any

from fastapi import WebSocket
from .connection_manager import ConnectionManager
from message_templates import format_message, MESSAGE_TEMPLATES
from adventure_log_service import AdventureLogService
from models.log_type import LogType


adventure_log = AdventureLogService()


class WebsocketEventResult:
    """Result object for WebSocket event handlers"""
    
    def __init__(self, broadcast_message: Dict[str, Any], 
                 log_removal_message: Optional[Dict[str, Any]] = None,
                 clear_prompt_message: Optional[Dict[str, Any]] = None):
        self.broadcast_message = broadcast_message
        self.log_removal_message = log_removal_message
        self.clear_prompt_message = clear_prompt_message




class WebsocketEvent():
    """
    Collection of business logic to be performed against specific events
    """
    websocket: WebSocket
    data: dict
    event_data: dict
    player_name: str
    client_id: str
    manager: ConnectionManager

    @staticmethod
    async def player_connection(websocket, data, event_data, player_name, client_id, manager):
        # Note: manager.connect() is already called in app_websocket.py
        # This event just handles the logging and broadcast

        # Log player connection to database
        log_message = format_message(MESSAGE_TEMPLATES["player_connected"], player=player_name)
        
        adventure_log.add_log_entry(
            room_id=client_id,
            message=log_message,
            log_type=LogType.SYSTEM,
            player_name=player_name
        )
        
        broadcast_message = {
            "event_type": "player_connected", 
            "data": {
                "connected_player": player_name
            }
        }
        
        return WebsocketEventResult(broadcast_message=broadcast_message)

    @staticmethod
    async def seat_change(websocket, data, event_data, player_name, client_id, manager):
        # Existing seat change logic...
        seat_layout = data.get("data")
        player_name_from_event = data.get("player_name", player_name)

        print(f"📡 Broadcasting seat layout change for room {client_id}: {seat_layout}")

        # Update party status for all users based on seat layout
        for user_name in manager.room_users.get(client_id, {}):
            is_in_party = user_name in seat_layout
            manager.update_party_status(client_id, user_name, is_in_party)

        broadcast_message = {
            "event_type": "seat_change",
            "data": seat_layout,
            "player_name": player_name_from_event
        }
        
        return WebsocketEventResult(broadcast_message=broadcast_message)

    @staticmethod
    async def dice_prompt(websocket, data, event_data, player_name, client_id, manager):
        prompted_player = event_data.get("prompted_player")
        roll_type = event_data.get("roll_type")
        prompted_by = event_data.get("prompted_by", player_name)
        prompt_id = event_data.get("prompt_id")  # New: Get prompt ID
        
        # Log the prompt to adventure log with prompt_id for later removal
        log_message = format_message(MESSAGE_TEMPLATES["dice_prompt"], target=prompted_player, roll_type=roll_type)
        
        adventure_log.add_log_entry(
            room_id=client_id,
            message=log_message,
            log_type=LogType.DUNGEON_MASTER,
            player_name=prompted_by,
            prompt_id=prompt_id
        )
        
        print(f"🎲 {prompted_by} prompted {prompted_player} to roll {roll_type} (prompt_id: {prompt_id})")
        
        broadcast_message = {
            "event_type": "dice_prompt",
            "data": {
                "prompted_player": prompted_player,
                "roll_type": roll_type,
                "prompted_by": prompted_by,
                "prompt_id": prompt_id,  # Include prompt ID in broadcast
                "log_message": log_message  # Include the formatted log message
            }
        }
        
        return WebsocketEventResult(broadcast_message=broadcast_message)
    
    @staticmethod
    async def initiative_prompt_all(websocket, data, event_data, player_name, client_id, manager):
        players_to_prompt = event_data.get("players", [])
        prompted_by = event_data.get("prompted_by", player_name)
                
        # Generate unique initiative prompt ID for potential removal
        initiative_prompt_id = f"initiative_all_{int(time.time() * 1000)}"
        
        # Log ONE adventure log entry for the collective action
        log_message = format_message(MESSAGE_TEMPLATES["initiative_prompt"], players=", ".join(players_to_prompt))
        
        adventure_log.add_log_entry(
            room_id=client_id,
            message=log_message,
            log_type=LogType.DUNGEON_MASTER,
            player_name=prompted_by,
            prompt_id=initiative_prompt_id
        )
        
        print(f"⚡ {prompted_by} prompted all players for initiative: {', '.join(players_to_prompt)}")
        
        # Single broadcast with player list - clients check if they're in the list
        broadcast_message = {
            "event_type": "initiative_prompt_all",
            "data": {
                "players_to_prompt": players_to_prompt,
                "roll_type": "Initiative",
                "prompted_by": prompted_by,
                "prompt_id": initiative_prompt_id,  # Use the same ID for tracking
                "initiative_prompt_id": initiative_prompt_id,  # Add specific field for frontend tracking
                "log_message": log_message  # Include the formatted log message
            }
        }
        
        return WebsocketEventResult(broadcast_message=broadcast_message)

    @staticmethod
    async def dice_prompt_clear(websocket, data, event_data, player_name, client_id, manager):
        cleared_by = event_data.get("cleared_by", player_name)
        clear_all = event_data.get("clear_all", False)  # New: Support clearing all prompts
        prompt_id = event_data.get("prompt_id")  # New: Support clearing specific prompt by ID
        initiative_prompt_id = event_data.get("initiative_prompt_id")  # New: Initiative prompt ID for clear all
        
        # Remove adventure log entries for cancelled prompts
        log_removal_message = None
        if prompt_id:
            # Remove specific prompt log entry
            try:
                deleted_count = adventure_log.remove_log_by_prompt_id(client_id, prompt_id)
                if deleted_count > 0:
                    print(f"🗑️ Removed adventure log entry for cancelled prompt {prompt_id}")
                    
                    # Prepare log removal message
                    log_removal_message = {
                        "event_type": "adventure_log_removed",
                        "data": {
                            "prompt_id": prompt_id,
                            "removed_by": cleared_by
                        }
                    }
            except Exception as e:
                print(f"❌ Failed to remove adventure log for cancelled prompt {prompt_id}: {e}")
        elif clear_all and initiative_prompt_id:
            # Remove initiative prompt log entry when clearing all
            try:
                deleted_count = adventure_log.remove_log_by_prompt_id(client_id, initiative_prompt_id)
                if deleted_count > 0:
                    print(f"🗑️ Removed initiative prompt log entry {initiative_prompt_id}")
                    
                    # Prepare log removal message
                    log_removal_message = {
                        "event_type": "adventure_log_removed",
                        "data": {
                            "prompt_id": initiative_prompt_id,
                            "removed_by": cleared_by
                        }
                    }
            except Exception as e:
                print(f"❌ Failed to remove initiative prompt log {initiative_prompt_id}: {e}")
        
        if clear_all:
            print(f"🎲 {cleared_by} cleared all dice prompts")
        elif prompt_id:
            print(f"🎲 {cleared_by} cleared dice prompt {prompt_id}")
        else:
            print(f"🎲 {cleared_by} cleared dice prompt")
        
        broadcast_message = {
            "event_type": "dice_prompt_clear",
            "data": {
                "cleared_by": cleared_by,
                "clear_all": clear_all,  # New: Include clear_all flag
                "prompt_id": prompt_id   # New: Include specific prompt ID if provided
            }
        }
        
        return WebsocketEventResult(broadcast_message=broadcast_message, log_removal_message=log_removal_message)

    @staticmethod
    async def dice_roll(websocket, data, event_data, player_name, client_id, manager):
        """Handle dice roll event - includes auto-clearing prompts"""
        roll_data = event_data
        player = roll_data.get("player")
        formatted_message = roll_data.get("message")  # Pre-formatted by frontend
        prompt_id = roll_data.get("prompt_id")
        
        adventure_log.add_log_entry(
            room_id=client_id,
            message=formatted_message,
            log_type=LogType.PLAYER_ROLL, 
            player_name=player
        )
        
        if prompt_id:
            print(f"🎲 {formatted_message} (completing prompt {prompt_id})")
        else:
            print(f"🎲 {formatted_message}")
        
        broadcast_message = {
            "event_type": "dice_roll",
            "data": {
                **event_data  # Frontend sends everything we need
            }
        }
        
        # Auto-clear prompt if this was a prompted roll (has prompt_id or player)
        clear_prompt_message = None
        log_removal_message = None
        if prompt_id:
            # Remove the adventure log entry for this prompt
            try:
                deleted_count = adventure_log.remove_log_by_prompt_id(client_id, prompt_id)
                if deleted_count > 0:
                    print(f"🗑️ Removed adventure log entry for completed prompt {prompt_id}")
                    
                    # Prepare log removal message to send after dice roll
                    log_removal_message = {
                        "event_type": "adventure_log_removed",
                        "data": {
                            "prompt_id": prompt_id,
                            "removed_by": "system"
                        }
                    }
            except Exception as e:
                print(f"❌ Failed to remove adventure log for prompt {prompt_id}: {e}")
            
            clear_prompt_message = {
                "event_type": "dice_prompt_clear",
                "data": {
                    "cleared_by": "system",
                    "auto_cleared": True,
                    "prompt_id": prompt_id  # Clear specific prompt by ID
                }
            }
        elif player:
            # For initiative prompts, clear by player name since we might not have exact prompt_id
            clear_prompt_message = {
                "event_type": "dice_prompt_clear",
                "data": {
                    "cleared_by": "system", 
                    "auto_cleared": True,
                    "cleared_player": player  # Clear prompts for this player
                }
            }
        
        return WebsocketEventResult(
            broadcast_message=broadcast_message,
            log_removal_message=log_removal_message,
            clear_prompt_message=clear_prompt_message
        )

    @staticmethod
    async def combat_state(websocket, data, event_data, player_name, client_id, manager):
        """Handle combat state changes"""
        combat_active = event_data.get("combatActive", False)
        action = "started" if combat_active else "ended"
        
        template_key = "combat_started" if action == "started" else "combat_ended"
        log_message = format_message(MESSAGE_TEMPLATES[template_key], player=player_name)
        
        adventure_log.add_log_entry(
            room_id=client_id,
            message=log_message,
            log_type=LogType.SYSTEM,
            player_name=player_name
        )
        
        broadcast_message = {
            "event_type": "combat_state",
            "data": event_data
        }
        
        return WebsocketEventResult(broadcast_message=broadcast_message)

    @staticmethod
    async def seat_count_change(websocket, data, event_data, player_name, client_id, manager):
        """Handle seat count changes"""
        broadcast_message = {
            "event_type": "seat_count_change",
            "data": event_data,
            "player_name": player_name
        }
        
        return WebsocketEventResult(broadcast_message=broadcast_message)

    @staticmethod
    async def player_kicked(websocket, data, event_data, player_name, client_id, manager):
        """Handle player kicked events"""
        kicked_player = event_data.get("kicked_player")
        
        log_message = format_message(MESSAGE_TEMPLATES["player_kicked"], player=kicked_player)
        
        adventure_log.add_log_entry(
            room_id=client_id,
            message=log_message,
            log_type=LogType.SYSTEM,
            player_name=player_name
        )
        
        broadcast_message = {
            "event_type": "player_kicked",
            "data": event_data,
            "player_name": player_name
        }
        
        return WebsocketEventResult(broadcast_message=broadcast_message)

    @staticmethod
    async def clear_system_messages(websocket, data, event_data, player_name, client_id, manager):
        """Handle clearing system messages"""
        cleared_by = event_data.get("cleared_by", player_name)
        
        try:
            deleted_count = adventure_log.clear_system_messages(client_id)
            
            log_message = format_message(MESSAGE_TEMPLATES["messages_cleared"], player=cleared_by, count=deleted_count)
            
            adventure_log.add_log_entry(
                room_id=client_id,
                message=log_message,
                log_type=LogType.SYSTEM,
                player_name=cleared_by
            )
            
            print(f"🧹 {cleared_by} cleared {deleted_count} system messages from room {client_id}")
            
            broadcast_message = {
                "event_type": "system_messages_cleared",
                "data": {
                    "deleted_count": deleted_count,
                    "cleared_by": cleared_by
                }
            }
            
            return WebsocketEventResult(broadcast_message=broadcast_message)
            
        except Exception as e:
            error_msg = f"Failed to clear system messages: {str(e)}"
            print(f"❌ {error_msg}")
            
            error_message = {
                "event_type": "error",
                "data": error_msg
            }
            return WebsocketEventResult(broadcast_message=error_message)

    @staticmethod
    async def clear_all_messages(websocket, data, event_data, player_name, client_id, manager):
        """Handle clearing all messages"""
        cleared_by = event_data.get("cleared_by", player_name)
        
        try:
            deleted_count = adventure_log.clear_all_messages(client_id)
            
            log_message = format_message(MESSAGE_TEMPLATES["messages_cleared"], player=cleared_by, count=deleted_count)
            
            adventure_log.add_log_entry(
                room_id=client_id,
                message=log_message,
                log_type=LogType.SYSTEM,
                player_name=cleared_by
            )
            
            print(f"🧹 {cleared_by} cleared {deleted_count} total messages from room {client_id}")
            
            broadcast_message = {
                "event_type": "all_messages_cleared",
                "data": {
                    "deleted_count": deleted_count,
                    "cleared_by": cleared_by
                }
            }
            
            return WebsocketEventResult(broadcast_message=broadcast_message)
            
        except Exception as e:
            error_msg = f"Failed to clear all messages: {str(e)}"
            print(f"❌ {error_msg}")
            
            error_message = {
                "event_type": "error",
                "data": error_msg
            }
            return WebsocketEventResult(broadcast_message=error_message)

    @staticmethod
    async def color_change(websocket, data, event_data, player_name, client_id, manager):
        """Handle player color changes"""
        from gameservice import GameService
        
        player_changing = event_data.get("player")
        seat_index = event_data.get("seat_index")
        new_color = event_data.get("new_color")
        changed_by = event_data.get("changed_by", player_name)
        
        if not all([player_changing, seat_index is not None, new_color]):
            error_message = {
                "event_type": "error",
                "data": "Color change requires player, seat_index, and new_color"
            }
            return WebsocketEventResult(broadcast_message=error_message)
        
        try:
            # Get current seat colors
            current_colors = GameService.get_seat_colors(client_id)
            
            # Update the specific seat color
            current_colors[str(seat_index)] = new_color
            
            # Persist to database
            GameService.update_seat_colors(client_id, current_colors)
            
            print(f"🎨 {changed_by} changed {player_changing}'s color (seat {seat_index}) to {new_color}")
            
            broadcast_message = {
                "event_type": "color_change",
                "data": {
                    "player": player_changing,
                    "seat_index": seat_index,
                    "new_color": new_color,
                    "changed_by": changed_by
                }
            }
            
            return WebsocketEventResult(broadcast_message=broadcast_message)
            
        except Exception as e:
            error_msg = f"Failed to update seat color: {str(e)}"
            print(f"❌ {error_msg}")
            
            error_message = {
                "event_type": "error",
                "data": error_msg
            }
            return WebsocketEventResult(broadcast_message=error_message)

    @staticmethod
    async def player_disconnect(websocket, data, event_data, player_name, client_id, manager):
        """Handle player disconnect event"""
        from gameservice import GameService
        
        # Log player disconnection to database
        log_message = format_message(MESSAGE_TEMPLATES["player_disconnected"], player=player_name)
        
        adventure_log.add_log_entry(
            room_id=client_id,
            message=log_message,
            log_type=LogType.SYSTEM,
            player_name=player_name
        )
        
        manager.remove_connection(websocket, client_id, player_name)
        
        # Clean up disconnected player's seat
        current_seats = GameService.get_seat_layout(client_id)
        
        # Remove disconnected player from their seat (case-insensitive)
        updated_seats = []
        for seat in current_seats:
            if seat.lower() == player_name.lower():
                updated_seats.append("empty")
            else:
                updated_seats.append(seat)
        
        # Update seat layout in database
        GameService.update_seat_layout(client_id, updated_seats)
        
        # Broadcast player disconnection event
        disconnect_message = {
            "event_type": "player_disconnected", 
            "data": {
                "disconnected_player": player_name
            }
        }
        
        # Broadcast updated seat layout to all remaining clients
        seat_change_message = {
            "event_type": "seat_change",
            "data": updated_seats
        }
        
        return WebsocketEventResult(
            broadcast_message=disconnect_message,
            clear_prompt_message=seat_change_message  # Reuse this field for the seat update
        )

    @staticmethod 
    async def role_change(websocket, data, event_data, player_name, client_id, manager):
        """Handle role changes (moderator/DM assignments)"""
        from gameservice import GameService
        
        action = event_data.get("action")  # 'add_moderator', 'remove_moderator', 'set_dm', 'unset_dm'
        target_player = event_data.get("target_player")
        
        if not action or not target_player:
            print(f"❌ Invalid role change request: action={action}, target_player={target_player}")
            return WebsocketEventResult(broadcast_message={})
        
        print(f"🎭 Role change: {action} for {target_player} by {player_name}")
        
        # Create log message based on action
        log_messages = {
            "add_moderator": f"{target_player} has been promoted to moderator by {player_name}",
            "remove_moderator": f"{target_player} has been removed as moderator by {player_name}",
            "set_dm": f"{target_player} has been set as Dungeon Master by {player_name}",
            "unset_dm": f"Dungeon Master role has been removed by {player_name}"
        }
        
        log_message = log_messages.get(action, f"Role change: {action} for {target_player}")
        
        # Add to adventure log
        adventure_log.add_log_entry(
            room_id=client_id,
            message=log_message,
            log_type=LogType.SYSTEM,
            player_name=player_name
        )
        
        # Broadcast role change to all clients
        role_change_message = {
            "event_type": "role_change",
            "data": {
                "action": action,
                "target_player": target_player,
                "changed_by": player_name,
                "message": log_message
            }
        }
        
        return WebsocketEventResult(broadcast_message=role_change_message)