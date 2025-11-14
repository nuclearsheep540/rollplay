  /*
   * Copyright (C) 2025 Matthew Davey
   * SPDX-License-Identifier: GPL-3.0-or-later
   */

'use client'

import { React, useEffect, useState, useMemo, useCallback, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from "next/navigation";
import { getSeatColor } from '../utils/seatColors';

import PlayerCard from "./components/PlayerCard";
import DMChair from "./components/DMChair";
import DMControlCenter from './components/DMControlCenter';
import ModeratorControls from './components/ModeratorControls';
import HorizontalInitiativeTracker from './components/HorizontalInitiativeTracker';
import AdventureLog from './components/AdventureLog';
import LobbyPanel from './components/LobbyPanel';
import DiceActionPanel from './components/DiceActionPanel'; // NEW IMPORT
import { useWebSocket } from './hooks/useWebSocket';
import { useUnifiedAudio } from '../audio_management';
import { MapDisplay, GridOverlay, useMapWebSocket } from '../map_management';

function GameContent() {
  const params = useSearchParams();
  const router = useRouter(); 

  const [room404, setRoom404] = useState(false)
  const [thisPlayer, setThisPlayer] = useState()
  const [roomId, setRoomId] = useState()
  
  // Current user state - fetched once on page load
  const [currentUser, setCurrentUser] = useState(null)
  const [userLoading, setUserLoading] = useState(true)

  // Removed unused chat history state

  // who generated the room
  const [host, setHost] = useState("")

  // UNIFIED STRUCTURE - Replaces both seats and partyMembers
  const [gameSeats, setGameSeats] = useState([]);

  // State for seat colors (loaded from backend)
  const [seatColors, setSeatColors] = useState({});

  // Lobby state for connected users not in party
  const [lobbyUsers, setLobbyUsers] = useState([]);
  
  // Track disconnect timeouts for lobby users
  const [disconnectTimeouts, setDisconnectTimeouts] = useState({});

  // Role change trigger to refresh ModeratorControls when any role changes occur
  const [roleChangeTrigger, setRoleChangeTrigger] = useState(Date.now());

  // DM seat state - string containing DM name or empty string
  const [dmSeat, setDmSeat] = useState("");

  // Pre-computed player-to-seat mapping for O(1) lookups
  const playerSeatMap = useMemo(() => {
    const map = {};
    gameSeats.forEach((seat, index) => {
      if (seat.playerName !== "empty") {
        map[seat.playerName] = {
          seatIndex: index,
          seatColor: seatColors[index] || getSeatColor(index) // Use backend color or default
        };
      }
    });
    return map;
  }, [gameSeats, seatColors]);

  // UPDATED: State management for TabletopInterface - REMOVED HARDCODED DEFAULTS
  const [currentTurn, setCurrentTurn] = useState(null); // ❌ Removed 'Thorin' default
  const [isDM, setIsDM] = useState(false); // Toggle for DM panel visibility
  const [isModerator, setIsModerator] = useState(false); // Moderator status
  const [isHost, setIsHost] = useState(false); // Host status
  const [dicePortalActive, setDicePortalActive] = useState(true);
  const [uiScale, setUIScale] = useState('medium'); // UI Scale state
  const [combatActive, setCombatActive] = useState(false); // Combat state
  const [rollLog, setRollLog] = useState([
    { id: 1, message: 'Welcome to Tabletop Tavern', type: 'system'}
  ]);
  
  const [initiativeOrder, setInitiativeOrder] = useState([]); // ❌ Removed hardcoded data

  const [currentTrack, setCurrentTrack] = useState('🏰 Tavern Ambience');
  const [isPlaying, setIsPlaying] = useState(true);

  // UPDATED: Multiple dice roll prompts support
  const [activePrompts, setActivePrompts] = useState([]); // Array of {id, player, rollType, promptedBy}
  const [isDicePromptActive, setIsDicePromptActive] = useState(false); // Is any prompt active?
  const [currentInitiativePromptId, setCurrentInitiativePromptId] = useState(null); // Track initiative prompt ID for removal

  // Map system state
  const [activeMap, setActiveMap] = useState(null); // Current active map data
  const [gridEditMode, setGridEditMode] = useState(false); // Is DM editing grid dimensions?
  const [gridConfig, setGridConfig] = useState(null); // Current grid configuration
  const [liveGridOpacity, setLiveGridOpacity] = useState(0.2); // Live grid opacity for real-time updates
  
  // Debug wrapper for setGridConfig
  const debugSetGridConfig = (config) => {
    console.log('🎯 setGridConfig called with:', config);
    setGridConfig(config);
  };
  const [mapImageConfig, setMapImageConfig] = useState(null); // Map image positioning/scaling

  // Handle grid configuration changes during editing
  const handleGridChange = (newGridConfig) => {
    console.log('🎯 handleGridChange called with:', newGridConfig);
    console.log('🎯 Current gridConfig before update:', gridConfig);
    setGridConfig(newGridConfig);
    // TODO: Save to backend when grid editing is complete
    console.log('🎯 Grid config updated, setGridConfig called');
  };

  // Handle map image configuration changes during editing
  const handleMapImageChange = (newMapImageConfig) => {
    setMapImageConfig(newMapImageConfig);
    // TODO: Save to backend when map editing is complete
    console.log('Map image config updated:', newMapImageConfig);
  };

  // Helper function to get character data
  const getCharacterData = (playerName) => {
    const characterDatabase = {
      'Thorin': { class: 'Dwarf Fighter', level: 3, hp: 34, maxHp: 40 }
    };
    
    return characterDatabase[playerName] || {
      class: 'Adventurer',
      level: 1,
      hp: 10,
      maxHp: 10
    };
  };


  // Copy room code to clipboard
  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      
      // Optional: Show a temporary visual feedback
      const roomCodeElement = document.querySelector('.room-code');
      const originalText = roomCodeElement.textContent;
      
      // Change text to show it was copied
      roomCodeElement.textContent = 'Copied!';
      roomCodeElement.style.background = 'rgba(34, 197, 94, 0.3)';
      roomCodeElement.style.borderColor = 'rgba(34, 197, 94, 0.5)';
      
      // Reset after 2 seconds
      setTimeout(() => {
        roomCodeElement.textContent = originalText;
        roomCodeElement.style.background = 'rgba(74, 222, 128, 0.15)';
        roomCodeElement.style.borderColor = 'rgba(74, 222, 128, 0.3)';
      }, 2000);
      
    } catch (err) {
      console.error('Failed to copy room code:', err);
      // Fallback for older browsers
      fallbackCopyTextToClipboard(roomId);
    }
  };

  // Fallback copy function for browsers that don't support navigator.clipboard
  const fallbackCopyTextToClipboard = (text) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    
    // Avoid scrolling to bottom
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        // Show feedback
        const roomCodeElement = document.querySelector('.room-code');
        const originalText = roomCodeElement.textContent;
        roomCodeElement.textContent = 'Copied!';
        
        setTimeout(() => {
          roomCodeElement.textContent = originalText;
        }, 2000);
      }
    } catch (err) {
      console.error('Fallback: Unable to copy', err);
    }
    
    document.body.removeChild(textArea);
  };

  // UPDATED onLoad function to use unified structure
  async function onLoad(roomId) {
    const req = await fetch(`api/game/${roomId}`)
    if (req.status === 404) {
      console.log("room id not found")
      setRoom404(true)
      return
    }
  
    await req.json().then((res) => {
      setHost(res["room_host"] || res["player_name"]) // Backward compatibility
      
      // Set DM seat from room data
      const currentDM = res["dungeon_master"] || "";
      setDmSeat(currentDM);
      
      // Use actual seat layout from database if available
      const seatLayout = res["current_seat_layout"] || [];
      const maxPlayers = res["max_players"];
      const backendSeatColors = res["seat_colors"] || {};
      
      // Set seat colors from backend
      setSeatColors(backendSeatColors);
      
      // Initialize CSS variables for seat colors
      Object.keys(backendSeatColors).forEach(seatIndex => {
        document.documentElement.style.setProperty(
          `--seat-color-${seatIndex}`, 
          backendSeatColors[seatIndex]
        );
      });
      
      // Create unified seat structure from database data
      const initialSeats = [];
      for (let i = 0; i < maxPlayers; i++) {
        const playerName = seatLayout[i] || "empty";
        // Normalize player names when loading from database
        const normalizedPlayerName = playerName !== "empty" ? playerName.toLowerCase() : "empty";
        initialSeats.push({
          seatId: i,
          playerName: normalizedPlayerName,
          characterData: normalizedPlayerName !== "empty" ? getCharacterData(normalizedPlayerName) : null,
          isActive: false
        });
      }
      
      console.log("Loaded seat layout from database:", initialSeats);
      console.log("Loaded seat colors from database:", backendSeatColors);
      setGameSeats(initialSeats);
    })
    
    // Load adventure logs for this room
    await loadAdventureLogs(roomId);
    
    // Load active map for this room
    await loadActiveMap(roomId);
  }
  
  // Check player roles on initial page load - single source of truth
  const checkPlayerRoles = async (roomId, user) => {
    try {
      console.log(`🔍 Initial role check for user: ${user.screen_name || user.email} (ID: ${user.id}) in room: ${roomId}`);

      // Get MongoDB-based roles (host, moderator, DM) from active game session
      const playerName = user.screen_name || user.email;
      const mongoRolesResponse = await fetch(`/api/game/${roomId}/roles?playerName=${playerName}`);
      let isHost = false;
      let isModerator = false;
      let isDMRole = false;

      if (mongoRolesResponse.ok) {
        const mongoRoles = await mongoRolesResponse.json();
        isHost = mongoRoles.is_host;
        isModerator = mongoRoles.is_moderator;
        isDMRole = mongoRoles.is_dm;  // Use MongoDB DM flag
        console.log('📋 MongoDB roles:', mongoRoles);
      } else {
        console.error('❌ Failed to fetch MongoDB roles:', mongoRolesResponse.status);
      }

      // Set roles in component state
      setIsHost(isHost);
      setIsModerator(isModerator);
      setIsDM(isDMRole);
      console.log(`✅ Initial roles set - Host: ${isHost}, Moderator: ${isModerator}, DM: ${isDMRole}`);

    } catch (error) {
      console.error('Error checking player roles:', error);
    }
  };

  // Refresh dynamic roles (host/moderator) after WebSocket events
  // DM status is static and never changes during session
  const refreshDynamicRoles = async (roomId, user) => {
    try {
      console.log(`🔄 Refreshing dynamic roles for user: ${user.screen_name || user.email}`);
      
      // Only fetch MongoDB-based roles (host, moderator) - DM status is static
      const playerName = user.screen_name || user.email;
      const mongoRolesResponse = await fetch(`/api/game/${roomId}/roles?playerName=${playerName}`);
      
      if (mongoRolesResponse.ok) {
        const mongoRoles = await mongoRolesResponse.json();
        setIsHost(mongoRoles.is_host);
        setIsModerator(mongoRoles.is_moderator);
        console.log('🔄 Dynamic roles updated:', mongoRoles);
      } else {
        console.error('❌ Failed to refresh dynamic roles:', mongoRolesResponse.status);
      }
      
    } catch (error) {
      console.error('Error refreshing dynamic roles:', error);
    }
  };

  // Fetch current user data once on page load
  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        setUserLoading(true);
        const response = await fetch('/api/users/get_current_user', {
          method: 'GET',
          credentials: 'include'
        });
        
        if (response.ok) {
          const userData = await response.json();
          setCurrentUser(userData);
          console.log('✅ Current user loaded:', userData);
        } else {
          console.error('Failed to fetch user data:', response.status);
        }
      } catch (error) {
        console.error('Error fetching current user:', error);
      } finally {
        setUserLoading(false);
      }
    };

    fetchCurrentUser();
  }, []);

  // initialise the game lobby
  useEffect(() => {
    const roomId = params.get('room_id')

    console.log('Game page params:', { roomId })
    console.log('All params:', Array.from(params.entries()))

    setRoomId(roomId)
    
    // Wait for user to be loaded before proceeding
    if (!currentUser || userLoading) {
      console.log('Waiting for user data to load...');
      return;
    }
    
    // Set thisPlayer to use user's screen_name or email
    const playerName = currentUser.screen_name || currentUser.email;
    setThisPlayer(playerName?.toLowerCase());
    console.log('Using player name from user data:', playerName);

    // fetches the room ID, and loads data
    onLoad(roomId)
    
    console.log('roomId ', roomId)
    console.log('thisPlayer ', thisPlayer)
    console.log('roomId && thisPlayer ', roomId && thisPlayer)

    // Initial role check on page load - single source of truth
    if (roomId && currentUser) {
      checkPlayerRoles(roomId, currentUser);
    }
  }, [currentUser, userLoading])

  // UPDATED: Seat count management with displaced player handling
  const setSeatCount = async (newSeatCount) => {
    try {
      console.log(`Updating seat count to: ${newSeatCount}`);
      
      // Identify displaced players if reducing seat count
      const displacedPlayers = [];
      if (newSeatCount < gameSeats.length) {
        for (let i = newSeatCount; i < gameSeats.length; i++) {
          if (gameSeats[i] && gameSeats[i].playerName !== "empty") {
            displacedPlayers.push({
              playerName: gameSeats[i].playerName,
              seatId: i,
              characterData: gameSeats[i].characterData
            });
          }
        }
      }
      
      // Create new seat array
      const newSeats = [];
      
      // Copy existing seats up to the new count
      for (let i = 0; i < newSeatCount; i++) {
        if (i < gameSeats.length) {
          // Keep existing seat
          newSeats.push(gameSeats[i]);
        } else {
          // Add new empty seat
          newSeats.push({
            seatId: i,
            playerName: "empty",
            characterData: null,
            isActive: false
          });
        }
      }

      // Update MongoDB via API with displaced players info
      const response = await fetch(`/api/game/${roomId}/seats`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          max_players: newSeatCount,
          updated_by: getCurrentPlayerName(),
          displaced_players: displacedPlayers
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update seat count in database');
      }

      // Send websocket update using hook method
      sendSeatCountChange(newSeatCount, newSeats);

      // Note: Do NOT update local state here - let WebSocket broadcast handle it
      // This prevents double state updates that cause adventure log to jump
      
      console.log(`Seat count change requested. Displaced players:`, displacedPlayers);

    } catch (error) {
      console.error('Error updating seat count:', error);
      alert('Failed to update seat count. Please try again.');
    }
  };

  const loadAdventureLogs = async (roomId) => {
    try {
      console.log("Loading adventure logs from database...");
      
      const response = await fetch(`/api/game/${roomId}/logs?limit=100`);
      
      if (response.ok) {
        const data = await response.json();
        const dbLogs = data.logs;
        
        console.log(`Loaded ${dbLogs.length} logs from database`);
        
        // Convert database logs to your frontend format
        const formattedLogs = dbLogs.map(log => ({
          id: log.log_id,
          message: log.message,
          type: log.type,
          timestamp: formatTimestamp(log.timestamp),
          player_name: log.from_player, // Map from_player to player_name for styling
          prompt_id: log.prompt_id // Include prompt_id for removal matching
        }));
        
        // Replace your initial hardcoded logs with database logs
        setRollLog(formattedLogs.reverse()); // Reverse to show oldest first in state
        
      } else {
        console.log("No existing logs found, starting with empty log");
        // Keep your existing default logs or start empty
        setRollLog([]);
      }
      
    } catch (error) {
      console.error("Error loading adventure logs:", error);
      // Fallback to default logs
      setRollLog([
        { id: 1, message: 'Welcome to the adventure!', type: 'system', timestamp: formatTimestamp(new Date()) }
      ]);
    }
  };
  
  // Helper function to format timestamps
  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Load active map for the room
  const loadActiveMap = async (roomId) => {
    try {
      console.log("🗺️ Loading active map from database...");
      
      const response = await fetch(`/api/game/${roomId}/active-map`);
      
      if (response.ok) {
        const mapData = await response.json();
        
        if (mapData && mapData.active_map) {
          const activeMapData = mapData.active_map;
          console.log(`🗺️ Loaded active map: ${activeMapData.original_filename}`);
          
          // Set the active map (atomic - contains all map data including grid_config)
          setActiveMap(activeMapData);
          console.log('🗺️ Loaded complete map atomically:', {
            filename: activeMapData.filename,
            hasGridConfig: !!activeMapData.grid_config,
            hasImageConfig: !!activeMapData.map_image_config
          });
          
        } else {
          console.log("🗺️ No active map found for room");
          // Clear map state if no active map (atomic)
          setActiveMap(null);
        }
        
      } else if (response.status === 404) {
        console.log("🗺️ No active map found for room");
        // Clear map state if no active map (atomic)
        setActiveMap(null);
      } else {
        console.error("🗺️ Failed to fetch active map:", response.status, response.statusText);
      }
      
    } catch (error) {
      console.error("🗺️ Error loading active map:", error);
      // Don't set fallback map data - leave empty if error (atomic)
      setActiveMap(null);
    }
  };

  // UPDATED: Handle player kick
  const handleKickPlayer = async (playerToKick, disconnected) => {
    try {
      
      // Find the seat with this player and empty it
      const updatedSeats = gameSeats.map(seat => 
        seat.playerName === playerToKick 
          ? { ...seat, playerName: "empty", characterData: null, isActive: false }
          : seat
      );
  
      // Send kick event via websocket using hook method
      sendPlayerKick(playerToKick);
  
      // Send updated seat layout using hook method
      sendSeatChange(updatedSeats);
  
      // Update local state
      setGameSeats(updatedSeats);

      if (disconnected) {
        return
      }
  
      // Adventure log will be handled by server broadcast
  
    } catch (error) {
      console.error('Error kicking player:', error);
      alert('Failed to kick player. Please try again.');
    }
  };

  const addToLog = (message, type, playerName = null, promptId = null) => {
    const now = new Date();
    const timestamp = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const newEntry = {
      id: Date.now(),
      message,
      type,
      timestamp,
      player_name: playerName
    };
    
    // Add prompt_id if provided
    if (promptId) {
      newEntry.prompt_id = promptId;
    }
    
    setRollLog(prev => [...prev, newEntry]);
  };

  // Handle role changes from ModeratorControls and WebSocket events
  const handleRoleChange = async (action, playerName) => {
    console.log(`Role change: ${action} for ${playerName}`);
    
    // Update DM seat based on the action
    if (action === 'set_dm') {
      setDmSeat(playerName);
      
      // Business logic: If new DM is sitting in a party seat, remove them from it
      const playerSeatIndex = gameSeats.findIndex(seat => seat.playerName === playerName);
      if (playerSeatIndex !== -1) {
        console.log(`🎭 Removing ${playerName} from party seat ${playerSeatIndex} as they become DM`);
        
        // Create updated seats with the DM removed from party
        const newSeats = [...gameSeats];
        newSeats[playerSeatIndex] = {
          ...newSeats[playerSeatIndex],
          playerName: "empty",
          characterData: null,
          isActive: false
        };
        
        // Update local state and broadcast seat change
        setGameSeats(newSeats);
        sendSeatChange(newSeats);
      }
    } else if (action === 'unset_dm') {
      setDmSeat("");
    }
    
    // Refresh dynamic roles (host/moderator) for current user
    // DM status is static and doesn't change during session
    if (roomId && currentUser) {
      await refreshDynamicRoles(roomId, currentUser);
    }
    
    // Trigger refresh of ModeratorControls room data for all users
    setRoleChangeTrigger(Date.now());
    
    // Role changes are now broadcasted via WebSocket to all connected users
  };

  // Create a setter function for playerSeatMap updates
  const setPlayerSeatMap = (updaterFunction) => {
    // This is a derived state update - we need to update seatColors instead
    // The updaterFunction expects the current playerSeatMap and returns the new one
    const currentMap = playerSeatMap;
    const newMap = updaterFunction(currentMap);
    
    // Extract seat colors from the updated map
    const newSeatColors = {};
    Object.values(newMap).forEach(playerData => {
      if (playerData.seatIndex !== undefined && playerData.seatColor) {
        newSeatColors[playerData.seatIndex] = playerData.seatColor;
      }
    });
    
    setSeatColors(newSeatColors);
  };

  // Initialize unified audio system (local + remote) FIRST
  const {
    isAudioUnlocked,
    masterVolume,
    setMasterVolume,
    unlockAudio,
    playLocalSFX,
    remoteTrackStates,
    remoteTrackAnalysers,
    playRemoteTrack,
    resumeRemoteTrack,
    pauseRemoteTrack,
    stopRemoteTrack,
    setRemoteTrackVolume,
    toggleRemoteTrackLooping,
    loadRemoteAudioBuffer,
    audioBuffersRef,
    audioContextRef,
    setClearPendingOperationCallback
  } = useUnifiedAudio();

  // Ref to hold the pending operation clearing function from AudioMixerPanel
  const clearPendingOperationFnRef = useRef(null);

  // Function to set the callback (called by AudioMixerPanel)
  const setClearPendingOperationFn = useCallback((fn) => {
    clearPendingOperationFnRef.current = fn;
    setClearPendingOperationCallback(fn);
  }, [setClearPendingOperationCallback]);

  // Create game context object for WebSocket handlers (after audio functions are defined)
  const gameContext = {
    // State setters
    setGameSeats,
    setCombatActive,
    setRollLog,
    setActivePrompts,
    setIsDicePromptActive,
    setPlayerSeatMap,
    setLobbyUsers,
    setDisconnectTimeouts,
    setCurrentInitiativePromptId,
    
    // Current state values
    gameSeats,
    thisPlayer,
    currentUser,
    lobbyUsers,
    disconnectTimeouts,
    currentInitiativePromptId,
    
    // Helper functions
    addToLog,
    getCharacterData,
    handleRoleChange,
    
    // Remote audio functions (for WebSocket events)
    playRemoteTrack,
    resumeRemoteTrack,
    pauseRemoteTrack,
    stopRemoteTrack,
    setRemoteTrackVolume,
    toggleRemoteTrackLooping,
    loadRemoteAudioBuffer,
    audioBuffersRef,
    audioContextRef,
    
    // Remote audio state (for resume functionality)
    remoteTrackStates
  };

  // Initialize WebSocket hook with game context (after audio functions are available)
  const {
    webSocket,
    isConnected,
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
  } = useWebSocket(roomId, thisPlayer, gameContext);

  // Map management WebSocket hook (atomic approach)
  const mapContext = {
    setActiveMap,
    activeMap // All map data including grid_config handled atomically
    // No separate setGridConfig or setMapImageConfig - everything goes through setActiveMap
  };
  
  const {
    sendMapLoad,
    sendMapClear,
    sendMapConfigUpdate,
    sendMapRequest,
    handleMapLoad,
    handleMapClear,
    handleMapConfigUpdate
  } = useMapWebSocket(webSocket, isConnected, roomId, thisPlayer, mapContext);

  // Map handlers are managed by useMapWebSocket hook - no additional event listeners needed

  // WebSocket map requests are handled via user actions (load/clear/update)
  // Initial map loading is handled by HTTP fetch in onLoad function

  // Listen for combat state changes and play audio
  useEffect(() => {
    if (combatActive && isAudioUnlocked) {
      playLocalSFX('combatStart');
    }
  }, [combatActive, isAudioUnlocked]);

  // Fallback audio unlock on any click (for non-DM players)
  useEffect(() => {
    if (!isAudioUnlocked) {
      const handleFirstClick = () => {
        if (unlockAudio) {
          unlockAudio().then(() => {
            console.log('🔊 Audio unlocked on first user interaction');
          }).catch(err => {
            console.warn('Audio unlock failed on first click:', err);
          });
        }
      };

      // Add click listener to document
      document.addEventListener('click', handleFirstClick, { once: true });

      // Cleanup
      return () => {
        document.removeEventListener('click', handleFirstClick);
      };
    }
  }, [isAudioUnlocked, unlockAudio]);

  // Show dice portal for player rolls
  const showDicePortal = (playerName, promptType = null) => {
    setCurrentTurn(playerName);
    setDicePortalActive(true);
  };

  // Hide dice portal
  const hideDicePortal = () => {
    setDicePortalActive(false);
  };

  // UPDATED: DM prompts specific player to roll
  const promptPlayerRoll = (playerName, rollType) => {
    if (!playerName) {
      console.log("No player selected for roll prompt");
      return;
    }
    
    // Generate unique prompt ID
    const promptId = `${playerName}_${rollType}_${Date.now()}`;
    
    // Use the updated WebSocket method
    sendDicePrompt(playerName, rollType, promptId);
    
    // Update local state
    const newPrompt = {
      id: promptId,
      player: playerName,
      rollType: rollType,
      promptedBy: getCurrentPlayerName()
    };
    
    setActivePrompts(prev => {
      // Check if this player already has an active prompt for this roll type
      const existingIndex = prev.findIndex(p => p.player === playerName && p.rollType === rollType);
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
    
    // Note: Adventure log entry will be added via the WebSocket broadcast
    // to prevent duplication for the DM who initiated the prompt
  };

  // UPDATED: Clear dice prompt (can clear specific prompt or all prompts)
  const clearDicePrompt = (promptId = null, clearAll = false) => {
    sendDicePromptClear(promptId, clearAll, currentInitiativePromptId);
    
    if (clearAll) {
      setActivePrompts([]);
      setIsDicePromptActive(false);
      setCurrentInitiativePromptId(null); // Clear the tracked initiative prompt ID
    } else if (promptId) {
      setActivePrompts(prev => {
        const filtered = prev.filter(prompt => prompt.id !== promptId);
        setIsDicePromptActive(filtered.length > 0);
        return filtered;
      });
    }
  };

  // NEW: Prompt all players for initiative (collective approach)
  const promptAllPlayersInitiative = () => {
    const activePlayers = gameSeats.filter(seat => seat.playerName !== "empty");
    if (activePlayers.length === 0) {
      alert("No players in the game to prompt for initiative!");
      return;
    }
    
    const playerNames = activePlayers.map(player => player.playerName);
    sendInitiativePromptAll(playerNames);
  };

  // Handle dice roll
  const rollDice = () => {
    const result = Math.floor(Math.random() * 20) + 1;
    // Note: This function appears to be unused in current UI
    
    setTimeout(() => {
      hideDicePortal();
    }, 1000);
  };

  // Handle initiative order clicks
  const handleInitiativeClick = (clickedName) => {
    setInitiativeOrder(prev => 
      prev.map(item => ({
        ...item,
        active: item.name === clickedName
      }))
    );
    
    setCurrentTurn(clickedName);
    
    // Show dice portal for player turns (not NPCs)
    if (clickedName !== 'Bandit #1') {
      showDicePortal(clickedName);
    } else {
      hideDicePortal();
    }
  };

  // Handle audio track changes
  const handleTrackClick = (trackName, btnElement) => {
    const wasPlaying = trackName === currentTrack && isPlaying;
    
    if (!wasPlaying) {
      setCurrentTrack(trackName);
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  };


  // Handle clearing system messages
  const handleClearSystemMessages = async () => {
    try {
      await sendClearSystemMessages();
      
      // Remove system messages from local state immediately
      setRollLog(prev => prev.filter(entry => entry.type !== 'system'));
      
      // Adventure log will be handled by server broadcast
      
    } catch (error) {
      console.error('Error clearing system messages:', error);
      alert('Failed to clear system messages. Please try again.');
    }
  };

  // Handle clearing all adventure log messages
  const handleClearAllMessages = async () => {
    try {
      await sendClearAllMessages();
      
      // Clear all messages from local state immediately
      setRollLog([]);
      
      // Adventure log will be handled by server broadcast
      
    } catch (error) {
      console.error('Error clearing all messages:', error);
      alert('Failed to clear all messages. Please try again.');
    }
  };

  // Show loading or 404 states
  if (room404) {
    return <div>Room not found</div>;
  }

  if (!roomId) {
    return <div>Loading...</div>;
  }

  if (userLoading || !currentUser) {
    return <div>Loading user data...</div>;
  }

  // Helper functions to access current user data
  const getCurrentUserId = () => currentUser?.id;
  const getCurrentPlayerName = () => currentUser?.screen_name || currentUser?.email;

  // Helper to format dice notation properly
  const formatDiceNotation = (primaryDice, secondDice) => {
    if (!secondDice) {
      return primaryDice;
    }
    
    // If both dice are the same type, use multiplier notation (e.g., "2d20")
    if (primaryDice === secondDice) {
      return `2${primaryDice.toLowerCase()}`;
    }
    
    // If different dice types, use addition notation (e.g., "d20 + d6")
    return `${primaryDice.toLowerCase()} + ${secondDice.toLowerCase()}`;
  };

  // UPDATED: Handle dice rolls from PlayerCard components or DiceActionPanel
  const handlePlayerDiceRoll = (playerName, rollData) => {
    // Extract rollFor at the top level so it's available throughout the function
    const rollFor = rollData.rollFor;
    
    const { 
      dice, 
      primaryMultiplier = 1, 
      secondDice, 
      secondMultiplier = 1, 
      advantageMode, 
      bonus 
    } = rollData;
    const bonusValue = bonus ? parseInt(bonus.replace(/[^-\d]/g, '')) || 0 : 0;
    
    // Check if this involves D20s with advantage/disadvantage
    const primaryIsD20 = dice === 'D20';
    const useAdvantage = primaryIsD20 && advantageMode !== 'normal' && primaryMultiplier === 1;
    
    let totalResult = 0;
    let allRolls = [];
    let notation = [];
    
    if (useAdvantage) {
      // Advantage/Disadvantage: roll 2d20, apply modifier to each, take higher/lower
      const diceValue = 20;
      const roll1 = Math.floor(Math.random() * diceValue) + 1;
      const roll2 = Math.floor(Math.random() * diceValue) + 1;
      const result1 = roll1 + bonusValue;
      const result2 = roll2 + bonusValue;
      
      totalResult = advantageMode === 'advantage' 
        ? Math.max(result1, result2)
        : Math.min(result1, result2);
      
      allRolls.push(`[${roll1}, ${roll2}] = ${totalResult}`);
      notation.push(`${dice} (${advantageMode})`);
      
      // If there's a second die, roll it with multiplier and add to total
      if (secondDice) {
        const secondDiceValue = parseInt(secondDice.substring(1));
        let secondRolls = [];
        for (let i = 0; i < secondMultiplier; i++) {
          const roll = Math.floor(Math.random() * secondDiceValue) + 1;
          secondRolls.push(roll);
          totalResult += roll;
        }
        allRolls.push(...secondRolls);
        
        // Notation for second dice
        if (secondMultiplier > 1) {
          notation.push(`${secondMultiplier}${secondDice}`);
        } else {
          notation.push(secondDice);
        }
      }
    } else {
      // Normal rolls for both dice
      
      // Roll primary die with multiplier
      const primaryDiceValue = parseInt(dice.substring(1));
      let primaryRolls = [];
      for (let i = 0; i < primaryMultiplier; i++) {
        const roll = Math.floor(Math.random() * primaryDiceValue) + 1;
        primaryRolls.push(roll);
        totalResult += roll;
      }
      allRolls.push(...primaryRolls);
      
      // Notation for primary dice
      if (primaryMultiplier > 1) {
        notation.push(`${primaryMultiplier}${dice}`);
      } else {
        notation.push(dice);
      }
      
      // Roll second die with multiplier if present
      if (secondDice) {
        const secondDiceValue = parseInt(secondDice.substring(1));
        let secondRolls = [];
        for (let i = 0; i < secondMultiplier; i++) {
          const roll = Math.floor(Math.random() * secondDiceValue) + 1;
          secondRolls.push(roll);
          totalResult += roll;
        }
        allRolls.push(...secondRolls);
        
        // Notation for second dice
        if (secondMultiplier > 1) {
          notation.push(`${secondMultiplier}${secondDice}`);
        } else {
          notation.push(secondDice);
        }
      }
      
      // Add bonus once to total for normal rolls
      totalResult += bonusValue;
    }
    
    // Format message
    const bonusText = bonusValue !== 0 ? ` ${bonus}` : '';
    
    // Use proper dice notation formatting with multipliers
    let diceNotation;
    if (useAdvantage) {
      // For advantage/disadvantage, show as "d20 (advantage)" + any second dice with multipliers
      diceNotation = `${dice.toLowerCase()} (${advantageMode})`;
      if (secondDice) {
        if (secondMultiplier > 1) {
          diceNotation += ` + ${secondMultiplier}${secondDice.toLowerCase()}`;
        } else {
          diceNotation += ` + ${secondDice.toLowerCase()}`;
        }
      }
      diceNotation += bonusText;
    } else {
      // For normal rolls, build notation with multipliers
      let notationParts = [];
      
      // Primary dice notation
      if (primaryMultiplier > 1) {
        notationParts.push(`${primaryMultiplier}${dice.toLowerCase()}`);
      } else {
        notationParts.push(dice.toLowerCase());
      }
      
      // Secondary dice notation if present
      if (secondDice) {
        if (secondMultiplier > 1) {
          notationParts.push(`${secondMultiplier}${secondDice.toLowerCase()}`);
        } else {
          notationParts.push(secondDice.toLowerCase());
        }
      }
      
      diceNotation = notationParts.join(' + ') + bonusText;
    }
    // Format roll details - just show the final result
    const rollDetails = useAdvantage ? allRolls.join(', ') : `${totalResult}`;
    
    let formattedMessage;
    if (rollFor && rollFor !== "Standard Roll") {
      formattedMessage = ` [${rollFor}]: ${diceNotation}:  ${rollDetails}`;
    } else {
      formattedMessage = `: ${diceNotation}:  ${rollDetails}`;
    }
    
    // Clear prompts for this player if they match the roll type
    const playerPrompts = activePrompts.filter(prompt => 
      prompt.player === playerName && 
      (rollFor === prompt.rollType || rollFor === null) // Match specific roll type or clear if Standard Roll
    );
    
    // Get the prompt_id for adventure log cleanup (use first matching prompt)
    const promptIdForCleanup = playerPrompts.length > 0 ? playerPrompts[0].id : null;
    
    // Send raw dice data to backend for formatting
    if (sendDiceRoll) {
      const diceData = {
        diceNotation: diceNotation,
        results: allRolls,
        total: totalResult,
        modifier: bonusValue,
        advantage: useAdvantage ? advantageMode : null,
        context: rollFor && rollFor !== "Standard Roll" ? rollFor : "",
        promptId: promptIdForCleanup
      };
      sendDiceRoll(playerName, diceData);
    } else {
      console.error("sendDiceRoll function not available - WebSocket may not be connected");
    }
    
    playerPrompts.forEach(prompt => {
      clearDicePrompt(prompt.id, false);
    });
  };

  // NEW: Handle end turn (implement as needed)
  const handleEndTurn = () => {
    console.log(`${currentTurn} ended their turn`);
    // Add logic to move to next player in initiative order
    // This is where you'd implement turn progression
  };

  // Handle color changes from PlayerCard
  const handlePlayerColorChange = (playerName, seatIndex, newColor) => {
    if (!sendColorChange) {
      console.error('sendColorChange function not available');
      return;
    }
    
    console.log(`🎨 ${playerName} changing color (seat ${seatIndex}) to ${newColor}`);
    sendColorChange(playerName, seatIndex, newColor);
  };

  // MAIN RENDER
  return (
    <div className="game-interface" data-ui-scale={uiScale}>
      {/* Top Command Bar */}
      <div className="command-bar">
        <div className="campaign-info">
          <div className="campaign-title">The Curse of Strahd</div>
          <div className="location-breadcrumb">› Barovia Village › The Blood on the Vine Tavern</div>
        </div>

        <div className="dm-controls-bar">
          {/* Master Volume Control */}
          <div className="master-volume-control">
            <label htmlFor="master-volume" className="volume-label">
              {isAudioUnlocked ? '🔊' : '🔇'}
            </label>
            <input
              id="master-volume"
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={masterVolume}
              onChange={(e) => {
                // Unlock audio on first volume interaction
                if (!isAudioUnlocked && unlockAudio) {
                  unlockAudio().then(() => {
                    console.log('🔊 Audio unlocked when player adjusted volume');
                  }).catch(err => {
                    console.warn('Audio unlock failed on volume adjustment:', err);
                  });
                }
                setMasterVolume(parseFloat(e.target.value));
              }}
              className="volume-slider"
              title={`Master Volume: ${Math.round(masterVolume * 100)}%`}
            />
            <span className="volume-percentage">
              {Math.round(masterVolume * 100)}%
            </span>
            {!isAudioUnlocked && (
              <span className="text-yellow-400 text-xs ml-2">
                👆 Touch to enable audio
              </span>
            )}
          </div>

          {/* UI Scale Toggle */}
          <div className="ui-scale-nav">
            <button
              className={`scale-btn ${uiScale === 'small' ? 'active' : ''}`}
              onClick={() => setUIScale('small')}
              title="Small UI"
            >
              S
            </button>
            <button
              className={`scale-btn ${uiScale === 'medium' ? 'active' : ''}`}
              onClick={() => setUIScale('medium')}
              title="Medium UI"
            >
              M
            </button>
            <button
              className={`scale-btn ${uiScale === 'large' ? 'active' : ''}`}
              onClick={() => setUIScale('large')}
              title="Large UI"
            >
              L
            </button>
          </div>

          <button
            onClick={() => router.push('/dashboard?tab=games')}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg border border-slate-600 transition-all text-sm"
            title="Back to Dashboard"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Dashboard
          </button>
        </div>
      </div>

      {/* Main Game Area */}
      <div className="main-game-area">
        {/* GRID POSITION 1: Left Column - party-sidebar with adventure log */}
        <div className="party-sidebar">
          {/* DM Section */}
          <div 
            className="party-header"
            style={{
              color: '#fb7185', // Rose-400 for DM theme
              borderBottom: '1px solid rgba(251, 113, 133, 0.3)' // Rose-400/30 border
            }}
          >
            <span>Dungeon Master</span>
          </div>
          
          <DMChair 
            dmName={dmSeat}
            isEmpty={dmSeat === ""}
          />

          {/* Party Section */}
          <div 
            className="party-header"
            style={{
              borderBottom: '1px solid rgba(74, 222, 128, 0.3)' // Emerald-400/30 border to match party theme
            }}
          >
            <span>Party</span>
            <span className="seat-indicator">
              {gameSeats.filter(seat => seat.playerName !== "empty").length}/{gameSeats.length} Seats
            </span>
          </div>
          
          {gameSeats.map((seat) => {
            const isSitting = seat.playerName === getCurrentPlayerName();
            const currentColor = seatColors[seat.seatId] || getSeatColor(seat.seatId);
            
            return (
              <PlayerCard
                key={seat.seatId}
                seatId={seat.seatId}
                seats={gameSeats}
                thisPlayer={getCurrentPlayerName()}
                currentUser={currentUser}
                isSitting={isSitting}
                sendSeatChange={sendSeatChange}
                unlockAudio={unlockAudio}
                currentTurn={currentTurn}
                onDiceRoll={handlePlayerDiceRoll}
                playerData={seat.characterData}
                onColorChange={handlePlayerColorChange}
                currentColor={currentColor}
                isDM={isDM}
              />
            );
          })}

          {/* Lobby Panel - shows all connected users not in party */}
          <LobbyPanel
            lobbyUsers={lobbyUsers}
          />

          {/* Adventure Log component */}
          <AdventureLog 
            rollLog={rollLog}
            playerSeatMap={playerSeatMap}
          />
        </div>

        {/* GRID POSITION 2: Center Column - map-canvas with horizontal initiative */}
        <div className="grid-area-map-canvas relative">
          {/* Map Display Background - Now properly positioned in center area */}
          <MapDisplay 
            activeMap={activeMap}
            isEditMode={gridEditMode && isDM}
            onGridChange={handleGridChange}
            mapImageEditMode={gridEditMode && isDM}
            onMapImageChange={handleMapImageChange}
            liveGridOpacity={liveGridOpacity}
          />
          
          {/* Horizontal Initiative Tracker overlaid on map */}
          <HorizontalInitiativeTracker 
            initiativeOrder={initiativeOrder}
            handleInitiativeClick={handleInitiativeClick}
            currentTurn={currentTurn}
            combatActive={combatActive}
          />
        </div>

        {/* GRID POSITION 3: Right Panel - DM Controls (Full Height) */}
        <div className="right-panel p-4">
          {/* Moderator Controls - shown if player is host or moderator */}
          <ModeratorControls
            isModerator={isModerator}
            isHost={isHost}
            isDM={isDM}
            gameSeats={gameSeats}
            lobbyUsers={lobbyUsers}
            roomId={roomId}
            thisPlayer={getCurrentPlayerName()}
            currentUser={currentUser}
            onRoleChange={handleRoleChange}
            sendRoleChange={sendRoleChange}
            setSeatCount={setSeatCount}
            handleKickPlayer={handleKickPlayer}
            handleClearSystemMessages={handleClearSystemMessages}
            handleClearAllMessages={handleClearAllMessages}
            roleChangeTrigger={roleChangeTrigger}
          />
          
          <DMControlCenter
            isDM={isDM}
            promptPlayerRoll={promptPlayerRoll}
            promptAllPlayersInitiative={promptAllPlayersInitiative}  // NEW
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            handleTrackClick={handleTrackClick}
            combatActive={combatActive}
            setCombatActive={sendCombatStateChange}
            gameSeats={gameSeats}
            roomId={roomId}
            activePrompts={activePrompts}        // UPDATED: Pass array instead of single prompt
            unlockAudio={unlockAudio}             // NEW: Pass audio unlock function
            isAudioUnlocked={isAudioUnlocked}    // NEW: Pass audio unlock status
            remoteTrackStates={remoteTrackStates} // NEW: Pass remote track states
            remoteTrackAnalysers={remoteTrackAnalysers} // NEW: Pass remote track analysers
            playRemoteTrack={playRemoteTrack}     // NEW: Pass remote track controls (local)
            stopRemoteTrack={stopRemoteTrack}     // NEW: Pass remote track controls (local)
            sendRemoteAudioPlay={sendRemoteAudioPlay}     // NEW: Pass WebSocket sending functions
            sendRemoteAudioResume={sendRemoteAudioResume} // NEW: Pass WebSocket resume function
            sendRemoteAudioBatch={sendRemoteAudioBatch}   // NEW: Pass WebSocket batch function
            clearPendingOperation={setClearPendingOperationFn} // NEW: Pass function to set pending operation clearer
            clearDicePrompt={clearDicePrompt}    // UPDATED: Now accepts prompt ID
            // Map management props
            activeMap={activeMap}
            setActiveMap={setActiveMap}
            gridEditMode={gridEditMode}
            setGridEditMode={setGridEditMode}
            handleGridChange={handleGridChange}
            liveGridOpacity={liveGridOpacity}
            setLiveGridOpacity={setLiveGridOpacity}
            // WebSocket map functions
            sendMapLoad={sendMapLoad}
            sendMapClear={sendMapClear}
          />
        </div>

      </div>

      {/* UPDATED: DiceActionPanel with multiple prompts support */}
      <DiceActionPanel
        currentTurn={currentTurn}
        thisPlayer={getCurrentPlayerName()}
        currentUser={currentUser}
        combatActive={combatActive}
        onRollDice={handlePlayerDiceRoll}
        onEndTurn={handleEndTurn}
        uiScale={uiScale}
        activePrompts={activePrompts}            // UPDATED: Pass active prompts array
        isDicePromptActive={isDicePromptActive}
      />
    </div>
  );
}

export default function Game() {
  return (
    <Suspense fallback={
      <div className="game-loading" style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e3a8a 100%)',
        color: 'white',
        fontSize: '18px'
      }}>
        <div>🎲 Loading Tabletop Tavern...</div>
      </div>
    }>
      <GameContent />
    </Suspense>
  );
}