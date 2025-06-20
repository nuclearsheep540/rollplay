  /*
   * Copyright (C) 2025 Matthew Davey
   * SPDX-License-Identifier: GPL-3.0-or-later
   */

'use client'

import { useState, useEffect } from 'react'
import {
  handleSeatChange,
  handlePlayerConnected,
  handleLobbyUpdate,
  handlePlayerKicked,
  handleCombatState,
  handlePlayerDisconnected,
  handleDiceRoll,
  handleSystemMessagesCleared,
  handleAllMessagesCleared,
  handleDicePrompt,
  handleInitiativePromptAll,
  handleDicePromptClear,
  handleColorChange,
  handleAdventureLogRemoved,
  handleRoleChange,
  handleSeatCountChange,
  handlePlayerDisplaced,
  handleSystemMessage,
  handleRemoteAudioPlay,
  handleRemoteAudioStop,
  handleRemoteAudioVolume,
  createSendFunctions
} from './webSocketEvent'

export function useWebSocket(roomId, playerName, gameContext) {
  const [webSocket, setWebSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  // Initialize WebSocket connection
  useEffect(() => {
    if (!roomId || !playerName) return;

    console.log("Initializing WebSocket connection...");
    
    const socketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socketUrl = `${socketProtocol}//${window.location.host}/ws/`;
    const url = `${socketUrl}${roomId}?player_name=${playerName}`;

    const ws = new WebSocket(url);
    
    ws.onopen = () => {
      console.log("WebSocket connected");
      setIsConnected(true);
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      setIsConnected(false);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      console.error("WebSocket URL was:", url);
      console.error("WebSocket readyState:", ws.readyState);
      setIsConnected(false);
    };

    // Handle incoming messages
    ws.onmessage = (event) => {
      const json_data = JSON.parse(event.data);
      const event_type = json_data["event_type"];
      console.log("NEW EVENT", json_data);

      // Route messages to appropriate event handlers
      switch (event_type) {
        case "seat_change":
          handleSeatChange(json_data["data"], gameContext);
          break;

        case "seat_count_change":
          handleSeatCountChange(json_data["data"], gameContext);
          break;

        case "player_connected":
          handlePlayerConnected(json_data["data"], gameContext);
          break;

        case "lobby_update":
          handleLobbyUpdate(json_data["data"], gameContext);
          break;

        case "player_kicked":
          handlePlayerKicked(json_data["data"], gameContext);
          break;

        case "combat_state":
          handleCombatState(json_data["data"], gameContext);
          break;

        case "player_disconnected":
          handlePlayerDisconnected(json_data["data"], gameContext);
          break;

        case "role_change":
          handleRoleChange(json_data["data"], gameContext);
          break;

        case "dice_roll":
          handleDiceRoll(json_data["data"], gameContext);
          break;

        case "system_messages_cleared":
          handleSystemMessagesCleared(json_data["data"], gameContext);
          break;

        case "all_messages_cleared":
          handleAllMessagesCleared(json_data["data"], gameContext);
          break;

        case "dice_prompt":
          handleDicePrompt(json_data["data"], gameContext);
          break;

        case "initiative_prompt_all":
          handleInitiativePromptAll(json_data["data"], gameContext);
          break;

        case "dice_prompt_clear":
          handleDicePromptClear(json_data["data"], gameContext);
          break;

        case "color_change":
          handleColorChange(json_data["data"], { gameContext });
          break;

        case "adventure_log_removed":
          handleAdventureLogRemoved(json_data["data"], gameContext);
          break;

        case "player_displaced":
          handlePlayerDisplaced(json_data["data"], gameContext);
          break;

        case "system_message":
          handleSystemMessage(json_data["data"], gameContext);
          break;

        case "remote_audio_play":
          handleRemoteAudioPlay(json_data["data"], gameContext);
          break;

        case "remote_audio_stop":
          handleRemoteAudioStop(json_data["data"], gameContext);
          break;

        case "remote_audio_volume":
          handleRemoteAudioVolume(json_data["data"], gameContext);
          break;

        default:
          console.log("Unhandled WebSocket event:", event_type, json_data);
      }
    };

    setWebSocket(ws);

    // Cleanup function
    return () => {
      console.log("Cleaning up WebSocket");
      ws.close();
    };
  }, [roomId, playerName]);

  // Create send functions when webSocket is available
  const sendFunctions = webSocket && isConnected 
    ? createSendFunctions(webSocket, isConnected, roomId, playerName)
    : {};

  return {
    webSocket,
    isConnected,
    ...sendFunctions
  };
}