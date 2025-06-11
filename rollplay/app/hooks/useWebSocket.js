'use client'

import { useState, useEffect, useCallback } from 'react'

export function useWebSocket(roomId, playerName, callbacks) {
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
      setIsConnected(false);
    };

    // Handle incoming messages
    ws.onmessage = (event) => {
      const json_data = JSON.parse(event.data);
      const event_type = json_data["event_type"];
      console.log("NEW EVENT", json_data);

      // Route messages to appropriate callbacks
      switch (event_type) {
        case "seat_change":
          callbacks.onSeatChange?.(json_data["data"]);
          break;

        case "seat_count_change":
          callbacks.onSeatCountChange?.(json_data["data"]);
          break;

        case "chat_message":
          callbacks.onChatMessage?.(json_data);
          break;

        case "player_connected":
          callbacks.onPlayerConnected?.(json_data["data"]);
          break;

        case "player_kicked":
          callbacks.onPlayerKicked?.(json_data["data"]);
          break;

        case "combat_state":
          callbacks.onCombatStateChange?.(json_data["data"]);
          break;

        case "player_disconnected":
          callbacks.onPlayerDisconnected?.(json_data["data"]);
          break;

        case "dice_roll":
          callbacks.onDiceRoll?.(json_data["data"]);
          break;

        case "system_messages_cleared":
          callbacks.onSystemMessagesCleared?.(json_data["data"]);
          break;

        case "all_messages_cleared":
          callbacks.onAllMessagesCleared?.(json_data["data"]);
          break;

        // NEW: Dice prompt events
        case "dice_prompt":
          callbacks.onDicePrompt?.(json_data["data"]);
          break;

        case "dice_prompt_clear":
          callbacks.onDicePromptClear?.(json_data["data"]);
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

  // UPDATED: Send dice prompt with ID
  const sendDicePrompt = useCallback((promptedPlayer, rollType, promptId) => {
    if (!webSocket || !isConnected) {
      console.log("❌ Cannot send dice prompt - WebSocket not connected");
      return;
    }
    
    console.log(`🎲 Sending dice prompt: ${promptedPlayer} to roll ${rollType} (ID: ${promptId})`);
    
    webSocket.send(JSON.stringify({
      "event_type": "dice_prompt",
      "data": {
        "prompted_player": promptedPlayer,
        "roll_type": rollType,
        "prompted_by": playerName,
        "prompt_id": promptId
      }
    }));
  }, [webSocket, isConnected, playerName]);

  // UPDATED: Clear dice prompt with options
  const sendDicePromptClear = useCallback((promptId = null, clearAll = false) => {
    if (!webSocket || !isConnected) {
      console.log("❌ Cannot clear dice prompt - WebSocket not connected");
      return;
    }
    
    if (clearAll) {
      console.log("🎲 Clearing all dice prompts");
    } else if (promptId) {
      console.log(`🎲 Clearing specific dice prompt: ${promptId}`);
    } else {
      console.log("🎲 Clearing dice prompts");
    }
    
    webSocket.send(JSON.stringify({
      "event_type": "dice_prompt_clear",
      "data": {
        "cleared_by": playerName,
        "prompt_id": promptId,
        "clear_all": clearAll
      }
    }));
  }, [webSocket, isConnected, playerName]);

  const sendClearSystemMessages = useCallback(async () => {
    if (!webSocket || !isConnected) return;
  
    try {
      // First call the API to clear from database
      const response = await fetch(`/api/game/${roomId}/logs/system`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cleared_by: playerName
        }),
      });
  
      if (!response.ok) {
        throw new Error('Failed to clear system messages from database');
      }
  
      const result = await response.json();
      console.log(`✅ Cleared ${result.deleted_count} system messages`);
  
      // Then broadcast the change via websocket
      webSocket.send(JSON.stringify({
        "event_type": "clear_system_messages",
        "data": {
          "cleared_by": playerName,
          "deleted_count": result.deleted_count
        }
      }));
  
    } catch (error) {
      console.error('❌ Error clearing system messages:', error);
      throw error;
    }
  }, [webSocket, isConnected, roomId, playerName]);

  const sendClearAllMessages = useCallback(async () => {
    if (!webSocket || !isConnected) return;
  
    try {
      // First call the API to clear all messages from database
      const response = await fetch(`/api/game/${roomId}/logs`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cleared_by: playerName
        }),
      });
  
      if (!response.ok) {
        throw new Error('Failed to clear all messages from database');
      }
  
      const result = await response.json();
      console.log(`✅ Cleared ${result.deleted_count} total messages`);
  
      // Then broadcast the change via websocket
      webSocket.send(JSON.stringify({
        "event_type": "clear_all_messages",
        "data": {
          "cleared_by": playerName,
          "deleted_count": result.deleted_count
        }
      }));
  
    } catch (error) {
      console.error('❌ Error clearing all messages:', error);
      throw error;
    }
  }, [webSocket, isConnected, roomId, playerName]);

  // WebSocket sending methods
  const sendSeatChange = useCallback(async (newSeats) => {
    if (!webSocket || !isConnected) {
      console.log("❌ Cannot send seat change - WebSocket not connected");
      return;
    }
    
    try {
      console.log("🔄 Starting seat change process...");
      console.log("📝 New seats:", newSeats);
      const seatArray = newSeats.map(seat => seat.playerName);
      console.log("📝 Seat array to send:", seatArray);
      
      // First save to database via HTTP PUT
      console.log(`📡 Making HTTP PUT to /api/game/${roomId}/seat-layout`);
      const response = await fetch(`/api/game/${roomId}/seat-layout`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          seat_layout: seatArray,
          updated_by: playerName
        }),
      });
  
      console.log(`📡 HTTP Response status: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ HTTP PUT failed: ${response.status} - ${errorText}`);
        throw new Error(`Failed to save seat layout: ${response.status} - ${errorText}`);
      }
  
      const responseData = await response.json();
      console.log("✅ HTTP PUT successful:", responseData);
  
      // Then broadcast via websocket
      console.log("📡 Broadcasting via WebSocket...");
      webSocket.send(JSON.stringify({
        "event_type": "seat_change",
        "data": seatArray,
        "player_name": playerName
      }));
      console.log("✅ WebSocket broadcast sent");
      
    } catch (error) {
      console.error('❌ Error in sendSeatChange:', error);
      alert(`Failed to update seat layout: ${error.message}`);
      throw error;
    }
  }, [webSocket, isConnected, roomId, playerName]);

  const sendSeatCountChange = useCallback(async (newSeatCount, newSeats) => {
    if (!webSocket || !isConnected) return;

    webSocket.send(JSON.stringify({
      "event_type": "seat_count_change",
      "data": {
        "max_players": newSeatCount,
        "new_seats": newSeats.map(seat => seat.playerName),
        "updated_by": playerName
      }
    }));
  }, [webSocket, isConnected, playerName]);

  const sendCombatStateChange = useCallback((newCombatState) => {
    if (!webSocket || !isConnected) return;
    
    console.log("Sending combat state change to WS:", newCombatState);
    
    webSocket.send(JSON.stringify({
      "event_type": "combat_state",
      "data": {
        "combatActive": newCombatState
      }
    }));
  }, [webSocket, isConnected]);

  const sendPlayerKick = useCallback((playerToKick) => {
    if (!webSocket || !isConnected) return;

    webSocket.send(JSON.stringify({
      "event_type": "player_kicked",
      "data": {
        "kicked_player": playerToKick
      }
    }));
  }, [webSocket, isConnected]);

  // UPDATED: Enhanced dice roll with context
  const sendDiceRoll = useCallback((player, dice, result, rollFor = null) => {
    if (!webSocket || !isConnected) return;

    console.log(`🎲 Sending dice roll: ${player} rolled ${dice} = ${result} for ${rollFor || 'General Roll'}`);

    webSocket.send(JSON.stringify({
      "event_type": "dice_roll",
      "data": {
        "player": player,
        "dice": dice,
        "result": result,
        "roll_for": rollFor
      }
    }));
  }, [webSocket, isConnected]);

  const sendChatMessage = useCallback((message) => {
    if (!webSocket || !isConnected) return;

    webSocket.send(JSON.stringify({
      "event_type": "chat_message",
      "data": message
    }));
  }, [webSocket, isConnected]);

  return {
    webSocket,
    isConnected,
    // Sending methods
    sendSeatChange,
    sendSeatCountChange,
    sendCombatStateChange,
    sendPlayerKick,
    sendDiceRoll,
    sendChatMessage,
    sendClearSystemMessages,
    sendClearAllMessages,
    // NEW: Prompt methods
    sendDicePrompt,
    sendDicePromptClear
  };
}