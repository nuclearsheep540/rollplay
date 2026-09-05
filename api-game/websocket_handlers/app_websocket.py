# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later
import logging
from fastapi import FastAPI, WebSocket
import asyncio

from starlette.websockets import WebSocketDisconnect

from gameservice import GameService

logger = logging.getLogger(__name__)

from .connection_manager import manager, RoomManager
from .websocket_events import WebsocketEvent
from map_token_ops import filter_map_token_state_for_player

# Wire event type -> handler. Written out EXPLICITLY, never
# getattr(WebsocketEvent, event_type): the same class also carries
# player_connection, player_disconnect, player_displaced and system_message,
# which the server invokes itself and no client may ever reach, plus the
# private name/metadata/log helpers. This dict IS the wire allowlist, so an
# event absent from it is refused and adding a handler cannot expose it to
# clients by accident.
#
# Every handler shares one signature and returns a WebsocketEventResult, which
# is what lets the receive loop below be a single body instead of one branch
# per event. Post-dispatch behaviour that is genuinely per-event (the seat
# lobby refresh, the dice follow-ups) is spelled out there rather than hidden
# in this table.
EVENT_HANDLERS = {
    "seat_change": WebsocketEvent.seat_change,
    "seat_count_change": WebsocketEvent.seat_count_change,
    "player_kicked": WebsocketEvent.player_kicked,
    "role_change": WebsocketEvent.role_change,
    "color_change": WebsocketEvent.color_change,
    "combat_state": WebsocketEvent.combat_state,
    "dice_roll": WebsocketEvent.dice_roll,
    "dice_prompt": WebsocketEvent.dice_prompt,
    "dice_prompt_clear": WebsocketEvent.dice_prompt_clear,
    "initiative_prompt_all": WebsocketEvent.initiative_prompt_all,
    "clear_system_messages": WebsocketEvent.clear_system_messages,
    "clear_all_messages": WebsocketEvent.clear_all_messages,
    "remote_audio_play": WebsocketEvent.remote_audio_play,
    "remote_audio_resume": WebsocketEvent.remote_audio_resume,
    "remote_audio_batch": WebsocketEvent.remote_audio_batch,
    "spotify_control": WebsocketEvent.spotify_control,
    "map_load": WebsocketEvent.map_load,
    "map_clear": WebsocketEvent.map_clear,
    "map_request": WebsocketEvent.map_request,
    "map_config_update": WebsocketEvent.map_config_update,
    "fog_config_update": WebsocketEvent.fog_config_update,
    "map_token_update": WebsocketEvent.map_token_update,
    "map_token_drag": WebsocketEvent.map_token_drag,
    "image_load": WebsocketEvent.image_load,
    "image_clear": WebsocketEvent.image_clear,
    "image_request": WebsocketEvent.image_request,
    "image_config_update": WebsocketEvent.image_config_update,
}

def register_websocket_routes(app: FastAPI):
    """Register WebSocket routes with the FastAPI app"""

    @app.websocket("/ws/{client_id}")
    async def websocket_endpoint(
        websocket: WebSocket,
        client_id: str,  # This should be your room_id
        user_id: str
    ):
        await manager.connect(websocket, client_id, user_id)

        # Create room-scoped manager for this connection
        room_manager = RoomManager(manager, client_id)

        # Send initial state to THIS client only (before broadcasting connection to others)
        try:
            room = await GameService.get_room(client_id)
            if room:
                # Hidden tokens never reach player clients (decision 17) —
                # this send is already per-socket, so filter right here.
                # The same rule covers token_images: an image referenced
                # only by hidden tokens would leak the monster's artwork,
                # so players get refs for visible-board images only (a
                # reveal fragment delivers the ref when it's needed).
                map_token_state = room.get("map_token_state", {})
                token_images = room.get("token_images", {})
                if user_id != room.get("dungeon_master", {}).get("user_id"):
                    map_token_state = filter_map_token_state_for_player(map_token_state)
                    visible_image_ids = set()
                    for visible_board in map_token_state.values():
                        for visible_token in visible_board:
                            if visible_token.get("image_asset_id"):
                                visible_image_ids.add(visible_token["image_asset_id"])
                    visible_token_images = {}
                    for image_id, image_ref in token_images.items():
                        if image_id in visible_image_ids:
                            visible_token_images[image_id] = image_ref
                    token_images = visible_token_images
                initial_state = {
                    "event_type": "initial_state",
                    "data": {
                        "seat_layout": room.get("seat_layout", []),
                        "dungeon_master": room.get("dungeon_master", {}),
                        "combat_active": room.get("combat_active", False),
                        "max_players": room.get("max_players", 8),
                        "campaign_id": room.get("campaign_id", ""),
                        "player_metadata": room.get("player_metadata", {}),
                        "audio_state": room.get("audio_state", {}),
                        "spotify": room.get("spotify", {}),
                        "map_token_state": map_token_state,
                        # Filtered for non-DM recipients above (decision 17:
                        # refs for hidden-only images would leak the
                        # monster's artwork; reveal fragments deliver the
                        # ref when the token enters the player's view).
                        "token_images": token_images
                    }
                }
                await websocket.send_json(initial_state)
                logger.debug(f"Sent initial state to {user_id}")
            else:
                logger.warning(f"Room {client_id} not found, skipping initial state")
        except Exception as e:
            logger.error(f"Error sending initial state: {e}")

        # Handle connection event and get result (broadcasts to ALL clients)
        result = await WebsocketEvent.player_connection(
            websocket=websocket,
            data={},
            event_data={},
            user_id=user_id,
            client_id=client_id,
            manager=manager
        )
        await room_manager.update_room_data(result.broadcast_message)

        try:
            while True:
                data = await websocket.receive_json()
                event_type = data.get("event_type")
                event_data = data.get("data")

                # Drag frames arrive ~20x/sec per dragging hand, and this log
                # is a synchronous stderr write on that hot path.
                if event_type != 'map_token_drag':
                    logger.debug(f"WebSocket received: {event_type} from {user_id}")

                handler = EVENT_HANDLERS.get(event_type)
                if handler is None:
                    logger.warning(f"Unknown WebSocket event type: {event_type}")
                    continue

                # One try for EVERY handler. Only map_load and image_load used
                # to have one; anywhere else an escaping exception broke out of
                # this loop and killed the socket, which since holds stopped
                # expiring (tokens decision 54) also stranded the player's
                # tokens for the life of the process.
                try:
                    result = await handler(
                        websocket=websocket,
                        data=data,
                        event_data=event_data,
                        user_id=user_id,
                        client_id=client_id,
                        manager=manager
                    )
                except Exception as handler_error:
                    logger.error(f"Exception in {event_type} handler: {handler_error}")
                    await websocket.send_json({
                        "event_type": "error",
                        "data": f"{event_type} failed: {str(handler_error)}"
                    })
                    continue

                # Nothing to broadcast: the handler already answered the sender
                # point-to-point (a denied grab, a per-recipient filtered
                # fragment, a request served directly) or deliberately stayed
                # silent. update_room_data must never be handed None — it would
                # send a bare null to every client in the room.
                if result.broadcast_message is None:
                    continue

                # Errors go to the sender alone, never to the room.
                if result.broadcast_message.get("event_type") == "error":
                    await websocket.send_json(result.broadcast_message)
                    continue

                # seat_change refreshes the lobby BEFORE its own broadcast, so
                # clients see lobby_update then seat_change. Moving it after
                # would reorder two messages they already depend on.
                if event_type == "seat_change":
                    await room_manager.broadcast_lobby_update()

                await room_manager.update_room_data(result.broadcast_message)

                # Follow-up sends for the dice flows. The delay is deliberate:
                # the roll has to land before the line that removes its log.
                if event_type == "dice_roll":
                    await asyncio.sleep(0.5)
                    if result.log_removal_message:
                        await room_manager.update_room_data(result.log_removal_message)
                    if result.clear_prompt_message:
                        await room_manager.update_room_data(result.clear_prompt_message)
                elif event_type == "dice_prompt_clear":
                    if result.log_removal_message:
                        await room_manager.update_room_data(result.log_removal_message)

        except WebSocketDisconnect:
            logger.debug(f"WebSocket closed by {user_id} in room {client_id}")
        except Exception as loop_error:
            # The receive itself failed (malformed frame, transport error), or
            # sending the handler's error reply did. Either way this socket is
            # finished; cleanup happens in the finally below.
            logger.error(f"WebSocket loop failed for {user_id} in room {client_id}: {loop_error}")
        finally:
            # Cleanup on EVERY exit path, not just a clean WebSocketDisconnect.
            # Holds no longer expire on their own, so a socket that left by any
            # other route used to keep this player's tokens held for the life
            # of the process. player_disconnect runs first and releases them,
            # so a later failure in the lobby broadcast cannot strand a token.
            result = await WebsocketEvent.player_disconnect(
                websocket=websocket,
                data={},
                event_data={},
                user_id=user_id,
                client_id=client_id,
                manager=manager
            )

            # Lobby update after disconnect (shows the user as disconnecting).
            await room_manager.broadcast_lobby_update()

            # No broadcast at all when a stale duplicate socket closed — the
            # user never left, so there is nothing to tell the room.
            if result.broadcast_message:
                await room_manager.update_room_data(result.broadcast_message)
            if result.clear_prompt_message:  # This contains the seat change message
                await room_manager.update_room_data(result.clear_prompt_message)
