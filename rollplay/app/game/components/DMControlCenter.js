import React, { useState, useEffect, useMemo } from 'react';
import { 
  DM_TITLE, 
  DM_HEADER, 
  DM_SUB_HEADER, 
  DM_CHILD,
  DM_CHILD_LAST,
  PANEL_CHILD_LAST,
  DM_PROMPT_LIST,
  DM_ARROW,
  COMBAT_TOGGLE_ACTIVE,
  COMBAT_TOGGLE_INACTIVE,
  ACTIVE_BACKGROUND,
  PANEL_SUBTITLE
} from '../../styles/constants';
import DicePrompt from './DMDicePrompt';
import { AudioMixerPanel } from '../../audio_management/components';
import MapSelectionSection from './MapSelectionModal';

String.prototype.titleCase = function() {
  return this.replace(/\w\S*/g, (txt) =>
    txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );
};

// Component to read actual image file dimensions
const ImageDimensions = ({ activeMap }) => {
  const [dimensions, setDimensions] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeMap?.file_path) return;

    setLoading(true);
    const img = new Image();
    
    img.onload = () => {
      setDimensions({
        width: img.naturalWidth,
        height: img.naturalHeight
      });
      setLoading(false);
      console.log('📏 Actual image dimensions:', img.naturalWidth, 'x', img.naturalHeight);
    };
    
    img.onerror = () => {
      setDimensions(null);
      setLoading(false);
      console.warn('📏 Failed to load image for dimensions');
    };
    
    img.src = activeMap.file_path;
  }, [activeMap?.file_path]);

  if (loading) return <span>Reading image dimensions...</span>;
  if (!dimensions) return <span>Unable to read image dimensions</span>;

  // Determine orientation
  const isPortrait = dimensions.height > dimensions.width;
  const isSquare = dimensions.width === dimensions.height;
  const orientation = isSquare ? 'square' : (isPortrait ? 'portrait' : 'landscape');
  
  return (
    <span>
      Image: {dimensions.width}w × {dimensions.height}h px ({orientation})
    </span>
  );
};

export default function DMControlCenter({
  isDM,
  promptPlayerRoll,
  promptAllPlayersInitiative,  // NEW: Function to prompt all players for initiative
  currentTrack,
  isPlaying,
  handleTrackClick,
  combatActive = true,
  setCombatActive,
  gameSeats,
  setSeatCount,
  roomId,
  campaignId = null,   // Campaign ID for direct api-site calls
  handleKickPlayer,
  handleClearSystemMessages,
  handleClearAllMessages,   // NEW: Function to clear all messages
  activePrompts = [],        // UPDATED: Array of active prompts
  clearDicePrompt,           // UPDATED: Function to clear prompt(s)
  unlockAudio = null,        // NEW: Audio unlock function for DM
  isAudioUnlocked = false,   // NEW: Audio unlock status
  remoteTrackStates = {},    // NEW: Remote track states from unified audio
  remoteTrackAnalysers = {}, // NEW: Remote track analysers from unified audio
  playRemoteTrack = null,    // NEW: Play remote track function (local)
  stopRemoteTrack = null,    // NEW: Stop remote track function (local)
  sendRemoteAudioPlay = null,  // NEW: Send remote audio play via WebSocket
  sendRemoteAudioResume = null, // NEW: Send remote audio resume via WebSocket
  sendRemoteAudioBatch = null,     // NEW: Send remote audio batch operations via WebSocket
  clearPendingOperation = null,  // NEW: Function to set pending operation clearer
  // Map management props
  activeMap = null,          // NEW: Current active map data (contains grid_config atomically)
  setActiveMap = null,       // NEW: Function to set active map
  gridEditMode = false,      // NEW: Grid edit mode state
  setGridEditMode = null,    // NEW: Function to toggle grid edit mode
  handleGridChange = null,   // NEW: Function to handle grid config changes
  liveGridOpacity = 0.2,     // NEW: Live grid opacity for real-time updates
  setLiveGridOpacity = null, // NEW: Function to set live grid opacity
  // WebSocket map functions
  sendMapLoad = null,        // NEW: Send map load via WebSocket
  sendMapClear = null        // NEW: Send map clear via WebSocket
  // Note: Grid config updates now use HTTP API instead of WebSocket
}) {
  
  // State for main panel collapse
  const [isCollapsed, setIsCollapsed] = useState(true); // Default to collapsed to encourage DM to click and unlock audio

  // State for collapsible sections
  const [expandedSections, setExpandedSections] = useState({
    map: true,
    combat: true,
    audio: false
  });

  const [isClearingLogs, setIsClearingLogs] = useState(false);
  const [isClearingAllLogs, setIsClearingAllLogs] = useState(false);

  // NEW: State for dice roll prompts (minimal addition)
  const [selectedPlayerForPrompt, setSelectedPlayerForPrompt] = useState('');
  const [isPlayerSelectExpanded, setIsPlayerSelectExpanded] = useState(false);
  const [rollPromptModalOpen, setRollPromptModalOpen] = useState(false);
  const [selectedPlayerForModal, setSelectedPlayerForModal] = useState('');

  // Grid size slider (cells on shorter image edge - always produces square cells)
  const [gridSize, setGridSize] = useState(10);
  const [isDimensionsExpanded, setIsDimensionsExpanded] = useState(false);

  // Image dimensions for auto-calculating square grid
  const [imageDimensions, setImageDimensions] = useState(null);

  // Store original server opacity when entering edit mode
  const [originalServerOpacity, setOriginalServerOpacity] = useState(null);

  // State for map selection inline section
  const [isMapExpanded, setIsMapExpanded] = useState(false);

  // Load image dimensions when map changes
  useEffect(() => {
    if (!activeMap?.file_path) {
      setImageDimensions(null);
      return;
    }

    const img = new Image();
    img.onload = () => {
      setImageDimensions({
        width: img.naturalWidth,
        height: img.naturalHeight
      });
      console.log('📏 Loaded image dimensions:', img.naturalWidth, 'x', img.naturalHeight);
    };
    img.onerror = () => {
      setImageDimensions(null);
      console.warn('📏 Failed to load image for grid calculation');
    };
    img.src = activeMap.file_path;
  }, [activeMap?.file_path]);

  // Calculate grid dimensions to ensure square cells
  const calculatedGrid = useMemo(() => {
    if (!imageDimensions) return { width: gridSize, height: gridSize };

    const { width: imgW, height: imgH } = imageDimensions;
    const isLandscape = imgW >= imgH;

    if (isLandscape) {
      // Height is shorter edge
      const gridHeight = gridSize;
      const gridWidth = Math.round(gridSize * imgW / imgH);
      return { width: gridWidth, height: gridHeight };
    } else {
      // Width is shorter edge
      const gridWidth = gridSize;
      const gridHeight = Math.round(gridSize * imgH / imgW);
      return { width: gridWidth, height: gridHeight };
    }
  }, [imageDimensions, gridSize]);

  // Sync slider with loaded grid config
  useEffect(() => {
    const gridConfig = activeMap?.grid_config;

    if (gridConfig && imageDimensions) {
      // Calculate what gridSize would produce this config
      const { width: imgW, height: imgH } = imageDimensions;
      const isLandscape = imgW >= imgH;

      // Extract the shorter dimension as the gridSize
      const newSize = isLandscape ? gridConfig.grid_height : gridConfig.grid_width;
      setGridSize(newSize || 10);

      // Extract opacity from grid config (try both edit and display mode)
      const editOpacity = gridConfig.colors?.edit_mode?.opacity;
      const displayOpacity = gridConfig.colors?.display_mode?.opacity;
      const configOpacity = editOpacity || displayOpacity || 0.2;
      if (setLiveGridOpacity) {
        setLiveGridOpacity(configOpacity);
      }

      console.log('🎯 Synced slider with atomic map grid config:', {
        gridSize: newSize,
        opacity: configOpacity,
        filename: activeMap.filename
      });
    } else if (!activeMap || activeMap.grid_config === null) {
      // Reset to defaults when no map or no grid config
      setGridSize(10);
      if (setLiveGridOpacity) {
        setLiveGridOpacity(0.2);
      }
      console.log('🎯 Reset slider to defaults (no active map or grid config)');
    }
  }, [activeMap, imageDimensions]);

  // Live preview: update grid overlay when dimensions or opacity change during edit mode
  useEffect(() => {
    if (!isDimensionsExpanded || !handleGridChange) return;

    const previewConfig = {
      grid_width: calculatedGrid.width,
      grid_height: calculatedGrid.height,
      enabled: true,
      colors: {
        edit_mode: {
          line_color: "#d1d5db",
          opacity: liveGridOpacity,
          line_width: 1
        },
        display_mode: {
          line_color: "#d1d5db",
          opacity: liveGridOpacity,
          line_width: 1
        }
      }
    };

    handleGridChange(previewConfig);
    console.log('🎯 Live preview updated:', previewConfig);
  }, [calculatedGrid, liveGridOpacity, isDimensionsExpanded, handleGridChange]);

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const toggleCombat = () => {
    setCombatActive(!combatActive);
  };




  // NEW: Handle prompting specific player for specific roll type
  const handlePromptPlayerForRoll = (playerName, rollType) => {
    promptPlayerRoll(playerName, rollType);
    // Keep section expanded after prompting - only collapse when header is clicked
    // setIsPlayerSelectExpanded(false); // Removed - don't auto-collapse
    // setSelectedPlayerForPrompt('');   // Keep selection for better UX
  };

  // Get list of players currently in seats (excluding empty seats)
  const activePlayers = gameSeats?.filter(seat => seat.playerName !== "empty") || [];

  // NEW: Create grid configuration from dimensions (pure dimensional grid)
  const createGridFromDimensions = (gridWidth, gridHeight) => {
    return {
      grid_width: gridWidth,
      grid_height: gridHeight,
      enabled: true,
      colors: {
        edit_mode: {
          line_color: "#d1d5db", // light-grey-200
          opacity: liveGridOpacity,
          line_width: 1
        },
        display_mode: {
          line_color: "#d1d5db", // light-grey-200
          opacity: liveGridOpacity,
          line_width: 1
        }
      }
    };
  };

  // NEW: Handle map selection from modal
  const handleMapSelection = (mapData) => {
    console.log('🗺️ Map selected:', mapData);
    
    if (sendMapLoad) {
      sendMapLoad(mapData);
      console.log('🗺️ Selected map load sent via WebSocket:', mapData);
    } else {
      // Fallback to local state if WebSocket not available
      if (setActiveMap) {
        setActiveMap(mapData);
        console.log('🗺️ Selected map loaded locally (WebSocket unavailable):', mapData);
      }
    }
  };

  // NEW: Apply grid dimensions to current map via HTTP API (server authoritative)
  const applyGridDimensions = async () => {
    if (!activeMap) {
      console.error('🎯 Cannot apply grid - no active map');
      return;
    }
    
    console.log('🎯 Applying grid dimensions via HTTP API - activeMap:', activeMap);
    console.log('🎯 activeMap.filename:', activeMap.filename);
    
    const newGridConfig = createGridFromDimensions(
      calculatedGrid.width,
      calculatedGrid.height
    );

    console.log('🎯 Created new grid config (square cells):', newGridConfig);
    
    try {
      // Send COMPLETE updated map via HTTP API (atomic)
      // Remove MongoDB _id field to avoid immutable field error
      const { _id, ...mapWithoutId } = activeMap;
      const updatedMap = {
        ...mapWithoutId,
        grid_config: newGridConfig
      };
      
      const response = await fetch(`/api/game/${roomId}/map`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          map: updatedMap,
          updated_by: 'dm'
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('🎯 ✅ Grid config updated successfully via HTTP API:', result);
        // The backend will broadcast the update via WebSocket to all clients
      } else {
        const error = await response.text();
        console.error('🎯 ❌ Failed to update grid config via HTTP API:', error);
        alert('Failed to update grid configuration. Please try again.');
      }
    } catch (error) {
      console.error('🎯 ❌ Error updating grid config via HTTP API:', error);
      alert('Failed to update grid configuration. Please try again.');
    }
    
    console.log('🎯 Applied grid dimensions:', calculatedGrid, 'resulting config:', newGridConfig);
  };

  if (!isDM) {
    return null;
  }

  return (
    <div>
      {/* Collapsible Header */}
      <div 
        className={DM_TITLE}
        onClick={() => {
          // Unlock both audio systems on first DM interaction
          if (isCollapsed) {
            // Unlock basic HTML5 audio (for local sounds)
            if (unlockAudio) {
              unlockAudio().then(() => {
                console.log('🔊 HTML5 Audio unlocked when DM expanded Control Center');
              }).catch(err => {
                console.warn('HTML5 audio unlock failed:', err);
              });
            }
            
            // Note: Web Audio is now part of unified audio system and unlocked with unlockAudio above
          }
          setIsCollapsed(!isCollapsed);
        }}
      >
        🎲 DM Command Center
        <div className={`${DM_ARROW} ${isCollapsed ? 'rotate-180' : ''}`}>
          ▼
        </div>
      </div>

      {/* Collapsible Content */}
      {!isCollapsed && (
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col scrollbar-thin scrollbar-track-white/5 scrollbar-thumb-purple-500/30 hover:scrollbar-thumb-purple-500/50">
        <DicePrompt
          isOpen={rollPromptModalOpen}
          onClose={() => setRollPromptModalOpen(false)}
          selectedPlayer={selectedPlayerForModal}
          onPromptRoll={handlePromptPlayerForRoll}
        />
        
      {/* UPDATED: Active Dice Prompts Status (show list of active prompts) */}
      {activePrompts.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              🎯 Active Prompts ({activePrompts.length})
            </div>
            {activePrompts.length > 1 && (
              <button
                className={DM_CHILD +  " max-w-32 text-center"}
                onClick={() => clearDicePrompt(null, true)}
              >
                Clear All
              </button>
            )}
          </div>
          
          <div>
            {activePrompts.map((prompt) => (
              <div key={prompt.id} className={DM_CHILD}>
                <div className="flex items-center justify-between">
                  <div>
                    <div>
                      {prompt.player.titleCase()} • {prompt.rollType}
                    </div>
                  </div>
                  <button
                    onClick={() => clearDicePrompt(prompt.id, false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Map Controls Section */}
      <div className="flex-shrink-0">
        <div 
          className={DM_HEADER}
          onClick={() => toggleSection('map')}
        >
          🗺️ Map Controls
          <span className={`${DM_ARROW} ${expandedSections.map ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </div>
        {expandedSections.map && (
          <div>
            <button
              className={`${DM_CHILD} ${isMapExpanded ? ACTIVE_BACKGROUND : ''}`}
              onClick={() => setIsMapExpanded(!isMapExpanded)}
            >
              📁 {isMapExpanded ? 'Hide Maps' : 'Load Map'}
            </button>
            <MapSelectionSection
              isExpanded={isMapExpanded}
              onSelectMap={handleMapSelection}
              roomId={roomId}
              campaignId={campaignId}
              currentMap={activeMap}
            />
            {activeMap && (
              <button 
                className={`${DM_CHILD} ${ACTIVE_BACKGROUND}`}
                onClick={() => {
                  // Clear the current map via WebSocket
                  if (sendMapClear) {
                    sendMapClear();
                    console.log('🗺️ Map clear sent via WebSocket');
                  } else {
                    // Fallback to local state if WebSocket not available
                    if (setActiveMap) {
                      setActiveMap(null);
                      console.log('🗺️ Map cleared locally (WebSocket unavailable)');
                    }
                  }
                }}
              >
                🗑️ Clear Map
              </button>
            )}
            {/* Grid Dimensions Controls - now the main edit mode */}
            <button 
              className={`${DM_CHILD} ${isDimensionsExpanded ? ACTIVE_BACKGROUND : ''}`}
              onClick={() => {
                const newExpanded = !isDimensionsExpanded;
                setIsDimensionsExpanded(newExpanded);
                // Enable/disable grid edit mode when expanding/collapsing
                if (setGridEditMode) {
                  setGridEditMode(newExpanded);
                }
                // Store original server opacity when entering edit mode
                if (newExpanded && originalServerOpacity === null) {
                  setOriginalServerOpacity(liveGridOpacity);
                } else if (!newExpanded && originalServerOpacity !== null) {
                  // Exiting edit mode - revert to original server opacity
                  if (setLiveGridOpacity) {
                    setLiveGridOpacity(originalServerOpacity);
                  }
                  setOriginalServerOpacity(null);
                }
              }}
              disabled={!activeMap}
            >
              📐 {isDimensionsExpanded ? 'Exit Grid Edit' : 'Edit Grid'}
            </button>
            
            {/* Grid Size Slider (expandable) - always produces square cells */}
            {isDimensionsExpanded && activeMap && (
              <div className="ml-4 mb-6">
                {/* Grid Size Slider */}
                <div className="mb-3">
                  <label className="block text-xs text-gray-400 mb-1">
                    Grid Size: {calculatedGrid.width}×{calculatedGrid.height} cells (square)
                  </label>
                  <input
                    type="range"
                    min="4"
                    max="40"
                    step="1"
                    value={gridSize}
                    onChange={(e) => setGridSize(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Large (4)</span>
                    <span>Medium</span>
                    <span>Small (40)</span>
                  </div>
                </div>

                {/* Grid Opacity Slider */}
                <div className="mb-3">
                  <label className="block text-xs text-gray-400 mb-1">
                    Grid Opacity: {(liveGridOpacity * 100).toFixed(0)}%
                  </label>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.1"
                    value={liveGridOpacity}
                    onChange={(e) => {
                      const newOpacity = parseFloat(e.target.value);
                      if (setLiveGridOpacity) {
                        setLiveGridOpacity(newOpacity);
                      }
                      if (setGridEditMode) {
                        setGridEditMode(true);
                      }
                    }}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>10%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* Apply Button */}
                <button
                  className={DM_CHILD_LAST}
                  onClick={applyGridDimensions}
                >
                  ✨ Apply {calculatedGrid.width}×{calculatedGrid.height} Grid
                </button>

                {/* Image info */}
                {activeMap && (
                  <div className="text-xs text-gray-400 mt-2">
                    <ImageDimensions activeMap={activeMap} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Combat Management Section */}
      <div className="flex-shrink-0">
        <div 
          className={DM_HEADER}
          onClick={() => toggleSection('combat')}
        >
          ⚔️ Combat Management
          <span className={`${DM_ARROW} ${expandedSections.combat ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </div>
        {expandedSections.combat && (
          <div>
            
            {/* Initiate Combat Toggle */}
            <div 
              className={`${DM_CHILD} w-full flex items-center justify-between cursor-pointer`}
              onClick={toggleCombat}
            >
              ⚔️ Toggle Combat
              
              <div 
                className={`rounded-full border-2 transition-all duration-200 w-14 h-7 ${
                  combatActive 
                    ? COMBAT_TOGGLE_ACTIVE 
                    : COMBAT_TOGGLE_INACTIVE
                }`}
                
              >
                  {/* This is the dot in the toggle pill */}
                <div 
                  className={`inline-block rounded-full bg-white shadow-lg transform transition-transform duration-300 w-4 h-4 m-1 ${
                    combatActive ? 'translate-x-6' : 'translate-x-0'
                  }`}
                ></div>
              </div>
            </div>

            <button 
              className={`${DM_CHILD} w-full text-left`}
              onClick={() => {
                promptAllPlayersInitiative();
              }}
            >
              ⚡ Prompt All Players - Initiative
            </button>

            {/* UPDATED: Prompt Dice Throw - now shows player selection */}
            <div>
              <button 
                className={`${DM_CHILD}  ${
                  isPlayerSelectExpanded && selectedPlayerForPrompt === 'general' ? ACTIVE_BACKGROUND : DM_CHILD_LAST
                }`}
                onClick={() => {
                  setIsPlayerSelectExpanded(!isPlayerSelectExpanded);
                  setSelectedPlayerForPrompt('general');
                }}
              >
                🎲 Prompt Player Roll {isPlayerSelectExpanded && selectedPlayerForPrompt === 'general'}
              </button>

              {/* Player Selection (inline expansion like your original design) */}
              {isPlayerSelectExpanded && selectedPlayerForPrompt === 'general' && (
                <div className="ml-4 mb-6">
                  {activePlayers.length > 0 ? (
                    activePlayers.map((player) => (
                      <button
                        key={player.seatId}
                        className={DM_CHILD}
                        onClick={() => {
                          // Open the roll type selection modal
                          setSelectedPlayerForModal(player.playerName);
                          setRollPromptModalOpen(true);
                          // Keep the "Prompt Player Roll" section expanded
                          // Don't modify isPlayerSelectExpanded here
                        }}
                      >
                        {player.playerName.titleCase()}
                        {player.characterData && (
                          <span> • {player.characterData.class}</span>
                        )}
                      </button>
                    ))
                  ) : (
                    <div className={DM_CHILD_LAST}>
                      No players in game
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Audio Tracks Section */}
      <AudioMixerPanel
        isExpanded={expandedSections.audio}
        onToggle={() => toggleSection('audio')}
        remoteTrackStates={remoteTrackStates}
        remoteTrackAnalysers={remoteTrackAnalysers}
        sendRemoteAudioPlay={sendRemoteAudioPlay}
        sendRemoteAudioResume={sendRemoteAudioResume}
        sendRemoteAudioBatch={sendRemoteAudioBatch}
        unlockAudio={unlockAudio}
        isAudioUnlocked={isAudioUnlocked}
        clearPendingOperation={clearPendingOperation}
      />


        </div>
      )}
    </div>
  );
}