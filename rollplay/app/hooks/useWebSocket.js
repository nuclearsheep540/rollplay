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

  const sendDiceRoll = useCallback((player, dice, result) => {
    if (!webSocket || !isConnected) return;

    webSocket.send(JSON.stringify({
      "event_type": "dice_roll",
      "data": {
        "player": player,
        "dice": dice,
        "result": result
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
    sendChatMessage
  };
}