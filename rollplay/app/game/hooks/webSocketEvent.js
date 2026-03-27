/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * WebSocket Event Handlers
 * Contains all the business logic for handling incoming WebSocket messages
 * These functions take data and state setters directly to process events
 *
 * Identity: All identity fields use user_id (UUID string). Display names are
 * resolved from playerMetadata at render time.
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
    campaign_id,
    player_metadata,
    audio_state
  } = data;

  // player_metadata is already keyed by user_id from api-game — no normalization needed
  const metadata = player_metadata || {};

  if (handlers.setPlayerMetadata) {
    handlers.setPlayerMetadata(metadata);
  }

  // Set DM object {user_id, player_name, campaign_role}
  if (handlers.setDungeonMaster) {
    handlers.setDungeonMaster(dungeon_master && dungeon_master.user_id ? dungeon_master : null);
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

  // Convert seat layout (user_id array) to frontend unified structure
  if (seat_layout && handlers.setGameSeats) {
    const seats = seat_layout.map((userId, index) => {
      const meta = userId !== "empty" ? (metadata[userId] || null) : null;
      return {
        seatId: index,
        userId: userId,
        playerName: meta?.player_name || (userId !== "empty" ? userId : "empty"),
        characterData: meta,
        isActive: false
      };
    });

    handlers.setGameSeats(seats);
  }

  // Sync audio state for late-joiners (plays active tracks at correct position)
  if (audio_state && handlers.syncAudioState) {
    handlers.syncAudioState(audio_state);
  }

  console.log("✅ Initial state applied - client synced with server");
};

export const handleSeatChange = (data, { setGameSeats, getCharacterData }) => {
  console.log("received a new message with seat change:", data);

  // data is a userId array from the backend
  const updatedSeats = data.map((userId, index) => {
    const charData = userId !== "empty" ? getCharacterData(userId) : null;
    return {
      seatId: index,
      userId: userId,
      playerName: charData?.player_name || (userId !== "empty" ? userId : "empty"),
      characterData: charData,
      isActive: false
    };
  });

  setGameSeats(updatedSeats);
};

export const handleSeatCountChange = (data, { setGameSeats, getCharacterData }) => {
  console.log("received seat count change:", data);
  const { max_players, new_seats, updated_by, displaced_players = [] } = data;

  // new_seats is a userId array
  const updatedSeats = new_seats ? new_seats.map((userId, index) => {
    const charData = userId !== "empty" ? getCharacterData(userId) : null;
    return {
      seatId: index,
      userId: userId,
      playerName: charData?.player_name || (userId !== "empty" ? userId : "empty"),
      characterData: charData,
      isActive: false
    };
  }) : [];

  setGameSeats(updatedSeats);
};

/**
 * Handle player character change during active session
 * Updates the seat with new character data — matched by user_id
 */
export const handlePlayerCharacterChanged = (data, { setGameSeats, setPlayerMetadata }) => {
  console.log("received player character change:", data);
  const {
    user_id,
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

  const newCharData = {
    user_id,
    player_name,
    character_id,
    character_name,
    character_class,
    character_race,
    level,
    hp_current,
    hp_max,
    ac
  };

  // Update the seat that matches this userId with new character data
  setGameSeats(prevSeats =>
    prevSeats.map(seat => {
      if (seat.userId === user_id) {
        return {
          ...seat,
          playerName: player_name || seat.playerName,
          characterData: newCharData
        };
      }
      return seat;
    })
  );

  if (setPlayerMetadata) {
    setPlayerMetadata(prev => ({
      ...prev,
      [user_id]: newCharData
    }));
  }

  console.log(`✅ Updated character for ${user_id} (${player_name}) to ${character_name}`);
};

export const handlePlayerConnected = (data, {}) => {
  console.log("received player connection:", data);
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

  // Mark user as disconnecting in lobby
  setLobbyUsers(prev =>
    prev.map(user =>
      (user.user_id === disconnected_player || user.name === disconnected_player)
        ? { ...user, status: 'disconnecting' }
        : user
    )
  );
};

export const handlePlayerKicked = (data, { thisUserId, stopRemoteTrack, remoteTrackStates, handleRemoteAudioBatch, sfxSlots, stopSfxSlot }) => {
  console.log("received player kick:", data);
  const { kicked_player } = data;

  // If this user was kicked, stop all audio and redirect
  if (kicked_player === thisUserId) {
    console.log("🚪 Player was kicked - stopping all audio before redirect");

    // Stop all currently active BGM tracks using batch operations
    if (remoteTrackStates && Object.keys(remoteTrackStates).length > 0) {
      if (handleRemoteAudioBatch) {
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
        Object.keys(remoteTrackStates).forEach(trackId => {
          try {
            stopRemoteTrack(trackId);
          } catch (error) {
            console.warn(`Failed to stop track ${trackId}:`, error);
          }
        });
      }
    }

    // Stop all active SFX soundboard slots
    if (sfxSlots && stopSfxSlot) {
      sfxSlots.forEach((slot, i) => {
        if (slot.isPlaying) stopSfxSlot(i);
      });
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
};

export const handlePlayerDisconnected = (data, { thisUserId, setLobbyUsers, setDisconnectTimeouts, disconnectTimeouts }) => {
  console.log("received player disconnect:", data);
  const disconnected_player = data["disconnected_player"];

  // Server will handle seat cleanup and broadcast updated layout
  if (disconnected_player !== thisUserId) {
    // Backend handles disconnect logging
  }

  // Handle lobby disconnect visualization (just mark as disconnecting)
  handlePlayerDisconnectedLobby(data, { setLobbyUsers, setDisconnectTimeouts, disconnectTimeouts });
};

export const handleDiceRoll = (data, { addToLog }) => {
  console.log("received dice roll:", data);
  const { player, message } = data;

  // player is now a userId — addToLog stores it as user_id for seat color lookup
  if (addToLog) {
    addToLog(message, 'player-roll', player);
  }
};

export const handleSystemMessagesCleared = (data, { setRollLog, thisUserId }) => {
  console.log("received system messages cleared:", data);
  const { deleted_count, cleared_by } = data;

  // Remove all system messages from the current rollLog
  setRollLog(prev => prev.filter(entry => entry.type !== 'system'));

  if (cleared_by !== thisUserId) {
    // Backend handles system message clearing logging
  }
};

export const handleAllMessagesCleared = (data, { setRollLog }) => {
  console.log("received all messages cleared:", data);
  setRollLog([]);
};

export const handleDicePrompt = (data, { setActivePrompts, setIsDicePromptActive, addToLog }) => {
  console.log("received dice prompt:", data);
  const { prompted_player, roll_type, prompted_by, prompt_id, log_message } = data;

  // prompted_player and prompted_by are now userIds
  if (addToLog) {
    addToLog(log_message, 'dungeon-master', prompted_by, prompt_id);
  }

  const newPrompt = {
    id: prompt_id || Date.now(),
    player: prompted_player,
    rollType: roll_type,
    promptedBy: prompted_by
  };

  setActivePrompts(prev => {
    const existingIndex = prev.findIndex(p => p.player === prompted_player && p.rollType === roll_type);
    if (existingIndex >= 0) {
      const updated = [...prev];
      updated[existingIndex] = newPrompt;
      return updated;
    } else {
      return [...prev, newPrompt];
    }
  });

  setIsDicePromptActive(true);
};

export const handleInitiativePromptAll = (data, { setActivePrompts, setIsDicePromptActive, setCurrentInitiativePromptId, thisUserId, addToLog }) => {
  console.log("received initiative prompt all:", data);
  const { players_to_prompt, roll_type, prompted_by, prompt_id, initiative_prompt_id, log_message } = data;

  setCurrentInitiativePromptId(initiative_prompt_id);

  if (addToLog) {
    addToLog(log_message, 'dungeon-master', prompted_by, initiative_prompt_id);
  }

  // players_to_prompt is now an array of userIds
  const allPrompts = players_to_prompt.map(userId => ({
    id: `${userId}_${roll_type}_${Date.now()}`,
    player: userId,
    rollType: roll_type,
    promptedBy: prompted_by,
    isInitiativePrompt: true
  }));

  setActivePrompts(prev => {
    const filteredPrev = prev.filter(p =>
      !players_to_prompt.includes(p.player) || p.rollType !== roll_type
    );
    return [...filteredPrev, ...allPrompts];
  });

  // Only set dice prompt active if this user is actually prompted
  if (players_to_prompt.includes(thisUserId)) {
    setIsDicePromptActive(true);
  }
};

export const handleDicePromptClear = (data, { setActivePrompts, setIsDicePromptActive }) => {
  console.log("received dice prompt clear:", data);
  const { prompt_id, clear_all, cleared_player } = data;

  if (clear_all) {
    setActivePrompts([]);
    setIsDicePromptActive(false);
  } else if (prompt_id) {
    setActivePrompts(prev => {
      const filtered = prev.filter(prompt => prompt.id !== prompt_id);
      setIsDicePromptActive(filtered.length > 0);
      return filtered;
    });
  } else if (cleared_player) {
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

  // Update playerSeatMap state if the setter is available (keyed by userId)
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

  setRollLog(prev => prev.filter(entry => entry.prompt_id !== prompt_id));
  console.log(`🗑️ Removed adventure log entry with prompt_id: ${prompt_id}`);
};

export const handleRoleChange = (data, { handleRoleChange, setPlayerMetadata, setDungeonMaster }) => {
  console.log("🎭 Role change received:", data);

  const { action, target_player, changed_by, message, player_metadata, dungeon_master } = data;

  // Update player_metadata from broadcast — moderatorIds derived via useMemo
  if (setPlayerMetadata && player_metadata) {
    setPlayerMetadata(player_metadata);
  }

  // Update DM object from broadcast
  if (setDungeonMaster) {
    setDungeonMaster(dungeon_master && dungeon_master.user_id ? dungeon_master : null);
  }

  // Trigger role refresh — target_player is a userId
  if (handleRoleChange) {
    handleRoleChange(action, target_player);
  }
};

// =====================================
// OUTBOUND SEND FUNCTIONS
// =====================================

export const createSendFunctions = (webSocket, isConnected, roomId, userId) => {
  const sendDicePrompt = (promptedUserId, rollType, promptId) => {
    if (!webSocket || !isConnected) {
      console.log("❌ Cannot send dice prompt - WebSocket not connected");
      return;
    }

    console.log(`🎲 Sending dice prompt: ${promptedUserId} to roll ${rollType} (ID: ${promptId})`);

    webSocket.send(JSON.stringify({
      "event_type": "dice_prompt",
      "data": {
        "prompted_player": promptedUserId,
        "roll_type": rollType,
        "prompted_by": userId,
        "prompt_id": promptId
      }
    }));
  };

  const sendInitiativePromptAll = (userIdsToPrompt) => {
    if (!webSocket || !isConnected) {
      console.log("❌ Cannot send initiative prompt - WebSocket not connected");
      return;
    }

    console.log(`⚡ Sending initiative prompt to all players: ${userIdsToPrompt.join(', ')}`);

    webSocket.send(JSON.stringify({
      "event_type": "initiative_prompt_all",
      "data": {
        "players": userIdsToPrompt,
        "prompted_by": userId
      }
    }));
  };

  const sendDicePromptClear = (promptId = null, clearAll = false, initiativePromptId = null) => {
    if (!webSocket || !isConnected) {
      console.log("❌ Cannot clear dice prompt - WebSocket not connected");
      return;
    }

    const clearData = {
      "cleared_by": userId,
      "prompt_id": promptId,
      "clear_all": clearAll
    };

    if (clearAll && initiativePromptId) {
      clearData.initiative_prompt_id = initiativePromptId;
    }

    webSocket.send(JSON.stringify({
      "event_type": "dice_prompt_clear",
      "data": clearData
    }));
  };

  const sendClearSystemMessages = async () => {
    if (!webSocket || !isConnected) {
      throw new Error('Cannot clear system messages: WebSocket not connected');
    }

    webSocket.send(JSON.stringify({
      "event_type": "clear_system_messages",
      "data": {
        "cleared_by": userId
      }
    }));
  };

  const sendClearAllMessages = async () => {
    if (!webSocket || !isConnected) return;

    try {
      const response = await fetch(`/api/game/${roomId}/logs`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cleared_by: userId }),
      });

      if (!response.ok) {
        throw new Error('Failed to clear all messages from database');
      }

      const result = await response.json();
      console.log(`✅ Cleared ${result.deleted_count} total messages`);

      webSocket.send(JSON.stringify({
        "event_type": "clear_all_messages",
        "data": {
          "cleared_by": userId,
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
      // Send userId array to backend
      const seatArray = newSeats.map(seat => seat.userId);

      const response = await fetch(`/api/game/${roomId}/seat-layout`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seat_layout: seatArray,
          updated_by: userId
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
        "user_id": userId
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
        "new_seats": newSeats.map(seat => seat.userId),
        "updated_by": userId
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

  const sendPlayerKick = (userIdToKick) => {
    if (!webSocket || !isConnected) return;

    webSocket.send(JSON.stringify({
      "event_type": "player_kicked",
      "data": {
        "kicked_player": userIdToKick
      }
    }));
  };

  const sendDiceRoll = (rollerUserId, diceData) => {
    if (!webSocket || !isConnected) return;

    const { diceNotation, results, total, modifier, advantage, context, promptId } = diceData;

    console.log(`🎲 Sending dice roll: ${diceNotation} = ${total}${promptId ? ` (prompt_id: ${promptId})` : ''}`);

    const rollData = {
      "player": rollerUserId,
      "diceNotation": diceNotation,
      "results": results,
      "total": total,
      "modifier": modifier || 0,
      "advantage": advantage || null,
      "context": context || ""
    };

    if (promptId) {
      rollData.prompt_id = promptId;
    }

    webSocket.send(JSON.stringify({
      "event_type": "dice_roll",
      "data": rollData
    }));
  };

  const sendColorChange = (targetUserId, seatIndex, newColor) => {
    if (!webSocket || !isConnected) {
      console.log("❌ Cannot send color change - WebSocket not connected");
      return;
    }

    console.log(`🎨 Sending color change: ${targetUserId} (seat ${seatIndex}) to ${newColor}`);

    webSocket.send(JSON.stringify({
      "event_type": "color_change",
      "data": {
        "player": targetUserId,
        "seat_index": seatIndex,
        "new_color": newColor,
        "changed_by": userId
      }
    }));
  };

  const sendRoleChange = (action, targetUserId) => {
    if (!webSocket || !isConnected) {
      console.log("❌ Cannot send role change - WebSocket not connected");
      return;
    }

    console.log(`🎭 Sending role change: ${action} for ${targetUserId}`);

    webSocket.send(JSON.stringify({
      "event_type": "role_change",
      "data": {
        "action": action,
        "target_player": targetUserId
      }
    }));
  };

  // Audio send functions from the audio management module
  const audioSendFunctions = createAudioSendFunctions(webSocket, isConnected, userId);
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

// Event handlers for displaced players

export const handlePlayerDisplaced = (data, { thisUserId }) => {
  console.log("🚪 Player displaced:", data);
  const { user_id, former_seat, message, reason } = data;

  if (user_id === thisUserId) {
    console.log(`⚠️ You have been displaced: ${message}`);
  }
};

export const handleSystemMessage = (data, {}) => {
  console.log("📢 System message:", data);
  const { message, type = 'system' } = data;
  // Backend handles system message logging
};

export const handleSessionEnded = (data, { stopRemoteTrack, remoteTrackStates, handleRemoteAudioBatch, setSessionEndedData, sfxSlots, stopSfxSlot }) => {
  console.log("🛑 Session ended:", data);
  const { reason, message } = data;

  console.log(`🚪 Game session ended: ${message || reason}`);

  // Stop all currently active BGM tracks using batch operations
  if (remoteTrackStates && Object.keys(remoteTrackStates).length > 0) {
    if (handleRemoteAudioBatch) {
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
      Object.keys(remoteTrackStates).forEach(trackId => {
        try {
          stopRemoteTrack(trackId);
        } catch (error) {
          console.warn(`Failed to stop track ${trackId}:`, error);
        }
      });
    }
  }

  // Stop all active SFX soundboard slots
  if (sfxSlots && stopSfxSlot) {
    sfxSlots.forEach((slot, i) => {
      if (slot.isPlaying) stopSfxSlot(i);
    });
  }

  // Show session ended modal with countdown
  if (setSessionEndedData) {
    setSessionEndedData({ message, reason });
  } else {
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
    setActiveMap(map);
    if (map.grid_config) setGridConfig(map.grid_config);
    if (map.map_image_config) setMapImageConfig(map.map_image_config);
    console.log(`🗺️ Map "${map.original_filename}" loaded by ${loaded_by}`);
  }
};

export const handleMapClear = (data, { setActiveMap, setGridConfig, setMapImageConfig }) => {
  console.log("🗺️ Map cleared:", data);
  setActiveMap(null);
  setGridConfig(null);
  setMapImageConfig(null);
};

export const handleMapConfigUpdate = (data, { setActiveMap, activeMap }) => {
  console.log("🗺️ Map config updated:", data);
  const { filename, grid_config, map_image_config, updated_by } = data;

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

export const createMapSendFunctions = (sendMessage, roomId, thisUserId) => ({
  sendMapLoad: (mapData) => {
    sendMessage({
      event_type: 'map_load',
      data: { map_data: mapData }
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
