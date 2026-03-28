  /*
   * Copyright (C) 2025 Matthew Davey
   * SPDX-License-Identifier: GPL-3.0-or-later
   */

'use client'

import { useEffect, useState, useMemo, useCallback, useRef, Suspense } from 'react'
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
import { COLORS } from '../styles/colorTheme';
import HorizontalInitiativeTracker from './components/HorizontalInitiativeTracker';
import AdventureLog from './components/AdventureLog';
import LobbyPanel from './components/LobbyPanel';
import DiceActionPanel from './components/DiceActionPanel'; // NEW IMPORT
import Modal from '@/app/shared/components/Modal';
import { useWebSocket } from './hooks/useWebSocket';
import { useUnifiedAudio } from '../audio_management';
import { MapDisplay, useMapWebSocket, ImageDisplay, useImageWebSocket } from '../map_management';
import MapOverlayPanel from './components/MapOverlayPanel';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faVolumeHigh, faVolumeXmark, faRightToBracket, faEye, faMaximize, faMinimize } from '@fortawesome/free-solid-svg-icons';
import { useFullscreen } from './hooks/useFullscreen';
import MapSafeArea from './components/MapSafeArea';
import Drawer from './components/Drawer';
import GridTuningOverlay from '../map_management/components/GridTuningOverlay';

// Tab configuration for left drawer
const LEFT_DRAWER_TABS = [
  { id: 'party', label: 'PARTY' },
  { id: 'log', label: 'LOG' },
];

// Tab configuration for right drawer - role filtering applied at render time
const RIGHT_DRAWER_TABS = [
  { id: 'moderator', label: 'MOD', dmOnly: false },
  { id: 'audio', label: 'AUDIO', dmOnly: true },
  { id: 'map', label: 'MAP', dmOnly: true },
  { id: 'image', label: 'IMAGE', dmOnly: true },
  { id: 'combat', label: 'COMBAT', dmOnly: true },
];

export default function GameContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { isFullscreen, toggleFullscreen } = useFullscreen()

  const [room404, setRoom404] = useState(false)
  const [thisUserId, setThisUserId] = useState()
  const [roomId, setRoomId] = useState()

  // Current user state - fetched once on page load
  const [currentUser, setCurrentUser] = useState(null)
  const [userLoading, setUserLoading] = useState(true)

  // UNIFIED STRUCTURE - Replaces both seats and partyMembers
  const [gameSeats, setGameSeats] = useState([]);

  // Character metadata is hydrated from api-game hot state via ETL.
  // Keyed by user_id (UUID string).
  const [playerMetadata, setPlayerMetadata] = useState({});
  // Derived from playerMetadata — no separate state needed
  const moderatorIds = useMemo(() => {
    return Object.entries(playerMetadata)
      .filter(([_, meta]) => meta.campaign_role === 'mod')
      .map(([userId]) => userId);
  }, [playerMetadata]);

  // State for seat colors (loaded from backend)
  const [seatColors, setSeatColors] = useState({});

  // Lobby state for connected users not in party
  const [lobbyUsers, setLobbyUsers] = useState([]);
  
  // Track disconnect timeouts for lobby users
  const [disconnectTimeouts, setDisconnectTimeouts] = useState({});


  // DM state - object {user_id, player_name, campaign_role} or null
  const [dungeonMaster, setDungeonMaster] = useState(null);

  // Pre-computed user-to-seat mapping for O(1) lookups (keyed by userId)
  const playerSeatMap = useMemo(() => {
    const map = {};
    gameSeats.forEach((seat, index) => {
      if (seat.userId && seat.userId !== "empty") {
        map[seat.userId] = {
          seatIndex: index,
          seatColor: seatColors[index] || getSeatColor(index)
        };
      }
    });
    return map;
  }, [gameSeats, seatColors]);

  // userId → display name map (derived from player_metadata + DM contract)
  const displayNameMap = useMemo(() => {
    const map = {};
    Object.entries(playerMetadata).forEach(([userId, meta]) => {
      map[userId] = meta.player_name || userId;
    });
    // DM isn't in playerMetadata (no character), add from contract
    if (dungeonMaster?.user_id && dungeonMaster.player_name) {
      map[dungeonMaster.user_id] = dungeonMaster.player_name;
    }
    return map;
  }, [playerMetadata, dungeonMaster]);

  // userId → character name map (derived from player_metadata)
  const characterNameMap = useMemo(() => {
    const map = {};
    Object.entries(playerMetadata).forEach(([userId, meta]) => {
      if (meta.character_name) {
        map[userId] = meta.character_name;
      }
    });
    return map;
  }, [playerMetadata]);

  const getCharacterData = useCallback((userId) => {
    if (!userId || userId === "empty") {
      return null;
    }
    return playerMetadata[userId] || null;
  }, [playerMetadata]);

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
  
  // Derived: filter system messages out of adventure log, route them to lobby
  const filteredRollLog = useMemo(() => rollLog.filter(e => e.type !== 'system'), [rollLog]);
  const systemMessages = useMemo(() => rollLog.filter(e => e.type === 'system'), [rollLog]);

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
  const [gridInspect, setGridInspect] = useState(false);
  const [gridInspectMode, setGridInspectMode] = useState('hold'); // 'hold' | 'toggle'

  // Shift key → grid inspect (hold mode: down=on, up=off; toggle mode: down=flip)
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'Shift' || e.repeat) return;
      setGridInspect(prev => gridInspectMode === 'toggle' ? !prev : true);
    };
    const onKeyUp = (e) => {
      if (e.key !== 'Shift' || gridInspectMode === 'toggle') return;
      setGridInspect(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
  }, [gridInspectMode]);

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
  const [heroImageReady, setHeroImageReady] = useState(false);

  // Ref for sendSeatChange — breaks circular dep: handleRoleChange → sendSeatChange → useWebSocket → gameContext → handleRoleChange
  const sendSeatChangeRef = useRef(null);

  // Spectator mode - user has no character selected for this campaign
  const [isSpectator, setIsSpectator] = useState(false);
  const navRef = useRef(null);
  const [activeLeftDrawer, setActiveLeftDrawer] = useState('party'); // 'party' | 'log' | null
  const [activeRightDrawer, setActiveRightDrawer] = useState(null); // null | 'dm' | 'moderator'
  const [rightDrawerSettled, setRightDrawerSettled] = useState(false); // starts closed
  const [isMixerOpen, setIsMixerOpen] = useState(false);
  const [mapImageConfig, setMapImageConfig] = useState(null); // Map image positioning/scaling

  const canUseModeratorTools = isModerator || isHost;

  // Derive moderator status from campaign_role in player metadata
  useEffect(() => {
    if (!thisUserId) return;
    const role = playerMetadata[thisUserId]?.campaign_role;
    setIsModerator(role === 'mod');
  }, [playerMetadata, thisUserId]);

  const visibleRightTabs = useMemo(() => {
    return RIGHT_DRAWER_TABS.filter((tab) => {
      if (tab.id === 'moderator') {
        return canUseModeratorTools;
      }
      return !tab.dmOnly || isDM;
    });
  }, [canUseModeratorTools, isDM]);

  // Stable callbacks for grid/map config changes — passed to DMControlCenter useEffect deps
  const handleGridChange = useCallback((newGridConfig) => {
    setGridConfig(newGridConfig);
  }, []);

  const handleMapImageChange = useCallback((newMapImageConfig) => {
    setMapImageConfig(newMapImageConfig);
  }, []);

  // If permissions change (role/DM status), close any no-longer-visible right drawer tab.
  useEffect(() => {
    if (!activeRightDrawer) return;

    const activeTabStillVisible = visibleRightTabs.some((tab) => tab.id === activeRightDrawer);
    if (!activeTabStillVisible) {
      setActiveRightDrawer(null);
    }
  }, [activeRightDrawer, visibleRightTabs]);




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

  // UPDATED onLoad function to use unified structure — userId-keyed
  async function onLoad(roomId) {
    const req = await fetch(`api/game/${roomId}`)
    if (req.status === 404) {
      console.log("room id not found")
      setRoom404(true)
      return
    }

    const res = await req.json();

    // Set DM from room data (object: {user_id, player_name, campaign_role})
    setDungeonMaster(res["dungeon_master"] || null);

    // Use actual seat layout from database (contains user_ids)
    const seatLayout = res["current_seat_layout"] || [];
    const maxPlayers = res["max_players"];
    const backendSeatColors = res["seat_colors"] || {};
    // player_metadata is already keyed by user_id from api-game
    const backendPlayerMetadata = res["player_metadata"] || {};

    setPlayerMetadata(backendPlayerMetadata);

    // Set seat colors from backend
    setSeatColors(backendSeatColors);

    // Initialize CSS variables for seat colors
    Object.keys(backendSeatColors).forEach(seatIndex => {
      document.documentElement.style.setProperty(
        `--seat-color-${seatIndex}`,
        backendSeatColors[seatIndex]
      );
    });

    // Create unified seat structure — userId is identity, playerName is display
    const initialSeats = [];
    for (let i = 0; i < maxPlayers; i++) {
      const userId = seatLayout[i] || "empty";
      const meta = userId !== "empty" ? (backendPlayerMetadata[userId] || null) : null;
      initialSeats.push({
        seatId: i,
        userId: userId,
        playerName: meta?.player_name || (userId !== "empty" ? userId : "empty"),
        characterData: meta,
        isActive: false
      });
    }

    console.log("Loaded seat layout from database:", initialSeats);
    console.log("Loaded seat colors from database:", backendSeatColors);
    setGameSeats(initialSeats);

    // Active map is embedded in the game state response — apply immediately so the
    // browser can start fetching the S3 image without waiting for a second round trip.
    if (res["active_map"]) {
      const embeddedMap = res["active_map"];
      console.log(`🗺️ Loaded active map (embedded): ${embeddedMap.original_filename}`);
      setActiveMap(embeddedMap);
    } else {
      console.log("🗺️ No active map in game state");
      setActiveMap(null);
    }

    // Adventure logs and active image are independent of each other — fetch in parallel.
    await Promise.all([
      loadAdventureLogs(roomId),
      loadActiveImage(roomId),
    ]);
  }
  
  // Check player roles on initial page load - single source of truth
  const checkPlayerRoles = async (roomId, user) => {
    try {
      console.log(`🔍 Initial role check for user: ${user.screen_name || user.email} (ID: ${user.id}) in room: ${roomId}`);

      // Get MongoDB-based roles from active game session using user_id
      const mongoRolesResponse = await fetch(`/api/game/${roomId}/roles?userId=${user.id}`);
      let hostFlag = false;
      let isDMRole = false;

      if (mongoRolesResponse.ok) {
        const mongoRoles = await mongoRolesResponse.json();
        hostFlag = mongoRoles.is_host;
        isDMRole = mongoRoles.is_dm;
        console.log('📋 MongoDB roles:', mongoRoles);
      } else {
        console.error('❌ Failed to fetch MongoDB roles:', mongoRolesResponse.status);
      }

      // Set roles in component state
      setIsHost(hostFlag);
      setIsDM(isDMRole);
      console.log(`✅ Initial roles set - Host: ${hostFlag}, DM: ${isDMRole}`);

    } catch (error) {
      console.error('Error checking player roles:', error);
    }
  };

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

    // Set thisUserId to the authenticated user's UUID
    setThisUserId(currentUser.id);
    console.log('Using user ID:', currentUser.id);

    // fetches the room ID, and loads data
    onLoad(roomId)

    console.log('roomId ', roomId)
    console.log('thisUserId ', thisUserId)
    console.log('roomId && thisUserId ', roomId && thisUserId)

    // Initial role check on page load - single source of truth
    if (roomId && currentUser) {
      checkPlayerRoles(roomId, currentUser);
    }
  }, [currentUser, userLoading])

  // Derive spectator status from campaign_role in player metadata.
  // Explicit: spectator if campaign_role === 'spectator', regardless of character state.
  useEffect(() => {
    if (!thisUserId || isDM === null) return;

    const role = playerMetadata[thisUserId]?.campaign_role;
    if (!role) return; // metadata not loaded yet

    if (role === 'spectator') {
      setIsSpectator(true);
      console.log('👁️ campaign_role is spectator — entering as spectator');
    } else {
      setIsSpectator(false);
      console.log(`✅ campaign_role is ${role} — not a spectator`);
    }
  }, [playerMetadata, thisUserId, isDM]);

  // Measure total nav height (including spectator banner when present)
  // and publish as --nav-height on the game-interface container so all
  // fixed elements (drawers, MapSafeArea) stay below the nav automatically.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const applyHeight = () => {
      const gameInterface = nav.closest('.game-interface');
      if (gameInterface) {
        gameInterface.style.setProperty('--nav-height', `${nav.offsetHeight}px`);
      }
    };

    applyHeight();
    const observer = new ResizeObserver(applyHeight);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [isSpectator]);

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
          setCampaignMeta({ title: data.title, description: data.description, heroImage: data.hero_image });
          // Preload hero image so we can gate the overlay on it being ready
          if (data.hero_image) {
            const img = new Image();
            img.onload = () => setHeroImageReady(true);
            img.onerror = () => setHeroImageReady(true); // Show content anyway on error
            img.src = data.hero_image;
          } else {
            setHeroImageReady(true); // No hero image — show content immediately
          }
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
    setLiveCellSize(Math.max(8, Math.min(naturalWidth / cols, naturalHeight / rows)));
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
          if (gameSeats[i] && gameSeats[i].userId !== "empty") {
            displacedPlayers.push({
              userId: gameSeats[i].userId,
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
            userId: "empty",
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
          updated_by: thisUserId,
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
          user_id: log.from_player, // userId for seat color lookup + display name resolution
          prompt_id: log.prompt_id
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

  // Handle player kick — targets by userId
  const handleKickPlayer = async (userIdToKick, disconnected) => {
    try {
      // Find the seat with this user and empty it
      const updatedSeats = gameSeats.map(seat =>
        seat.userId === userIdToKick
          ? { ...seat, userId: "empty", playerName: "empty", characterData: null, isActive: false }
          : seat
      );

      // Send kick event via websocket using hook method
      sendPlayerKick(userIdToKick);

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

  const addToLog = useCallback((message, type, userId = null, promptId = null) => {
    const now = new Date();
    const timestamp = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const newEntry = {
      id: Date.now(),
      message,
      type,
      timestamp,
      user_id: userId
    };

    // Add prompt_id if provided
    if (promptId) {
      newEntry.prompt_id = promptId;
    }

    setRollLog(prev => [...prev, newEntry]);
  }, []);

  // Handle role changes from ModeratorControls and WebSocket events — uses userId
  const handleRoleChange = useCallback(async (action, targetUserId) => {
    console.log(`Role change: ${action} for ${targetUserId}`);

    // Update isDM flag — dungeonMaster object is set by WebSocket handler
    if (action === 'set_dm') {
      setIsDM(targetUserId === thisUserId);

      // Business logic: If new DM is sitting in a party seat, remove them from it
      const seatIndex = gameSeats.findIndex(seat => seat.userId === targetUserId);
      if (seatIndex !== -1) {
        console.log(`🎭 Removing ${targetUserId} from party seat ${seatIndex} as they become DM`);

        const newSeats = [...gameSeats];
        newSeats[seatIndex] = {
          ...newSeats[seatIndex],
          userId: "empty",
          playerName: "empty",
          characterData: null,
          isActive: false
        };

        setGameSeats(newSeats);
        sendSeatChangeRef.current?.(newSeats);
      }
    } else if (action === 'unset_dm') {
      setIsDM(false);
    }
  }, [gameSeats, thisUserId]);

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
    setPlayerMetadata,
    setDungeonMaster,
    setChannelMuted,
    setChannelSoloed,

    // Current state values
    gameSeats,
    thisUserId,
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
    gameSeats, thisUserId, currentUser, lobbyUsers,
    disconnectTimeouts, currentInitiativePromptId, remoteTrackStates,
    addToLog, getCharacterData, handleRoleChange, setPlayerSeatMap,
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
    sendRemoteAudioBatch,
    registerHandler
  } = useWebSocket(roomId, thisUserId, gameContext);

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
  } = useMapWebSocket(webSocket, isConnected, roomId, thisUserId, mapContext, registerHandler);

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
  } = useImageWebSocket(webSocket, isConnected, roomId, thisUserId, imageContext, registerHandler);

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

    if (!roomId || !thisUserId) {
      return;
    }

    // 2. Re-check live role state to avoid stale client role flags on refresh.
    let liveRoles = null;
    try {
      const roleResponse = await fetch(`/api/game/${roomId}/roles?userId=${encodeURIComponent(thisUserId)}`);
      if (roleResponse.ok) {
        liveRoles = await roleResponse.json();
      }
    } catch (error) {
      console.warn('Could not re-check roles before auto-seat:', error);
    }

    const isLiveStaff = Boolean(liveRoles?.is_dm || liveRoles?.is_moderator);
    if (isLiveStaff || isDM || isModerator) {
      return;
    }

    const characterData = getCharacterData(thisUserId);
    if (!characterData?.character_id) {
      setIsSpectator(true);
      return;
    }

    // 3. Auto-seat only valid adventurers who are not already seated.
    const alreadySeated = gameSeats.some(s => s.userId === thisUserId);
    if (alreadySeated) {
      return;
    }

    const emptyIdx = gameSeats.findIndex(s => s.userId === "empty");
    if (emptyIdx === -1) {
      return;
    }

    const newSeats = [...gameSeats];
    newSeats[emptyIdx] = {
      ...newSeats[emptyIdx],
      userId: thisUserId,
      playerName: displayNameMap[thisUserId] || getCurrentPlayerName(),
      characterData,
      isActive: false
    };
    await sendSeatChange(newSeats);
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

  // DM prompts specific player to roll — uses userId
  const promptPlayerRoll = (userId, rollType) => {
    if (!userId) {
      console.log("No player selected for roll prompt");
      return;
    }

    // Generate unique prompt ID
    const promptId = `${userId}_${rollType}_${Date.now()}`;

    // Use the updated WebSocket method
    sendDicePrompt(userId, rollType, promptId);

    // Update local state
    const newPrompt = {
      id: promptId,
      player: userId,
      rollType: rollType,
      promptedBy: thisUserId
    };

    setActivePrompts(prev => {
      const existingIndex = prev.findIndex(p => p.player === userId && p.rollType === rollType);
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

  // Prompt all seated players for initiative — sends userIds
  const promptAllPlayersInitiative = () => {
    const activePlayers = gameSeats.filter(seat => seat.userId !== "empty");
    if (activePlayers.length === 0) {
      alert("No players in the game to prompt for initiative!");
      return;
    }

    const userIds = activePlayers.map(player => player.userId);
    sendInitiativePromptAll(userIds);
  };

  // Handle dice roll
  const rollDice = () => {
    const result = Math.floor(Math.random() * 20) + 1;
    // Note: This function appears to be unused in current UI
    
    setTimeout(() => {
      hideDicePortal();
    }, 1000);
  };

  // Handle initiative order clicks — identity is userId for players
  const handleInitiativeClick = (userId) => {
    setInitiativeOrder(prev =>
      prev.map(item => ({
        ...item,
        active: item.userId === userId
      }))
    );

    setCurrentTurn(userId);

    // Show dice portal for player turns (not NPCs — NPCs have no userId)
    if (userId) {
      showDicePortal(userId);
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
  // Send WebSocket event — server clears MongoDB and broadcasts to all clients
  const handleClearSystemMessages = async () => {
    await sendClearSystemMessages();
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

  // Handle dice rolls from PlayerCard components or DiceActionPanel — userId is identity
  const handlePlayerDiceRoll = (userId, rollData) => {
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
    
    // Clear prompts for this user if they match the roll type
    const playerPrompts = activePrompts.filter(prompt =>
      prompt.player === userId &&
      (rollFor === prompt.rollType || rollFor === null)
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
      sendDiceRoll(userId, diceData);
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

  // Handle color changes from PlayerCard — uses userId
  const handlePlayerColorChange = (userId, seatIndex, newColor) => {
    if (!sendColorChange) {
      console.error('sendColorChange function not available');
      return;
    }

    console.log(`🎨 ${userId} changing color (seat ${seatIndex}) to ${newColor}`);
    sendColorChange(userId, seatIndex, newColor);
  };

  // MAIN RENDER
  return (
    <div className="game-interface" data-ui-scale={uiScale}>
      {/* Top Command Bar — flex column so spectator banner extends the nav height */}
      <div ref={navRef} className="top-nav">
        <div className="top-nav-bar">
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

            {/* Fullscreen Toggle */}
            <button
              onClick={toggleFullscreen}
              className="fullscreen-btn"
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              aria-pressed={isFullscreen}
            >
              <FontAwesomeIcon icon={isFullscreen ? faMinimize : faMaximize} />
            </button>
          </div>

          <button
            onClick={() => router.push('/dashboard')}
            className="nav-back-btn"
            title="Back to Dashboard"
          >
            Dashboard
            <FontAwesomeIcon icon={faRightToBracket} size="xl" style={{ marginLeft: '6px'}} />
          </button>
        </div>

        {/* Spectator Banner — in normal flow inside nav, grows nav height */}
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
              <span style={{ fontSize: '22px', color: '#f59e0b' }}>
                <FontAwesomeIcon icon={faEye} />
              </span>
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
      </div>

      {/* Left drawer — fixed-position, tabbed (PARTY / LOG) */}
      <Drawer
        side="left"
        tabs={LEFT_DRAWER_TABS}
        activeTab={activeLeftDrawer}
        onTabChange={setActiveLeftDrawer}
      >
        {activeLeftDrawer === 'party' && (
          <>
            <DMChair
              dungeonMaster={dungeonMaster}
              moderators={moderatorIds}
              displayNameMap={displayNameMap}
            />

            {gameSeats.filter(seat => !isSpectator || canUseModeratorTools || seat.userId !== "empty").map((seat) => {
              const isSitting = seat.userId === thisUserId;
              const currentColor = seatColors[seat.seatId] || getSeatColor(seat.seatId);

              return (
                <PlayerCard
                  key={seat.seatId}
                  seatId={seat.seatId}
                  seats={gameSeats}
                  thisUserId={thisUserId}
                  isSitting={isSitting}
                  currentTurn={currentTurn}
                  onDiceRoll={handlePlayerDiceRoll}
                  playerData={seat.characterData}
                  onColorChange={handlePlayerColorChange}
                  currentColor={currentColor}
                />
              );
            })}

            {/* Lobby / Connected Users */}
            <LobbyPanel
              lobbyUsers={lobbyUsers}
              systemMessages={systemMessages}
              displayNameMap={displayNameMap}
            />
          </>
        )}

        {activeLeftDrawer === 'log' && (
          <AdventureLog
            rollLog={filteredRollLog}
            playerSeatMap={playerSeatMap}
            displayNameMap={displayNameMap}
            characterNameMap={characterNameMap}
          />
        )}
      </Drawer>

      {/* Right drawer — fixed-position, outside grid flow */}
      {(() => {
        return (
          <div
            className={`right-drawer ${rightDrawerSettled ? 'drawer-settled' : ''}`}
            style={{ transform: activeRightDrawer ? 'translateX(0)' : 'translateX(100%)' }}
            onTransitionEnd={(e) => {
              if (e.target === e.currentTarget && e.propertyName === 'transform') {
                setRightDrawerSettled(!!activeRightDrawer);
              }
            }}
          >
            {/* Scrollable tab strip — centers when tabs fit, scrolls when they overflow */}
            <div className="right-drawer-tab-strip">
              <div className="right-drawer-tab-strip-inner">
                {visibleRightTabs.map((tab) => (
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
              {activeRightDrawer === 'moderator' && canUseModeratorTools && (
                <ModeratorControls
                  isModerator={isModerator}
                  isHost={isHost}
                  isDM={isDM}
                  gameSeats={gameSeats}
                  lobbyUsers={lobbyUsers}
                  roomId={roomId}
                  thisUserId={thisUserId}
                  currentUser={currentUser}
                  onRoleChange={handleRoleChange}
                  setSeatCount={setSeatCount}
                  handleKickPlayer={handleKickPlayer}
                  handleClearSystemMessages={handleClearSystemMessages}
                  displayNameMap={displayNameMap}
                  playerMetadata={playerMetadata}
                  dungeonMaster={dungeonMaster}
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
                  onCellSizeChange={(delta) => setLiveCellSize(prev => Math.max(8, Math.min(100, parseFloat((prev + delta).toFixed(1)))))}
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
                  characterNameMap={characterNameMap}
                  displayNameMap={displayNameMap}
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
              <div aria-hidden="true" style={{ flexShrink: 0, height: '40vh' }} />
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
              gridInspect={gridInspect}
              offsetX={liveTuning.offsetX}
              offsetY={liveTuning.offsetY}
              onImageLoad={setMapNaturalDimensions}
            />
          )}

          {/* Safe area: shrinks insets to match open drawers — all overlays live here */}
          <MapSafeArea
            isDrawerOpen={!!activeLeftDrawer}
            activeRightDrawer={activeRightDrawer}
            isMixerOpen={isMixerOpen}
          >
            <MapOverlayPanel
              isMapLocked={isMapLocked}
              onToggleLock={() => setIsMapLocked(prev => !prev)}
              activeMap={activeMap}
              gridInspect={gridInspect}
              gridInspectMode={gridInspectMode}
              onToggleInspectMode={() => setGridInspectMode(prev => prev === 'hold' ? 'toggle' : 'hold')}
            />
            {tuningMode && (
              <GridTuningOverlay
                onOffsetXChange={(delta) => setLiveTuning(prev => ({ ...prev, offsetX: prev.offsetX + delta }))}
                onOffsetYChange={(delta) => setLiveTuning(prev => ({ ...prev, offsetY: prev.offsetY + delta }))}
                onCellSizeChange={(delta) => setLiveCellSize(prev => Math.max(8, Math.min(100, parseFloat((prev + delta).toFixed(1)))))}
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
        const isPlayerSeated = gameSeats.some(seat => seat.userId === thisUserId);
        const canUseDice = isPlayerSeated || isDM;
        return canUseDice && (
          <DiceActionPanel
            currentTurn={currentTurn}
            thisUserId={thisUserId}
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
          className="fixed inset-0 z-[102] flex items-center justify-center bg-black cursor-pointer"
          onClick={handleEnterSession}
        >
          {heroImageReady && <div
            className="relative rounded-sm overflow-hidden shadow-2xl shadow-black/50 select-none border-2 gate-card"
            style={{
              borderColor: COLORS.smoke,
              width: 'min(90vw, calc(90vh * 16 / 9))',
              backgroundImage: campaignMeta?.heroImage ? `url(${campaignMeta.heroImage})` : 'none',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              aspectRatio: '16 / 9',
            }}
          >
            {/* Gradient overlay for text readability */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/90 via-black/40 to-black/90" />

            {/* Content */}
            <div className="absolute inset-0 flex flex-col px-8" style={{ paddingTop: 'clamp(1rem, 3vh, 3rem)', paddingBottom: 'clamp(1rem, 3vh, 3rem)' }}>
              {campaignMeta?.title && (
                <h2 className="text-4xl text-white font-[family-name:var(--font-metamorphous)] text-center leading-none">
                  {campaignMeta.title}
                </h2>
              )}

              {/* Middle row — spacer | description (75%) | spacer */}
              <div className="flex items-center gate-description flex-1">
                <div className="w-[12.5%]" />
                <div className="w-3/4">
                  {campaignMeta?.description && (
                    <p className="text-center overflow-hidden mx-auto" style={{ color: COLORS.smoke, whiteSpace: 'pre-line', fontSize: 'clamp(0.65rem, 3cqh, 1.5rem)' }}>
                      {campaignMeta.description}
                    </p>
                  )}
                </div>
                <div className="w-[12.5%]" />
              </div>

              {/* Click to enter — centered */}
              <p className="text-2xl tracking-widest capitalize text-center font-[family-name:var(--font-metamorphous)] leading-none mt-auto" style={{ color: COLORS.smoke }}>
                Click to enter
              </p>
            </div>

            {/* Connected players — absolutely positioned, grows upward */}
            {(() => {
              const seated = gameSeats.filter(s => s.userId !== 'empty').map(s => s.playerName);
              const inLobby = lobbyUsers.filter(u => u.status === 'connected').map(u => u.name);
              const allConnected = [...new Set([...seated, ...inLobby])];
              if (allConnected.length === 0) return null;
              return (
                <div className="absolute left-0 bottom-0 text-left px-8" style={{ paddingBottom: 'clamp(1rem, 3vh, 3rem)' }}>
                  <p className="text-sm uppercase tracking-widest mb-1" style={{ color: COLORS.smoke }}>Connected:</p>
                  {allConnected.map(name => (
                    <p key={name} className="text-base text-gray-300">{name}</p>
                  ))}
                </div>
              );
            })()}
          </div>}
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

