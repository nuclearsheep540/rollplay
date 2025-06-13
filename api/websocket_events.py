import time

from fastapi import WebSocket
from connection_manager import ConnectionManager
from message_templates import format_message, MESSAGE_TEMPLATES
from adventure_log_service import AdventureLogService
from models.log_type import LogType


adventure_log = AdventureLogService()

# Helper function to add log entries
def add_adventure_log(room_id: str, message: str, log_type: LogType, player_name: str = None, prompt_id: str = None):
    """Helper function to add log entries with your default settings"""
    try:
        # Convert LogType enum to string value for the service
        log_type_value = log_type.value if isinstance(log_type, LogType) else log_type
        
        return adventure_log.add_log_entry(
            room_id=room_id,
            message=message,
            log_type=log_type_value,
            player_name=player_name,
            max_logs=200,
            prompt_id=prompt_id
        )
    except Exception as e:
        print(f"Failed to add adventure log: {e}")
        return None


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
    # Normalize player name to lowercase for consistent identification
        player_name = player_name.lower()
        await manager.connect(websocket, client_id, player_name)

        # Log player connection to database
        log_message = format_message(MESSAGE_TEMPLATES["player_connected"], player=player_name)
        
        add_adventure_log(
            room_id=client_id,
            message=log_message,
            log_type=LogType.SYSTEM,
            player_name=player_name
        )
        
        return {
            "event_type": "player_connected", 
            "data": {
                "connected_player": player_name
            }
        }

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

        return {
            "event_type": "seat_change",
            "data": seat_layout,
            "player_name": player_name_from_event
        }


    @staticmethod
    async def dice_prompt(websocket, data, event_data, player_name, client_id, manager):
        prompted_player = event_data.get("prompted_player")
        roll_type = event_data.get("roll_type")
        prompted_by = event_data.get("prompted_by", player_name)
        prompt_id = event_data.get("prompt_id")  # New: Get prompt ID
        
        # Log the prompt to adventure log with prompt_id for later removal
        log_message = format_message(MESSAGE_TEMPLATES["dice_prompt"], target=prompted_player, roll_type=roll_type)
        
        add_adventure_log(
            room_id=client_id,
            message=log_message,
            log_type=LogType.DUNGEON_MASTER,
            player_name=prompted_by,
            prompt_id=prompt_id
        )
        
        print(f"🎲 {prompted_by} prompted {prompted_player} to roll {roll_type} (prompt_id: {prompt_id})")
        
        return {
            "event_type": "dice_prompt",
            "data": {
                "prompted_player": prompted_player,
                "roll_type": roll_type,
                "prompted_by": prompted_by,
                "prompt_id": prompt_id,  # Include prompt ID in broadcast
                "log_message": log_message  # Include the formatted log message
            }
        }
    
    @staticmethod
    async def initiative_prompt_all(websocket, data, event_data, player_name, client_id, manager):
        players_to_prompt = event_data.get("players", [])
        prompted_by = event_data.get("prompted_by", player_name)
                
        # Generate unique initiative prompt ID for potential removal
        initiative_prompt_id = f"initiative_all_{int(time.time() * 1000)}"
        
        # Log ONE adventure log entry for the collective action
        log_message = format_message(MESSAGE_TEMPLATES["initiative_prompt"], players=", ".join(players_to_prompt))
        
        add_adventure_log(
            room_id=client_id,
            message=log_message,
            log_type=LogType.DUNGEON_MASTER,
            player_name=prompted_by,
            prompt_id=initiative_prompt_id
        )
        
        print(f"⚡ {prompted_by} prompted all players for initiative: {', '.join(players_to_prompt)}")
        # Single broadcast with player list - clients check if they're in the list
        return {
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
        
        return {
            "event_type": "dice_prompt_clear",
            "data": {
                "cleared_by": cleared_by,
                "clear_all": clear_all,  # New: Include clear_all flag
                "prompt_id": prompt_id   # New: Include specific prompt ID if provided
            }
        }