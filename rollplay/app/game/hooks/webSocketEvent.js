/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * WebSocket Event Handlers
 * Contains all the business logic for handling incoming WebSocket messages
 * These functions take data and state setters directly to process events
 */

// Import audio event handlers from the audio management module
import {
  handleRemoteAudioPlay,
  handleRemoteAudioResume,
  handleRemoteAudioBatch,
  createAudioSendFunctions
} from '../../audio_management/hooks/webSocketAudioEvents';

// =====================================
// GAME EVENT HANDLERS
// =====================================

/**
 * Handle initial state synchronization when client connects/reconnects
 * This ensures the client has the current room state before receiving any other events
 */
export const handleInitialState = (data, handlers) => {
  console.log("📦 Received initial state:", data);

  const {
    seat_layout,
    dungeon_master,
    combat_active,
    seat_colors,
    max_players,
    campaign_id
  } = data;

  // Set DM name
  if (handlers.setDmSeat && dungeon_master) {
    handlers.setDmSeat(dungeon_master);
  }

  // Set campaign ID for asset library calls
  if (handlers.setCampaignId && campaign_id) {
    handlers.setCampaignId(campaign_id);
  }

  // Set combat state
  if (handlers.setCombatActive !== undefined) {
    handlers.setCombatActive(combat_active || false);
  }

  // Set seat colors
  if (handlers.setSeatColors && seat_colors) {
    handlers.setSeatColors(seat_colors);
  }

  // Convert seat layout to frontend unified structure
  if (seat_layout && handlers.setGameSeats && handlers.getCharacterData) {
    const seats = seat_layout.map((playerName, index) => ({
      seatId: index,
      playerName: playerName,
      characterData: playerName !== "empty" ? handlers.getCharacterData(playerName) : null,
      isActive: false
    }));

    handlers.setGameSeats(seats);
  }

  console.log("✅ Initial state applied - client synced with server");
};

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

/**
 * Handle player character change during active session
 * Updates the seat with new character data
 */
export const handlePlayerCharacterChanged = (data, { setGameSeats }) => {
  console.log("received player character change:", data);
  const {
    player_name,
    character_id,
    character_name,
    character_class,
    character_race,
    level,
    hp_current,
    hp_max,
    ac
  } = data;

  // Update the seat that matches this player with new character data
  setGameSeats(prevSeats =>
    prevSeats.map(seat => {
      // Handle both string and object seat formats
      const seatPlayerName = typeof seat.playerName === 'string'
        ? seat.playerName.toLowerCase()
        : seat.playerName?.player_name?.toLowerCase();

      if (seatPlayerName === player_name.toLowerCase()) {
        return {
          ...seat,
          characterData: {
            character_id,
            character_name,
            character_class,
            character_race,
            level,
            hp_current,
            hp_max,
            ac
          }
        };
      }
      return seat;
    })
  );

  console.log(`✅ Updated character for ${player_name} to ${character_name}`);
};

// Removed unused handleChatMessage function

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

export const handlePlayerKicked = (data, { thisPlayer, stopRemoteTrack, remoteTrackStates, handleRemoteAudioBatch }) => {
  console.log("received player kick:", data);
  const { kicked_player } = data;
  // Backend handles kick logging

  // If this player was kicked, stop all audio and redirect
  if (kicked_player === thisPlayer) {
    console.log("🚪 Player was kicked - stopping all audio before redirect");
    
    // Stop all currently active audio tracks using batch operations
    if (remoteTrackStates && Object.keys(remoteTrackStates).length > 0) {
      if (handleRemoteAudioBatch) {
        // Use batch operations for better performance
        const stopOperations = Object.keys(remoteTrackStates).map(trackId => ({
          trackId: trackId,
          operation: 'stop'
        }));
        
        console.log(`🛑 Batch stopping ${stopOperations.length} audio tracks`);
        handleRemoteAudioBatch(
          { operations: stopOperations, triggered_by: 'player_kicked' },
          { stopRemoteTrack }
        );
      } else if (stopRemoteTrack) {
        // Fallback to individual stops if batch handler not available
        Object.keys(remoteTrackStates).forEach(trackId => {
          try {
            stopRemoteTrack(trackId);
            console.log(`🛑 Stopped audio track: ${trackId}`);
          } catch (error) {
            console.warn(`Failed to stop track ${trackId}:`, error);
          }
        });
      }
    }
    
    // Small delay to ensure audio stops before redirect
    setTimeout(() => {
      window.history.replaceState(null, '', '/');
      window.history.back();
    }, 100);
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

  const sendDiceRoll = (player, diceData) => {
    if (!webSocket || !isConnected) return;

    const { diceNotation, results, total, modifier, advantage, context, promptId } = diceData;

    console.log(`🎲 Sending dice roll: ${diceNotation} = ${total}${promptId ? ` (prompt_id: ${promptId})` : ''}`);

    const rollData = {
      "player": player,
      "diceNotation": diceNotation,
      "results": results,
      "total": total,
      "modifier": modifier || 0,
      "advantage": advantage || null,
      "context": context || ""
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

  // Removed unused sendChatMessage function

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

  // Import and use audio send functions from the audio management module
  const audioSendFunctions = createAudioSendFunctions(webSocket, isConnected, playerName);
  const { sendRemoteAudioPlay, sendRemoteAudioResume, sendRemoteAudioBatch } = audioSendFunctions;

  return {
    sendSeatChange,
    sendSeatCountChange,
    sendCombatStateChange,
    sendPlayerKick,
    sendDiceRoll,
    sendClearSystemMessages,
    sendClearAllMessages,
    sendDicePrompt,
    sendDicePromptClear,
    sendInitiativePromptAll,
    sendColorChange,
    sendRoleChange,
    sendRemoteAudioPlay,
    sendRemoteAudioResume,
    sendRemoteAudioBatch
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

export const handleSessionEnded = (data, { stopRemoteTrack, remoteTrackStates, handleRemoteAudioBatch, setSessionEndedData }) => {
  console.log("🛑 Session ended:", data);
  const { reason, message } = data;

  console.log(`🚪 Game session ended: ${message || reason}`);

  // Stop all currently active audio tracks using batch operations
  if (remoteTrackStates && Object.keys(remoteTrackStates).length > 0) {
    if (handleRemoteAudioBatch) {
      // Use batch operations for better performance
      const stopOperations = Object.keys(remoteTrackStates).map(trackId => ({
        trackId: trackId,
        operation: 'stop'
      }));

      console.log(`🛑 Batch stopping ${stopOperations.length} audio tracks before redirect`);
      handleRemoteAudioBatch(
        { operations: stopOperations, triggered_by: 'session_ended' },
        { stopRemoteTrack }
      );
    } else if (stopRemoteTrack) {
      // Fallback to individual stops if batch handler not available
      Object.keys(remoteTrackStates).forEach(trackId => {
        try {
          stopRemoteTrack(trackId);
          console.log(`🛑 Stopped audio track: ${trackId}`);
        } catch (error) {
          console.warn(`Failed to stop track ${trackId}:`, error);
        }
      });
    }
  }

  // Show session ended modal with countdown
  if (setSessionEndedData) {
    setSessionEndedData({ message, reason });
  } else {
    // Fallback if modal setter not available
    alert(message || `This game session has ended: ${reason}`);
    setTimeout(() => {
      window.location.href = '/dashboard';
    }, 100);
  }
};

// =====================================
// MAP EVENT HANDLERS
// =====================================

export const handleMapLoad = (data, { setActiveMap, setGridConfig, setMapImageConfig }) => {
  console.log("🗺️ Map loaded:", data);
  const { map, loaded_by } = data;
  
  if (map) {
    // Set the active map
    setActiveMap(map);
    
    // Apply grid configuration if present
    if (map.grid_config) {
      setGridConfig(map.grid_config);
    }
    
    // Apply map image configuration if present
    if (map.map_image_config) {
      setMapImageConfig(map.map_image_config);
    }
    
    console.log(`🗺️ Map "${map.original_filename}" loaded by ${loaded_by}`);
  }
};

export const handleMapClear = (data, { setActiveMap, setGridConfig, setMapImageConfig }) => {
  console.log("🗺️ Map cleared:", data);
  const { cleared_by } = data;
  
  // Clear all map-related state
  setActiveMap(null);
  setGridConfig(null);
  setMapImageConfig(null);
  
  console.log(`🗺️ Map cleared by ${cleared_by}`);
};

export const handleMapConfigUpdate = (data, { setActiveMap, activeMap }) => {
  console.log("🗺️ Map config updated:", data);
  const { filename, grid_config, map_image_config, updated_by } = data;
  
  // Atomic update - update the complete map object
  if (activeMap && activeMap.filename === filename) {
    const updatedMap = {
      ...activeMap,
      ...(grid_config !== undefined && { grid_config }),
      ...(map_image_config !== undefined && { map_image_config })
    };
    setActiveMap(updatedMap);
    console.log(`🗺️ Map ${filename} config updated atomically by ${updated_by}`);
  } else {
    console.warn(`🗺️ Config update for ${filename} but current map is different or missing`);
  }
};

// =====================================
// MAP SEND FUNCTIONS
// =====================================

export const createMapSendFunctions = (sendMessage, roomId, thisPlayer) => ({
  sendMapLoad: (mapData) => {
    sendMessage({
      event_type: 'map_load',
      data: {
        map_data: mapData
      }
    });
  },
  
  sendMapClear: () => {
    sendMessage({
      event_type: 'map_clear',
      data: {}
    });
  },
  
  sendMapConfigUpdate: (filename, gridConfig = null, mapImageConfig = null) => {
    sendMessage({
      event_type: 'map_config_update',
      data: {
        filename: filename,
        grid_config: gridConfig,
        map_image_config: mapImageConfig
      }
    });
  },
  
  sendMapRequest: () => {
    sendMessage({
      event_type: 'map_request',
      data: {}
    });
  }
});

// Re-export audio handlers for backward compatibility
export { handleRemoteAudioPlay, handleRemoteAudioResume, handleRemoteAudioBatch };