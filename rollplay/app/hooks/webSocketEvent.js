/**
 * WebSocket Event Handlers
 * Contains all the event handling logic for incoming WebSocket messages
 * These are pure functions that take data and callbacks to process events
 */

export const handleSeatChange = (data, callbacks) => {
  console.log("received a new message with seat change:", data);
  callbacks.onSeatChange?.(data);
};

export const handleSeatCountChange = (data, callbacks) => {
  console.log("received seat count change:", data);
  callbacks.onSeatCountChange?.(data);
};

export const handleChatMessage = (data, callbacks) => {
  console.log("received chat message:", data);
  callbacks.onChatMessage?.(data);
};

export const handlePlayerConnected = (data, callbacks) => {
  console.log("received player connection:", data);
  callbacks.onPlayerConnected?.(data);
};

export const handlePlayerKicked = (data, callbacks) => {
  console.log("received player kick:", data);
  callbacks.onPlayerKicked?.(data);
};

export const handleCombatState = (data, callbacks) => {
  console.log("received combat state change:", data);
  callbacks.onCombatStateChange?.(data);
};

export const handlePlayerDisconnected = (data, callbacks) => {
  console.log("received player disconnect:", data);
  callbacks.onPlayerDisconnected?.(data);
};

export const handleDiceRoll = (data, callbacks) => {
  console.log("received dice roll:", data);
  callbacks.onDiceRoll?.(data);
};

export const handleSystemMessagesCleared = (data, callbacks) => {
  console.log("received system messages cleared:", data);
  callbacks.onSystemMessagesCleared?.(data);
};

export const handleAllMessagesCleared = (data, callbacks) => {
  console.log("received all messages cleared:", data);
  callbacks.onAllMessagesCleared?.(data);
};

export const handleDicePrompt = (data, callbacks) => {
  console.log("received dice prompt:", data);
  callbacks.onDicePrompt?.(data);
};

export const handleInitiativePromptAll = (data, callbacks) => {
  console.log("received initiative prompt all:", data);
  callbacks.onInitiativePromptAll?.(data);
};

export const handleDicePromptClear = (data, callbacks) => {
  console.log("received dice prompt clear:", data);
  callbacks.onDicePromptClear?.(data);
};

// WebSocket sending functions (outbound messages)
export const createSendFunctions = (webSocket, isConnected, roomId, playerName) => {
  const sendDicePrompt = (promptedPlayer, rollType, promptId) => {
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
  };

  const sendInitiativePromptAll = (playersToPrompt) => {
    if (!webSocket || !isConnected) {
      console.log("❌ Cannot send initiative prompt - WebSocket not connected");
      return;
    }
    
    console.log(`⚡ Sending initiative prompt to all players: ${playersToPrompt.join(', ')}`);
    
    webSocket.send(JSON.stringify({
      "event_type": "initiative_prompt_all",
      "data": {
        "players": playersToPrompt,
        "prompted_by": playerName
      }
    }));
  };

  const sendDicePromptClear = (promptId = null, clearAll = false) => {
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
  };

  const sendClearSystemMessages = async () => {
    if (!webSocket || !isConnected) return;
  
    try {
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
  };

  const sendClearAllMessages = async () => {
    if (!webSocket || !isConnected) return;
  
    try {
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
  };

  const sendSeatChange = async (newSeats) => {
    if (!webSocket || !isConnected) {
      console.log("❌ Cannot send seat change - WebSocket not connected");
      return;
    }
    
    try {
      console.log("🔄 Starting seat change process...");
      const seatArray = newSeats.map(seat => seat.playerName);
      
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
  
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to save seat layout: ${response.status} - ${errorText}`);
      }
  
      const responseData = await response.json();
      console.log("✅ HTTP PUT successful:", responseData);
  
      webSocket.send(JSON.stringify({
        "event_type": "seat_change",
        "data": seatArray,
        "player_name": playerName
      }));
      
    } catch (error) {
      console.error('❌ Error in sendSeatChange:', error);
      alert(`Failed to update seat layout: ${error.message}`);
      throw error;
    }
  };

  const sendSeatCountChange = (newSeatCount, newSeats) => {
    if (!webSocket || !isConnected) return;

    webSocket.send(JSON.stringify({
      "event_type": "seat_count_change",
      "data": {
        "max_players": newSeatCount,
        "new_seats": newSeats.map(seat => seat.playerName),
        "updated_by": playerName
      }
    }));
  };

  const sendCombatStateChange = (newCombatState) => {
    if (!webSocket || !isConnected) return;
    
    console.log("Sending combat state change to WS:", newCombatState);
    
    webSocket.send(JSON.stringify({
      "event_type": "combat_state",
      "data": {
        "combatActive": newCombatState
      }
    }));
  };

  const sendPlayerKick = (playerToKick) => {
    if (!webSocket || !isConnected) return;

    webSocket.send(JSON.stringify({
      "event_type": "player_kicked",
      "data": {
        "kicked_player": playerToKick
      }
    }));
  };

  const sendDiceRoll = (player, formattedMessage, rollFor = null) => {
    if (!webSocket || !isConnected) return;

    console.log(`🎲 Sending dice roll: ${formattedMessage}`);

    webSocket.send(JSON.stringify({
      "event_type": "dice_roll",
      "data": {
        "player": player,
        "message": formattedMessage,
        "roll_for": rollFor
      }
    }));
  };

  const sendChatMessage = (message) => {
    if (!webSocket || !isConnected) return;

    webSocket.send(JSON.stringify({
      "event_type": "chat_message",
      "data": message
    }));
  };

  return {
    sendSeatChange,
    sendSeatCountChange,
    sendCombatStateChange,
    sendPlayerKick,
    sendDiceRoll,
    sendChatMessage,
    sendClearSystemMessages,
    sendClearAllMessages,
    sendDicePrompt,
    sendDicePromptClear,
    sendInitiativePromptAll
  };
};