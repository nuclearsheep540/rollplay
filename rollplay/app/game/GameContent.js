  /*
   * Copyright (C) 2025 Matthew Davey
   * SPDX-License-Identifier: GPL-3.0-or-later
   */

'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import gsap from 'gsap'
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
import { MapDisplay, useMapWebSocket, ImageDisplay, useImageWebSocket, useGridConfig } from '../map_management';
import { useFogEngine, registerFogHandlers, createFogSendFunctions } from '../fog_management';
import MapOverlayPanel from './components/MapOverlayPanel';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faVolumeHigh, faVolumeXmark, faRightToBracket, faEye, faUpRightAndDownLeftFromCenter, faDownLeftAndUpRightToCenter, faCloudArrowDown, faRulerHorizontal, faUsers, faBookOpen } from '@fortawesome/free-solid-svg-icons';
import { faCloud } from '@fortawesome/free-regular-svg-icons';
import { useFullscreen } from './hooks/useFullscreen';
import MapSafeArea from './components/MapSafeArea';
import Drawer from './components/Drawer';
import GridTuningOverlay from '../map_management/components/GridTuningOverlay';
import { useAssetProgress, useAssetDownload } from '@/app/shared/providers/AssetDownloadManager';
import { useGatePreload } from './hooks/useGatePreload';

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

// Loading gate — rotating themed flavor text
const LOADING_PHRASES = [
  'INKING CHRONICLES', 'SUMMONING SPIRITS', 'UNFURLING MAPS',
  'TUNING THE SPHERES', 'FORGING BONDS', 'SETTING THE STAGE',
  'AWAKENING RELICS', 'CHARTING REALMS', 'WEAVING FATE',
];

// Loading gate — random app tips
const APP_TIPS = [
  'Press Shift to inspect grid cells and view coordinates.',
  'The DM can adjust reverb, filters, and effects per audio channel.',
  'You can release your character between sessions to use them elsewhere.',
  'Try fullscreen mode for the most immersive experience.',
  'The DM can present images in cinematic letterbox mode.',
  'Use the adventure log to track key moments in your session.',
  'The DM can set audio cues to transition multiple tracks at once.',
  'Characters can only be active in one campaign at a time.',
  'Moderators can assist the DM with map and image controls.',
  'The soundboard lets the DM trigger instant sound effects.',
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
      map[userId] = meta.player_name || "";
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
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [showScaleMenu, setShowScaleMenu] = useState(false);
  const [showAssetInfo, setShowAssetInfo] = useState(true);
  const volumeRef = useRef(null);
  const scaleRef = useRef(null);

  // Click-outside to close volume and scale popups
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showVolumeSlider && volumeRef.current && !volumeRef.current.contains(e.target)) {
        setShowVolumeSlider(false);
      }
      if (showScaleMenu && scaleRef.current && !scaleRef.current.contains(e.target)) {
        setShowScaleMenu(false);
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, [showVolumeSlider, showScaleMenu]);

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
  const [isMapLocked, setIsMapLocked] = useState(false);
  const [gridInspect, setGridInspect] = useState(false);
  const [gridInspectMode, setGridInspectMode] = useState('hold'); // 'hold' | 'toggle'

  // Fog of war — engine owns the canvas (off-React, no flicker on re-render).
  // Single instance lives at GameContent level so it outlives panel toggles
  // and is shared between the map display (renders fog) and the DM panel
  // (paints fog).
  const fog = useFogEngine();
  const [fogPaintMode, setFogPaintMode] = useState(false);

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
  const [mapNaturalDimensions, setMapNaturalDimensions] = useState(null); // { naturalWidth, naturalHeight }

  // Shared grid editing state (cellSize, cols, rows, opacity, color, offset)
  const grid = useGridConfig();

  // Image system state
  const [activeImage, setActiveImage] = useState(null); // Current active image data
  const [activeDisplay, setActiveDisplay] = useState(null); // "map" | "image" | null
  const s3Loading = useAssetProgress();

  // Session ended modal state
  const [sessionEndedData, setSessionEndedData] = useState(null); // { message, reason } when session ends

  // Campaign ID for direct api-site calls (asset library)
  const [campaignId, setCampaignId] = useState(null);

  // Campaign metadata for overlay (fetched from api-site when campaignId is set)
  const [campaignMeta, setCampaignMeta] = useState(null);

  // Hero image via AssetDownloadManager — cache hit if user came from dashboard
  const heroAsset = campaignMeta?.heroImageAsset;
  const { blobUrl: heroBlobUrl, ready: heroAssetReady } = useAssetDownload(
    heroAsset?.s3_url, heroAsset?.file_size, heroAsset?.asset_id
  );
  // For S3-backed assets, use the blob URL; for presets, use the direct path; always ready if no hero image
  const heroImageUrl = heroAsset?.asset_id
    ? (heroAssetReady ? heroBlobUrl : null)
    : (campaignMeta?.heroImage || null);
  // Gate preload readiness flags
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const [wsInitialStateReceived, setWsInitialStateReceived] = useState(false);
  const [rawAudioState, setRawAudioState] = useState(null);
  const [gateVisible, setGateVisible] = useState(true);
  const gateRef = useRef(null);

  // Ref for sendSeatChange — breaks circular dep: handleRoleChange → sendSeatChange → useWebSocket → gameContext → handleRoleChange
  const sendSeatChangeRef = useRef(null);

  // Spectator mode - user has no character selected for this campaign
  const [isSpectator, setIsSpectator] = useState(false);
  const navRef = useRef(null);
  const [activeLeftDrawer, setActiveLeftDrawer] = useState(null); // 'party' | 'log' | null
  const [activeRightDrawer, setActiveRightDrawer] = useState(null); // null | 'dm' | 'moderator'
  const [rightDrawerSettled, setRightDrawerSettled] = useState(false); // starts closed
  const [isMixerOpen, setIsMixerOpen] = useState(false);
  const [mapImageConfig, setMapImageConfig] = useState(null); // Map image positioning/scaling

  // Audio cue state — lifted here so it persists across drawer open/close
  const [currentCue, setCurrentCue] = useState(null);
  const [trackFadeStates, setTrackFadeStates] = useState({});
  const [fadeDuration, setFadeDuration] = useState(1000);

  const canUseModeratorTools = isModerator || isHost;

  // Cine mode hides all UI chrome for players — DMs and moderators keep controls visible.
  const isPlayer = !isDM && !isModerator && !isSpectator;
  const cineHideUI = activeDisplay === 'image'
    && activeImage?.image_config?.display_mode === 'cine'
    && isPlayer;

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
        playerName: meta?.player_name || "",
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

    setInitialDataLoaded(true);
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
          setCampaignMeta({
            title: data.title,
            description: data.description,
            heroImage: data.hero_image,
            heroImageAsset: data.hero_image_asset || null,
          });
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

  // Sync grid hook state from activeMap.map_config.grid_config whenever it changes
  useEffect(() => {
    grid.initFromConfig(activeMap?.map_config?.grid_config, mapNaturalDimensions);
  }, [activeMap?.map_config?.grid_config]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute default cell_size from image dimensions when no stored value is present
  useEffect(() => {
    if (!mapNaturalDimensions) return;
    const gc = activeMap?.map_config?.grid_config;
    if (gc?.grid_cell_size) return; // already have a stored value
    grid.initFromConfig(gc, mapNaturalDimensions);
  }, [mapNaturalDimensions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Computed effective grid config:
  // - Edit mode: use hook's live preview (includes color from gridConfig if pushed via handleGridChange)
  // - Display mode: use saved activeMap.map_config.grid_config directly, with live offset when tuning
  const effectiveGridConfig = useMemo(() => {
    if (gridEditMode) {
      if (!activeMap) return null;
      // If MapControlsPanel has pushed a preview config via handleGridChange, merge its colors
      const colorOverride = gridConfig?.colors;
      if (colorOverride) {
        return { ...grid.effectiveGridConfig, colors: colorOverride };
      }
      return grid.effectiveGridConfig;
    }
    const base = activeMap?.map_config?.grid_config;
    if (!base) return null;
    if (tuningMode) return { ...base, offset_x: grid.offset.x, offset_y: grid.offset.y };
    return base;
  }, [gridEditMode, grid.effectiveGridConfig, grid.offset, gridConfig, activeMap, tuningMode]); // eslint-disable-line react-hooks/exhaustive-deps

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
    audioSyncComplete,
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
    // Batch state updates (for atomic multi-track operations)
    startStateBatch,
    flushStateBatch,
  } = useUnifiedAudio();

  // Gate preload — aggregates readiness from REST, WebSocket, and asset downloads
  const gatePreload = useGatePreload({ campaignMeta, initialDataLoaded, wsInitialStateReceived, isAudioUnlocked, activeMap, activeImage, rawAudioState, audioSyncComplete });

  // Loading gate — rotating flavor text
  const [flavorIndex, setFlavorIndex] = useState(0);
  useEffect(() => {
    if (isAudioUnlocked) return;
    const id = setInterval(() => setFlavorIndex(i => (i + 1) % LOADING_PHRASES.length), 3000);
    return () => clearInterval(id);
  }, [isAudioUnlocked]);

  // Loading gate — random app tip (selected once)
  const selectedTip = useMemo(() => APP_TIPS[Math.floor(Math.random() * APP_TIPS.length)], []);

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
    setWsInitialStateReceived,
    setRawAudioState,
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

    // Batch state updates (for atomic multi-track operations)
    startStateBatch,
    flushStateBatch,

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
    setChannelMuted, setChannelSoloed, setBroadcastMasterVolume,
    startStateBatch, flushStateBatch
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

  // Fog of war — register WS handler and build send function alongside map.
  // Fog state never round-trips through React: incoming masks go straight
  // into the engine canvas (decode-then-swap, no flicker).
  useEffect(() => {
    if (!registerHandler || !fog.engine) return;
    return registerFogHandlers({ registerHandler, engine: fog.engine });
  }, [registerHandler, fog.engine]);

  const fogSenders = useMemo(
    () => createFogSendFunctions(webSocket, isConnected),
    [webSocket, isConnected]
  );

  // Hydrate the engine from the active map's first region when the map
  // loads or changes (cold→hot via ETL on session start, then live
  // updates). Step-1 reads regions[0] only; multi-region rendering
  // lands later via FogRegionStack.
  useEffect(() => {
    if (!fog.engine) return;
    const firstRegion = activeMap?.map_config?.fog_config?.regions?.[0] ?? null;
    fog.loadRegion(firstRegion);
  }, [activeMap?.map_config?.asset_id, activeMap?.map_config?.fog_config?.version, fog.engine]); // eslint-disable-line react-hooks/exhaustive-deps

  // Match fog canvas aspect ratio to the active map. Without this, a
  // square 1024×1024 default canvas gets CSS-stretched to fit the map's
  // actual aspect, deforming brush strokes into ellipses. Skip when an
  // existing region already pinned the canvas size on load.
  useEffect(() => {
    if (!fog.engine || !mapNaturalDimensions) return;
    const hasPaintedRegion = activeMap?.map_config?.fog_config?.regions?.some(
      (r) => r.mask
    );
    if (hasPaintedRegion) return;
    fog.fitToMap(mapNaturalDimensions.naturalWidth, mapNaturalDimensions.naturalHeight);
  }, [mapNaturalDimensions, activeMap?.map_config?.asset_id, fog]); // eslint-disable-line react-hooks/exhaustive-deps

  // DM "Update fog" handler — serialises the engine as a single region
  // and broadcasts the full v2 fog_config. Multi-region runtime updates
  // (toggle, per-region paint) come in step 5+.
  const handleFogUpdate = useCallback(() => {
    const filename = activeMap?.map_config?.filename;
    if (!filename || !fog.engine) return;
    const region = fog.serialize();
    const fogConfig = region
      ? { version: 2, regions: [region] }
      : null;
    fogSenders.sendFogUpdate(filename, fogConfig);
  }, [activeMap?.map_config?.filename, fog, fogSenders]);

  const handleFogClearBroadcast = useCallback(() => {
    const filename = activeMap?.map_config?.filename;
    if (!filename || !fog.engine) return;
    fog.clear();
    fogSenders.sendFogUpdate(filename, null);
  }, [activeMap?.map_config?.filename, fog, fogSenders]);

  // Image management WebSocket hook
  const imageContext = {
    setActiveImage,
    activeImage,
    setActiveDisplay
  };

  const {
    sendImageLoad,
    sendImageClear,
    sendImageConfigUpdate,
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
    // 1. Fade out the gate overlay (GSAP autoAlpha = GPU-accelerated opacity + visibility)
    if (gateRef.current) {
      gsap.to(gateRef.current, {
        autoAlpha: 0,
        duration: 0.3,
        ease: 'power2.inOut',
        onComplete: () => setGateVisible(false),
      });
    } else {
      setGateVisible(false);
    }

    // 2. Unlock audio (drains pending play ops with corrected offsets)
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

  // Show loading or 404 states — styled to match the gate overlay so there's no white flash
  const earlyReturnStyle = { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#0B0A09', color: '#6B7280' };

  if (room404) {
    return <div style={earlyReturnStyle}>Room not found</div>;
  }

  if (!roomId || userLoading || !currentUser) {
    return <div style={earlyReturnStyle} aria-busy="true" />;
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
            <div className="campaign-title">{campaignMeta?.title || 'Loading...'}</div>
          </div>

          <div className="nav-actions">
            {/* Asset status — bordered icon toggle + expandable info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'calc(6px * var(--ui-scale))' }}>
              <button
                onClick={() => { setShowAssetInfo(prev => !prev); setShowVolumeSlider(false); setShowScaleMenu(false); }}
                className="fullscreen-btn"
                title="Asset download status"
                aria-label="Asset download status"
                aria-expanded={showAssetInfo}
              >
                <FontAwesomeIcon
                  icon={s3Loading.loading || s3Loading.lingering ? faCloudArrowDown : faCloud}
                  style={{ color: s3Loading.loading || s3Loading.lingering ? '#6366f1' : COLORS.smoke }}
                />
              </button>
              {showAssetInfo && (
                <div style={{ width: 'calc(120px * var(--ui-scale))', display: 'flex', alignItems: 'center' }}>
                  {s3Loading.loading || s3Loading.lingering ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'calc(6px * var(--ui-scale))', width: '100%' }}>
                      <span style={{ color: '#d1d5db', fontSize: 'calc(12px * var(--ui-scale))', whiteSpace: 'nowrap' }}>
                        {s3Loading.completedCount}/{s3Loading.totalCount}
                      </span>
                      <div style={{
                        flex: 1,
                        height: 'calc(4px * var(--ui-scale))',
                        backgroundColor: '#374151',
                        borderRadius: '2px',
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%',
                          width: `${s3Loading.totalBytes > 0 ? (s3Loading.loadedBytes / s3Loading.totalBytes) * 100 : 0}%`,
                          backgroundColor: '#6366f1',
                          borderRadius: '2px',
                          transition: 'width 0.15s ease',
                        }} />
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                      <span style={{ color: '#d1d5db', fontSize: 'calc(11px * var(--ui-scale))', whiteSpace: 'nowrap' }}>
                        {s3Loading.cachedCount} assets
                      </span>
                      <span style={{ color: '#6b7280', fontSize: 'calc(11px * var(--ui-scale))', whiteSpace: 'nowrap' }}>
                        {s3Loading.cachedSize < 1024 * 1024
                          ? `${(s3Loading.cachedSize / 1024).toFixed(0)} KB`
                          : `${(s3Loading.cachedSize / (1024 * 1024)).toFixed(1)} MB`}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* Master Volume — bordered icon, vertical slider popup */}
            <div ref={volumeRef} style={{ position: 'relative' }}>
              <button
                onClick={() => {
                  if (!isAudioUnlocked && unlockAudio) {
                    unlockAudio().catch(() => {});
                  }
                  setShowVolumeSlider(prev => !prev);
                  setShowScaleMenu(false);
                }}
                className="fullscreen-btn"
                title={`Master Volume: ${Math.round(masterVolume * 100)}%`}
                aria-label={`Master Volume: ${Math.round(masterVolume * 100)}%`}
                aria-expanded={showVolumeSlider}
              >
                <FontAwesomeIcon icon={isAudioUnlocked ? faVolumeHigh : faVolumeXmark} />
              </button>
              {showVolumeSlider && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    marginTop: 'calc(6px * var(--ui-scale))',
                    background: 'rgba(0,0,0,0.9)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 'calc(3px * var(--ui-scale))',
                    padding: 'calc(12px * var(--ui-scale)) calc(8px * var(--ui-scale))',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 'calc(6px * var(--ui-scale))',
                    zIndex: 102,
                  }}>
                    <input
                      id="master-volume"
                      aria-label="Master volume"
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={masterVolume}
                      onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
                      className="volume-slider-vertical"
                      style={{
                        writingMode: 'vertical-lr',
                        direction: 'rtl',
                        height: 'calc(100px * var(--ui-scale))',
                        width: 'calc(4px * var(--ui-scale))',
                      }}
                    />
                    <span style={{
                      fontFamily: 'monospace',
                      fontSize: 'calc(11px * var(--ui-scale))',
                      color: 'rgba(255,255,255,0.7)',
                    }}>
                      {Math.round(masterVolume * 100)}%
                    </span>
                  </div>
              )}
            </div>

            {/* UI Scale — bordered icon, dropdown menu */}
            <div ref={scaleRef} style={{ position: 'relative' }}>
              <button
                onClick={() => { setShowScaleMenu(prev => !prev); setShowVolumeSlider(false); }}
                className="fullscreen-btn"
                title={`UI Scale: ${uiScale}`}
                aria-label={`UI Scale: ${uiScale}`}
                aria-expanded={showScaleMenu}
              >
                <FontAwesomeIcon icon={faRulerHorizontal} />
              </button>
              {showScaleMenu && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    marginTop: 'calc(6px * var(--ui-scale))',
                    background: 'rgba(0,0,0,0.9)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 'calc(3px * var(--ui-scale))',
                    padding: 'calc(4px * var(--ui-scale))',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'calc(2px * var(--ui-scale))',
                    zIndex: 102,
                    minWidth: 'calc(60px * var(--ui-scale))',
                  }}>
                    {['small', 'medium', 'large'].map(size => (
                      <button
                        key={size}
                        onClick={() => { setUIScale(size); setShowScaleMenu(false); }}
                        style={{
                          background: uiScale === size ? 'var(--content-on-dark)' : 'transparent',
                          color: uiScale === size ? '#1a1a2e' : '#e2e8f0',
                          border: 'none',
                          borderRadius: 'calc(2px * var(--ui-scale))',
                          padding: 'calc(4px * var(--ui-scale)) calc(8px * var(--ui-scale))',
                          fontSize: 'calc(12px * var(--ui-scale))',
                          cursor: 'pointer',
                          textAlign: 'center',
                          fontWeight: uiScale === size ? '600' : '400',
                        }}
                      >
                        {size.charAt(0).toUpperCase() + size.slice(1)}
                      </button>
                    ))}
                  </div>
              )}
            </div>

            {/* Fullscreen Toggle */}
            <button
              onClick={toggleFullscreen}
              className="fullscreen-btn"
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              aria-pressed={isFullscreen}
            >
              <FontAwesomeIcon icon={isFullscreen ? faDownLeftAndUpRightToCenter : faUpRightAndDownLeftFromCenter} />
            </button>

            <button
              onClick={() => router.push('/dashboard')}
              className="fullscreen-btn"
              title="Back to Dashboard"
            >
              Dashboard
              <FontAwesomeIcon icon={faRightToBracket} style={{ marginLeft: 'calc(6px * var(--ui-scale))' }} />
            </button>
          </div>
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

      {/* Left drawer — fixed-position, tabbed (PARTY / LOG) — hidden in cine mode for players */}
      {!cineHideUI && <Drawer
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
      </Drawer>}

      {/* Right drawer — fixed-position, outside grid flow — hidden in cine mode for players */}
      {!cineHideUI && (() => {
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
                  dungeonMaster={dungeonMaster}
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
                  grid={grid}
                  sendMapLoad={sendMapLoad}
                  sendMapClear={sendMapClear}
                  onTuningModeChange={setTuningMode}
                  fog={fog}
                  fogPaintMode={fogPaintMode}
                  setFogPaintMode={setFogPaintMode}
                  onFogUpdate={handleFogUpdate}
                  onFogClearBroadcast={handleFogClearBroadcast}
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
                  sendImageConfigUpdate={sendImageConfigUpdate}
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
                  currentCue={currentCue}
                  setCurrentCue={setCurrentCue}
                  trackFadeStates={trackFadeStates}
                  setTrackFadeStates={setTrackFadeStates}
                  fadeDuration={fadeDuration}
                  setFadeDuration={setFadeDuration}
                />
              )}
              <div aria-hidden="true" style={{ flexShrink: 0, height: '40vh' }} />
            </div>
          </div>
        );
      })()}

      {/* Main game area — conditional display: map or image */}
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
              liveGridOpacity={grid.gridOpacity}
              gridConfig={effectiveGridConfig}
              isMapLocked={isMapLocked || (isDM && fogPaintMode)}
              gridInspect={gridInspect}
              offsetX={grid.offset.x}
              offsetY={grid.offset.y}
              onImageLoad={setMapNaturalDimensions}
              fogEngine={fog.engine}
              fogPaintMode={isDM && fogPaintMode}
            />
          )}

          {/* Safe area: shrinks insets to match open drawers — all overlays live here */}
          <MapSafeArea
            isDrawerOpen={!!activeLeftDrawer}
            activeRightDrawer={activeRightDrawer}
            isMixerOpen={isMixerOpen}
          >
            {activeDisplay === 'map' && (
              <MapOverlayPanel
                isMapLocked={isMapLocked}
                onToggleLock={() => setIsMapLocked(prev => !prev)}
                activeMap={activeMap}
                gridInspect={gridInspect}
                gridInspectMode={gridInspectMode}
                onToggleInspectMode={() => setGridInspectMode(prev => prev === 'hold' ? 'toggle' : 'hold')}
              />
            )}
            {tuningMode && (
              <GridTuningOverlay
                onOffsetXChange={(delta) => grid.adjustOffset(delta, 0)}
                onOffsetYChange={(delta) => grid.adjustOffset(0, delta)}
                onCellSizeChange={(delta) => grid.adjustCellSize(delta)}
                onColChange={(delta) => grid.adjustGridCols(delta)}
                onRowChange={(delta) => grid.adjustGridRows(delta)}
              />
            )}
          </MapSafeArea>

          {/* Image display — visible when activeDisplay is "image" */}
          {activeDisplay === 'image' && (
            <ImageDisplay
              activeImage={activeImage}
            />
          )}

          {!cineHideUI && (
            <HorizontalInitiativeTracker
              initiativeOrder={initiativeOrder}
              handleInitiativeClick={handleInitiativeClick}
              currentTurn={currentTurn}
              combatActive={combatActive}
            />
          )}
        </div>
      </div>

      {/* DiceActionPanel - only show if user is sitting in a seat OR is DM */}
      {(() => {
        const isPlayerSeated = gameSeats.some(seat => seat.userId === thisUserId);
        const canUseDice = (isPlayerSeated || isDM) && !cineHideUI;
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
          trackStates={remoteTrackStates}
          trackAnalysers={remoteTrackAnalysers}
          setTrackVolume={setRemoteTrackVolume}
          onVolumeCommit={(trackId, volume) => sendRemoteAudioBatch?.([{
            trackId, operation: 'volume', volume,
          }])}
          onPlay={handleMixerPlay}
          onPause={handleMixerPause}
          onStop={handleMixerStop}
          onLoopCommit={(trackId, looping, loopMode) => {
            toggleRemoteTrackLooping?.(trackId, looping);
            sendRemoteAudioBatch?.([{
              trackId, operation: 'loop', looping, loop_mode: loopMode,
            }]);
          }}
          channelEffects={channelEffects}
          applyChannelEffects={applyChannelEffects}
          setEffectMixLevel={setEffectMixLevel}
          onEffectsChange={(trackId, effects) => sendRemoteAudioBatch?.([{
            trackId, operation: 'effects', effects,
          }])}
          mutedChannels={mutedChannels}
          soloedChannels={soloedChannels}
          setChannelMuted={setChannelMuted}
          setChannelSoloed={setChannelSoloed}
          masterAnalysers={masterAnalysers}
          masterVolume={broadcastMasterVolume}
          onMasterVolumeChange={setBroadcastMasterVolume}
          onMasterVolumeCommit={(volume) => sendRemoteAudioBatch?.([{
            trackId: 'master', operation: 'master_volume', volume,
          }])}
        />
      )}

      {/* Loading Gate Overlay — full-screen themed loading screen */}
      {gateVisible && (() => {
        const seated = gameSeats.filter(s => s.userId !== 'empty').map(s => ({ name: s.playerName, connected: true }));
        const inLobby = lobbyUsers.filter(u => u.status === 'connected').map(u => ({ name: u.name, connected: true }));
        const pendingLobby = lobbyUsers.filter(u => u.status !== 'connected').map(u => ({ name: u.name, connected: false }));
        const seenNames = new Set();
        const fellowship = [...seated, ...inLobby, ...pendingLobby].filter(p => {
          if (seenNames.has(p.name)) return false;
          seenNames.add(p.name);
          return true;
        });

        return (
          <div
            ref={gateRef}
            className={`fixed inset-0 z-[102] select-none ${gatePreload.ctaReady ? 'cursor-pointer' : 'cursor-default'}`}
            onClick={gatePreload.ctaReady ? handleEnterSession : undefined}
          >
            {/* Hero image background */}
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: heroImageUrl ? `url(${heroImageUrl})` : 'none',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundColor: COLORS.onyx,
              }}
            />
            {/* Gradient overlays for readability */}
            <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.7) 100%)' }} />
            <div className="absolute inset-0 bg-black/50" />

            {/* Content wrapper */}
            <div className="absolute inset-0 flex flex-col px-8 md:px-16" style={{ paddingTop: '8vh' }}>

              {/* Top section — title area */}
              <div className="flex-shrink-0 text-center">
                {/* Decorative rule */}
                <div className="flex items-center justify-center gap-4 mb-3">
                  <div className="h-px w-16 md:w-24" style={{ backgroundColor: COLORS.silver }} />
                  <span className="text-xs" style={{ color: COLORS.silver }}>&#9670;</span>
                  <div className="h-px w-16 md:w-24" style={{ backgroundColor: COLORS.silver }} />
                </div>
                <p className="text-xs tracking-[0.3em] uppercase mb-3" style={{ color: COLORS.silver }}>Now Entering</p>
                <div className="flex items-center justify-center gap-4 mb-6">
                  <div className="h-px w-12 md:w-16" style={{ backgroundColor: COLORS.silver }} />
                  <span className="text-xs" style={{ color: COLORS.silver }}>&#9670;</span>
                  <div className="h-px w-12 md:w-16" style={{ backgroundColor: COLORS.silver }} />
                </div>

                {/* Campaign title */}
                {campaignMeta?.title && (
                  <h1 className="text-5xl md:text-7xl font-[family-name:var(--font-metamorphous)] leading-none mb-6" style={{ color: COLORS.smoke }}>
                    {campaignMeta.title}
                  </h1>
                )}

                {/* Campaign description */}
                {campaignMeta?.description && (
                  <p className="text-lg italic max-w-2xl mx-auto leading-relaxed" style={{ color: COLORS.silver, whiteSpace: 'pre-line' }}>
                    &ldquo;{campaignMeta.description}&rdquo;
                  </p>
                )}
              </div>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Progress bar + CTA section */}
              <div className="flex-shrink-0 w-3/5 mx-auto mb-4">
                {/* Progress bar — starts in CTA position, slides up when complete */}
                <div
                  ref={el => {
                    if (el && gatePreload.ctaReady && el.dataset.slid !== 'true') {
                      el.dataset.slid = 'true';
                      gsap.to(el, { y: -48, duration: 0.35, ease: 'power2.inOut' });
                    }
                  }}
                  className="relative py-6 px-6"
                >
                  {/* Corner brackets */}
                  <div className="absolute top-0 left-0 w-4 h-4 border-t border-l" style={{ borderColor: COLORS.silver }} />
                  <div className="absolute top-0 right-0 w-4 h-4 border-t border-r" style={{ borderColor: COLORS.silver }} />
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l" style={{ borderColor: COLORS.silver }} />
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r" style={{ borderColor: COLORS.silver }} />

                  {/* Flavor text + percentage row */}
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs tracking-[0.2em] uppercase gate-flavor-pulse" style={{ color: COLORS.silver }}>
                      {gatePreload.ready ? 'READY' : `${LOADING_PHRASES[flavorIndex]}...`}
                    </p>
                    <p className="text-lg font-[family-name:var(--font-metamorphous)]" style={{ color: COLORS.smoke }}>
                      {gatePreload.percent}%
                    </p>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: COLORS.graphite }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${gatePreload.percent}%`,
                        backgroundColor: COLORS.smoke,
                        transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                      }}
                    />
                  </div>
                </div>

                {/* CTA — appears below bar after 500ms hold at 100% */}
                {gatePreload.ctaReady && (
                  <div className="text-center mt-4 gate-cta-enter">
                    <p className="text-3xl tracking-[0.3em] uppercase font-[family-name:var(--font-metamorphous)] animate-pulse" style={{ color: COLORS.smoke }}>
                      Click to Enter
                    </p>
                  </div>
                )}
              </div>

              {/* Spacer */}
              <div className="flex-1 min-h-[2vh]" />

              {/* Bottom row — fellowship + tips */}
              <div className="flex-shrink-0 flex justify-between items-end pb-10">
                {/* Fellowship panel */}
                <div
                  className="rounded-sm px-5 py-4 backdrop-blur-sm"
                  style={{
                    backgroundColor: 'rgba(0,0,0,0.6)',
                    border: `1px solid ${COLORS.graphite}66`,
                    minWidth: '240px',
                    maxWidth: '320px',
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <FontAwesomeIcon icon={faUsers} className="text-xs" style={{ color: COLORS.silver }} />
                    <p className="text-xs tracking-[0.2em] uppercase" style={{ color: COLORS.silver }}>Members Ready</p>
                  </div>
                  {fellowship.length > 0 ? fellowship.map(player => (
                    <div key={player.name} className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: player.connected ? '#d97706' : COLORS.graphite }} />
                        <span className="text-sm" style={{ color: COLORS.smoke }}>{player.name}</span>
                      </div>
                      {gatePreload.ctaReady ? (
                        <span className="text-xs px-2 py-0.5 rounded-sm" style={{ backgroundColor: COLORS.graphite, color: COLORS.smoke }}>Ready</span>
                      ) : !player.connected ? (
                        <span className="text-xs italic" style={{ color: COLORS.silver }}>Connecting...</span>
                      ) : null}
                    </div>
                  )) : (
                    <p className="text-xs italic" style={{ color: COLORS.silver }}>Awaiting adventurers...</p>
                  )}
                </div>

                {/* Tips panel */}
                <div className="text-right" style={{ maxWidth: '280px' }}>
                  <FontAwesomeIcon icon={faBookOpen} className="text-2xl mb-2" style={{ color: COLORS.graphite }} />
                  <p className="text-xs tracking-[0.2em] uppercase mb-2" style={{ color: COLORS.silver }}>Did You Know?</p>
                  <p className="text-sm italic leading-relaxed" style={{ color: COLORS.silver }}>{selectedTip}</p>
                </div>
              </div>
            </div>

            {/* Footer bar */}
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-8 py-2">
              <p className="text-xs" style={{ color: COLORS.graphite }}>Room: {roomId}</p>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-600" />
                <p className="text-xs" style={{ color: COLORS.graphite }}>v{process.env.NEXT_PUBLIC_RELEASE || 'dev'}</p>
              </div>
            </div>
          </div>
        );
      })()}

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

