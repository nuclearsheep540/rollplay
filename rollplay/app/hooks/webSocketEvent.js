/**
 * WebSocket Event Handlers
 * Contains all the business logic for handling incoming WebSocket messages
 * These functions take data and state setters directly to process events
 */

// =====================================
// REMOTE AUDIO EVENT HANDLERS
// =====================================

export const handleRemoteAudioPlay = async (data, { playRemoteTrack, loadRemoteAudioBuffer, audioBuffersRef }) => {
  console.log("🎵 Remote audio play command received:", data);
  const { tracks, triggered_by } = data;
  
  if (playRemoteTrack) {
    if (tracks && Array.isArray(tracks)) {
      // Multiple tracks for synchronized playback
      console.log(`🔗 Processing ${tracks.length} synchronized tracks:`, tracks);
      
      try {
        // Phase 1: Load all audio buffers in parallel (but wait for ALL to complete)
        console.log(`📁 [SYNC] Loading ${tracks.length} audio buffers in parallel...`);
        const loadPromises = tracks.map(async (track, index) => {
          const { channelId, filename } = track;
          console.log(`📁 [SYNC ${index + 1}/${tracks.length}] Loading buffer for ${channelId}: ${filename}`);
          
          // Use the existing loadRemoteAudioBuffer function from useUnifiedAudio
          const buffer = await loadRemoteAudioBuffer(`/audio/${filename}`, channelId);
          
          // Store the buffer with the same key format that playRemoteTrack expects
          // playRemoteTrack expects: trackId_audioFile (e.g., "audio_channel_1A_boss.mp3")
          if (buffer && audioBuffersRef) {
            const expectedKey = `${channelId}_${filename}`;
            audioBuffersRef.current[expectedKey] = buffer;
            console.log(`📁 [SYNC] Stored buffer with expected key: ${expectedKey}`);
          }
          return { track, buffer, index };
        });
        
        const loadResults = await Promise.all(loadPromises);
        console.log(`✅ [SYNC] All ${tracks.length} buffers loaded, starting synchronized playback...`);
        
        // Phase 2: Start all tracks simultaneously (now that all buffers are ready)
        const playPromises = loadResults.map(async ({ track, buffer, index }) => {
          if (!buffer) {
            console.warn(`❌ [SYNC ${index + 1}/${tracks.length}] Buffer failed to load for ${track.channelId}`);
            return false;
          }
          
          const { channelId, filename, looping = true, volume = 1.0 } = track;
          console.log(`▶️ [SYNC ${index + 1}/${tracks.length}] Starting pre-loaded ${channelId}: ${filename}`);
          
          // Call playRemoteTrack with a flag to skip buffer loading since we already have it
          const success = await playRemoteTrack(channelId, filename, looping, volume, null, track, true);
          console.log(`▶️ [SYNC ${index + 1}/${tracks.length}] Play result for ${channelId}: ${success}`);
          return success;
        });
        
        const results = await Promise.all(playPromises);
        console.log(`🎯 Synchronized playback completed: ${results.filter(r => r).length}/${tracks.length} tracks started successfully`);
      } catch (error) {
        console.error(`❌ Synchronized playback failed:`, error);
      }
    } else {
      // Legacy single track format
      const { track_type, audio_file, loop = true, volume = 1.0 } = data;
      console.log(`▶️ Playing single remote track: ${track_type}: ${audio_file}`);
      // For legacy format, create a simple track state object
      const trackState = { channelId: track_type, filename: audio_file, looping: loop, volume };
      const success = await playRemoteTrack(track_type, audio_file, loop, volume, null, trackState);
      console.log(`▶️ Single track play result: ${success}`);
    }
  } else {
    console.warn("❌ playRemoteTrack function not available");
  }
};

export const handleRemoteAudioStop = (data, { stopRemoteTrack }) => {
  console.log("🛑 Remote audio stop command received:", data);
  const { track_type, triggered_by } = data;
  
  if (stopRemoteTrack) {
    stopRemoteTrack(track_type);
    console.log(`⏹️ Stopped remote ${track_type} (triggered by ${triggered_by})`);
  }
};

export const handleRemoteAudioPause = (data, { pauseRemoteTrack }) => {
  console.log("⏸️ Remote audio pause command received:", data);
  const { track_type, triggered_by } = data;
  
  if (pauseRemoteTrack) {
    pauseRemoteTrack(track_type);
    console.log(`⏸️ Paused remote ${track_type} (triggered by ${triggered_by})`);
  }
};

export const handleRemoteAudioVolume = (data, { setRemoteTrackVolume }) => {
  console.log("🔊 Remote audio volume command received:", data);
  const { track_type, volume, triggered_by } = data;
  
  if (setRemoteTrackVolume) {
    setRemoteTrackVolume(track_type, volume);
    console.log(`🔊 Set remote ${track_type} volume to ${Math.round(volume * 100)}% (triggered by ${triggered_by})`);
  }
};

export const handleRemoteAudioResume = async (data, { resumeRemoteTrack, remoteTrackStates }) => {
  console.log("▶️ Remote audio resume command received:", data);
  const { tracks, track_type, triggered_by } = data;
  
  if (resumeRemoteTrack) {
    if (tracks && Array.isArray(tracks)) {
      // Multiple tracks for synchronized resume
      console.log(`🔗 Processing ${tracks.length} synchronized resume tracks:`, tracks);
      
      // Start all tracks simultaneously using Promise.all for true sync
      const resumePromises = tracks.map(async (track, index) => {
        const { channelId } = track;
        console.log(`▶️ [RESUME ${index + 1}/${tracks.length}] About to resume ${channelId} from paused position`);
        
        const success = await resumeRemoteTrack(channelId);
        console.log(`▶️ [RESUME ${index + 1}/${tracks.length}] Resume result for ${channelId}: ${success}`);
        return success;
      });
      
      try {
        const results = await Promise.all(resumePromises);
        console.log(`🎯 Synchronized resume completed: ${results.filter(r => r).length}/${tracks.length} tracks resumed successfully`);
      } catch (error) {
        console.error(`❌ Synchronized resume failed:`, error);
      }
    } else {
      // Legacy single track resume format
      console.log(`▶️ Resuming single remote track: ${track_type} from paused position`);
      
      const success = await resumeRemoteTrack(track_type);
      console.log(`▶️ Single track resume result: ${success}`);
    }
  } else {
    console.warn("❌ resumeRemoteTrack function not available");
  }
};

export const handleRemoteAudioLoop = (data, { toggleRemoteTrackLooping }) => {
  console.log("🔄 Remote audio loop command received:", data);
  const { track_type, looping, triggered_by } = data;
  
  if (toggleRemoteTrackLooping) {
    toggleRemoteTrackLooping(track_type, looping);
    console.log(`🔄 Set remote ${track_type} looping to ${looping ? 'enabled' : 'disabled'} (triggered by ${triggered_by})`);
  } else {
    console.warn("❌ toggleRemoteTrackLooping function not available");
  }
};


// =====================================
// EXISTING EVENT HANDLERS
// =====================================

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

export const handlePlayerKicked = (data, { thisPlayer, stopRemoteTrack, remoteTrackStates }) => {
  console.log("received player kick:", data);
  const { kicked_player } = data;
  // Backend handles kick logging

  // If this player was kicked, stop all audio and redirect
  if (kicked_player === thisPlayer) {
    console.log("🚪 Player was kicked - stopping all audio before redirect");
    
    // Stop all currently active audio tracks
    if (stopRemoteTrack && remoteTrackStates) {
      Object.keys(remoteTrackStates).forEach(trackId => {
        try {
          stopRemoteTrack(trackId);
          console.log(`🛑 Stopped audio track: ${trackId}`);
        } catch (error) {
          console.warn(`Failed to stop track ${trackId}:`, error);
        }
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

  // =====================================
  // REMOTE AUDIO SENDING FUNCTIONS
  // =====================================

  const sendRemoteAudioPlay = (trackType, audioFile, loop = true, volume = null) => {
    if (!webSocket || !isConnected) return;
    
    console.log(`📡 Sending remote audio play: ${trackType} - ${audioFile}`);
    
    webSocket.send(JSON.stringify({
      "event_type": "remote_audio_play",
      "data": {
        "track_type": trackType,
        "audio_file": audioFile,
        "loop": loop,
        "volume": volume,
        "triggered_by": playerName
      }
    }));
  };

  const sendRemoteAudioPlayTracks = (tracks) => {
    console.log(`🔍 sendRemoteAudioPlayTracks called with:`, tracks);
    console.log(`🔍 WebSocket state: connected=${isConnected}, readyState=${webSocket?.readyState}`);
    
    if (!webSocket || !isConnected) {
      console.warn(`❌ Cannot send synchronized audio - WebSocket not ready. connected=${isConnected}, webSocket=${!!webSocket}`);
      return;
    }
    
    const trackDescriptions = tracks.map(t => `${t.channelId} (${t.filename})`).join(' + ');
    console.log(`📡 Sending synchronized audio play: ${trackDescriptions}`);
    
    const message = {
      "event_type": "remote_audio_play",
      "data": {
        "tracks": tracks,
        "triggered_by": playerName
      }
    };
    
    console.log(`📡 WebSocket message being sent:`, message);
    
    try {
      webSocket.send(JSON.stringify(message));
      console.log(`✅ WebSocket send successful`);
    } catch (error) {
      console.error(`❌ WebSocket send failed:`, error);
    }
  };

  const sendRemoteAudioStop = (trackType) => {
    if (!webSocket || !isConnected) return;
    
    console.log(`📡 Sending remote audio stop: ${trackType}`);
    
    webSocket.send(JSON.stringify({
      "event_type": "remote_audio_stop",
      "data": {
        "track_type": trackType,
        "triggered_by": playerName
      }
    }));
  };

  const sendRemoteAudioPause = (trackType) => {
    if (!webSocket || !isConnected) return;
    
    console.log(`📡 Sending remote audio pause: ${trackType}`);
    
    webSocket.send(JSON.stringify({
      "event_type": "remote_audio_pause",
      "data": {
        "track_type": trackType,
        "triggered_by": playerName
      }
    }));
  };

  const sendRemoteAudioVolume = (trackType, volume) => {
    if (!webSocket || !isConnected) return;
    
    console.log(`📡 [DEBOUNCED] Sending remote audio volume: ${trackType} - ${Math.round(volume * 100)}%`);
    
    webSocket.send(JSON.stringify({
      "event_type": "remote_audio_volume",
      "data": {
        "track_type": trackType,
        "volume": volume,
        "triggered_by": playerName
      }
    }));
  };

  const sendRemoteAudioResume = (trackType) => {
    if (!webSocket || !isConnected) return;
    
    console.log(`📡 Sending remote audio resume: ${trackType}`);
    
    webSocket.send(JSON.stringify({
      "event_type": "remote_audio_resume",
      "data": {
        "track_type": trackType,
        "triggered_by": playerName
      }
    }));
  };

  const sendRemoteAudioResumeTracks = (tracks) => {
    if (!webSocket || !isConnected) {
      console.warn(`❌ Cannot send synchronized audio resume - WebSocket not ready. connected=${isConnected}, webSocket=${!!webSocket}`);
      return;
    }
    
    const trackDescriptions = tracks.map(t => `${t.channelId} (paused)`).join(' + ');
    console.log(`📡 Sending synchronized audio resume: ${trackDescriptions}`);
    
    const message = {
      "event_type": "remote_audio_resume",
      "data": {
        "tracks": tracks,
        "triggered_by": playerName
      }
    };
    
    console.log(`📡 WebSocket resume message being sent:`, message);
    
    try {
      webSocket.send(JSON.stringify(message));
      console.log(`✅ WebSocket resume send successful`);
    } catch (error) {
      console.error(`❌ WebSocket resume send failed:`, error);
    }
  };

  const sendRemoteAudioLoop = (trackType, looping) => {
    if (!webSocket || !isConnected) return;
    
    console.log(`📡 Sending remote audio loop toggle: ${trackType} - ${looping ? 'enabled' : 'disabled'}`);
    
    webSocket.send(JSON.stringify({
      "event_type": "remote_audio_loop",
      "data": {
        "track_type": trackType,
        "looping": looping,
        "triggered_by": playerName
      }
    }));
  };


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
    sendRemoteAudioPlayTracks,
    sendRemoteAudioPause,
    sendRemoteAudioStop,
    sendRemoteAudioVolume,
    sendRemoteAudioResume,
    sendRemoteAudioResumeTracks,
    sendRemoteAudioLoop
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