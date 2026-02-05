# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later
import time
from typing import Optional, Dict, Any

from fastapi import WebSocket
from .connection_manager import ConnectionManager
from message_templates import format_message, MESSAGE_TEMPLATES
from adventure_log_service import AdventureLogService
from models.log_type import LogType
from mapservice import MapService, MapSettings


adventure_log = AdventureLogService()
map_service = MapService()


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

        # Try to clean up disconnected player's seat (may fail if room already closed)
        try:
            current_seats = GameService.get_seat_layout(client_id)

            # Remove disconnected player from their seat (case-insensitive)
            updated_seats = []
            for seat in current_seats:
                if seat.lower() == player_name.lower():
                    updated_seats.append("empty")
                else:
                    updated_seats.append(seat)

            # Update seat layout in database (may fail if room was deleted)
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
        except Exception as e:
            # Room was likely already closed/deleted - this is fine, just log it
            print(f"⚠️ Could not update seat layout for {player_name} in room {client_id}: {str(e)}")
            print(f"ℹ️ Room may have been closed - graceful disconnect without seat update")

            # Still broadcast disconnect message even if DB update fails
            disconnect_message = {
                "event_type": "player_disconnected",
                "data": {
                    "disconnected_player": player_name
                }
            }

            return WebsocketEventResult(
                broadcast_message=disconnect_message,
                clear_prompt_message=None
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
            print(log_message)
            
        else:
            # Single track (legacy format)
            track_type = event_data.get("track_type")  # 'bgm', 'sfx' (legacy: 'music', 'ambient')
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
            
            print(f"🎵 Remote audio play: {triggered_by} playing {track_type} - {audio_file} (loop: {loop}, volume: {volume})")
        
        
        # Fire-and-forget: persist play state to MongoDB
        import time
        try:
            from gameservice import GameService
            for track in tracks:
                channel_id = track.get("channelId")
                if channel_id:
                    channel_state = {
                        "filename": track.get("filename"),
                        "asset_id": track.get("asset_id"),
                        "s3_url": track.get("s3_url"),
                        "volume": track.get("volume", 0.8),
                        "looping": track.get("looping", True),
                        "playback_state": "playing",
                        "started_at": time.time(),
                        "paused_elapsed": None,
                    }
                    GameService.update_audio_state(client_id, channel_id, channel_state)
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
    async def remote_audio_batch(websocket, data, event_data, player_name, client_id, manager):
        """Handle batch audio operations - execute multiple track operations in a single message"""
        operations = event_data.get("operations")  # Array of {trackId, operation, ...params}
        triggered_by = event_data.get("triggered_by", player_name)
        fade_duration = event_data.get("fade_duration")  # Optional fade duration for transitions
        
        if not operations or not isinstance(operations, list) or len(operations) == 0:
            print(f"❌ Invalid batch audio request: operations must be a non-empty array")
            return WebsocketEventResult(broadcast_message={})
        
        print(f"🎛️ Backend received batch audio operations from {triggered_by}: {len(operations)} operations")
        
        # Validate all operations
        valid_operations = ["play", "stop", "pause", "resume", "volume", "loop", "load"]
        for i, op in enumerate(operations):
            if not isinstance(op, dict):
                print(f"❌ Invalid operation {i}: must be an object")
                return WebsocketEventResult(broadcast_message={})

            track_id = op.get("trackId")
            operation = op.get("operation")

            if not track_id or not operation:
                print(f"❌ Invalid operation {i}: missing trackId or operation")
                return WebsocketEventResult(broadcast_message={})

            if operation not in valid_operations:
                print(f"❌ Invalid operation {i}: operation '{operation}' not supported")
                return WebsocketEventResult(broadcast_message={})

            # Validate operation-specific required parameters
            if operation == "play" or operation == "load":
                if not op.get("filename"):
                    print(f"❌ Invalid {operation} operation {i}: missing filename")
                    return WebsocketEventResult(broadcast_message={})
            elif operation == "volume":
                if "volume" not in op:
                    print(f"❌ Invalid volume operation {i}: missing volume parameter")
                    return WebsocketEventResult(broadcast_message={})
            elif operation == "loop":
                if "looping" not in op:
                    print(f"❌ Invalid loop operation {i}: missing looping parameter")
                    return WebsocketEventResult(broadcast_message={})
        
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

        log_message = f"🎛️ {triggered_by} executed batch audio operations: {', '.join(operation_summaries)}"
        print(log_message)

        # Fire-and-forget: persist audio state to MongoDB for late-joiner sync
        import time
        try:
            from gameservice import GameService

            # Always pre-fetch current audio state — multiple operations need it for read-modify-write
            current_audio_state = GameService.get_audio_state(client_id)

            for op in operations:
                track_id = op.get("trackId")
                operation = op.get("operation")

                if operation == "play":
                    channel_state = {
                        "filename": op.get("filename"),
                        "asset_id": op.get("asset_id"),
                        "s3_url": op.get("s3_url"),
                        "volume": op.get("volume", 0.8),
                        "looping": op.get("looping", True),
                        "playback_state": "playing",
                        "started_at": time.time(),
                        "paused_elapsed": None,
                    }
                    GameService.update_audio_state(client_id, track_id, channel_state)

                elif operation == "stop":
                    # Stop playback but keep track loaded in channel
                    ch = current_audio_state.get(track_id, {})
                    channel_state = {
                        **ch,
                        "playback_state": "stopped",
                        "started_at": None,
                        "paused_elapsed": None,
                    }
                    GameService.update_audio_state(client_id, track_id, channel_state)

                elif operation == "pause":
                    ch = current_audio_state.get(track_id, {})
                    started_at = ch.get("started_at")
                    paused_elapsed = (time.time() - started_at) if started_at else 0
                    channel_state = {
                        **ch,
                        "playback_state": "paused",
                        "paused_elapsed": paused_elapsed,
                    }
                    GameService.update_audio_state(client_id, track_id, channel_state)

                elif operation == "resume":
                    ch = current_audio_state.get(track_id, {})
                    paused_elapsed = ch.get("paused_elapsed", 0)
                    channel_state = {
                        **ch,
                        "playback_state": "playing",
                        "started_at": time.time() - paused_elapsed,
                        "paused_elapsed": None,
                    }
                    GameService.update_audio_state(client_id, track_id, channel_state)

                elif operation == "volume":
                    ch = current_audio_state.get(track_id, {}) if current_audio_state else {}
                    channel_state = {**ch, "volume": op.get("volume")}
                    GameService.update_audio_state(client_id, track_id, channel_state)

                elif operation == "loop":
                    ch = current_audio_state.get(track_id, {}) if current_audio_state else {}
                    channel_state = {**ch, "looping": op.get("looping")}
                    GameService.update_audio_state(client_id, track_id, channel_state)

                elif operation == "load":
                    channel_state = {
                        "filename": op.get("filename"),
                        "asset_id": op.get("asset_id"),
                        "s3_url": op.get("s3_url"),
                        "volume": op.get("volume", 0.8),
                        "looping": op.get("looping", True),
                        "playback_state": "stopped",
                        "started_at": None,
                        "paused_elapsed": None,
                    }
                    GameService.update_audio_state(client_id, track_id, channel_state)

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
    async def map_load(websocket, data, event_data, player_name, client_id, manager):
        """Load/set active map for the room"""
        print(f"🗺️ Map load handler called for room {client_id} by {player_name}")
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
            # Check if this map already exists with grid config
            existing_map = map_service.collection.find_one(
                {"room_id": room_id, "filename": map_data.get("filename")}
            ) if map_service.collection is not None else None
            
            # Only use existing grid_config if found, otherwise NO grid config
            grid_config_to_use = None
            if existing_map and existing_map.get("grid_config"):
                grid_config_to_use = existing_map["grid_config"]
                print(f"🗺️ Using existing grid config for map {map_data.get('filename')}: {grid_config_to_use}")
            else:
                print(f"🗺️ No existing grid config for map {map_data.get('filename')} - map will have no grid until DM sets one")
            
            # Create MapSettings with existing grid config or None
            map_settings = MapSettings(
                room_id=room_id,
                filename=map_data.get("filename", "unknown.jpg"),
                original_filename=map_data.get("original_filename", map_data.get("filename", "unknown.jpg")),
                file_path=map_data.get("file_path", ""),
                grid_config=grid_config_to_use,
                map_image_config=map_data.get("map_image_config"),
                uploaded_by=player_name,
                active=True
            )
            
            # Save to database
            success = map_service.set_active_map(room_id, map_settings)
            
            if success:
                # Get the actual saved map from database (includes preserved grid_config)
                saved_map = map_service.get_active_map(room_id)
                
                if saved_map:
                    # Log map loading
                    log_message = f"🗺️ {player_name.title()} loaded map: {map_settings.original_filename}"
                    adventure_log.add_log_entry(room_id, log_message, LogType.SYSTEM, player_name)
                    
                    # Broadcast the actual saved map (with preserved grid_config from MongoDB)
                    map_load_message = {
                        "event_type": "map_load",
                        "data": {
                            "map": saved_map,
                            "loaded_by": player_name
                        }
                    }
                else:
                    print(f"❌ Failed to retrieve saved map after setting active")
                    return WebsocketEventResult(broadcast_message={
                        "event_type": "error",
                        "data": {"error": "Failed to retrieve saved map"}
                    })
                
                print(f"🗺️ Map loaded for room {room_id}: {map_settings.filename}")
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
    async def map_clear(websocket, data, event_data, player_name, client_id, manager):
        """Clear the active map for the room"""
        room_id = client_id  # Use client_id as room_id
        
        if not room_id:
            print(f"❌ Invalid map clear request: missing room_id")
            return WebsocketEventResult(broadcast_message={"error": "Invalid map clear request"})
        
        try:
            # Clear from database
            success = map_service.clear_active_map(room_id)
            
            if success:
                # Log map clearing
                log_message = f"🗺️ {player_name.title()} cleared the active map"
                adventure_log.add_log_entry(room_id, log_message, LogType.SYSTEM, player_name)
                
                # Broadcast to all clients
                map_clear_message = {
                    "event_type": "map_clear",
                    "data": {
                        "cleared_by": player_name
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
    async def map_config_update(websocket, data, event_data, player_name, client_id, manager):
        """Update map configuration (grid settings, etc.)"""
        room_id = client_id  # Use client_id as room_id
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
                        "updated_by": player_name
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
    async def map_request(websocket, data, event_data, player_name, client_id, manager):
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
                
                print(f"🗺️ Sent current map to {player_name} in room {room_id}")
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