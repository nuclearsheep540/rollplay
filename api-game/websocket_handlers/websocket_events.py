# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later
import math
import time
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

from fastapi import WebSocket
from pydantic import ValidationError
from .connection_manager import ConnectionManager
from message_templates import format_message, MESSAGE_TEMPLATES
from adventure_log_service import AdventureLogService
from models.log_type import LogType
from mapservice import MapService, MapSettings
from imageservice import ImageService, ImageSettings
from gameservice import GameService
from map_token_ops import VALID_MAP_TOKEN_OPS, filter_hidden_tokens, grid_cell_label, is_valid_asset_key
from map_token_holds import MapTokenHolds
from site_client import fetch_character_summary
from shared_contracts.image import ImageConfig
from shared_contracts.grid_math import grid_geometry_changed, grid_usable, resnap_token_position
from shared_contracts.map import MapConfig
from shared_contracts.map_token import MapToken
from shared_contracts.audio import AudioChannelState, AudioTrackConfig, AudioEffects
from shared_contracts.spotify import SpotifyState
from mongo_service import mongo_service


adventure_log = AdventureLogService(db=mongo_service.db)
map_service = MapService(db=mongo_service.db)
image_service = ImageService(db=mongo_service.db)
map_token_holds = MapTokenHolds()

# CONCURRENCY CONTRACT (api-game went async 2026-09-03).
#
# Every database call is now awaited, so a handler can be suspended part-way
# through and another client's message can run before it resumes. Blocking
# pymongo used to make each handler an accidental critical section; it no
# longer is.
#
# The rule: this registry, _hidden_held_tokens below, and the connection
# manager's room_users are plain dicts owned by the event-loop thread. Read
# and mutate them BETWEEN awaits, never across one — if a decision depends on
# a value read before an await, re-read it after. Nothing here is ever touched
# from another thread, which is why no locking is needed.

# Hidden tokens whose hold is (or was recently) active, keyed
# (room_id, asset_id, token_id). Move frames arrive at ~20 Hz — far too hot
# for a per-frame board read — so the grab's board lookup caches the hidden
# flag here and frames/releases consult the set instead (decision 17: drag
# presence for hidden tokens must not reach player clients either).
# Presence-adjacent and in-memory like MapTokenHolds itself; a stale entry
# (lost release) is overwritten by the next grab and only ever suppresses
# relays for a token players cannot see anyway.
_hidden_held_tokens = set()


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
    for field in ("grid_config", "fog_config", "map_image_config", "pc_token_scale"):
        value = incoming.get(field)
        if value is None:
            value = existing.get(field)  # preserve existing when chaperone is silent
        out[field] = value
    return out


async def grid_resnap_fragment(room_id: str, asset_id: Optional[str], updated_by: str,
                          old_grid_config: Optional[Dict[str, Any]],
                          new_grid_config: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Rewrite a map's token board for a grid geometry change and build the
    map_token_state_update fragment for it (tokens v2 decision 20: exact-cell
    re-snap, superseding v1 decision 7's no-auto-resnap).

    Returns None when there is nothing to do: no asset, new grid unusable
    (disabled grids leave positions alone), cosmetic-only change, empty
    board, or every token already on its lattice point. updated_at is
    deliberately preserved so z-order doesn't scramble (see
    GameService.replace_map_token_board).
    """
    if not asset_id:
        return None
    if not grid_usable(new_grid_config):
        return None
    if not grid_geometry_changed(old_grid_config, new_grid_config):
        return None

    board_tokens = await GameService.get_map_tokens(room_id, asset_id)
    if not board_tokens:
        return None

    resnapped_tokens = []
    any_token_moved = False
    for board_token in board_tokens:
        new_x, new_y = resnap_token_position(
            board_token.get("x"), board_token.get("y"),
            board_token.get("footprint", 1),
            old_grid_config, new_grid_config,
        )
        if new_x != board_token.get("x") or new_y != board_token.get("y"):
            any_token_moved = True
            resnapped_tokens.append({**board_token, "x": new_x, "y": new_y})
        else:
            resnapped_tokens.append(board_token)

    if not any_token_moved:
        return None

    if not await GameService.replace_map_token_board(room_id, asset_id, resnapped_tokens):
        logger.error(f"Grid re-snap board write failed for room {room_id}, map {asset_id}")
        return None

    return {
        "event_type": "map_token_state_update",
        "data": {
            "asset_id": asset_id,
            "tokens": resnapped_tokens,
            "op": "resnap",
            "token_id": None,
            "updated_by": updated_by,
        },
    }


async def send_map_token_fragment(manager, room_id: str, fragment: Dict[str, Any]) -> None:
    """Deliver a map_token_state_update with per-recipient hidden filtering
    (decision 17) — the shared rail for server-initiated board rewrites
    like the grid re-snap. Hidden tokens must never reach player clients,
    whichever path emits the board. Fast path: nothing hidden → one room
    broadcast, exactly as v1 behaved."""
    fragment_tokens = fragment["data"]["tokens"]
    if not any(board_token.get("hidden") for board_token in fragment_tokens):
        await manager.update_room_data(room_id, fragment)
        return

    dm_user_id = await GameService.get_dm_user_id(room_id)
    player_fragment = {
        **fragment,
        "data": {**fragment["data"], "tokens": filter_hidden_tokens(fragment_tokens)},
    }
    for recipient_user_id in list(manager.room_users.get(room_id, {}).keys()):
        recipient_fragment = fragment if recipient_user_id == dm_user_id else player_fragment
        await manager.send_to_player(room_id, recipient_user_id, recipient_fragment)


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
    async def _get_player_metadata(room_id: str) -> Dict[str, Any]:
        room = await GameService.get_room(room_id) or {}
        player_metadata = room.get("player_metadata", {})
        return player_metadata if isinstance(player_metadata, dict) else {}

    @staticmethod
    async def _display_name(room_id: str, user_id: str, player_metadata: Optional[Dict[str, Any]] = None) -> str:
        """Resolve user_id to display name via player_metadata.

        NEVER returns a raw user_id (UUID = PII). Falls back to a neutral, non-identifying
        default when no name is known.
        """
        if not user_id:
            return "Unknown Adventurer"
        if player_metadata is None:
            player_metadata = await WebsocketEvent._get_player_metadata(room_id)
        metadata = player_metadata.get(user_id, {}) if isinstance(player_metadata, dict) else {}
        return metadata.get("player_name") or "Unknown Adventurer"

    @staticmethod
    async def _character_name_for_prompt(room_id: str, user_id: str, player_metadata: Optional[Dict[str, Any]] = None) -> str:
        if not user_id:
            return "Unknown Adventurer"

        if player_metadata is None:
            player_metadata = await WebsocketEvent._get_player_metadata(room_id)

        metadata = player_metadata.get(user_id, {}) if isinstance(player_metadata, dict) else {}
        # Never fall through to user_id (UUID = PII).
        return metadata.get("character_name") or metadata.get("player_name") or "Unknown Adventurer"

    @staticmethod
    async def player_connection(websocket, data, event_data, user_id, client_id, manager):
        # Note: manager.connect() is already called in app_websocket.py
        # This event just handles the logging and broadcast

        display_name = await WebsocketEvent._display_name(client_id, user_id)

        # Log player connection to database
        log_message = format_message(MESSAGE_TEMPLATES["player_connected"], player=display_name)

        await adventure_log.add_log_entry(
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
        """Broadcast the seat layout after a change.

        Reads the AUTHORITATIVE layout rather than trusting the array the
        client sent. The sender built its array before its own change landed,
        so under two simultaneous joins each client would broadcast a picture
        missing the other's seat, and whichever arrived last would win on every
        screen — the same stale-copy problem as the write, one layer up
        (plan api-game/03). The write itself happens over HTTP, before this
        event; this handler only reflects the result to the room.

        Validates its own payload: the router used to do this before
        dispatching, which meant the one handler with a shape requirement had
        it enforced somewhere else entirely. The error result reaches the
        sender only, exactly as the router's inline reply did.
        """
        seat_layout = await GameService.get_seat_layout(client_id)
        if not isinstance(seat_layout, list):
            return WebsocketEventResult.error("Room has no seat layout.")

        print(f"📡 Broadcasting seat layout change for room {client_id}: {seat_layout}")

        # Update party status for all users based on seat layout
        for uid in manager.room_users.get(client_id, {}):
            is_in_party = uid in seat_layout
            manager.update_party_status(client_id, uid, is_in_party)

        # Phase I: pull this player's latest character snapshot from api-site so runtime changes
        # (level-up, HP, AC) flow into player_metadata on the next seat interaction. Best-effort.
        try:
            metadata = await WebsocketEvent._get_player_metadata(client_id) or {}
            character_id = (metadata.get(user_id) or {}).get("character_id")
            if character_id:
                summary = await fetch_character_summary(character_id)
                if summary:
                    summary["user_id"] = user_id
                    await GameService.update_player_character(client_id, summary)
        except Exception as e:
            print(f"⚠️ Character snapshot refresh failed for {user_id}: {e}")

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

        player_metadata = await WebsocketEvent._get_player_metadata(client_id)
        target_character = await WebsocketEvent._character_name_for_prompt(client_id, prompted_player, player_metadata)
        prompted_by_name = await WebsocketEvent._display_name(client_id, prompted_by, player_metadata)

        # Log the prompt to adventure log with prompt_id for later removal
        log_message = format_message(MESSAGE_TEMPLATES["dice_prompt"], target=target_character, roll_type=roll_type)

        await adventure_log.add_log_entry(
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
        if not players_to_prompt:
            # Nothing to prompt. Silent by design — the router dropped this
            # before dispatch and never answered the sender, so returning no
            # broadcast keeps the behaviour identical.
            logger.warning("No players provided for initiative prompt")
            return WebsocketEventResult(broadcast_message=None)

        prompted_by = event_data.get("prompted_by", user_id)
                
        # Generate unique initiative prompt ID for potential removal
        initiative_prompt_id = f"initiative_all_{int(time.time() * 1000)}"

        player_metadata = await WebsocketEvent._get_player_metadata(client_id)

        character_targets = [
            await WebsocketEvent._character_name_for_prompt(client_id, player, player_metadata)
            for player in players_to_prompt
        ]
        
        # Log ONE adventure log entry for the collective action
        log_message = format_message(MESSAGE_TEMPLATES["initiative_prompt"], players=", ".join(character_targets))
        
        prompted_by_name = await WebsocketEvent._display_name(client_id, prompted_by, player_metadata)

        await adventure_log.add_log_entry(
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
                deleted_count = await adventure_log.remove_log_by_prompt_id(client_id, prompt_id)
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
                deleted_count = await adventure_log.remove_log_by_prompt_id(client_id, initiative_prompt_id)
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
        
        await adventure_log.add_log_entry(
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
                deleted_count = await adventure_log.remove_log_by_prompt_id(client_id, prompt_id)
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
        display_name = await WebsocketEvent._display_name(client_id, user_id)

        template_key = "combat_started" if action == "started" else "combat_ended"
        log_message = format_message(MESSAGE_TEMPLATES[template_key], player=display_name)

        await adventure_log.add_log_entry(
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
        display_name = await WebsocketEvent._display_name(client_id, user_id)

        max_players = event_data.get("max_players")
        displaced_players = event_data.get("displaced_players", [])

        log_message = f"Seat count changed to {max_players} by {display_name}"
        if displaced_players:
            displaced_names = [p.get("playerName", p.get("userId", "unknown")) for p in displaced_players]
            log_message += f". Moved to lobby: {', '.join(displaced_names)}"

        await adventure_log.add_log_entry(
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
        
        await adventure_log.add_log_entry(
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
        
        await adventure_log.add_log_entry(
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
        display_name = await WebsocketEvent._display_name(client_id, user_id)
        kicked_name = await WebsocketEvent._display_name(client_id, kicked_user_id)

        log_message = format_message(MESSAGE_TEMPLATES["player_kicked"], player=kicked_name)

        await adventure_log.add_log_entry(
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
            deleted_count = await adventure_log.clear_system_messages(client_id)
            
            log_message = format_message(MESSAGE_TEMPLATES["messages_cleared"], player=cleared_by, count=deleted_count)
            
            await adventure_log.add_log_entry(
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
            deleted_count = await adventure_log.clear_all_messages(client_id)
            
            log_message = format_message(MESSAGE_TEMPLATES["messages_cleared"], player=cleared_by, count=deleted_count)
            
            await adventure_log.add_log_entry(
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
        """Handle character color changes.

        Color is character-owned (it rides player_metadata and follows the
        player between seats); the seat only displays it. Cold persistence
        happens at session end, when api-site syncs player colors back onto
        character rows."""
        player_changing = event_data.get("player")  # user_id whose character color is changing
        new_color = event_data.get("new_color")
        changed_by = event_data.get("changed_by", user_id)

        if not all([player_changing, new_color]):
            error_message = {
                "event_type": "error",
                "data": "Color change requires player and new_color"
            }
            return WebsocketEventResult(broadcast_message=error_message)

        try:
            await GameService.update_player_color(client_id, player_changing, new_color)

            print(f"🎨 {changed_by} changed {player_changing}'s character color to {new_color}")

            broadcast_message = {
                "event_type": "color_change",
                "data": {
                    "player": player_changing,
                    "new_color": new_color,
                    "changed_by": changed_by
                }
            }

            return WebsocketEventResult(broadcast_message=broadcast_message)

        except Exception as e:
            error_msg = f"Failed to update character color: {str(e)}"
            print(f"❌ {error_msg}")

            error_message = {
                "event_type": "error",
                "data": error_msg
            }
            return WebsocketEventResult(broadcast_message=error_message)

    @staticmethod
    async def player_disconnect(websocket, data, event_data, user_id, client_id, manager):
        """Handle player disconnect event"""
        display_name = await WebsocketEvent._display_name(client_id, user_id)

        # A user can have more than one socket for a room (second tab, or a
        # reconnect that raced the old socket's close). Only the CURRENT one
        # closing means the user left; a stale duplicate closing must drop
        # itself and nothing else. Since decision 54 removed idle expiry, an
        # unguarded teardown here is the only remaining way a live hand can
        # lose its map-token holds mid-drag.
        if not manager.is_current_connection(websocket, client_id, user_id):
            logger.info(
                "MAPTOKENS stale socket closed for user %s in room %s — "
                "live connection kept, holds untouched", user_id, client_id)
            manager.remove_connection(websocket, client_id, user_id)
            return WebsocketEventResult(broadcast_message=None)

        # Drop any map-token holds the leaver had — remote clients clear their
        # lift affordances off this handler's player_disconnected broadcast.
        released_hold_keys = map_token_holds.release_all_for_user(client_id, user_id)
        for released_asset_id, released_token_id in released_hold_keys:
            _hidden_held_tokens.discard((client_id, released_asset_id, released_token_id))

        # Log player disconnection to database
        log_message = format_message(MESSAGE_TEMPLATES["player_disconnected"], player=display_name)

        await adventure_log.add_log_entry(
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
            current_seats = await GameService.get_seat_layout(client_id)

            # Remove disconnected user from their seat
            updated_seats = [
                "empty" if seat == user_id else seat
                for seat in current_seats
            ]

            # Update seat layout in database (may fail if room was deleted)
            await GameService.update_seat_layout(client_id, updated_seats)

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

        display_name = await WebsocketEvent._display_name(client_id, user_id)
        target_name = await WebsocketEvent._display_name(client_id, target_user_id)

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
        await adventure_log.add_log_entry(
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
                    await GameService.update_audio_state(client_id, channel_id, channel_state.model_dump())
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
    async def spotify_control(websocket, data, event_data, user_id, client_id, manager):
        """DM-only control of the synced Spotify BGM bed.

        Mirrors the remote-audio anchor model: `started_at` is a server epoch-seconds
        anchor for position 0 of the current track; `paused_elapsed` freezes the
        playhead while paused. Every client — including a late-joiner reading the
        snapshot from initial_state — computes `position = now - started_at` to drive
        its own Spotify SDK player. v1: a single track that loops.
        """
        event_data = event_data or {}
        action = event_data.get("action")
        triggered_by = event_data.get("triggered_by", user_id)

        if action not in ("sync", "select", "play", "pause", "stop", "channel_volume"):
            return WebsocketEventResult.error(f"Invalid spotify action: {action}")

        # DM-only: the Spotify bed is authoritative for the whole table.
        if not await GameService.is_dm(client_id, user_id):
            return WebsocketEventResult.error("Only the DM can control Spotify playback")

        # Normalise through the contract: fills defaults (e.g. channel_level = -12 dB) for
        # any document predating a field, and fails loudly on drift instead of guessing.
        current = SpotifyState(**(await GameService.get_spotify_state(client_id) or {})).model_dump()
        now = time.time()

        if action == "sync":
            # Leader model: the DM's client reports its live SDK state (track, playing,
            # position, playlist context) and the server anchors it. This is what drives
            # continuous playlists, next/prev and seek — the DM's Spotify is the source of
            # truth, we just mirror it to everyone.
            track_uri = event_data.get("track_uri")
            if not track_uri:
                snapshot = {
                    "track_uri": None, "track_meta": {},
                    "context_uri": event_data.get("context_uri"),
                    "playback_state": "stopped", "started_at": None,
                    "paused_elapsed": None, "is_looping": False,
                    "channel_level": current["channel_level"],
                    "updated_by": triggered_by,
                }
            else:
                is_playing = bool(event_data.get("is_playing"))
                pos_sec = (event_data.get("position_ms") or 0) / 1000.0
                snapshot = {
                    "context_uri": event_data.get("context_uri"),
                    "track_uri": track_uri,
                    "track_meta": event_data.get("track_meta", {}),
                    "playback_state": "playing" if is_playing else "paused",
                    "started_at": (now - pos_sec) if is_playing else None,
                    "paused_elapsed": None if is_playing else pos_sec,
                    "is_looping": False,
                    "channel_level": current["channel_level"],
                    "updated_by": triggered_by,
                }

        elif action == "select":
            track_uri = event_data.get("track_uri")
            if not track_uri:
                return WebsocketEventResult.error("spotify select requires track_uri")
            snapshot = {
                "track_uri": track_uri,
                "track_meta": event_data.get("track_meta", {}),
                "playback_state": "playing",
                "started_at": now,
                "paused_elapsed": None,
                "is_looping": True,  # v1: single track loops
                "channel_level": current["channel_level"],
                "updated_by": triggered_by,
            }

        elif action == "play":
            if not current.get("track_uri"):
                return WebsocketEventResult.error("No Spotify track selected")
            paused_elapsed = current.get("paused_elapsed") or 0
            snapshot = {
                **current,
                "playback_state": "playing",
                "started_at": now - paused_elapsed,
                "paused_elapsed": None,
                "updated_by": triggered_by,
            }

        elif action == "pause":
            started_at = current.get("started_at")
            paused_elapsed = (now - started_at) if started_at else (current.get("paused_elapsed") or 0)
            snapshot = {
                **current,
                "playback_state": "paused",
                "paused_elapsed": paused_elapsed,
                "updated_by": triggered_by,
            }

        elif action == "stop":
            snapshot = {
                **current,
                "playback_state": "stopped",
                "started_at": None,
                "paused_elapsed": None,
                "updated_by": triggered_by,
            }

        else:  # channel_volume — mixer level for the Spotify bed; leaves playback untouched
            level_raw = event_data.get("level")
            if level_raw is None:
                return WebsocketEventResult.error("channel_volume requires a numeric level")
            try:
                level = max(0.0, min(1.0, float(level_raw)))
            except (TypeError, ValueError):
                return WebsocketEventResult.error("channel_volume requires a numeric level")
            snapshot = {**current, "channel_level": level, "updated_by": triggered_by}

        await GameService.update_spotify_state(client_id, snapshot)
        logger.info(f"🎵 Spotify {action} by {triggered_by} in room {client_id}")

        return WebsocketEventResult(
            broadcast_message={"event_type": "spotify_state", "data": snapshot}
        )

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
            current_audio_state = await GameService.get_audio_state(client_id)

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
                    await GameService.update_audio_state(client_id, track_id, channel_state.model_dump())

                elif operation == "stop":
                    # Stop playback but keep track loaded in channel
                    ch = current_audio_state.get(track_id, {})
                    channel_state = AudioChannelState(
                        **{**ch, "playback_state": "stopped", "started_at": None, "paused_elapsed": None}
                    )
                    await GameService.update_audio_state(client_id, track_id, channel_state.model_dump())

                elif operation == "pause":
                    ch = current_audio_state.get(track_id, {})
                    started_at = ch.get("started_at")
                    paused_elapsed = (time.time() - started_at) if started_at else 0
                    channel_state = AudioChannelState(
                        **{**ch, "playback_state": "paused", "paused_elapsed": paused_elapsed}
                    )
                    await GameService.update_audio_state(client_id, track_id, channel_state.model_dump())

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
                    await GameService.update_audio_state(client_id, track_id, channel_state.model_dump())

                elif operation == "volume":
                    ch = current_audio_state.get(track_id, {}) if current_audio_state else {}
                    channel_state = AudioChannelState(**{**ch, "volume": op.get("volume")})
                    await GameService.update_audio_state(client_id, track_id, channel_state.model_dump())

                elif operation == "loop":
                    ch = current_audio_state.get(track_id, {}) if current_audio_state else {}
                    loop_update = {"looping": op.get("looping")}
                    if op.get("loop_mode") is not None:
                        loop_update["loop_mode"] = op.get("loop_mode")
                    channel_state = AudioChannelState(**{**ch, **loop_update})
                    await GameService.update_audio_state(client_id, track_id, channel_state.model_dump())

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
                        await GameService.save_track_config(client_id, old_asset_id, track_config.model_dump())

                    # 2. Check for saved config for incoming track
                    new_asset_id = op.get("asset_id")
                    saved_config = await GameService.get_track_config(client_id, new_asset_id) if new_asset_id else None

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

                    await GameService.update_audio_state(client_id, track_id, channel_state.model_dump())

                    # 4. Remove saved config (it's now active in a channel)
                    if new_asset_id and saved_config:
                        await GameService.remove_track_config(client_id, new_asset_id)

                    # Update op so the broadcast carries the resolved config
                    op["volume"] = channel_state.volume
                    op["looping"] = channel_state.looping
                    op["effects"] = channel_state.effects.model_dump()
                    op["paused_elapsed"] = channel_state.paused_elapsed

                elif operation == "effects":
                    ch = current_audio_state.get(track_id, {})
                    channel_state = AudioChannelState(**{**ch, "effects": op.get("effects", {})})
                    await GameService.update_audio_state(client_id, track_id, channel_state.model_dump())

                elif operation == "mute":
                    ch = current_audio_state.get(track_id, {})
                    channel_state = AudioChannelState(**{**ch, "muted": op.get("muted", False)})
                    await GameService.update_audio_state(client_id, track_id, channel_state.model_dump())

                elif operation == "solo":
                    ch = current_audio_state.get(track_id, {})
                    channel_state = AudioChannelState(**{**ch, "soloed": op.get("soloed", False)})
                    await GameService.update_audio_state(client_id, track_id, channel_state.model_dump())

                elif operation == "master_volume":
                    # Store broadcast master volume as a top-level field on audio_state
                    await GameService.update_audio_state(client_id, "__master_volume", op.get("volume", 1.0))

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
                        await GameService.save_track_config(client_id, old_asset_id, track_config.model_dump())

                    channel_state = AudioChannelState(
                        volume=op.get("volume", 0.8),
                        looping=False,
                    )
                    await GameService.update_audio_state(client_id, track_id, channel_state.model_dump())

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
            existing_map = await map_service.get_room_map_by_filename(
                room_id, mc_data.get("filename")
            )
            existing_mc = existing_map.get("map_config", {}) if existing_map else {}

            preserved = _merge_preserved_map_fields(incoming=mc_data, existing=existing_mc)

            # Build MapConfig via passthrough: take everything the frontend
            # sent, layer in the merged-preserved values for the cargo
            # fields, validate. Any new MapConfig field added later is
            # forwarded automatically — no field list to keep in sync.
            # Pydantic's `extra='forbid'` makes shape drift fail loudly.
            map_config = MapConfig.model_validate({
                **mc_data,
                "grid_config":      preserved["grid_config"],
                "fog_config":       preserved["fog_config"],
                "map_image_config": preserved["map_image_config"],
                "pc_token_scale":   preserved["pc_token_scale"],
            })
            map_settings = MapSettings(
                room_id=room_id,
                uploaded_by=user_id,
                map_config=map_config,
            )
            
            # Save to database
            success = await map_service.set_active_map(room_id, map_settings)
            
            if success:
                # Get the actual saved map from database (includes preserved grid_config)
                saved_map = await map_service.get_active_map(room_id)
                
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
            success = await map_service.clear_active_map(room_id)
            
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
        display_name = await WebsocketEvent._display_name(room_id, user_id)
        filename = event_data.get("filename")
        grid_config = event_data.get("grid_config")
        map_image_config = event_data.get("map_image_config")
        
        if not room_id:
            print(f"❌ Invalid map config update request: missing room_id")
            return WebsocketEventResult(broadcast_message={"error": "Invalid map config update request"})
        
        try:
            # Capture the pre-update grid + the map's asset_id: token boards
            # are keyed by asset_id and the exact-cell re-snap (decision 20)
            # needs the old lattice to know which cell each token was in.
            active_map = await map_service.get_active_map(room_id)
            active_map_config = (active_map or {}).get("map_config", {})
            old_grid_config = None
            map_asset_id = None
            if active_map_config.get("filename") == filename:
                old_grid_config = active_map_config.get("grid_config")
                map_asset_id = active_map_config.get("asset_id")

            # Update in database
            print(f"🗺️ Updating map config in database for room {room_id}, filename {filename}")
            print(f"   Grid config: {grid_config}")
            print(f"   Map image config: {map_image_config}")

            success = await map_service.update_map_config(
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

                # Exact-cell re-snap: rewrite the board for the new lattice
                # and reconcile every client wholesale. Sent from here (the
                # dispatcher broadcasts config_update_message after we
                # return); both messages are self-contained so the one-tick
                # ordering gap is cosmetic only.
                resnap_fragment = await grid_resnap_fragment(
                    room_id, map_asset_id, user_id, old_grid_config, grid_config
                )
                if resnap_fragment:
                    # Per-recipient delivery — a raw room broadcast here
                    # would hand players every hidden token's position
                    # (decision 17).
                    await send_map_token_fragment(manager, room_id, resnap_fragment)
                    print(f"🗺️ Re-snapped {len(resnap_fragment['data']['tokens'])} tokens for room {room_id}")

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
            success = await map_service.update_fog_config(room_id, filename, fog_config)
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
    def _map_token_display_name(token: Dict[str, Any], player_metadata: Dict[str, Any]) -> str:
        """Name a token for log lines: owner's character name, else its label.
        Never a raw user_id (UUID = PII)."""
        owner_user_id = token.get("owner_user_id") or ""
        owner_metadata = player_metadata.get(owner_user_id, {}) if isinstance(player_metadata, dict) else {}
        fallback = "an NPC" if token.get("kind") == "npc" else "Unknown Adventurer"
        return owner_metadata.get("character_name") or token.get("label") or fallback

    @staticmethod
    async def _map_token_place_cell_suffix(room_id: str, asset_id: str, token: Dict[str, Any]) -> str:
        """' at D7' when the placed token lands on the active map's addressable
        grid; empty string otherwise (gridless, untuned, off-grid, or the op
        targets a non-active map's board)."""
        active_map = await map_service.get_active_map(room_id)
        map_config = active_map.get("map_config", {}) if active_map else {}
        if map_config.get("asset_id") != asset_id:
            return ""

        cell_label = grid_cell_label(token["x"], token["y"], map_config.get("grid_config"))
        return f" at {cell_label}" if cell_label else ""

    @staticmethod
    async def _write_map_token_log(room_id: str, user_id: str, template_key: str,
                             subject_token: Dict[str, Any], cell_suffix: str = "") -> str:
        """Resolve names, format one map-token log line, and persist it.
        Called only from branches that actually log — routine ops must not
        pay the metadata fetch (see map_token_update docstring)."""
        player_metadata = await WebsocketEvent._get_player_metadata(room_id)
        mover_name = await WebsocketEvent._display_name(room_id, user_id, player_metadata)
        token_name = WebsocketEvent._map_token_display_name(subject_token, player_metadata)
        log_message = format_message(
            MESSAGE_TEMPLATES[template_key],
            player=mover_name, token=token_name, cell_suffix=cell_suffix
        )
        await adventure_log.add_log_entry(
            room_id=room_id,
            message=log_message,
            log_type=LogType.SYSTEM,
            from_player=None
        )
        return log_message

    @staticmethod
    async def map_token_update(websocket, data, event_data, user_id, client_id, manager):
        """Lane 1 — committed MapToken state (authoritative).

        Validates shape + invariants (MapToken contract: finite x/y,
        footprint 1–4), applies the op as one atomic Mongo array update via
        NOT atomic across the read → write → read-back sequence: each await
        is a suspension point where another client's commit can interleave.
        Accepted by design — ops are per-token positional $sets, so two
        players committing different tokens cannot clobber each other, and
        same-token races are last-write-wins (product decision 11). A
        read-back that includes someone else's newer commit broadcasts a more
        current board, never a wrong one.

        GameService.apply_map_token_op, then broadcasts the map's full token
        array as the reconciliation fragment (fog's no-flicker philosophy —
        the array is tiny). Attribution (created_by/updated_by) is stamped
        from the connection's user_id, never trusted from the wire.

        Adventure-log rules (inform, don't enforce):
          place  → always ("Matt placed Elara at D7")
          remove → always ("Matt removed Goblin 3")
          move   → only when a pc token is moved by someone other than its
                   owner — the social-correction signal. Routine own-token
                   and npc moves are not logged (log-flood informs nobody).
        """
        room_id = client_id
        event_data = event_data or {}
        asset_id = event_data.get("asset_id")
        op = event_data.get("op")

        if not is_valid_asset_key(asset_id):
            return WebsocketEventResult.error("Invalid map token update: bad asset_id")
        if op not in VALID_MAP_TOKEN_OPS:
            return WebsocketEventResult.error(f"Invalid map token op: {op}")

        token_payload = None
        token_id = event_data.get("token_id")
        if op == "remove":
            if not token_id or not isinstance(token_id, str):
                return WebsocketEventResult.error("Invalid map token remove: missing token_id")
        else:
            try:
                token = MapToken.model_validate(event_data.get("token"))
            except ValidationError as validation_error:
                return WebsocketEventResult.error(f"Invalid map token payload: {validation_error}")
            if op == "place":
                token = token.model_copy(update={"created_by": user_id})
            token_id = token.id
            token_payload = token.model_dump()

        # One projection read serves the whole op: DM identity (ACL +
        # filtering), the pre-op board (target lookup, denial answer), and
        # the image refs (place/reveal fragments carry them).
        dm_user_id, pre_op_board, room_token_images = await GameService.get_room_token_context(room_id, asset_id)
        sender_is_dm = dm_user_id is not None and user_id == dm_user_id

        # Pre-op snapshot for every non-place op: the ACL/lock checks need
        # the board's version of the target (the wire payload is never
        # trusted for kind/locked/hidden), and remove's log needs the name
        # of what's vanishing before it goes.
        pre_op_token = None
        if op != "place":
            for existing_token in pre_op_board:
                if existing_token.get("id") == token_id:
                    pre_op_token = existing_token
                    break

        target_kind = token_payload.get("kind") if op == "place" else (pre_op_token or {}).get("kind")

        # ACL (decisions 16/18/19). The client UI never offers these ops —
        # the deny is the backstop against tampered clients, answered to the
        # sender only with the authoritative board so their optimistic
        # commit reconciles away.
        denial_reason = None
        if target_kind == "npc" and not sender_is_dm:
            # An ASSIGNED npc token — a player's minion/companion — is
            # player-side: anyone may move it, exactly the decision-2
            # table-feel pc tokens have. Move (plus its grab) is the only
            # op that opens; place, remove, and configure stay the DM's.
            companion_move_allowed = (
                op == "move"
                and pre_op_token is not None
                and bool(pre_op_token.get("owner_user_id"))
            )
            if not companion_move_allowed:
                denial_reason = "npc tokens are the DM's to command"
        if denial_reason is None and op in ("move", "remove") and pre_op_token and pre_op_token.get("locked"):
            denial_reason = "token is locked"
        if (denial_reason is None and op == "configure" and pre_op_token
                and pre_op_token.get("kind") == "pc"):
            if token_payload.get("hidden") or token_payload.get("locked"):
                denial_reason = "hidden/locked are npc-only flags"
            elif token_payload.get("owner_user_id") != pre_op_token.get("owner_user_id"):
                denial_reason = "pc token ownership is identity"

        if denial_reason:
            sender_tokens = pre_op_board if sender_is_dm else filter_hidden_tokens(pre_op_board)
            await websocket.send_json({
                "event_type": "map_token_state_update",
                "data": {
                    "asset_id": asset_id,
                    "tokens": sender_tokens,
                    "op": "denied",
                    "token_id": token_id,
                    "updated_by": user_id,
                    "log_message": None,
                    "denied_reason": denial_reason,
                },
            })
            logger.warning(
                f"Map token op denied ({denial_reason}): {op} on {token_id} by {user_id} in {room_id}")
            return WebsocketEventResult(broadcast_message=None)

        try:
            tokens = await GameService.apply_map_token_op(
                room_id, asset_id, op, token=token_payload, token_id=token_id
            )
        except ValueError as op_error:
            return WebsocketEventResult.error(str(op_error))

        was_hidden = bool(pre_op_token.get("hidden")) if pre_op_token else False
        now_hidden = bool(token_payload.get("hidden")) if token_payload else was_hidden

        # Adventure-log rules (inform, don't enforce) — with one carve-out:
        # ops on hidden tokens log NOTHING ("placed Goblin at D7" would be
        # the ambush on a plate, decision 17). The reveal is the log moment.
        log_message = None
        if op == "place" and not token_payload.get("hidden"):
            cell_suffix = await WebsocketEvent._map_token_place_cell_suffix(room_id, asset_id, token_payload)
            log_message = await WebsocketEvent._write_map_token_log(
                room_id, user_id, "map_token_placed", token_payload, cell_suffix
            )
        elif op == "remove" and pre_op_token and not was_hidden:
            log_message = await WebsocketEvent._write_map_token_log(
                room_id, user_id, "map_token_removed", pre_op_token
            )
        elif op == "move":
            moved_token = None
            for candidate_token in tokens:
                if candidate_token.get("id") == token_id:
                    moved_token = candidate_token
                    break
            # The social-correction signal: log a pc token — or an assigned
            # companion — moved by someone other than its owner. Routine
            # own-token and plain-npc moves stay unlogged (log-flood
            # informs nobody).
            if moved_token and (moved_token.get("kind") == "pc"
                                or moved_token.get("owner_user_id")):
                owner_user_id = moved_token.get("owner_user_id")
                if owner_user_id and owner_user_id != user_id:
                    move_template = ("map_token_moved_by_other"
                                     if moved_token.get("kind") == "pc"
                                     else "map_token_moved_party")
                    log_message = await WebsocketEvent._write_map_token_log(
                        room_id, user_id, move_template, moved_token
                    )
        elif op == "configure" and was_hidden and not now_hidden:
            revealed_token = None
            for candidate_token in tokens:
                if candidate_token.get("id") == token_id:
                    revealed_token = candidate_token
                    break
            if revealed_token:
                cell_suffix = await WebsocketEvent._map_token_place_cell_suffix(room_id, asset_id, revealed_token)
                log_message = await WebsocketEvent._write_map_token_log(
                    room_id, user_id, "map_token_revealed", revealed_token, cell_suffix
                )
                # Reveal mid-hold: stop suppressing its drag relays.
                _hidden_held_tokens.discard((room_id, asset_id, token_id))
        elif op == "configure" and not was_hidden and now_hidden:
            # Hide mid-hold: start suppressing its drag relays (the
            # symmetric case of the reveal discard above).
            if map_token_holds.holder(room_id, asset_id, token_id) is not None:
                _hidden_held_tokens.add((room_id, asset_id, token_id))

        if op == "place":
            player_view_changed = not token_payload.get("hidden")
        elif op in ("move", "remove"):
            player_view_changed = not was_hidden
        else:  # configure — visible at either end reaches players
            player_view_changed = (not was_hidden) or (not now_hidden)

        fragment_data = {
            "asset_id": asset_id,
            "tokens": tokens,
            "op": op,
            "token_id": token_id,
            "updated_by": user_id,
            "log_message": log_message,
        }

        # A token entering the players' world (placed visible, or revealed)
        # may carry an image ref they never received — initial_state only
        # delivers refs for tokens visible at connect (decision 17 covers
        # artwork identity too). Piggyback the ref on this fragment.
        token_enters_view = (
            (op == "place" and player_view_changed)
            or (op == "configure" and was_hidden and not now_hidden)
        )
        if token_enters_view:
            post_op_target = None
            for candidate_token in tokens:
                if candidate_token.get("id") == token_id:
                    post_op_target = candidate_token
                    break
            target_image_id = (post_op_target or {}).get("image_asset_id")
            if target_image_id and room_token_images.get(target_image_id):
                fragment_data["token_images"] = {target_image_id: room_token_images[target_image_id]}

        # Per-recipient hidden filtering (decision 17). Fast path: a board
        # with nothing hidden broadcasts identically to everyone, exactly as
        # v1 did. Otherwise the DM gets the full board and players get the
        # filtered one — and an op that lives entirely in the hidden layer
        # (placing/moving/removing a hidden token) sends players nothing at
        # all: even op metadata would tip the ambush.
        board_has_hidden = any(board_token.get("hidden") for board_token in tokens)
        if not board_has_hidden and not was_hidden:
            return WebsocketEventResult(
                broadcast_message={"event_type": "map_token_state_update", "data": fragment_data})

        player_tokens = filter_hidden_tokens(tokens)
        for recipient_user_id in list(manager.room_users.get(room_id, {}).keys()):
            if recipient_user_id == dm_user_id:
                recipient_tokens = tokens
            elif player_view_changed:
                recipient_tokens = player_tokens
            else:
                continue
            await manager.send_to_player(room_id, recipient_user_id, {
                "event_type": "map_token_state_update",
                "data": {**fragment_data, "tokens": recipient_tokens},
            })
        return WebsocketEventResult(broadcast_message=None)

    @staticmethod
    async def map_token_drag(websocket, data, event_data, user_id, client_id, manager):
        """Lane 2 — ephemeral drag presence. No Mongo write, no log (the
        remote_audio_resume precedent), but not a pure relay: grabs go through
        the in-memory hold map (product decision 11 — first hand on the mini
        wins; concurrency, not ownership).

        v1 clients send grab/release only. "move" is accepted and relayed
        (holder-validated) so the live-drag fast-follow is a client-side flag
        flip, not a backend deploy. A denied grab is answered to the requester
        only (map_token_drag_denied) — their optimistic drag snaps back.
        """
        room_id = client_id
        event_data = event_data or {}
        asset_id = event_data.get("asset_id")
        token_id = event_data.get("token_id")
        phase = event_data.get("phase")

        if not is_valid_asset_key(asset_id):
            return WebsocketEventResult.error("Invalid map token drag: bad asset_id")
        if not token_id:
            return WebsocketEventResult.error("Invalid map token drag: missing token_id")
        if phase not in ("grab", "move", "release"):
            return WebsocketEventResult.error(f"Invalid map token drag phase: {phase}")

        drag_x = event_data.get("x")
        drag_y = event_data.get("y")
        for coordinate in (drag_x, drag_y):
            if coordinate is not None:
                if not isinstance(coordinate, (int, float)) or isinstance(coordinate, bool) \
                        or not math.isfinite(coordinate):
                    return WebsocketEventResult.error("Invalid map token drag: x/y must be finite numbers")

        if phase == "grab":
            # This read suspends, so the board it returns can be a few
            # milliseconds stale by the time try_grab runs below. Accepted:
            # the same class as any optimistic grab, and try_grab itself is
            # synchronous, so first-hand-wins stays exact.
            #
            # ACL before the hold (decisions 16/18): a non-DM grabbing an
            # npc token, or anyone grabbing a locked token, is denied on the
            # same rail as a concurrency loss — the optimistic drag snaps
            # back. One projection read at human hand frequency serves both
            # the target lookup and the DM check.
            grab_dm_user_id, grab_board, _grab_token_images = await GameService.get_room_token_context(room_id, asset_id)
            target_token = None
            for existing_token in grab_board:
                if existing_token.get("id") == token_id:
                    target_token = existing_token
                    break

            grab_denied = False
            if target_token and target_token.get("kind") == "npc":
                # Assigned companions are player-side (decision 2): open grab.
                if grab_dm_user_id != user_id and not target_token.get("owner_user_id"):
                    grab_denied = True
            if target_token and target_token.get("locked"):
                grab_denied = True

            blocking_holder = None
            if not grab_denied:
                blocking_holder = map_token_holds.try_grab(room_id, asset_id, token_id, user_id)

            if grab_denied or blocking_holder is not None:
                # Answered to the requester only — their optimistic drag snaps
                # back. held_by is a user_id (nameplate resolves client-side)
                # or None for an ACL/lock denial.
                deny_message = {
                    "event_type": "map_token_drag_denied",
                    "data": {
                        "asset_id": asset_id,
                        "token_id": token_id,
                        "held_by": blocking_holder,
                    },
                }
                await websocket.send_json(deny_message)
                return WebsocketEventResult(broadcast_message=None)

            # Cache the hidden flag for this hold: move frames are too hot
            # for a board read, and a hidden token's drag presence must not
            # reach player clients (decision 17).
            if target_token and target_token.get("hidden"):
                _hidden_held_tokens.add((room_id, asset_id, token_id))
        elif phase == "move":
            if map_token_holds.holder(room_id, asset_id, token_id) != user_id:
                # A frame from a hand that does not hold this token: a denied
                # grab still streaming, or frames overtaking their own
                # release. Drop silently — no error spam at stream frequency.
                return WebsocketEventResult(broadcast_message=None)
            # Nothing to refresh: holds have no clock (decision 54). A move
            # frame is movement, not proof of life.
        else:
            released = map_token_holds.release(room_id, asset_id, token_id, user_id)
            if not released and map_token_holds.holder(room_id, asset_id, token_id) is not None:
                # Someone else still holds this token — a spurious release
                # (denied grab's pointerup, stale client) must not clear the
                # real holder's lift affordance room-wide. Drop silently.
                return WebsocketEventResult(broadcast_message=None)
            # released, or already unheld (the holder's disconnect got here
            # first): relay so remote lift affordances clear; the lane-1
            # commit settles actual position.

        # Hidden token's hand: no relay at all (decision 17). Players don't
        # have the token; grab/frame/release presence would leak the ambush
        # (token id AND coordinates) to a websocket inspector. The DM is the
        # only client that could render it and filters its own echo anyway.
        if (room_id, asset_id, token_id) in _hidden_held_tokens:
            if phase == "release":
                _hidden_held_tokens.discard((room_id, asset_id, token_id))
            return WebsocketEventResult(broadcast_message=None)

        drag_message = {
            "event_type": "map_token_drag",
            "data": {
                "asset_id": asset_id,
                "token_id": token_id,
                "phase": phase,
                "x": drag_x,
                "y": drag_y,
                "holder_user_id": user_id,
            },
        }
        return WebsocketEventResult(broadcast_message=drag_message)

    @staticmethod
    async def map_request(websocket, data, event_data, user_id, client_id, manager):
        """Request current active map (for new players joining)"""
        room_id = client_id  # Use client_id as room_id
        
        if not room_id:
            print(f"❌ Invalid map request: missing room_id")
            return WebsocketEventResult(broadcast_message={"error": "Invalid map request"})
        
        try:
            # Get active map from database
            active_map = await map_service.get_active_map(room_id)
            
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
        display_name = await WebsocketEvent._display_name(room_id, user_id)
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

            success = await image_service.set_active_image(room_id, image_settings)

            if success:
                saved_image = await image_service.get_active_image(room_id)

                if saved_image:
                    log_message = f"🖼️ {display_name.title()} loaded image: {image_settings.image_config.original_filename}"
                    await adventure_log.add_log_entry(room_id, log_message, LogType.SYSTEM, user_id)

                    active_display = await image_service.get_active_display(room_id)

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
        display_name = await WebsocketEvent._display_name(room_id, user_id)

        if not room_id:
            print(f"❌ Invalid image clear request: missing room_id")
            return WebsocketEventResult(broadcast_message={"error": "Invalid image clear request"})

        try:
            success = await image_service.clear_active_image(room_id)

            if success:
                log_message = f"🖼️ {display_name.title()} cleared the active image"
                await adventure_log.add_log_entry(room_id, log_message, LogType.SYSTEM, user_id)

                active_display = await image_service.get_active_display(room_id)

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
            success = await image_service.update_image_config(
                room_id,
                image_fit=image_fit,
                display_mode=display_mode,
                aspect_ratio=aspect_ratio,
                image_position_x=image_position_x,
                image_position_y=image_position_y,
            )

            if success:
                saved_image = await image_service.get_active_image(room_id)
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
            active_image = await image_service.get_active_image(room_id)
            active_display = await image_service.get_active_display(room_id)

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