/**
 * WebSocket Event Handlers
 * Contains all the business logic for handling incoming WebSocket messages
 * These functions take data and state setters directly to process events
 */

export const handleSeatChange = (data, { setGameSeats, getCharacterData }) => {
  console.log("received a new message with seat change:", data);
  
  // Convert websocket data back to unified structure
  const updatedSeats = data.map((playerName, index) => ({
    seatId: index,
    playerName: playerName,
    characterData: playerName !== "empty" ? getCharacterData(playerName) : null,
    isActive: false // Reset turn state, will be managed by initiative
  }));
  
  setGameSeats(updatedSeats);
};

export const handleSeatCountChange = (data, { setGameSeats, getCharacterData }) => {
  console.log("received seat count change:", data);
  const { max_players, new_seats, updated_by, displaced_players = [] } = data;
  
  // Convert to unified structure
  const updatedSeats = new_seats ? new_seats.map((playerName, index) => ({
    seatId: index,
    playerName: playerName,
    characterData: playerName !== "empty" ? getCharacterData(playerName) : null,
    isActive: false
  })) : [];
  
  setGameSeats(updatedSeats);
  
  // Backend handles all logging now - no frontend log generation
};

export const handleChatMessage = (data, { setChatLog, chatLog }) => {
  console.log("received chat message:", data);
  setChatLog([
    ...chatLog,
    {
      "player_name": data["player_name"],
      "chat_message": data["data"],
      "timestamp": data["utc_timestamp"]
    }
  ]);
};

export const handlePlayerConnected = (data, {}) => {
  console.log("received player connection:", data);
  const { connected_player } = data;
  
  // Backend handles connection logging - no frontend action needed
};

export const handleLobbyUpdate = (data, { setLobbyUsers }) => {
  console.log("received lobby update:", data);
  const { lobby_users } = data;
  
  // Add default status to each user if not present
  const usersWithStatus = (lobby_users || []).map(user => ({
    ...user,
    status: user.status || 'connected'
  }));
  
  // Update lobby users list
  setLobbyUsers(usersWithStatus);
};

export const handlePlayerDisconnectedLobby = (data, { setLobbyUsers, setDisconnectTimeouts, disconnectTimeouts }) => {
  console.log("received player disconnected for lobby:", data);
  const { disconnected_player } = data;
  
  // Mark user as disconnecting in lobby (but don't set timeout - let backend handle removal)
  setLobbyUsers(prev => 
    prev.map(user => 
      user.name === disconnected_player 
        ? { ...user, status: 'disconnecting' }
        : user
    )
  );
  
  // Don't set frontend timeout - let backend handle the 30-second removal
  // The backend will send a lobby_update when user is actually removed
};

export const handlePlayerKicked = (data, { thisPlayer }) => {
  console.log("received player kick:", data);
  const { kicked_player } = data;
  // Backend handles kick logging

  // If this player was kicked, go back in browser history
  if (kicked_player === thisPlayer) {
    window.history.replaceState(null, '', '/');
    window.history.back();
    return;
  }
};

export const handleCombatState = (data, { setCombatActive }) => {
  console.log("received combat state change:", data);
  const { combatActive: newCombatState } = data;
  
  setCombatActive(newCombatState);
  
  // Note: Combat state changes are logged on the server side only
  // to prevent duplication for the player who initiated the change
};

export const handlePlayerDisconnected = (data, { thisPlayer, setLobbyUsers, setDisconnectTimeouts, disconnectTimeouts }) => {
  console.log("received player disconnect:", data);
  const disconnected_player = data["disconnected_player"];

  // Server will handle seat cleanup and broadcast updated layout
  // No client-side seat modification needed - server-only disconnect management

  if (disconnected_player !== thisPlayer) {
    // Backend handles disconnect logging
  }
  
  // Handle lobby disconnect visualization (just mark as disconnecting)
  handlePlayerDisconnectedLobby(data, { setLobbyUsers, setDisconnectTimeouts, disconnectTimeouts });
};

export const handleDiceRoll = (data, { addToLog }) => {
  console.log("received dice roll:", data);
  const { player, message } = data;
  
  // Backend handles database storage, frontend handles real-time display
  if (addToLog) {
    addToLog(message, 'player-roll', player);
  }
};

export const handleSystemMessagesCleared = (data, { setRollLog, thisPlayer }) => {
  console.log("received system messages cleared:", data);
  const { deleted_count, cleared_by } = data;
  
  // Remove all system messages from the current rollLog
  setRollLog(prev => prev.filter(entry => entry.type !== 'system'));
  
  // Add a new system message about the clearing action
  if (cleared_by !== thisPlayer) {
    // Backend handles system message clearing logging
  }
};

export const handleAllMessagesCleared = (data, { setRollLog }) => {
  console.log("received all messages cleared:", data);
  const { deleted_count, cleared_by } = data;
  
  // Clear all messages from the current rollLog
  setRollLog([]);
  
  // Add a new system message about the clearing action
  // Backend handles all message clearing logging
};

export const handleDicePrompt = (data, { setActivePrompts, setIsDicePromptActive, addToLog }) => {
  console.log("received dice prompt:", data);
  const { prompted_player, roll_type, prompted_by, prompt_id, log_message } = data;
  
  // Backend handles database storage, frontend handles real-time display
  if (addToLog) {
    addToLog(log_message, 'dungeon-master', prompted_by, prompt_id);
  }
  
  // Add to active prompts array
  const newPrompt = {
    id: prompt_id || Date.now(), // Use provided ID or generate one
    player: prompted_player,
    rollType: roll_type,
    promptedBy: prompted_by
  };
  
  setActivePrompts(prev => {
    // Check if this player already has an active prompt for this roll type
    const existingIndex = prev.findIndex(p => p.player === prompted_player && p.rollType === roll_type);
    if (existingIndex >= 0) {
      // Replace existing prompt
      const updated = [...prev];
      updated[existingIndex] = newPrompt;
      return updated;
    } else {
      // Add new prompt
      return [...prev, newPrompt];
    }
  });
  
  setIsDicePromptActive(true);
};

export const handleInitiativePromptAll = (data, { setActivePrompts, setIsDicePromptActive, setCurrentInitiativePromptId, thisPlayer, addToLog }) => {
  console.log("received initiative prompt all:", data);
  const { players_to_prompt, roll_type, prompted_by, prompt_id, initiative_prompt_id, log_message } = data;
  
  console.log("🎲 Initiative prompt log_message:", log_message);
  
  // Store the initiative prompt ID for potential removal on "clear all"
  setCurrentInitiativePromptId(initiative_prompt_id);
  
  // Backend handles database storage, frontend handles real-time display
  if (addToLog) {
    addToLog(log_message, 'dungeon-master', prompted_by, initiative_prompt_id);
  }
  
  // For DMs and all players, track ALL prompts created by this initiative call
  // This ensures the DM sees the correct total count
  const allPrompts = players_to_prompt.map(player => ({
    id: `${player}_${roll_type}_${Date.now()}`,
    player: player,
    rollType: roll_type,
    promptedBy: prompted_by,
    isInitiativePrompt: true // Flag to identify initiative prompts
  }));
  
  setActivePrompts(prev => {
    // Remove any existing initiative prompts for these players
    const filteredPrev = prev.filter(p => 
      !players_to_prompt.includes(p.player) || p.rollType !== roll_type
    );
    
    // Add all new initiative prompts
    return [...filteredPrev, ...allPrompts];
  });
  
  // Only set dice prompt active if this player is actually prompted
  if (players_to_prompt.includes(thisPlayer)) {
    setIsDicePromptActive(true);
  }
};

export const handleDicePromptClear = (data, { setActivePrompts, setIsDicePromptActive }) => {
  console.log("received dice prompt clear:", data);
  const { prompt_id, clear_all, cleared_player } = data;
  
  if (clear_all) {
    // Clear all prompts
    setActivePrompts([]);
    setIsDicePromptActive(false);
  } else if (prompt_id) {
    // Clear specific prompt by ID
    setActivePrompts(prev => {
      const filtered = prev.filter(prompt => prompt.id !== prompt_id);
      setIsDicePromptActive(filtered.length > 0);
      return filtered;
    });
  } else if (cleared_player) {
    // Clear all prompts for specific player
    setActivePrompts(prev => {
      const filtered = prev.filter(prompt => prompt.player !== cleared_player);
      setIsDicePromptActive(filtered.length > 0);
      return filtered;
    });
  }
};

export const handleColorChange = (data, { gameContext }) => {
  console.log("received color change:", data);
  const { player, seat_index, new_color } = data;
  
  // Update CSS variable immediately for visual feedback
  document.documentElement.style.setProperty(
    `--seat-color-${seat_index}`, 
    new_color
  );
  
  // Update playerSeatMap state if the setter is available
  if (gameContext.setPlayerSeatMap) {
    gameContext.setPlayerSeatMap(prev => ({
      ...prev,
      [player]: { 
        ...prev[player], 
        seatColor: new_color 
      }
    }));
  }
  
  console.log(`🎨 Updated ${player}'s color (seat ${seat_index}) to ${new_color}`);
};

export const handleAdventureLogRemoved = (data, { setRollLog }) => {
  console.log("received adventure log removal:", data);
  const { prompt_id } = data;
  
  // Remove log entries that have the matching prompt_id
  setRollLog(prev => prev.filter(entry => entry.prompt_id !== prompt_id));
  
  console.log(`🗑️ Removed adventure log entry with prompt_id: ${prompt_id}`);
};

export const handleRoleChange = (data, { handleRoleChange }) => {
  console.log("🎭 Role change received:", data);
  
  const { action, target_player, changed_by, message } = data;
  
  // Add role change to adventure log
  // Backend handles role change logging
  
  // Trigger role refresh if handler is available
  if (handleRoleChange) {
    handleRoleChange(action, target_player);
  }
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

  const sendDicePromptClear = (promptId = null, clearAll = false, initiativePromptId = null) => {
    if (!webSocket || !isConnected) {
      console.log("❌ Cannot clear dice prompt - WebSocket not connected");
      return;
    }
    
    if (clearAll) {
      console.log("🎲 Clearing all dice prompts", initiativePromptId ? `(including initiative prompt: ${initiativePromptId})` : '');
    } else if (promptId) {
      console.log(`🎲 Clearing specific dice prompt: ${promptId}`);
    } else {
      console.log("🎲 Clearing dice prompts");
    }
    
    const clearData = {
      "cleared_by": playerName,
      "prompt_id": promptId,
      "clear_all": clearAll
    };
    
    // Include initiative prompt ID when clearing all
    if (clearAll && initiativePromptId) {
      clearData.initiative_prompt_id = initiativePromptId;
    }
    
    webSocket.send(JSON.stringify({
      "event_type": "dice_prompt_clear",
      "data": clearData
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

  const sendDiceRoll = (player, formattedMessage, rollFor = null, promptId = null) => {
    if (!webSocket || !isConnected) return;

    console.log(`🎲 Sending dice roll: ${formattedMessage}${promptId ? ` (prompt_id: ${promptId})` : ''}`);

    const rollData = {
      "player": player,
      "message": formattedMessage,
      "roll_for": rollFor
    };
    
    // Include prompt_id if provided for adventure log cleanup
    if (promptId) {
      rollData.prompt_id = promptId;
    }

    webSocket.send(JSON.stringify({
      "event_type": "dice_roll",
      "data": rollData
    }));
  };

  const sendChatMessage = (message) => {
    if (!webSocket || !isConnected) return;

    webSocket.send(JSON.stringify({
      "event_type": "chat_message",
      "data": message
    }));
  };

  const sendColorChange = (player, seatIndex, newColor) => {
    if (!webSocket || !isConnected) {
      console.log("❌ Cannot send color change - WebSocket not connected");
      return;
    }
    
    console.log(`🎨 Sending color change: ${player} (seat ${seatIndex}) to ${newColor}`);
    
    webSocket.send(JSON.stringify({
      "event_type": "color_change",
      "data": {
        "player": player,
        "seat_index": seatIndex,
        "new_color": newColor,
        "changed_by": playerName
      }
    }));
  };

  const sendRoleChange = (action, targetPlayer) => {
    if (!webSocket || !isConnected) {
      console.log("❌ Cannot send role change - WebSocket not connected");
      return;
    }
    
    console.log(`🎭 Sending role change: ${action} for ${targetPlayer}`);
    
    webSocket.send(JSON.stringify({
      "event_type": "role_change",
      "data": {
        "action": action,
        "target_player": targetPlayer
      }
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
    sendInitiativePromptAll,
    sendColorChange,
    sendRoleChange
  };
};

// New event handlers for displaced players

export const handlePlayerDisplaced = (data, { thisPlayer }) => {
  console.log("🚪 Player displaced:", data);
  const { player_name, former_seat, message, reason } = data;
  
  // If this is the current player, show a notification
  if (player_name === thisPlayer) {
    console.log(`⚠️ You have been displaced: ${message}`);
    // You could add a toast notification here
    // Backend handles displacement logging
  }
  
  // Log the displacement for all players to see
  // Backend handles displacement logging
};

export const handleSystemMessage = (data, {}) => {
  console.log("📢 System message:", data);
  const { message, type = 'system' } = data;
  
  // Add system message to adventure log
  // Backend handles system message logging
};

export const handleWhisper = (data, {}) => {
  console.log("💬 received whisper:", data);
  const { from_player, to_player, message } = data;
  
  // Backend handles whisper logging and message delivery
  // Frontend just needs to acknowledge receipt
};