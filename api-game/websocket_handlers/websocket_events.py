# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later
import time
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

from fastapi import WebSocket
from .connection_manager import ConnectionManager
from message_templates import format_message, MESSAGE_TEMPLATES
from adventure_log_service import AdventureLogService
from models.log_type import LogType
from mapservice import MapService, MapSettings
from imageservice import ImageService, ImageSettings
from gameservice import GameService
from shared_contracts.image import ImageConfig
from shared_contracts.map import MapConfig
from shared_contracts.audio import AudioChannelState, AudioTrackConfig, AudioEffects


adventure_log = AdventureLogService()
map_service = MapService()
image_service = ImageService()


def _merge_preserved_map_fields(incoming: dict, existing: dict) -> Dict[str, Any]:
    """Decide which value to use for the chaperoned (cargo) MapConfig
    fields when handling a runtime event that *carries* map state but
    isn't the owner of those fields.

    Rule: incoming-null means "I have no signal for this field, keep
    what's already there". An owner-style endpoint (PATCH /fog,
    fog_config_update WS event) does NOT use this helper — null there
    is the explicit clear signal.

    Surfaces that should use this helper:
      • map_load        — switching active map; fog/grid are cargo
      • (any future "switch state" event that carries MapConfig)

    Surfaces that should NOT:
      • fog_config_update — fog is the subject; null = clear
      • EndSession ETL    — null = "user cleared this on purpose"
    """
    out: Dict[str, Any] = {}
    for field in ("grid_config", "fog_config", "map_image_config"):
        value = incoming.get(field)
        if value is None:
            value = existing.get(field)  # preserve existing when chaperone is silent
        out[field] = value
    return out


class WebsocketEventResult:
    """Result object for WebSocket event handlers"""

    def __init__(self, broadcast_message: Dict[str, Any],
                 log_removal_message: Optional[Dict[str, Any]] = None,
                 clear_prompt_message: Optional[Dict[str, Any]] = None):
        self.broadcast_message = broadcast_message
        self.log_removal_message = log_removal_message
        self.clear_prompt_message = clear_prompt_message

    @staticmethod
    def error(message: str) -> 'WebsocketEventResult':
        """Create an error result that gets sent back to the sender only"""
        logger.warning(message)
        return WebsocketEventResult(
            broadcast_message={"event_type": "error", "data": {"detail": message}}
        )




class WebsocketEvent():
    """
    Collection of business logic to be performed against specific events
    """
    websocket: WebSocket
    data: dict
    event_data: dict
    user_id: str
    client_id: str
    manager: ConnectionManager
    
    @staticmethod
    def _format_dice_roll_message(roll_data):
        """Format dice roll message on backend (moved from frontend logic)"""
        player = roll_data.get("player", "Unknown")
        dice_notation = roll_data.get("diceNotation", "")
        results = roll_data.get("results", [])
        total = roll_data.get("total", 0)
        modifier = roll_data.get("modifier", 0)
        advantage = roll_data.get("advantage")
        context = roll_data.get("context", "")
        
        # Build the formatted message without player name (UI displays player separately)
        message_parts = []
        
        if context:
            message_parts.append(f"[{context}]: ")
        
        message_parts.append(f"{dice_notation}")
        
        if results:
            results_str = ", ".join(map(str, results))
            message_parts.append(f": [{results_str}]")
        
        if modifier != 0:
            sign = "+" if modifier > 0 else ""
            message_parts.append(f" {sign}{modifier}")
            
        message_parts.append(f" = {total}")
        
        if advantage == "advantage":
            message_parts.append(" (Advantage)")
        elif advantage == "disadvantage":
            message_parts.append(" (Disadvantage)")
            
        return "".join(message_parts)

    @staticmethod
    def _get_player_metadata(room_id: str) -> Dict[str, Any]:
        room = GameService.get_room(room_id) or {}
        player_metadata = room.get("player_metadata", {})
        return player_metadata if isinstance(player_metadata, dict) else {}

    @staticmethod
    def _display_name(room_id: str, user_id: str, player_metadata: Optional[Dict[str, Any]] = None) -> str:
        """Resolve user_id to display name via player_metadata."""
        if not user_id:
            return "Unknown"
        if player_metadata is None:
            player_metadata = WebsocketEvent._get_player_metadata(room_id)
        metadata = player_metadata.get(user_id, {}) if isinstance(player_metadata, dict) else {}
        return metadata.get("player_name") or user_id

    @staticmethod
    def _character_name_for_prompt(room_id: str, user_id: str, player_metadata: Optional[Dict[str, Any]] = None) -> str:
        if not user_id:
            return "Unknown"

        if player_metadata is None:
            player_metadata = WebsocketEvent._get_player_metadata(room_id)

        metadata = player_metadata.get(user_id, {}) if isinstance(player_metadata, dict) else {}
        return metadata.get("character_name") or metadata.get("player_name") or user_id

    @staticmethod
    async def player_connection(websocket, data, event_data, user_id, client_id, manager):
        # Note: manager.connect() is already called in app_websocket.py
        # This event just handles the logging and broadcast

        display_name = WebsocketEvent._display_name(client_id, user_id)

        # Log player connection to database
        log_message = format_message(MESSAGE_TEMPLATES["player_connected"], player=display_name)

        adventure_log.add_log_entry(
            room_id=client_id,
            message=log_message,
            log_type=LogType.SYSTEM,
            from_player=display_name
        )

        broadcast_message = {
            "event_type": "player_connected",
            "data": {
                "connected_user_id": user_id,
                "connected_player": display_name
            }
        }

        return WebsocketEventResult(broadcast_message=broadcast_message)

    @staticmethod
    async def seat_change(websocket, data, event_data, user_id, client_id, manager):
        seat_layout = data.get("data")

        print(f"📡 Broadcasting seat layout change for room {client_id}: {seat_layout}")

        # Update party status for all users based on seat layout
        for uid in manager.room_users.get(client_id, {}):
            is_in_party = uid in seat_layout
            manager.update_party_status(client_id, uid, is_in_party)

        broadcast_message = {
            "event_type": "seat_change",
            "data": seat_layout,
            "user_id": user_id
        }

        return WebsocketEventResult(broadcast_message=broadcast_message)

    @staticmethod
    async def dice_prompt(websocket, data, event_data, user_id, client_id, manager):
        prompted_player = event_data.get("prompted_player")  # user_id of target
        roll_type = event_data.get("roll_type")
        prompted_by = event_data.get("prompted_by", user_id)
        prompt_id = event_data.get("prompt_id")

        player_metadata = WebsocketEvent._get_player_metadata(client_id)
        target_character = WebsocketEvent._character_name_for_prompt(client_id, prompted_player, player_metadata)
        prompted_by_name = WebsocketEvent._display_name(client_id, prompted_by, player_metadata)

        # Log the prompt to adventure log with prompt_id for later removal
        log_message = format_message(MESSAGE_TEMPLATES["dice_prompt"], target=target_character, roll_type=roll_type)

        adventure_log.add_log_entry(
            room_id=client_id,
            message=log_message,
            log_type=LogType.DUNGEON_MASTER,
            from_player=prompted_by_name,
            prompt_id=prompt_id
        )

        print(f"🎲 {prompted_by} prompted {prompted_player} to roll {roll_type} (prompt_id: {prompt_id})")

        broadcast_message = {
            "event_type": "dice_prompt",
            "data": {
                "prompted_player": prompted_player,
                "roll_type": roll_type,
                "prompted_by": prompted_by,
                "prompt_id": prompt_id,
                "log_message": log_message
            }
        }

        return WebsocketEventResult(broadcast_message=broadcast_message)
    
    @staticmethod
    async def initiative_prompt_all(websocket, data, event_data, user_id, client_id, manager):
        players_to_prompt = event_data.get("players", [])  # user_ids
        prompted_by = event_data.get("prompted_by", user_id)
                
        # Generate unique initiative prompt ID for potential removal
        initiative_prompt_id = f"initiative_all_{int(time.time() * 1000)}"

        player_metadata = WebsocketEvent._get_player_metadata(client_id)

        character_targets = [
            WebsocketEvent._character_name_for_prompt(client_id, player, player_metadata)
            for player in players_to_prompt
        ]
        
        # Log ONE adventure log entry for the collective action
        log_message = format_message(MESSAGE_TEMPLATES["initiative_prompt"], players=", ".join(character_targets))
        
        prompted_by_name = WebsocketEvent._display_name(client_id, prompted_by, player_metadata)

        adventure_log.add_log_entry(
            room_id=client_id,
            message=log_message,
            log_type=LogType.DUNGEON_MASTER,
            from_player=prompted_by_name,
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
    async def dice_prompt_clear(websocket, data, event_data, user_id, client_id, manager):
        cleared_by = event_data.get("cleared_by", user_id)
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
    async def dice_roll(websocket, data, event_data, user_id, client_id, manager):
        """Handle dice roll event - includes auto-clearing prompts"""
        roll_data = event_data
        player = roll_data.get("player")
        prompt_id = roll_data.get("prompt_id")
        
        # Format dice roll message on backend (moved from frontend)
        formatted_message = WebsocketEvent._format_dice_roll_message(roll_data)
        
        adventure_log.add_log_entry(
            room_id=client_id,
            message=formatted_message,
            log_type=LogType.PLAYER_ROLL, 
            from_player=player
        )
        
        if prompt_id:
            print(f"🎲 {formatted_message} (completing prompt {prompt_id})")
        else:
            print(f"🎲 {formatted_message}")
        
        broadcast_message = {
            "event_type": "dice_roll",
            "data": {
                "player": player,
                "message": formatted_message,
                "prompt_id": prompt_id,
                **event_data  # Include original data for compatibility
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
    async def combat_state(websocket, data, event_data, user_id, client_id, manager):
        """Handle combat state changes"""
        combat_active = event_data.get("combatActive", False)
        action = "started" if combat_active else "ended"
        display_name = WebsocketEvent._display_name(client_id, user_id)

        template_key = "combat_started" if action == "started" else "combat_ended"
        log_message = format_message(MESSAGE_TEMPLATES[template_key], player=display_name)

        adventure_log.add_log_entry(
            room_id=client_id,
            message=log_message,
            log_type=LogType.SYSTEM,
            from_player=display_name
        )
        
        broadcast_message = {
            "event_type": "combat_state",
            "data": event_data
        }
        
        return WebsocketEventResult(broadcast_message=broadcast_message)

    @staticmethod
    async def seat_count_change(websocket, data, event_data, user_id, client_id, manager):
        """Handle seat count changes"""
        display_name = WebsocketEvent._display_name(client_id, user_id)

        max_players = event_data.get("max_players")
        displaced_players = event_data.get("displaced_players", [])

        log_message = f"Seat count changed to {max_players} by {display_name}"
        if displaced_players:
            displaced_names = [p.get("playerName", p.get("userId", "unknown")) for p in displaced_players]
            log_message += f". Moved to lobby: {', '.join(displaced_names)}"

        adventure_log.add_log_entry(
            room_id=client_id,
            message=log_message,
            log_type=LogType.SYSTEM,
            from_player=display_name
        )

        broadcast_message = {
            "event_type": "seat_count_change",
            "data": event_data,
            "user_id": user_id
        }

        return WebsocketEventResult(broadcast_message=broadcast_message)

    @staticmethod
    async def player_displaced(websocket, data, event_data, user_id, client_id, manager):
        """Handle player displacement events"""
        displaced_player = event_data.get("player_name")
        former_seat = event_data.get("former_seat")
        reason = event_data.get("reason", "unknown")
        
        log_message = f"{displaced_player} was moved to lobby from seat {former_seat + 1} due to {reason}"
        
        adventure_log.add_log_entry(
            room_id=client_id,
            message=log_message,
            log_type=LogType.SYSTEM,
            from_player="System"
        )
        
        # This event is typically sent to individual players, not broadcast
        return WebsocketEventResult(broadcast_message=None)

    @staticmethod
    async def system_message(websocket, data, event_data, user_id, client_id, manager):
        """Handle system messages"""
        message = event_data.get("message")
        
        adventure_log.add_log_entry(
            room_id=client_id,
            message=message,
            log_type=LogType.SYSTEM,
            from_player="System"
        )
        
        broadcast_message = {
            "event_type": "system_message",
            "data": event_data
        }
        
        return WebsocketEventResult(broadcast_message=broadcast_message)

    @staticmethod
    async def player_kicked(websocket, data, event_data, user_id, client_id, manager):
        """Handle player kicked events"""
        kicked_user_id = event_data.get("kicked_player")  # user_id of kicked player
        display_name = WebsocketEvent._display_name(client_id, user_id)
        kicked_name = WebsocketEvent._display_name(client_id, kicked_user_id)

        log_message = format_message(MESSAGE_TEMPLATES["player_kicked"], player=kicked_name)

        adventure_log.add_log_entry(
            room_id=client_id,
            message=log_message,
            log_type=LogType.SYSTEM,
            from_player=display_name
        )

        broadcast_message = {
            "event_type": "player_kicked",
            "data": event_data,
            "user_id": user_id
        }

        return WebsocketEventResult(broadcast_message=broadcast_message)

    @staticmethod
    async def clear_system_messages(websocket, data, event_data, user_id, client_id, manager):
        """Handle clearing system messages"""
        cleared_by = event_data.get("cleared_by", user_id)
        
        try:
            deleted_count = adventure_log.clear_system_messages(client_id)
            
            log_message = format_message(MESSAGE_TEMPLATES["messages_cleared"], player=cleared_by, count=deleted_count)
            
            adventure_log.add_log_entry(
                room_id=client_id,
                message=log_message,
                log_type=LogType.SYSTEM,
                from_player=cleared_by
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
    async def clear_all_messages(websocket, data, event_data, user_id, client_id, manager):
        """Handle clearing all messages"""
        cleared_by = event_data.get("cleared_by", user_id)
        
        try:
            deleted_count = adventure_log.clear_all_messages(client_id)
            
            log_message = format_message(MESSAGE_TEMPLATES["messages_cleared"], player=cleared_by, count=deleted_count)
            
            adventure_log.add_log_entry(
                room_id=client_id,
                message=log_message,
                log_type=LogType.SYSTEM,
                from_player=cleared_by
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
    async def color_change(websocket, data, event_data, user_id, client_id, manager):
        """Handle player color changes"""
        player_changing = event_data.get("player")  # user_id of player whose color is changing
        seat_index = event_data.get("seat_index")
        new_color = event_data.get("new_color")
        changed_by = event_data.get("changed_by", user_id)
        
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
    async def player_disconnect(websocket, data, event_data, user_id, client_id, manager):
        """Handle player disconnect event"""
        display_name = WebsocketEvent._display_name(client_id, user_id)

        # Log player disconnection to database
        log_message = format_message(MESSAGE_TEMPLATES["player_disconnected"], player=display_name)

        adventure_log.add_log_entry(
            room_id=client_id,
            message=log_message,
            log_type=LogType.SYSTEM,
            from_player=display_name
        )

        # Update party status to move disconnecting user to lobby before marking as disconnected
        print(f"🚪 Moving {user_id} from party to lobby on disconnect")
        manager.update_party_status(client_id, user_id, False)

        manager.remove_connection(websocket, client_id, user_id)

        # Try to clean up disconnected user's seat (may fail if room already closed)
        try:
            current_seats = GameService.get_seat_layout(client_id)

            # Remove disconnected user from their seat
            updated_seats = [
                "empty" if seat == user_id else seat
                for seat in current_seats
            ]

            # Update seat layout in database (may fail if room was deleted)
            GameService.update_seat_layout(client_id, updated_seats)

            # Broadcast player disconnection event
            disconnect_message = {
                "event_type": "player_disconnected",
                "data": {
                    "disconnected_user_id": user_id,
                    "disconnected_player": display_name
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
        except Exception as e:
            # Room was likely already closed/deleted - this is fine, just log it
            print(f"⚠️ Could not update seat layout for {user_id} in room {client_id}: {str(e)}")
            print(f"ℹ️ Room may have been closed - graceful disconnect without seat update")

            # Still broadcast disconnect message even if DB update fails
            disconnect_message = {
                "event_type": "player_disconnected",
                "data": {
                    "disconnected_user_id": user_id,
                    "disconnected_player": display_name
                }
            }

            return WebsocketEventResult(
                broadcast_message=disconnect_message,
                clear_prompt_message=None
            )

    @staticmethod
    async def role_change(websocket, data, event_data, user_id, client_id, manager):
        """Handle role changes (moderator/DM assignments)"""
        action = event_data.get("action")  # 'add_moderator', 'remove_moderator', 'set_dm', 'unset_dm'
        target_user_id = event_data.get("target_player")  # user_id of target

        if not action or not target_user_id:
            return WebsocketEventResult.error(f"Invalid role change request: action={action}, target={target_user_id}")

        display_name = WebsocketEvent._display_name(client_id, user_id)
        target_name = WebsocketEvent._display_name(client_id, target_user_id)

        print(f"🎭 Role change: {action} for {target_user_id} by {user_id}")

        # Create log message based on action
        log_messages = {
            "add_moderator": f"{target_name} has been set as moderator by {display_name}",
            "remove_moderator": f"{target_name} has been removed as moderator by {display_name}",
            "set_dm": f"{target_name} has been set as Dungeon Master by {display_name}",
            "unset_dm": f"Dungeon Master role has been removed by {display_name}"
        }

        log_message = log_messages.get(action, f"Role change: {action} for {target_name}")

        # Add to adventure log
        adventure_log.add_log_entry(
            room_id=client_id,
            message=log_message,
            log_type=LogType.SYSTEM,
            from_player=display_name
        )

        # Broadcast role change to all clients
        role_change_message = {
            "event_type": "role_change",
            "data": {
                "action": action,
                "target_player": target_user_id,
                "changed_by": user_id,
                "message": log_message
            }
        }

        return WebsocketEventResult(broadcast_message=role_change_message)

    @staticmethod
    async def remote_audio_play(websocket, data, event_data, user_id, client_id, manager):
        """Handle remote audio play events - DM controls audio for all players"""
        print(f"🎵 Backend received remote_audio_play event from {user_id}: {event_data}")
        triggered_by = event_data.get("triggered_by", user_id)
        
        # Support both single track and multiple tracks (for synchronized playback)
        tracks = event_data.get("tracks")
        if tracks:
            # Multiple tracks for synchronized playback
            if not isinstance(tracks, list) or len(tracks) == 0:
                return WebsocketEventResult.error("Invalid remote audio play request: tracks must be a non-empty array")
            
            # Validate all tracks
            for track in tracks:
                if not track.get("channelId") or not track.get("filename"):
                    return WebsocketEventResult.error(f"Invalid track in synchronized play request: missing channelId or filename")
            
            # Create log message for synchronized playback
            track_descriptions = [f"{track['channelId']} ({track['filename']})" for track in tracks]
            print(log_message)
            
        else:
            # Single track (legacy format)
            track_type = event_data.get("track_type")  # 'bgm', 'sfx' (legacy: 'music', 'ambient')
            audio_file = event_data.get("audio_file")  # 'boss.mp3', 'storm.mp3', etc.
            loop = event_data.get("loop", True)
            volume = event_data.get("volume", 1.0)
            
            if not track_type or not audio_file:
                return WebsocketEventResult.error(f"Invalid remote audio play request: track_type={track_type}, audio_file={audio_file}")
            
            # Convert single track to tracks array format
            tracks = [{
                "channelId": track_type,  # For legacy compatibility
                "filename": audio_file,
                "looping": loop,
                "volume": volume
            }]
            
            print(f"🎵 Remote audio play: {triggered_by} playing {track_type} - {audio_file} (loop: {loop}, volume: {volume})")
        
        
        # Fire-and-forget: persist play state to MongoDB
        try:
            for track in tracks:
                channel_id = track.get("channelId")
                if channel_id:
                    channel_state = AudioChannelState(
                        filename=track.get("filename"),
                        asset_id=track.get("asset_id"),
                        s3_url=track.get("s3_url"),
                        volume=track.get("volume", 0.8),
                        looping=track.get("looping", True),
                        playback_state="playing",
                        started_at=time.time(),
                        paused_elapsed=None,
                    )
                    GameService.update_audio_state(client_id, channel_id, channel_state.model_dump())
            print(f"🎵 Audio play state persisted for {len(tracks)} track(s)")
        except Exception as e:
            print(f"⚠️ Failed to persist audio play state: {e}")

        # Broadcast audio play command to all clients
        audio_play_message = {
            "event_type": "remote_audio_play",
            "data": {
                "tracks": tracks,
                "triggered_by": triggered_by,
                # Keep legacy fields for backward compatibility if single track
                **(event_data if len(tracks) == 1 and not event_data.get("tracks") else {})
            }
        }

        return WebsocketEventResult(broadcast_message=audio_play_message)

    @staticmethod
    async def remote_audio_resume(websocket, data, event_data, user_id, client_id, manager):
        """Handle remote audio resume events - DM resumes paused audio for all players"""
        triggered_by = event_data.get("triggered_by", user_id)
        tracks = event_data.get("tracks")
        track_type = event_data.get("track_type")  # Legacy single track format
        
        # Determine if this is single track or multi-track resume
        if tracks and isinstance(tracks, list):
            # Multi-track resume (synchronized tracks)
            track_descriptions = [f"{track.get('channelId', 'unknown')}" for track in tracks]
            log_message = f"▶️ {triggered_by} resumed synchronized audio: {', '.join(track_descriptions)}"
            print(f"🔗 Remote audio resume (sync): {triggered_by} resuming {len(tracks)} tracks: {', '.join(track_descriptions)}")
        else:
            # Legacy single track resume
            if not track_type:
                return WebsocketEventResult.error("Invalid remote audio resume request: no track_type or tracks provided")
            
            # Convert single track to tracks array format for consistency
            tracks = [{"channelId": track_type}]
            log_message = f"▶️ {triggered_by} resumed {track_type} audio"
            print(f"▶️ Remote audio resume: {triggered_by} resuming {track_type}")
        
        
        # Broadcast audio resume command to all clients
        audio_resume_message = {
            "event_type": "remote_audio_resume",
            "data": {
                "tracks": tracks,
                "triggered_by": triggered_by,
                # Keep legacy field for backward compatibility if single track
                **({"track_type": track_type} if track_type else {})
            }
        }
        
        return WebsocketEventResult(broadcast_message=audio_resume_message)

    @staticmethod
    async def remote_audio_batch(websocket, data, event_data, user_id, client_id, manager):
        """Handle batch audio operations - execute multiple track operations in a single message"""
        operations = event_data.get("operations")  # Array of {trackId, operation, ...params}
        triggered_by = event_data.get("triggered_by", user_id)
        fade_duration = event_data.get("fade_duration")  # Optional fade duration for transitions
        
        if not operations or not isinstance(operations, list) or len(operations) == 0:
            return WebsocketEventResult.error("Invalid batch audio request: operations must be a non-empty array")
        
        print(f"🎛️ Backend received batch audio operations from {triggered_by}: {len(operations)} operations")
        
        # Validate all operations
        valid_operations = ["play", "stop", "pause", "resume", "volume", "loop", "load", "clear", "effects", "mute", "solo", "master_volume"]
        for i, op in enumerate(operations):
            if not isinstance(op, dict):
                return WebsocketEventResult.error(f"Invalid batch audio operation {i}: must be an object")

            track_id = op.get("trackId")
            operation = op.get("operation")

            if not track_id or not operation:
                return WebsocketEventResult.error(f"Invalid batch audio operation {i}: missing trackId or operation")

            if operation not in valid_operations:
                return WebsocketEventResult.error(f"Invalid batch audio operation {i}: operation '{operation}' not supported")

            # Validate operation-specific required parameters
            if operation == "play" or operation == "load":
                if not op.get("filename"):
                    return WebsocketEventResult.error(f"Invalid batch audio {operation} operation {i}: missing filename")
            elif operation == "volume" or operation == "master_volume":
                if "volume" not in op:
                    return WebsocketEventResult.error(f"Invalid batch audio {operation} operation {i}: missing volume parameter")
            elif operation == "loop":
                if "looping" not in op:
                    return WebsocketEventResult.error(f"Invalid batch audio loop operation {i}: missing looping parameter")
            elif operation == "effects":
                if not isinstance(op.get("effects"), dict):
                    return WebsocketEventResult.error(f"Invalid batch audio effects operation {i}: missing or invalid effects object")
        
        # Create log message describing the batch operation
        operation_summaries = []
        for op in operations:
            track_id = op.get("trackId")
            operation = op.get("operation")
            
            if operation == "play":
                filename = op.get("filename", "unknown")
                operation_summaries.append(f"play {track_id} ({filename})")
            elif operation == "stop":
                operation_summaries.append(f"stop {track_id}")
            elif operation == "pause":
                operation_summaries.append(f"pause {track_id}")
            elif operation == "resume":
                operation_summaries.append(f"resume {track_id}")
            elif operation == "volume":
                volume = op.get("volume", 1.0)
                operation_summaries.append(f"set {track_id} volume to {volume}")
            elif operation == "loop":
                looping = op.get("looping", True)
                loop_text = "enable" if looping else "disable"
                operation_summaries.append(f"{loop_text} {track_id} looping")
            elif operation == "load":
                filename = op.get("filename", "unknown")
                operation_summaries.append(f"load {track_id} ({filename})")
            elif operation == "clear":
                operation_summaries.append(f"clear {track_id}")
            elif operation == "effects":
                effects = op.get("effects", {})
                enabled_effects = [k for k, v in effects.items() if v is True]
                operation_summaries.append(f"effects on {track_id}: {', '.join(enabled_effects) or 'all off'}")
            elif operation == "mute":
                muted = op.get("muted", False)
                operation_summaries.append(f"{'mute' if muted else 'unmute'} {track_id}")
            elif operation == "solo":
                soloed = op.get("soloed", False)
                operation_summaries.append(f"{'solo' if soloed else 'unsolo'} {track_id}")
            elif operation == "master_volume":
                volume = op.get("volume", 1.0)
                operation_summaries.append(f"set master volume to {volume}")

        log_message = f"🎛️ {triggered_by} executed batch audio operations: {', '.join(operation_summaries)}"
        print(log_message)

        # Fire-and-forget: persist audio state to MongoDB for late-joiner sync
        try:
            # Always pre-fetch current audio state — multiple operations need it for read-modify-write
            current_audio_state = GameService.get_audio_state(client_id)

            for op in operations:
                track_id = op.get("trackId")
                operation = op.get("operation")

                if operation == "play":
                    ch = current_audio_state.get(track_id, {})
                    play_fields = {
                        "filename": op.get("filename"),
                        "asset_id": op.get("asset_id"),
                        "s3_url": op.get("s3_url"),
                        "volume": op.get("volume", 0.8),
                        "looping": op.get("looping", True),
                        "playback_state": "playing",
                        "started_at": time.time(),
                        "paused_elapsed": None,
                    }
                    if op.get("loop_mode") is not None:
                        play_fields["loop_mode"] = op.get("loop_mode")
                    if op.get("loop_start") is not None:
                        play_fields["loop_start"] = op.get("loop_start")
                    if op.get("loop_end") is not None:
                        play_fields["loop_end"] = op.get("loop_end")
                    channel_state = AudioChannelState(**{**ch, **play_fields})
                    GameService.update_audio_state(client_id, track_id, channel_state.model_dump())

                elif operation == "stop":
                    # Stop playback but keep track loaded in channel
                    ch = current_audio_state.get(track_id, {})
                    channel_state = AudioChannelState(
                        **{**ch, "playback_state": "stopped", "started_at": None, "paused_elapsed": None}
                    )
                    GameService.update_audio_state(client_id, track_id, channel_state.model_dump())

                elif operation == "pause":
                    ch = current_audio_state.get(track_id, {})
                    started_at = ch.get("started_at")
                    paused_elapsed = (time.time() - started_at) if started_at else 0
                    channel_state = AudioChannelState(
                        **{**ch, "playback_state": "paused", "paused_elapsed": paused_elapsed}
                    )
                    GameService.update_audio_state(client_id, track_id, channel_state.model_dump())

                elif operation == "resume":
                    ch = current_audio_state.get(track_id, {})
                    paused_elapsed = ch.get("paused_elapsed", 0)
                    channel_state = AudioChannelState(
                        **{**ch,
                           "playback_state": "playing",
                           "started_at": time.time() - paused_elapsed,
                           "paused_elapsed": None,
                           }
                    )
                    GameService.update_audio_state(client_id, track_id, channel_state.model_dump())

                elif operation == "volume":
                    ch = current_audio_state.get(track_id, {}) if current_audio_state else {}
                    channel_state = AudioChannelState(**{**ch, "volume": op.get("volume")})
                    GameService.update_audio_state(client_id, track_id, channel_state.model_dump())

                elif operation == "loop":
                    ch = current_audio_state.get(track_id, {}) if current_audio_state else {}
                    loop_update = {"looping": op.get("looping")}
                    if op.get("loop_mode") is not None:
                        loop_update["loop_mode"] = op.get("loop_mode")
                    channel_state = AudioChannelState(**{**ch, **loop_update})
                    GameService.update_audio_state(client_id, track_id, channel_state.model_dump())

                elif operation == "load":
                    # 1. Save outgoing track's full config to audio_track_config
                    old_ch = current_audio_state.get(track_id, {})
                    old_asset_id = old_ch.get("asset_id")
                    if old_asset_id:
                        track_config = AudioTrackConfig(
                            volume=old_ch.get("volume"),
                            looping=old_ch.get("looping"),
                            effects=AudioEffects(**(old_ch.get("effects") or {})),
                            paused_elapsed=old_ch.get("paused_elapsed"),
                        )
                        GameService.save_track_config(client_id, old_asset_id, track_config.model_dump())

                    # 2. Check for saved config for incoming track
                    new_asset_id = op.get("asset_id")
                    saved_config = GameService.get_track_config(client_id, new_asset_id) if new_asset_id else None

                    # 3. Build channel state — restore from saved config or use provided defaults
                    if saved_config:
                        channel_state = AudioChannelState(
                            filename=op.get("filename"),
                            asset_id=new_asset_id,
                            s3_url=op.get("s3_url"),
                            volume=saved_config.get("volume", op.get("volume", 0.8)),
                            looping=saved_config.get("looping", op.get("looping")),
                            effects=saved_config.get("effects", {}),
                            playback_state="stopped",
                            started_at=None,
                            paused_elapsed=saved_config.get("paused_elapsed"),
                        )
                    else:
                        channel_state = AudioChannelState(
                            filename=op.get("filename"),
                            asset_id=new_asset_id,
                            s3_url=op.get("s3_url"),
                            volume=op.get("volume", 0.8),
                            looping=op.get("looping") if op.get("looping") is not None else True,
                            effects=op.get("effects", {}),
                            playback_state="stopped",
                            started_at=None,
                            paused_elapsed=None,
                        )

                    # Preserve channel-level mute/solo (not asset-level — survives track swaps)
                    channel_state.muted = old_ch.get("muted", False)
                    channel_state.soloed = old_ch.get("soloed", False)

                    GameService.update_audio_state(client_id, track_id, channel_state.model_dump())

                    # 4. Remove saved config (it's now active in a channel)
                    if new_asset_id and saved_config:
                        GameService.remove_track_config(client_id, new_asset_id)

                    # Update op so the broadcast carries the resolved config
                    op["volume"] = channel_state.volume
                    op["looping"] = channel_state.looping
                    op["effects"] = channel_state.effects.model_dump()
                    op["paused_elapsed"] = channel_state.paused_elapsed

                elif operation == "effects":
                    ch = current_audio_state.get(track_id, {})
                    channel_state = AudioChannelState(**{**ch, "effects": op.get("effects", {})})
                    GameService.update_audio_state(client_id, track_id, channel_state.model_dump())

                elif operation == "mute":
                    ch = current_audio_state.get(track_id, {})
                    channel_state = AudioChannelState(**{**ch, "muted": op.get("muted", False)})
                    GameService.update_audio_state(client_id, track_id, channel_state.model_dump())

                elif operation == "solo":
                    ch = current_audio_state.get(track_id, {})
                    channel_state = AudioChannelState(**{**ch, "soloed": op.get("soloed", False)})
                    GameService.update_audio_state(client_id, track_id, channel_state.model_dump())

                elif operation == "master_volume":
                    # Store broadcast master volume as a top-level field on audio_state
                    GameService.update_audio_state(client_id, "__master_volume", op.get("volume", 1.0))

                elif operation == "clear":
                    # Save outgoing track's full config before clearing
                    old_ch = current_audio_state.get(track_id, {})
                    old_asset_id = old_ch.get("asset_id")
                    if old_asset_id:
                        track_config = AudioTrackConfig(
                            volume=old_ch.get("volume"),
                            looping=old_ch.get("looping"),
                            effects=AudioEffects(**(old_ch.get("effects") or {})),
                            paused_elapsed=old_ch.get("paused_elapsed"),
                        )
                        GameService.save_track_config(client_id, old_asset_id, track_config.model_dump())

                    channel_state = AudioChannelState(
                        volume=op.get("volume", 0.8),
                        looping=False,
                    )
                    GameService.update_audio_state(client_id, track_id, channel_state.model_dump())

            print(f"🎵 Audio state persisted to MongoDB for {len(operations)} operations")
        except Exception as e:
            # Fire-and-forget — don't block the broadcast on DB errors
            print(f"⚠️ Failed to persist audio state to MongoDB: {e}")

        # Broadcast batch audio command to all clients
        batch_audio_message = {
            "event_type": "remote_audio_batch",
            "data": {
                "operations": operations,
                "triggered_by": triggered_by
            }
        }
        
        # Include fade_duration if provided
        if fade_duration is not None:
            batch_audio_message["data"]["fade_duration"] = fade_duration
        
        print(f"🎛️ Backend broadcasting batch operations: {batch_audio_message}")
        return WebsocketEventResult(broadcast_message=batch_audio_message)
    
    @staticmethod
    async def map_load(websocket, data, event_data, user_id, client_id, manager):
        """Load/set active map for the room"""
        print(f"🗺️ Map load handler called for room {client_id} by {user_id}")
        print(f"🗺️ event_data: {event_data}")
        print(f"🗺️ data: {data}")
        
        room_id = client_id  # Use client_id as room_id
        map_data = event_data.get("map_data")
        
        if not room_id or not map_data:
            print(f"❌ Invalid map load request: missing room_id or map_data")
            return WebsocketEventResult(broadcast_message={
                "event_type": "error",
                "data": {"error": "Invalid map load request"}
            })
        
        try:
            # Frontend sends nested shape: { room_id, uploaded_by, map_config: { ... } }
            mc_data = map_data.get("map_config", map_data) or {}

            # Look up the room's existing doc for this map (if any). When
            # the DM cycles between maps in a session, in-session edits
            # are preserved per-map — switching to map B and back to map A
            # restores A's painted fog and tweaked grid.
            existing_map = map_service.collection.find_one(
                {"room_id": room_id, "map_config.filename": mc_data.get("filename")}
            ) if map_service.collection is not None else None
            existing_mc = existing_map.get("map_config", {}) if existing_map else {}

            preserved = _merge_preserved_map_fields(incoming=mc_data, existing=existing_mc)

            # Build MapConfig via passthrough: take everything the frontend
            # sent, layer in the merged-preserved values for the cargo
            # fields, validate. Any new MapConfig field added later is
            # forwarded automatically — no field list to keep in sync.
            # Pydantic's `extra='forbid'` makes shape drift fail loudly.
            map_config = MapConfig.model_validate({
                **mc_data,
                "grid_config": preserved["grid_config"],
                "fog_config":  preserved["fog_config"],
            })
            map_settings = MapSettings(
                room_id=room_id,
                uploaded_by=user_id,
                map_config=map_config,
            )
            
            # Save to database
            success = map_service.set_active_map(room_id, map_settings)
            
            if success:
                # Get the actual saved map from database (includes preserved grid_config)
                saved_map = map_service.get_active_map(room_id)
                
                if saved_map:
                    # Broadcast the actual saved map (with preserved grid_config from MongoDB)
                    map_load_message = {
                        "event_type": "map_load",
                        "data": {
                            "map": saved_map,
                            "loaded_by": user_id
                        }
                    }
                else:
                    print(f"❌ Failed to retrieve saved map after setting active")
                    return WebsocketEventResult(broadcast_message={
                        "event_type": "error",
                        "data": {"error": "Failed to retrieve saved map"}
                    })
                
                print(f"🗺️ Map loaded for room {room_id}: {map_settings.map_config.filename}")
                return WebsocketEventResult(broadcast_message=map_load_message)
            else:
                print(f"❌ Failed to save map to database for room {room_id}")
                return WebsocketEventResult(broadcast_message={
                    "event_type": "error", 
                    "data": {"error": "Failed to save map"}
                })
                
        except Exception as e:
            print(f"❌ Error loading map for room {room_id}: {e}")
            return WebsocketEventResult(broadcast_message={
                "event_type": "error",
                "data": {"error": f"Failed to load map: {str(e)}"}
            })
    
    @staticmethod
    async def map_clear(websocket, data, event_data, user_id, client_id, manager):
        """Clear the active map for the room"""
        room_id = client_id  # Use client_id as room_id
        
        if not room_id:
            print(f"❌ Invalid map clear request: missing room_id")
            return WebsocketEventResult(broadcast_message={"error": "Invalid map clear request"})
        
        try:
            # Clear from database
            success = map_service.clear_active_map(room_id)
            
            if success:
                # Broadcast to all clients
                map_clear_message = {
                    "event_type": "map_clear",
                    "data": {
                        "cleared_by": user_id
                    }
                }
                
                print(f"🗺️ Map cleared for room {room_id}")
                return WebsocketEventResult(broadcast_message=map_clear_message)
            else:
                print(f"❌ Failed to clear map from database for room {room_id}")
                return WebsocketEventResult(broadcast_message={"error": "Failed to clear map"})
                
        except Exception as e:
            print(f"❌ Error clearing map for room {room_id}: {e}")
            return WebsocketEventResult(broadcast_message={"error": f"Failed to clear map: {str(e)}"})
    
    @staticmethod
    async def map_config_update(websocket, data, event_data, user_id, client_id, manager):
        """Update map configuration (grid settings, etc.)"""
        room_id = client_id  # Use client_id as room_id
        display_name = WebsocketEvent._display_name(room_id, user_id)
        filename = event_data.get("filename")
        grid_config = event_data.get("grid_config")
        map_image_config = event_data.get("map_image_config")
        
        if not room_id:
            print(f"❌ Invalid map config update request: missing room_id")
            return WebsocketEventResult(broadcast_message={"error": "Invalid map config update request"})
        
        try:
            # Update in database
            print(f"🗺️ Updating map config in database for room {room_id}, filename {filename}")
            print(f"   Grid config: {grid_config}")
            print(f"   Map image config: {map_image_config}")
            
            success = map_service.update_map_config(
                room_id, 
                filename, 
                grid_config=grid_config,
                map_image_config=map_image_config
            )
            
            if success:
                # Broadcast configuration update to all clients
                config_update_message = {
                    "event_type": "map_config_update",
                    "data": {
                        "filename": filename,
                        "grid_config": grid_config,
                        "map_image_config": map_image_config,
                        "updated_by": user_id
                    }
                }
                
                print(f"🗺️ Map config updated for room {room_id}")
                return WebsocketEventResult(broadcast_message=config_update_message)
            else:
                print(f"❌ No map config updated for room {room_id} (no active map or no changes)")
                return WebsocketEventResult(broadcast_message={"info": "No map config updated"})
                
        except Exception as e:
            print(f"❌ Error updating map config for room {room_id}: {e}")
            return WebsocketEventResult(broadcast_message={"error": f"Failed to update map config: {str(e)}"})
    
    @staticmethod
    async def fog_config_update(websocket, data, event_data, user_id, client_id, manager):
        """Replace the fog-of-war regions list on the active map (atomic full-replace).

        Payload shape:
            { filename: str, fog_config: { version: 2, regions: [...] } | null }

        fog_config=None clears all fog. Per the codebase's atomic state
        rule, the full regions list travels in a single message; players
        replace their canvases in one paint to honour the no-flicker
        contract. Per-region partial updates (toggle, paint a single
        region) are dedicated WS events — not yet implemented.
        """
        room_id = client_id
        filename = event_data.get("filename")
        fog_config = event_data.get("fog_config")

        if not room_id or not filename:
            print(f"❌ Invalid fog config update: missing room_id or filename")
            return WebsocketEventResult(broadcast_message={"error": "Invalid fog config update"})

        try:
            success = map_service.update_fog_config(room_id, filename, fog_config)
            if success:
                broadcast = {
                    "event_type": "fog_config_update",
                    "data": {
                        "filename": filename,
                        "fog_config": fog_config,
                        "updated_by": user_id,
                    },
                }
                return WebsocketEventResult(broadcast_message=broadcast)
            else:
                print(f"❌ No fog config updated for room {room_id} (no active map)")
                return WebsocketEventResult(broadcast_message={"info": "No fog config updated"})

        except Exception as e:
            print(f"❌ Error updating fog config for room {room_id}: {e}")
            return WebsocketEventResult(broadcast_message={"error": f"Failed to update fog config: {str(e)}"})

    @staticmethod
    async def map_request(websocket, data, event_data, user_id, client_id, manager):
        """Request current active map (for new players joining)"""
        room_id = client_id  # Use client_id as room_id
        
        if not room_id:
            print(f"❌ Invalid map request: missing room_id")
            return WebsocketEventResult(broadcast_message={"error": "Invalid map request"})
        
        try:
            # Get active map from database
            active_map = map_service.get_active_map(room_id)
            
            if active_map:
                # Send current map to requesting client only
                map_response_message = {
                    "event_type": "map_load",
                    "data": {
                        "map": active_map,
                        "loaded_by": active_map.get("uploaded_by", "unknown")
                    }
                }
                
                print(f"🗺️ Sent current map to {user_id} in room {room_id}")
                # Only send to the requesting client (not broadcast)
                await websocket.send_json(map_response_message)
                return WebsocketEventResult(broadcast_message=None)
            else:
                # No active map
                no_map_message = {
                    "event_type": "map_clear",
                    "data": {"cleared_by": "system"}
                }
                
                print(f"🗺️ No active map found for room {room_id}")
                await websocket.send_json(no_map_message)
                return WebsocketEventResult(broadcast_message=None)
                
        except Exception as e:
            print(f"❌ Error requesting map for room {room_id}: {e}")
            return WebsocketEventResult(broadcast_message={"error": f"Failed to request map: {str(e)}"})

    # ─── Image Events ───────────────────────────────────────────────

    @staticmethod
    async def image_load(websocket, data, event_data, user_id, client_id, manager):
        """Load/set active image for the room"""
        room_id = client_id
        display_name = WebsocketEvent._display_name(room_id, user_id)
        print(f"🖼️ Image load handler called for room {client_id} by {display_name}")
        image_data = event_data.get("image_data")

        if not room_id or not image_data:
            print(f"❌ Invalid image load request: missing room_id or image_data")
            return WebsocketEventResult(broadcast_message={
                "event_type": "error",
                "data": {"error": "Invalid image load request"}
            })

        try:
            # Frontend sends nested shape: { room_id, loaded_by, image_config: { ... } }
            ic_data = image_data.get("image_config", image_data)
            image_config = ImageConfig(
                asset_id=ic_data.get("asset_id", ""),
                filename=ic_data.get("filename", "unknown.jpg"),
                original_filename=ic_data.get("original_filename", ic_data.get("filename", "unknown.jpg")),
                file_path=ic_data.get("file_path", ""),
                image_fit=ic_data.get("image_fit", "float"),
                display_mode=ic_data.get("display_mode", "standard"),
                aspect_ratio=ic_data.get("aspect_ratio"),
                image_position_x=ic_data.get("image_position_x"),
                image_position_y=ic_data.get("image_position_y"),
                visual_overlays=ic_data.get("visual_overlays"),
                motion=ic_data.get("motion"),
            )
            image_settings = ImageSettings(
                room_id=room_id,
                loaded_by=user_id,
                image_config=image_config,
            )

            success = image_service.set_active_image(room_id, image_settings)

            if success:
                saved_image = image_service.get_active_image(room_id)

                if saved_image:
                    log_message = f"🖼️ {display_name.title()} loaded image: {image_settings.image_config.original_filename}"
                    adventure_log.add_log_entry(room_id, log_message, LogType.SYSTEM, user_id)

                    active_display = image_service.get_active_display(room_id)

                    broadcast_message = {
                        "event_type": "image_load",
                        "data": {
                            "image": saved_image,
                            "active_display": active_display,
                            "loaded_by": user_id
                        }
                    }
                else:
                    print(f"❌ Failed to retrieve saved image after setting active")
                    return WebsocketEventResult(broadcast_message={
                        "event_type": "error",
                        "data": {"error": "Failed to retrieve saved image"}
                    })

                print(f"🖼️ Image loaded for room {room_id}: {image_settings.image_config.filename}")
                return WebsocketEventResult(broadcast_message=broadcast_message)
            else:
                print(f"❌ Failed to save image to database for room {room_id}")
                return WebsocketEventResult(broadcast_message={
                    "event_type": "error",
                    "data": {"error": "Failed to save image"}
                })

        except Exception as e:
            print(f"❌ Error loading image for room {room_id}: {e}")
            return WebsocketEventResult(broadcast_message={
                "event_type": "error",
                "data": {"error": f"Failed to load image: {str(e)}"}
            })

    @staticmethod
    async def image_clear(websocket, data, event_data, user_id, client_id, manager):
        """Clear the active image for the room"""
        room_id = client_id
        display_name = WebsocketEvent._display_name(room_id, user_id)

        if not room_id:
            print(f"❌ Invalid image clear request: missing room_id")
            return WebsocketEventResult(broadcast_message={"error": "Invalid image clear request"})

        try:
            success = image_service.clear_active_image(room_id)

            if success:
                log_message = f"🖼️ {display_name.title()} cleared the active image"
                adventure_log.add_log_entry(room_id, log_message, LogType.SYSTEM, user_id)

                active_display = image_service.get_active_display(room_id)

                broadcast_message = {
                    "event_type": "image_clear",
                    "data": {
                        "active_display": active_display,
                        "cleared_by": user_id
                    }
                }

                print(f"🖼️ Image cleared for room {room_id}")
                return WebsocketEventResult(broadcast_message=broadcast_message)
            else:
                print(f"❌ Failed to clear image from database for room {room_id}")
                return WebsocketEventResult(broadcast_message={"error": "Failed to clear image"})

        except Exception as e:
            print(f"❌ Error clearing image for room {room_id}: {e}")
            return WebsocketEventResult(broadcast_message={"error": f"Failed to clear image: {str(e)}"})

    @staticmethod
    async def image_config_update(websocket, data, event_data, user_id, client_id, manager):
        """Update image config on the active image (lightweight, no re-save of full image)"""
        room_id = client_id
        image_fit = event_data.get("image_fit")
        display_mode = event_data.get("display_mode")
        aspect_ratio = event_data.get("aspect_ratio")
        image_position_x = event_data.get("image_position_x")
        image_position_y = event_data.get("image_position_y")

        if not room_id:
            return WebsocketEventResult(broadcast_message={"error": "Invalid image config update request"})

        try:
            success = image_service.update_image_config(
                room_id,
                image_fit=image_fit,
                display_mode=display_mode,
                aspect_ratio=aspect_ratio,
                image_position_x=image_position_x,
                image_position_y=image_position_y,
            )

            if success:
                saved_image = image_service.get_active_image(room_id)
                saved_ic = saved_image.get("image_config", {}) if saved_image else {}
                broadcast_message = {
                    "event_type": "image_config_update",
                    "data": {
                        "image_fit": saved_ic.get("image_fit", "float") if saved_image else image_fit,
                        "display_mode": saved_ic.get("display_mode", "standard") if saved_image else display_mode,
                        "aspect_ratio": saved_ic.get("aspect_ratio") if saved_image else aspect_ratio,
                        "image_position_x": saved_ic.get("image_position_x") if saved_image else image_position_x,
                        "image_position_y": saved_ic.get("image_position_y") if saved_image else image_position_y,
                        "updated_by": user_id
                    }
                }
                print(f"🖼️ Image config updated for room {room_id}: fit={image_fit}, mode={display_mode}")
                return WebsocketEventResult(broadcast_message=broadcast_message)
            else:
                return WebsocketEventResult(broadcast_message={"info": "No image config updated"})

        except Exception as e:
            print(f"❌ Error updating image config for room {room_id}: {e}")
            return WebsocketEventResult(broadcast_message={"error": f"Failed to update image config: {str(e)}"})

    @staticmethod
    async def image_request(websocket, data, event_data, user_id, client_id, manager):
        """Request current active image (for new players joining)"""
        room_id = client_id

        if not room_id:
            print(f"❌ Invalid image request: missing room_id")
            return WebsocketEventResult(broadcast_message={"error": "Invalid image request"})

        try:
            active_image = image_service.get_active_image(room_id)
            active_display = image_service.get_active_display(room_id)

            if active_image:
                response_message = {
                    "event_type": "image_load",
                    "data": {
                        "image": active_image,
                        "active_display": active_display,
                        "loaded_by": active_image.get("loaded_by", "unknown")
                    }
                }

                print(f"🖼️ Sent current image to {user_id} in room {room_id}")
                await websocket.send_json(response_message)
                return WebsocketEventResult(broadcast_message=None)
            else:
                # No active image — send display state so client knows what's active
                display_state_message = {
                    "event_type": "image_clear",
                    "data": {
                        "active_display": active_display,
                        "cleared_by": "system"
                    }
                }

                print(f"🖼️ No active image found for room {room_id}")
                await websocket.send_json(display_state_message)
                return WebsocketEventResult(broadcast_message=None)

        except Exception as e:
            print(f"❌ Error requesting image for room {room_id}: {e}")
            return WebsocketEventResult(broadcast_message={"error": f"Failed to request image: {str(e)}"})