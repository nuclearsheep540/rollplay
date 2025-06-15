# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later
from datetime import datetime
from fastapi import FastAPI, WebSocket
from starlette.websockets import WebSocketDisconnect

from .connection_manager import manager
from .websocket_events import WebsocketEvent
from adventure_log_service import AdventureLogService
from models.log_type import LogType

# Initialize shared services
adventure_log = AdventureLogService()

def register_websocket_routes(app: FastAPI):
    """Register WebSocket routes with the FastAPI app"""
    
    @app.websocket("/ws/{client_id}")
    async def websocket_endpoint(
        websocket: WebSocket,
        client_id: str,  # This should be your room_id
        player_name: str
    ):
        # Normalize player name to lowercase for consistent identification
        player_name = player_name.lower()
        await manager.connect(websocket, client_id, player_name)
        
        # Handle connection event and get result
        result = await WebsocketEvent.player_connection(
            websocket=websocket,
            data={},
            event_data={},
            player_name=player_name,
            client_id=client_id,
            manager=manager
        )
        await manager.update_data(result.broadcast_message)

        try:
            while True:
                data = await websocket.receive_json()
                event_type = data.get("event_type")
                event_data = data.get("data")
                
                # Initialize variables for post-processing
                broadcast_message = None
                log_removal_message = None
                clear_prompt_message = None

                if event_type == "seat_change":
                    # Existing seat change logic...
                    seat_layout = data.get("data")
                    
                    if not isinstance(seat_layout, list):
                        error_message = {
                            "event_type": "error",
                            "data": "Seat layout must be an array."
                        }
                        await websocket.send_json(error_message)
                        continue

                    result = await WebsocketEvent.seat_change(
                        websocket=websocket,
                        data=data,
                        event_data=event_data,
                        player_name=player_name,
                        client_id=client_id,
                        manager=manager
                    )
                    broadcast_message = result.broadcast_message

                    # After seat change, update lobby
                    await manager.broadcast_lobby_update(client_id)

                elif event_type == "dice_prompt":
                    result = await WebsocketEvent.dice_prompt(
                        websocket=websocket,
                        data=data,
                        event_data=event_data,
                        player_name=player_name,
                        client_id=client_id,
                        manager=manager
                    )
                    broadcast_message = result.broadcast_message

                elif event_type == "initiative_prompt_all":
                    if not event_data.get("players", []):
                        print("⚡ No players provided for initiative prompt")
                        continue

                    result = await WebsocketEvent.initiative_prompt_all(
                        websocket=websocket,
                        data=data,
                        event_data=event_data,
                        player_name=player_name,
                        client_id=client_id,
                        manager=manager
                    )
                    broadcast_message = result.broadcast_message

                # NEW: Handle clearing dice prompts
                elif event_type == "dice_prompt_clear":
                    result = await WebsocketEvent.dice_prompt_clear(
                        websocket=websocket,
                        data=data,
                        event_data=event_data,
                        player_name=player_name,
                        client_id=client_id,
                        manager=manager
                    )
                    broadcast_message = result.broadcast_message
                    log_removal_message = result.log_removal_message

                elif event_type == "combat_state":
                    result = await WebsocketEvent.combat_state(
                        websocket=websocket,
                        data=data,
                        event_data=event_data,
                        player_name=player_name,
                        client_id=client_id,
                        manager=manager
                    )
                    broadcast_message = result.broadcast_message

                elif event_type == "seat_count_change":
                    result = await WebsocketEvent.seat_count_change(
                        websocket=websocket,
                        data=data,
                        event_data=event_data,
                        player_name=player_name,
                        client_id=client_id,
                        manager=manager
                    )
                    broadcast_message = result.broadcast_message

                elif event_type == "player_kicked":
                    result = await WebsocketEvent.player_kicked(
                        websocket=websocket,
                        data=data,
                        event_data=event_data,
                        player_name=player_name,
                        client_id=client_id,
                        manager=manager
                    )
                    broadcast_message = result.broadcast_message

                elif event_type == "role_change":
                    result = await WebsocketEvent.role_change(
                        websocket=websocket,
                        data=data,
                        event_data=event_data,
                        player_name=player_name,
                        client_id=client_id,
                        manager=manager
                    )
                    broadcast_message = result.broadcast_message

                elif event_type == "dice_roll":
                    result = await WebsocketEvent.dice_roll(
                        websocket=websocket,
                        data=data,
                        event_data=event_data,
                        player_name=player_name,
                        client_id=client_id,
                        manager=manager
                    )
                    broadcast_message = result.broadcast_message
                    log_removal_message = result.log_removal_message
                    clear_prompt_message = result.clear_prompt_message
                
                elif event_type == "clear_system_messages":
                    result = await WebsocketEvent.clear_system_messages(
                        websocket=websocket,
                        data=data,
                        event_data=event_data,
                        player_name=player_name,
                        client_id=client_id,
                        manager=manager
                    )
                    broadcast_message = result.broadcast_message
                    
                    # Check if it's an error message and handle accordingly
                    if broadcast_message.get("event_type") == "error":
                        await websocket.send_json(broadcast_message)
                        continue
                
                elif event_type == "clear_all_messages":
                    result = await WebsocketEvent.clear_all_messages(
                        websocket=websocket,
                        data=data,
                        event_data=event_data,
                        player_name=player_name,
                        client_id=client_id,
                        manager=manager
                    )
                    broadcast_message = result.broadcast_message
                    
                    # Check if it's an error message and handle accordingly
                    if broadcast_message.get("event_type") == "error":
                        await websocket.send_json(broadcast_message)
                        continue

                elif event_type == "color_change":
                    result = await WebsocketEvent.color_change(
                        websocket=websocket,
                        data=data,
                        event_data=event_data,
                        player_name=player_name,
                        client_id=client_id,
                        manager=manager
                    )
                    broadcast_message = result.broadcast_message
                    
                    # Check if it's an error message and handle accordingly
                    if broadcast_message.get("event_type") == "error":
                        await websocket.send_json(broadcast_message)
                        continue

                else:
                    # Chat messages - frontend sends pre-formatted
                    timestamp = datetime.now().strftime("%H:%M")
                    
                    adventure_log.add_log_entry(
                        room_id=client_id,
                        message=data.get("data", ""),
                        log_type=LogType.CHAT, 
                        player_name=player_name
                    )
                    
                    await manager.update_data({
                        **data, 
                        "player_name": player_name, 
                        "utc_timestamp": timestamp
                    })
                    continue
                
                # Broadcast the main message
                await manager.update_data(broadcast_message)
                
                # Handle special cases for adventure log removal
                if event_type == "dice_roll":
                    import asyncio
                    await asyncio.sleep(0.5)  # Small delay to ensure dice roll is processed first
                    
                    # Send log removal message first
                    if log_removal_message:
                        await manager.update_data_for_room(client_id, log_removal_message)
                    
                    # Then send prompt clear message
                    if clear_prompt_message:
                        await manager.update_data(clear_prompt_message)
                
                elif event_type == "dice_prompt_clear":
                    # Send log removal message for cancelled prompts (no delay needed)
                    if log_removal_message:
                        await manager.update_data_for_room(client_id, log_removal_message)
                
        except WebSocketDisconnect:
            # Server-side disconnect handling with seat cleanup
            result = await WebsocketEvent.player_disconnect(
                websocket=websocket,
                data={},
                event_data={},
                player_name=player_name,
                client_id=client_id,
                manager=manager
            )
            
            # Send lobby update after disconnect (will show user as disconnecting)
            await manager.broadcast_lobby_update(client_id)
            
            # Broadcast disconnect and seat change messages
            await manager.update_data(result.broadcast_message)
            if result.clear_prompt_message:  # This contains the seat change message
                await manager.update_data(result.clear_prompt_message)