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
    async def player_connection(websocket, data, event_data, player_name, client_id, manager):
        # Note: manager.connect() is already called in app_websocket.py
        # This event just handles the logging and broadcast

        # Log player connection to database
        log_message = format_message(MESSAGE_TEMPLATES["player_connected"], player=player_name)
        
        adventure_log.add_log_entry(
            room_id=client_id,
            message=log_message,
            log_type=LogType.SYSTEM,
            from_player=player_name
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
            from_player=prompted_by,
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
            from_player=prompted_by,
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
            from_player=player_name
        )
        
        broadcast_message = {
            "event_type": "combat_state",
            "data": event_data
        }
        
        return WebsocketEventResult(broadcast_message=broadcast_message)

    @staticmethod
    async def seat_count_change(websocket, data, event_data, player_name, client_id, manager):
        """Handle seat count changes"""
        
        # Log seat count change to adventure log
        max_players = event_data.get("max_players")
        displaced_players = event_data.get("displaced_players", [])
        
        log_message = f"Seat count changed to {max_players} by {player_name}"
        if displaced_players:
            displaced_names = [p["playerName"] for p in displaced_players]
            log_message += f". Moved to lobby: {', '.join(displaced_names)}"
        
        adventure_log.add_log_entry(
            room_id=client_id,
            message=log_message,
            log_type=LogType.SYSTEM,
            from_player=player_name
        )
        
        broadcast_message = {
            "event_type": "seat_count_change",
            "data": event_data,
            "player_name": player_name
        }
        
        return WebsocketEventResult(broadcast_message=broadcast_message)

    @staticmethod
    async def player_displaced(websocket, data, event_data, player_name, client_id, manager):
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
    async def system_message(websocket, data, event_data, player_name, client_id, manager):
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
    async def player_kicked(websocket, data, event_data, player_name, client_id, manager):
        """Handle player kicked events"""
        kicked_player = event_data.get("kicked_player")
        
        log_message = format_message(MESSAGE_TEMPLATES["player_kicked"], player=kicked_player)
        
        adventure_log.add_log_entry(
            room_id=client_id,
            message=log_message,
            log_type=LogType.SYSTEM,
            from_player=player_name
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
            from_player=player_name
        )
        
        # Update party status to move disconnecting player to lobby before marking as disconnected
        print(f"🚪 Moving {player_name} from party to lobby on disconnect")
        manager.update_party_status(client_id, player_name, False)
        
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
            from_player=player_name
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

    @staticmethod 
    async def remote_audio_play(websocket, data, event_data, player_name, client_id, manager):
        """Handle remote audio play events - DM controls audio for all players"""
        print(f"🎵 Backend received remote_audio_play event from {player_name}: {event_data}")
        triggered_by = event_data.get("triggered_by", player_name)
        
        # Support both single track and multiple tracks (for synchronized playback)
        tracks = event_data.get("tracks")
        if tracks:
            # Multiple tracks for synchronized playback
            if not isinstance(tracks, list) or len(tracks) == 0:
                print(f"❌ Invalid remote audio play request: tracks must be a non-empty array")
                return WebsocketEventResult(broadcast_message={})
            
            # Validate all tracks
            for track in tracks:
                if not track.get("channelId") or not track.get("filename"):
                    print(f"❌ Invalid track in synchronized play request: {track}")
                    return WebsocketEventResult(broadcast_message={})
            
            # Create log message for synchronized playback
            track_descriptions = [f"{track['channelId']} ({track['filename']})" for track in tracks]
            log_message = f"🔗 {triggered_by} started synchronized playback: {' + '.join(track_descriptions)}"
            print(log_message)
            
        else:
            # Single track (legacy format)
            track_type = event_data.get("track_type")  # 'music', 'ambient', 'sfx'
            audio_file = event_data.get("audio_file")  # 'boss.mp3', 'storm.mp3', etc.
            loop = event_data.get("loop", True)
            volume = event_data.get("volume", 1.0)
            
            if not track_type or not audio_file:
                print(f"❌ Invalid remote audio play request: track_type={track_type}, audio_file={audio_file}")
                return WebsocketEventResult(broadcast_message={})
            
            # Convert single track to tracks array format
            tracks = [{
                "channelId": track_type,  # For legacy compatibility
                "filename": audio_file,
                "looping": loop,
                "volume": volume
            }]
            
            log_message = f"🎵 {triggered_by} started playing {track_type}: {audio_file}"
            print(f"🎵 Remote audio play: {triggered_by} playing {track_type} - {audio_file} (loop: {loop}, volume: {volume})")
        
        # Add to adventure log
        adventure_log.add_log_entry(
            room_id=client_id,
            message=log_message,
            log_type=LogType.SYSTEM,
            from_player=triggered_by
        )
        
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
    async def remote_audio_stop(websocket, data, event_data, player_name, client_id, manager):
        """Handle remote audio stop events - DM stops audio for all players"""
        track_type = event_data.get("track_type")  # 'music', 'ambient', 'sfx'
        triggered_by = event_data.get("triggered_by", player_name)
        
        if not track_type:
            print(f"❌ Invalid remote audio stop request: track_type={track_type}")
            return WebsocketEventResult(broadcast_message={})
        
        print(f"🛑 Remote audio stop: {triggered_by} stopping {track_type}")
        
        # Create log message for audio stop
        log_message = f"🛑 {triggered_by} stopped {track_type} audio"
        
        # Add to adventure log
        adventure_log.add_log_entry(
            room_id=client_id,
            message=log_message,
            log_type=LogType.SYSTEM,
            from_player=triggered_by
        )
        
        # Broadcast audio stop command to all clients
        audio_stop_message = {
            "event_type": "remote_audio_stop",
            "data": {
                "track_type": track_type,
                "triggered_by": triggered_by
            }
        }
        
        return WebsocketEventResult(broadcast_message=audio_stop_message)

    @staticmethod 
    async def remote_audio_pause(websocket, data, event_data, player_name, client_id, manager):
        """Handle remote audio pause events - DM pauses audio for all players"""
        track_type = event_data.get("track_type")  # 'music', 'ambient', 'sfx'
        triggered_by = event_data.get("triggered_by", player_name)
        
        if not track_type:
            print(f"❌ Invalid remote audio pause request: track_type={track_type}")
            return WebsocketEventResult(broadcast_message={})
        
        print(f"⏸️ Remote audio pause: {triggered_by} pausing {track_type}")
        
        # Create log message for audio pause
        log_message = f"⏸️ {triggered_by} paused {track_type} audio"
        
        adventure_log.add_log_entry(
            room_id=client_id,
            message=log_message,
            log_type=LogType.SYSTEM,
            from_player=triggered_by
        )
        
        # Broadcast audio pause command to all clients
        audio_pause_message = {
            "event_type": "remote_audio_pause",
            "data": {
                "track_type": track_type,
                "triggered_by": triggered_by
            }
        }
        
        return WebsocketEventResult(broadcast_message=audio_pause_message)

    @staticmethod 
    async def remote_audio_volume(websocket, data, event_data, player_name, client_id, manager):
        """Handle remote audio volume events - DM adjusts volume for all players"""
        track_type = event_data.get("track_type")  # 'music', 'ambient', 'sfx'
        volume = event_data.get("volume", 1.0)
        triggered_by = event_data.get("triggered_by", player_name)
        
        if not track_type or volume is None:
            print(f"❌ Invalid remote audio volume request: track_type={track_type}, volume={volume}")
            return WebsocketEventResult(broadcast_message={})
        
        print(f"🔊 Remote audio volume: {triggered_by} set {track_type} volume to {int(volume * 100)}%")
        
        # Note: Not logging volume changes to avoid spam in adventure log
        # Only log significant events like play/stop
        
        # Broadcast audio volume command to all clients
        audio_volume_message = {
            "event_type": "remote_audio_volume",
            "data": {
                "track_type": track_type,
                "volume": volume,
                "triggered_by": triggered_by
            }
        }
        
        return WebsocketEventResult(broadcast_message=audio_volume_message)

    @staticmethod
    async def remote_audio_resume(websocket, data, event_data, player_name, client_id, manager):
        """Handle remote audio resume events - DM resumes paused audio for all players"""
        triggered_by = event_data.get("triggered_by", player_name)
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
                print(f"❌ Invalid remote audio resume request: no track_type or tracks provided")
                return WebsocketEventResult(broadcast_message={})
            
            # Convert single track to tracks array format for consistency
            tracks = [{"channelId": track_type}]
            log_message = f"▶️ {triggered_by} resumed {track_type} audio"
            print(f"▶️ Remote audio resume: {triggered_by} resuming {track_type}")
        
        # Add to adventure log
        adventure_log.add_log_entry(
            room_id=client_id,
            message=log_message,
            log_type=LogType.SYSTEM,
            from_player=triggered_by
        )
        
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