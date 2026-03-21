  /*
   * Copyright (C) 2025 Matthew Davey
   * SPDX-License-Identifier: GPL-3.0-or-later
   */

'use client'

import { React, useEffect, useState, useMemo, useCallback, useRef, Suspense } from 'react'
import { authFetch } from '@/app/shared/utils/authFetch'
import { useSearchParams, useRouter } from "next/navigation";
import { getSeatColor } from '../utils/seatColors';

import PlayerCard from "./components/PlayerCard";
import DMChair from "./components/DMChair";
import MapControlsPanel from './components/MapControlsPanel';
import ImageControlsPanel from './components/ImageControlsPanel';
import CombatControlsPanel from './components/CombatControlsPanel';
import ModeratorControls from './components/ModeratorControls';
import { AudioMixerPanel, BottomMixerDrawer } from '../audio_management/components';
import { PlaybackState } from '../audio_management/types';
import HorizontalInitiativeTracker from './components/HorizontalInitiativeTracker';
import AdventureLog from './components/AdventureLog';
import LobbyPanel from './components/LobbyPanel';
import DiceActionPanel from './components/DiceActionPanel'; // NEW IMPORT
import Modal from '@/app/shared/components/Modal';
import { useWebSocket } from './hooks/useWebSocket';
import { useUnifiedAudio } from '../audio_management';
import { MapDisplay, GridOverlay, useMapWebSocket, ImageDisplay, useImageWebSocket } from '../map_management';
import MapOverlayPanel from './components/MapOverlayPanel';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faVolumeHigh, faVolumeXmark } from '@fortawesome/free-solid-svg-icons';
import MapSafeArea from './components/MapSafeArea';
import GridTuningOverlay from '../map_management/components/GridTuningOverlay';

// Tab configuration for right drawer - static, role filtering applied at render time
const RIGHT_DRAWER_TABS = [
  { id: 'moderator', label: 'MOD', dmOnly: false },
  { id: 'audio', label: 'AUDIO', dmOnly: true },
  { id: 'map', label: 'MAP', dmOnly: true },
  { id: 'image', label: 'IMAGE', dmOnly: true },
  { id: 'combat', label: 'COMBAT', dmOnly: true },
];

// Helper function to get character data — module scope (pure, no component state deps)
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
  const [isDM, setIsDM] = useState(null); // null = unknown, false = not DM, true = DM
  const [isModerator, setIsModerator] = useState(false); // Moderator status
  const [isHost, setIsHost] = useState(false); // Host status
  const [dicePortalActive, setDicePortalActive] = useState(true);
  const [uiScale, setUIScale] = useState('medium'); // UI Scale state

  // Default to 'small' on mobile/tablet devices — must be in useEffect
  // since navigator is unavailable during SSR. iPadOS and Chrome on iPad
  // report as "Macintosh" in the UA string, so we also detect them via
  // maxTouchPoints (iPads report 5, real Macs report 0).
  useEffect(() => {
    const ua = navigator.userAgent;
    const isMobile = /iPhone|iPod|Android/i.test(ua)
      || (navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua));
    if (isMobile) setUIScale('small');
  }, []);
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
  const [isMapLocked, setIsMapLocked] = useState(false);
  const [tuningMode, setTuningMode] = useState(null); // null | 'offset'
  const [liveTuning, setLiveTuning] = useState({ offsetX: 0, offsetY: 0 });
  const [liveCellSize, setLiveCellSize] = useState(64); // Cell size in native image pixels
  const [liveGridCols, setLiveGridCols] = useState(10); // Direct column count
  const [liveGridRows, setLiveGridRows] = useState(10); // Direct row count
  const [mapNaturalDimensions, setMapNaturalDimensions] = useState(null); // { naturalWidth, naturalHeight }

  // Image system state
  const [activeImage, setActiveImage] = useState(null); // Current active image data
  const [activeDisplay, setActiveDisplay] = useState(null); // "map" | "image" | null

  // Session ended modal state
  const [sessionEndedData, setSessionEndedData] = useState(null); // { message, reason } when session ends

  // Campaign ID for direct api-site calls (asset library)
  const [campaignId, setCampaignId] = useState(null);

  // Campaign metadata for overlay (fetched from api-site when campaignId is set)
  const [campaignMeta, setCampaignMeta] = useState(null);

  // Ref for sendSeatChange — breaks circular dep: handleRoleChange → sendSeatChange → useWebSocket → gameContext → handleRoleChange
  const sendSeatChangeRef = useRef(null);

  // Spectator mode - user has no character selected for this campaign
  const [isSpectator, setIsSpectator] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);
  const [partyDrawerSettled, setPartyDrawerSettled] = useState(true); // starts open, so settled
  const [activeRightDrawer, setActiveRightDrawer] = useState(null); // null | 'dm' | 'moderator'
  const [rightDrawerSettled, setRightDrawerSettled] = useState(false); // starts closed
  const [isMixerOpen, setIsMixerOpen] = useState(false);
  const [mapImageConfig, setMapImageConfig] = useState(null); // Map image positioning/scaling

  // Stable callbacks for grid/map config changes — passed to DMControlCenter useEffect deps
  const handleGridChange = useCallback((newGridConfig) => {
    setGridConfig(newGridConfig);
  }, []);

  const handleMapImageChange = useCallback((newMapImageConfig) => {
    setMapImageConfig(newMapImageConfig);
  }, []);




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

    // Load active image and display state for this room
    await loadActiveImage(roomId);
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
  const refreshDynamicRoles = useCallback(async (roomId, user) => {
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
  }, []);

  // Lock page scroll while in game — the game shell is a fixed viewport, not a document
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = '';
      body.style.overflow = '';
    };
  }, []);

  // Fetch current user data once on page load
  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        setUserLoading(true);
        const response = await authFetch('/api/users/get_current_user', {
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

  // Check spectator status when campaign ID is available
  // DMs are never spectators even without a character
  useEffect(() => {
    // Don't decide spectator status until roles have been resolved
    if (isDM === null || !campaignId || !currentUser) return;

    // DM is never a spectator
    if (isDM) {
      setIsSpectator(false);
      console.log('✅ User is DM - not a spectator');
      return;
    }

    const checkSpectatorStatus = async () => {
      try {
        const response = await authFetch('/api/characters/', { credentials: 'include' });
        if (!response.ok) return;

        const characters = await response.json();
        const selectedChar = characters.find(char => char.active_campaign === campaignId);

        if (selectedChar) {
          setIsSpectator(false);
          console.log(`✅ Character found for campaign: ${selectedChar.character_name}`);
        } else {
          setIsSpectator(true);
          console.log('👁️ No character selected - entering as spectator');
        }
      } catch (error) {
        console.error('Error checking spectator status:', error);
      }
    };

    checkSpectatorStatus();
  }, [campaignId, currentUser, isDM]);

  // Fetch campaign metadata (title + hero_image) for the Enter Session overlay
  useEffect(() => {
    if (!campaignId) return;
    console.log(`🎨 Fetching campaign metadata for overlay: ${campaignId}`);
    authFetch(`/api/campaigns/${campaignId}`, { credentials: 'include' })
      .then(res => {
        if (!res.ok) {
          console.warn(`⚠️ Campaign metadata fetch failed: ${res.status}`);
          return null;
        }
        return res.json();
      })
      .then(data => {
        if (data) {
          console.log(`✅ Campaign metadata loaded: "${data.title}"`);
          setCampaignMeta({ title: data.title, heroImage: data.hero_image });
        }
      })
      .catch(err => console.warn('⚠️ Campaign metadata fetch error:', err));
  }, [campaignId]);

  // Cleanup audio when component unmounts (user navigates away from game page)
  useEffect(() => {
    return () => {
      console.log('🚪 Game page unmounting - cleaning up audio...');
      if (cleanupAllAudio) {
        cleanupAllAudio();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-exit grid edit mode when navigating away from Map tab
  useEffect(() => {
    if (activeRightDrawer !== 'map' && gridEditMode) {
      setGridEditMode(false);
    }
    if (activeRightDrawer !== 'map' && tuningMode) {
      setTuningMode(null);
    }
  }, [activeRightDrawer, gridEditMode, tuningMode]);

  // Sync live grid state from activeMap.grid_config whenever it changes
  useEffect(() => {
    const gc = activeMap?.grid_config;
    setLiveTuning({ offsetX: gc?.offset_x ?? 0, offsetY: gc?.offset_y ?? 0 });
    setLiveGridCols(gc?.grid_width  || 10);
    setLiveGridRows(gc?.grid_height || 10);
    if (gc?.grid_cell_size) setLiveCellSize(gc.grid_cell_size);
    // If no stored cell_size, mapNaturalDimensions effect computes the default
  }, [activeMap?.grid_config]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute default cell_size from image dimensions when no stored value is present
  useEffect(() => {
    if (!mapNaturalDimensions) return;
    const gc = activeMap?.grid_config;
    if (gc?.grid_cell_size) return; // already have a stored value
    const { naturalWidth, naturalHeight } = mapNaturalDimensions;
    const cols = gc?.grid_width  || 10;
    const rows = gc?.grid_height || 10;
    setLiveCellSize(Math.max(8, Math.round(Math.min(naturalWidth / cols, naturalHeight / rows))));
  }, [mapNaturalDimensions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Default colors used when no grid_config exists yet (fresh map)
  const DEFAULT_GRID_COLORS = {
    edit_mode:    { line_color: '#d1d5db', opacity: 0.2, line_width: 1 },
    display_mode: { line_color: '#d1d5db', opacity: 0.2, line_width: 1 },
  };

  // Computed effective grid config:
  // - Edit mode: merge live col/row/cellSize into the preview config (colors come from gridConfig)
  // - Display mode: use saved activeMap.grid_config directly, with live offset when tuning
  const effectiveGridConfig = useMemo(() => {
    if (gridEditMode) {
      if (!activeMap) return null;
      const colorBase = gridConfig || activeMap?.grid_config || {};
      return {
        ...colorBase,
        enabled: true,
        grid_width:  liveGridCols,
        grid_height: liveGridRows,
        grid_cell_size: liveCellSize,
        offset_x:    liveTuning.offsetX,
        offset_y:    liveTuning.offsetY,
        colors: colorBase.colors || DEFAULT_GRID_COLORS,
      };
    }
    const base = activeMap?.grid_config;
    if (!base) return null;
    if (tuningMode) return { ...base, offset_x: liveTuning.offsetX, offset_y: liveTuning.offsetY };
    return base;
  }, [gridEditMode, liveGridCols, liveGridRows, liveCellSize, gridConfig, activeMap, tuningMode, liveTuning]); // eslint-disable-line react-hooks/exhaustive-deps

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
        console.log("🗺️ Failed to fetch active map:", response.status, response.statusText);
      }
      
    } catch (error) {
      console.log("🗺️ Error loading active map:", error);
      // Don't set fallback map data - leave empty if error (atomic)
      setActiveMap(null);
    }
  };

  // Load active image and display state for the room
  const loadActiveImage = async (roomId) => {
    try {
      console.log("🖼️ Loading active image from database...");

      const response = await fetch(`/api/game/${roomId}/active-image`);

      if (response.ok) {
        const data = await response.json();

        if (data.active_image) {
          setActiveImage(data.active_image);
          console.log(`🖼️ Loaded active image: ${data.active_image.original_filename || data.active_image.filename}`);
        } else {
          setActiveImage(null);
          console.log("🖼️ No active image found for room");
        }

        if (data.active_display) {
          setActiveDisplay(data.active_display);
          console.log(`🖼️ Active display: ${data.active_display}`);
        }
      } else {
        console.log("🖼️ Failed to fetch active image:", response.status);
      }
    } catch (error) {
      console.log("🖼️ Error loading active image:", error);
      setActiveImage(null);
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

  const addToLog = useCallback((message, type, playerName = null, promptId = null) => {
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
  }, []);

  // Handle role changes from ModeratorControls and WebSocket events
  const handleRoleChange = useCallback(async (action, playerName) => {
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
        sendSeatChangeRef.current?.(newSeats);
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
  }, [gameSeats, roomId, currentUser, refreshDynamicRoles]);

  // Create a setter function for playerSeatMap updates
  const setPlayerSeatMap = useCallback((updaterFunction) => {
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
  }, [playerSeatMap]);

  // Initialize unified audio system (local + remote) FIRST
  const {
    isAudioUnlocked,
    masterVolume,
    setMasterVolume,
    broadcastMasterVolume,
    setBroadcastMasterVolume,
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
    setClearPendingOperationCallback,
    loadAssetIntoChannel,
    syncAudioState,
    activeFades,
    cancelFade,
    // Per-channel insert effects
    channelEffects,
    applyChannelEffects,
    setEffectMixLevel,
    // Master metering
    masterAnalysers,
    // SFX Soundboard
    sfxSlots,
    playSfxSlot,
    stopSfxSlot,
    setSfxSlotVolume,
    loadSfxSlot,
    clearSfxSlot,
    cleanupAllAudio,
    // Channel mute/solo
    mutedChannels,
    soloedChannels,
    setChannelMuted,
    setChannelSoloed,
  } = useUnifiedAudio();

  // Ref to hold the pending operation clearing function from AudioMixerPanel
  const clearPendingOperationFnRef = useRef(null);

  // Function to set the callback (called by AudioMixerPanel)
  const setClearPendingOperationFn = useCallback((fn) => {
    clearPendingOperationFnRef.current = fn;
    setClearPendingOperationCallback(fn);
  }, [setClearPendingOperationCallback]);

  // Create game context object for WebSocket handlers (after audio functions are defined)
  // Memoized to prevent useWebSocket's ref-update effect from re-running on every render.
  // State setters, refs, and module-scope functions are stable and omitted from deps.
  const gameContext = useMemo(() => ({
    // State setters (stable — React guarantees identity)
    setGameSeats,
    setCombatActive,
    setRollLog,
    setActivePrompts,
    setIsDicePromptActive,
    setPlayerSeatMap,
    setLobbyUsers,
    setDisconnectTimeouts,
    setCurrentInitiativePromptId,
    setCampaignId,
    setChannelMuted,
    setChannelSoloed,

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
    remoteTrackStates,

    // Fade state (for WebSocket batch cancel logic)
    activeFades,
    cancelFade,

    // Late-joiner audio sync
    syncAudioState,

    // Asset loading (for load batch operations from other clients)
    loadAssetIntoChannel,

    // Channel effects (for effects batch operations from other clients)
    applyChannelEffects,

    // Broadcast master volume (for master_volume batch operations from DM)
    setBroadcastMasterVolume,

    // SFX Soundboard (for batch operations from other clients)
    playSfxSlot,
    stopSfxSlot,
    setSfxSlotVolume,
    loadSfxSlot,
    clearSfxSlot,
    sfxSlots,

    // Session ended modal
    setSessionEndedData
  }), [
    gameSeats, thisPlayer, currentUser, lobbyUsers,
    disconnectTimeouts, currentInitiativePromptId, remoteTrackStates,
    addToLog, handleRoleChange, setPlayerSeatMap,
    playRemoteTrack, resumeRemoteTrack, pauseRemoteTrack, stopRemoteTrack,
    setRemoteTrackVolume, toggleRemoteTrackLooping, loadRemoteAudioBuffer,
    activeFades, cancelFade, syncAudioState, loadAssetIntoChannel, applyChannelEffects,
    playSfxSlot, stopSfxSlot, setSfxSlotVolume, loadSfxSlot, clearSfxSlot, sfxSlots,
    audioBuffersRef, audioContextRef,
    setChannelMuted, setChannelSoloed, setBroadcastMasterVolume
  ]);

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
    sendRemoteAudioBatch,
    registerHandler
  } = useWebSocket(roomId, thisPlayer, gameContext);

  // Sync ref so handleRoleChange can call sendSeatChange without circular dep
  sendSeatChangeRef.current = sendSeatChange;

  // Mixer drawer transport handlers — send via WebSocket batch
  const handleMixerPlay = useCallback((trackId) => {
    const trackState = remoteTrackStates[trackId];
    if (!trackState?.filename) return;
    if (trackState.playbackState === PlaybackState.PAUSED) {
      sendRemoteAudioBatch?.([{ trackId, operation: 'resume' }]);
    } else {
      sendRemoteAudioBatch?.([{
        trackId,
        operation: 'play',
        filename: trackState.filename,
        asset_id: trackState.asset_id,
        s3_url: trackState.s3_url,
        looping: trackState.looping,
        volume: trackState.volume,
        type: trackState.type,
        channelGroup: trackState.channelGroup,
        track: trackState.track,
      }]);
    }
  }, [remoteTrackStates, sendRemoteAudioBatch]);

  const handleMixerPause = useCallback((trackId) => {
    sendRemoteAudioBatch?.([{ trackId, operation: 'pause' }]);
  }, [sendRemoteAudioBatch]);

  const handleMixerStop = useCallback((trackId) => {
    sendRemoteAudioBatch?.([{ trackId, operation: 'stop' }]);
  }, [sendRemoteAudioBatch]);

  // Map management WebSocket hook (atomic approach)
  // Wrap setActiveMap to also update activeDisplay when a map is loaded
  const setActiveMapWithDisplay = useCallback((mapData) => {
    setActiveMap(mapData);
    if (mapData) {
      setActiveDisplay('map');
    }
  }, []);

  const mapContext = {
    setActiveMap: setActiveMapWithDisplay,
    activeMap // All map data including grid_config handled atomically
    // No separate setGridConfig or setMapImageConfig - everything goes through setActiveMap
  };
  
  const {
    sendMapLoad,
    sendMapClear,
    sendMapConfigUpdate,
    sendMapRequest,
  } = useMapWebSocket(webSocket, isConnected, roomId, thisPlayer, mapContext, registerHandler);

  // Image management WebSocket hook
  const imageContext = {
    setActiveImage,
    activeImage,
    setActiveDisplay
  };

  const {
    sendImageLoad,
    sendImageClear,
    sendImageRequest,
  } = useImageWebSocket(webSocket, isConnected, roomId, thisPlayer, imageContext, registerHandler);

  // Map/Image handlers are managed by their respective WebSocket hooks
  // Initial loading is handled by HTTP fetch in onLoad function

  // Listen for combat state changes and play audio
  useEffect(() => {
    if (combatActive && isAudioUnlocked) {
      playLocalSFX('combatStart');
    }
  }, [combatActive, isAudioUnlocked]);

  // Handle "Enter Session" overlay click — unlocks audio + auto-seats player
  const handleEnterSession = async () => {
    // 1. Unlock audio (drains pending play ops with corrected offsets)
    await unlockAudio();

    // 2. Auto-seat if eligible (not DM, not spectator, not already seated)
    if (isDM === false && !isSpectator) {
      const alreadySeated = gameSeats.some(s => s.playerName === thisPlayer);
      if (!alreadySeated) {
        const emptyIdx = gameSeats.findIndex(s => s.playerName === "empty");
        if (emptyIdx !== -1) {
          const newSeats = [...gameSeats];
          newSeats[emptyIdx] = {
            ...newSeats[emptyIdx],
            playerName: thisPlayer,
            characterData: getCharacterData(thisPlayer),
            isActive: false
          };
          sendSeatChange(newSeats);
        }
      }
    }
  };

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
      <div className="top-nav">
        <div className="campaign-info">
          <div className="campaign-title">The Curse of Strahd</div>
        </div>

        <div className="nav-actions">
          {/* Master Volume Control */}
          <div className="master-volume-control">
            <label htmlFor="master-volume" className="volume-label">
              <FontAwesomeIcon icon={isAudioUnlocked ? faVolumeHigh : faVolumeXmark} />
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
        </div>

        <button
          onClick={() => router.push('/dashboard')}
          className="nav-back-btn"
          title="Back to Dashboard"
        >
          Dashboard
        </button>
      </div>

      {/* Spectator Banner */}
      {isSpectator && (
        <div className="spectator-banner" style={{
          backgroundColor: '#1e293b',
          borderBottom: '2px solid #f59e0b',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '20px' }}>👁️</span>
            <div>
              <p style={{ color: '#f59e0b', fontWeight: '600', margin: 0 }}>Spectator Mode</p>
              <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0 }}>
                You're watching this session. Select a character in your campaign to participate.
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            style={{
              backgroundColor: '#f59e0b',
              color: '#1e293b',
              padding: '8px 16px',
              borderRadius: '6px',
              fontWeight: '600',
              fontSize: '14px',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Go to Campaigns
          </button>
        </div>
      )}

      {/* Party drawer — fixed-position, outside grid flow */}
      <div
        className={`party-drawer ${partyDrawerSettled ? 'drawer-settled' : ''}`}
        style={{ transform: isDrawerOpen ? 'translateX(0)' : 'translateX(-100%)' }}
        onTransitionEnd={(e) => {
          if (e.propertyName === 'transform') setPartyDrawerSettled(isDrawerOpen);
        }}
      >
        <button
          className={`drawer-toggle-tab ${isDrawerOpen ? 'active' : ''}`}
          onClick={() => { setPartyDrawerSettled(false); setIsDrawerOpen(!isDrawerOpen); }}
        >
          PARTY
        </button>

        <div className="drawer-content">
          {/* DM Section */}
          <div
            className="party-header"
            style={{
              color: '#fb7185',
              borderBottom: '1px solid rgba(251, 113, 133, 0.3)'
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
              borderBottom: '1px solid rgba(74, 222, 128, 0.3)'
            }}
          >
            <span>Party</span>
            <span className="seat-indicator">
              {gameSeats.filter(seat => seat.playerName !== "empty").length}/{gameSeats.length} Seats
            </span>
          </div>

          {gameSeats.filter(seat => isDM || seat.playerName !== "empty").map((seat) => {
            const isSitting = seat.playerName === getCurrentPlayerName();
            const currentColor = seatColors[seat.seatId] || getSeatColor(seat.seatId);

            return (
              <PlayerCard
                key={seat.seatId}
                seatId={seat.seatId}
                seats={gameSeats}
                thisPlayer={getCurrentPlayerName()}
                isSitting={isSitting}
                currentTurn={currentTurn}
                onDiceRoll={handlePlayerDiceRoll}
                playerData={seat.characterData}
                onColorChange={handlePlayerColorChange}
                currentColor={currentColor}
              />
            );
          })}

          {/* Lobby Panel */}
          <LobbyPanel
            lobbyUsers={lobbyUsers}
          />

          {/* Adventure Log */}
          <AdventureLog
            rollLog={rollLog}
            playerSeatMap={playerSeatMap}
          />
        </div>
      </div>

      {/* Right drawer — fixed-position, outside grid flow */}
      {(() => {
        const visibleTabs = RIGHT_DRAWER_TABS.filter(tab => !tab.dmOnly || isDM);

        return (
          <div
            className={`right-drawer ${rightDrawerSettled ? 'drawer-settled' : ''}`}
            style={{ transform: activeRightDrawer ? 'translateX(0)' : 'translateX(100%)' }}
            onTransitionEnd={(e) => {
              if (e.propertyName === 'transform') setRightDrawerSettled(!!activeRightDrawer);
            }}
          >
            {/* Scrollable tab strip — centers when tabs fit, scrolls when they overflow */}
            <div className="right-drawer-tab-strip">
              <div className="right-drawer-tab-strip-inner">
                {visibleTabs.map((tab) => (
                  <button
                    key={tab.id}
                    className={`right-drawer-tab ${activeRightDrawer === tab.id ? 'active' : ''}`}
                    onClick={() => { setRightDrawerSettled(false); setActiveRightDrawer(prev => prev === tab.id ? null : tab.id); }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="drawer-content">
              {activeRightDrawer === 'moderator' && (
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
              )}
              {activeRightDrawer === 'map' && isDM && (
                <MapControlsPanel
                  roomId={roomId}
                  campaignId={campaignId}
                  activeMap={activeMap}
                  setActiveMap={setActiveMap}
                  gridEditMode={gridEditMode}
                  setGridEditMode={setGridEditMode}
                  handleGridChange={handleGridChange}
                  liveGridOpacity={liveGridOpacity}
                  setLiveGridOpacity={setLiveGridOpacity}
                  sendMapLoad={sendMapLoad}
                  sendMapClear={sendMapClear}
                  liveTuning={liveTuning}
                  onTuningModeChange={setTuningMode}
                  onOffsetChange={(ox, oy) => setLiveTuning({ offsetX: ox, offsetY: oy })}
                  cellSize={liveCellSize}
                  onCellSizeChange={(delta) => setLiveCellSize(prev => Math.max(8, Math.min(500, prev + delta)))}
                  liveGridCols={liveGridCols}
                  liveGridRows={liveGridRows}
                />
              )}
              {activeRightDrawer === 'image' && isDM && (
                <ImageControlsPanel
                  roomId={roomId}
                  campaignId={campaignId}
                  activeImage={activeImage}
                  setActiveImage={setActiveImage}
                  sendImageLoad={sendImageLoad}
                  sendImageClear={sendImageClear}
                />
              )}
              {activeRightDrawer === 'combat' && isDM && (
                <CombatControlsPanel
                  promptPlayerRoll={promptPlayerRoll}
                  promptAllPlayersInitiative={promptAllPlayersInitiative}
                  combatActive={combatActive}
                  setCombatActive={sendCombatStateChange}
                  gameSeats={gameSeats}
                  activePrompts={activePrompts}
                  clearDicePrompt={clearDicePrompt}
                />
              )}
              {activeRightDrawer === 'audio' && isDM && (
                <AudioMixerPanel
                  isExpanded={true}
                  onToggle={() => {}}
                  remoteTrackStates={remoteTrackStates}
                  sendRemoteAudioBatch={sendRemoteAudioBatch}
                  unlockAudio={unlockAudio}
                  isAudioUnlocked={isAudioUnlocked}
                  clearPendingOperation={setClearPendingOperationFn}
                  loadAssetIntoChannel={loadAssetIntoChannel}
                  campaignId={campaignId}
                  sfxSlots={sfxSlots}
                  loadSfxSlot={loadSfxSlot}
                  clearSfxSlot={clearSfxSlot}
                  setSfxSlotVolume={setSfxSlotVolume}
                  activeFades={activeFades}
                />
              )}
            </div>
          </div>
        );
      })()}

      {/* Main Game Area — conditional display: map or image */}
      <div className="main-game-area">
        <div className="grid-area-map-canvas relative">
          {/* Map display — visible when activeDisplay is "map" or null (default) */}
          {activeDisplay !== 'image' && (
            <MapDisplay
              activeMap={activeMap}
              isEditMode={gridEditMode && isDM}
              onGridChange={handleGridChange}
              mapImageEditMode={gridEditMode && isDM}
              onMapImageChange={handleMapImageChange}
              liveGridOpacity={liveGridOpacity}
              gridConfig={effectiveGridConfig}
              isMapLocked={isMapLocked}
              offsetX={liveTuning.offsetX}
              offsetY={liveTuning.offsetY}
              onImageLoad={setMapNaturalDimensions}
            />
          )}

          {/* Safe area: shrinks insets to match open drawers — all overlays live here */}
          <MapSafeArea
            isDrawerOpen={isDrawerOpen}
            activeRightDrawer={activeRightDrawer}
            isMixerOpen={isMixerOpen}
          >
            <MapOverlayPanel
              isMapLocked={isMapLocked}
              onToggleLock={() => setIsMapLocked(prev => !prev)}
              activeMap={activeMap}
            />
            {tuningMode && (
              <GridTuningOverlay
                onOffsetXChange={(delta) => setLiveTuning(prev => ({ ...prev, offsetX: prev.offsetX + delta }))}
                onOffsetYChange={(delta) => setLiveTuning(prev => ({ ...prev, offsetY: prev.offsetY + delta }))}
                onCellSizeChange={(delta) => setLiveCellSize(prev => Math.max(8, Math.min(500, prev + delta)))}
                onColChange={(delta) => setLiveGridCols(prev => Math.max(2, prev + delta))}
                onRowChange={(delta) => setLiveGridRows(prev => Math.max(2, prev + delta))}
              />
            )}
          </MapSafeArea>

          {/* Image display — visible when activeDisplay is "image" */}
          {activeDisplay === 'image' && (
            <ImageDisplay
              activeImage={activeImage}
            />
          )}

          <HorizontalInitiativeTracker
            initiativeOrder={initiativeOrder}
            handleInitiativeClick={handleInitiativeClick}
            currentTurn={currentTurn}
            combatActive={combatActive}
          />
        </div>
      </div>

      {/* DiceActionPanel - only show if user is sitting in a seat OR is DM */}
      {(() => {
        const playerName = getCurrentPlayerName();
        const isPlayerSeated = gameSeats.some(seat => seat.playerName === playerName);
        const canUseDice = isPlayerSeated || isDM;
        return canUseDice && (
          <DiceActionPanel
            currentTurn={currentTurn}
            thisPlayer={playerName}
            currentUser={currentUser}
            combatActive={combatActive}
            onRollDice={handlePlayerDiceRoll}
            onEndTurn={handleEndTurn}
            uiScale={uiScale}
            activePrompts={activePrompts}
            isDicePromptActive={isDicePromptActive}
          />
        );
      })()}

      {/* Bottom Mixer Drawer — DM only */}
      {isDM && (
        <BottomMixerDrawer
          isOpen={isMixerOpen}
          onToggle={() => setIsMixerOpen(prev => !prev)}
          remoteTrackStates={remoteTrackStates}
          remoteTrackAnalysers={remoteTrackAnalysers}
          setRemoteTrackVolume={setRemoteTrackVolume}
          sendRemoteAudioBatch={sendRemoteAudioBatch}
          onPlay={handleMixerPlay}
          onPause={handleMixerPause}
          onStop={handleMixerStop}
          onLoopToggle={toggleRemoteTrackLooping}
          channelEffects={channelEffects}
          applyChannelEffects={applyChannelEffects}
          setEffectMixLevel={setEffectMixLevel}
          mutedChannels={mutedChannels}
          soloedChannels={soloedChannels}
          setChannelMuted={setChannelMuted}
          setChannelSoloed={setChannelSoloed}
          masterAnalysers={masterAnalysers}
          masterVolume={broadcastMasterVolume}
          onMasterVolumeChange={setBroadcastMasterVolume}
        />
      )}

      {/* Audio Gate Overlay — provides user gesture for AudioContext + auto-seats player */}
      {!isAudioUnlocked && (
        <div
          className="fixed inset-0 z-[102] flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-pointer"
          onClick={handleEnterSession}
        >
          <div
            className="relative rounded-sm overflow-hidden shadow-2xl shadow-black/50 select-none"
            style={{
              width: 'min(60vw, calc(70vh * 16 / 9))',
              backgroundImage: `url(${campaignMeta?.heroImage || '/campaign-tile-bg.png'})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              aspectRatio: '16 / 9',
            }}
          >
            {/* Gradient overlays for text readability at top and bottom */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/90 via-transparent to-black/90" />

            {/* Content */}
            <div className="absolute inset-0 flex flex-col items-center justify-between py-12 px-6 text-center">
              {campaignMeta?.title && (
                <h2 className="text-4xl text-white font-[family-name:var(--font-metamorphous)]">
                  {campaignMeta.title}
                </h2>
              )}
              <p className="text-sm text-gray-300/80 tracking-widest uppercase">
                Click to enter
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Session Ended Modal with Countdown */}
      {sessionEndedData && (
        <SessionEndedModal
          message={sessionEndedData.message}
          reason={sessionEndedData.reason}
        />
      )}
    </div>
  );
}

// Session Ended Modal Component with countdown progress bar
function SessionEndedModal({ message, reason }) {
  const [progress, setProgress] = useState(0);
  const redirectDelay = 5000; // 5 seconds

  useEffect(() => {
    const startTime = Date.now();

    // Update progress bar
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.min((elapsed / redirectDelay) * 100, 100);
      setProgress(newProgress);
    }, 50);

    // Redirect after delay
    const timeout = setTimeout(() => {
      window.location.href = '/dashboard';
    }, redirectDelay);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  return (
    <Modal
      open={true}
      onClose={() => {}}
      size="md"
      panelClassName="bg-slate-800 border border-slate-600 rounded-lg shadow-xl p-6"
    >
      <div className="text-center">
        <div className="text-4xl mb-4">🎲</div>
        <h2 className="text-xl font-bold text-white mb-2">Session Ended</h2>
        <p className="text-slate-300 mb-4">
          {message || `This game session has ended: ${reason}`}
        </p>
        <p className="text-slate-400 text-sm mb-4">
          You will be redirected shortly
        </p>

        {/* Progress bar */}
        <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
          <div
            className="bg-blue-500 h-full transition-all duration-50 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </Modal>
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