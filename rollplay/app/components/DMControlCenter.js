import React, { useState } from 'react';
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
  ACTIVE_BACKGROUND
} from '../styles/constants';
import DicePrompt from './DMDicePrompt';

String.prototype.titleCase = function() {
  return this.replace(/\w\S*/g, (txt) =>
    txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
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
  handleKickPlayer,
  handleClearSystemMessages,
  handleClearAllMessages,   // NEW: Function to clear all messages
  activePrompts = [],        // UPDATED: Array of active prompts
  clearDicePrompt,           // UPDATED: Function to clear prompt(s)
  unlockAudio = null,        // NEW: Audio unlock function for DM
  remoteTrackStates = {},    // NEW: Remote track states from unified audio
  playRemoteTrack = null,    // NEW: Play remote track function
  stopRemoteTrack = null,    // NEW: Stop remote track function
  setRemoteTrackVolume = null // NEW: Set remote track volume function
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
              className={DM_CHILD}
            >
              📁 Upload Map
            </button>
            <button 
              className={DM_CHILD}
            >
              💾 Load Map
            </button>
            <button 
              className={DM_CHILD_LAST}
            >
              📏 Grid Settings
            </button>
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
      <div className="flex-shrink-0">
        <div 
          className={DM_HEADER}
          onClick={() => toggleSection('audio')}
        >
          🎵 Audio Tracks
          <span className={`${DM_ARROW} ${expandedSections.audio ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </div>
        {expandedSections.audio && (
          <div>
            {/* Music Track */}
            <div className={DM_SUB_HEADER}>🎵 Music</div>
            <div className={DM_CHILD}>
              <div>
                <div>Boss Battle</div>
                <div>{remoteTrackStates.music?.playing ? '▶️ Playing' : '⏹️ Stopped'}</div>
              </div>
              <div className="flex gap-2 items-center">
                <button 
                  className="bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded text-xs"
                  onClick={() => {
                    console.log('🎵 Play Music button clicked');
                    if (playRemoteTrack) {
                      playRemoteTrack('music', 'boss.mp3', true);
                    }
                  }}
                >
                  ▶️
                </button>
                <button 
                  className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs"
                  onClick={() => {
                    if (stopRemoteTrack) {
                      stopRemoteTrack('music');
                    }
                  }}
                >
                  ⏹️
                </button>
                <div className="flex items-center gap-1 ml-2">
                  <span className="text-xs text-gray-400">Vol:</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={remoteTrackStates.music?.volume || 0.7}
                    onChange={(e) => {
                      if (setRemoteTrackVolume) {
                        setRemoteTrackVolume('music', parseFloat(e.target.value));
                      }
                    }}
                    className="w-16 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer slider-thumb-blue"
                  />
                  <span className="text-xs text-gray-400 min-w-[24px]">
                    {Math.round((remoteTrackStates.music?.volume || 0.7) * 100)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Ambient Track */}
            <div className={DM_SUB_HEADER}>🌧️ Ambient</div>
            <div className={DM_CHILD}>
              <div>
                <div>Storm Sounds</div>
                <div>{remoteTrackStates.ambient?.playing ? '▶️ Playing' : '⏹️ Stopped'}</div>
              </div>
              <div className="flex gap-2 items-center">
                <button 
                  className="bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded text-xs"
                  onClick={() => {
                    console.log('🌧️ Play Ambient button clicked');
                    if (playRemoteTrack) {
                      playRemoteTrack('ambient', 'storm.mp3', true);
                    }
                  }}
                >
                  ▶️
                </button>
                <button 
                  className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs"
                  onClick={() => {
                    if (stopRemoteTrack) {
                      stopRemoteTrack('ambient');
                    }
                  }}
                >
                  ⏹️
                </button>
                <div className="flex items-center gap-1 ml-2">
                  <span className="text-xs text-gray-400">Vol:</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={remoteTrackStates.ambient?.volume || 0.6}
                    onChange={(e) => {
                      if (setRemoteTrackVolume) {
                        setRemoteTrackVolume('ambient', parseFloat(e.target.value));
                      }
                    }}
                    className="w-16 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer slider-thumb-blue"
                  />
                  <span className="text-xs text-gray-400 min-w-[24px]">
                    {Math.round((remoteTrackStates.ambient?.volume || 0.6) * 100)}%
                  </span>
                </div>
              </div>
            </div>

            {/* SFX Track */}
            <div className={DM_SUB_HEADER}>⚔️ Sound Effects</div>
            <div className={DM_CHILD_LAST}>
              <div>
                <div>Combat Start</div>
                <div>{remoteTrackStates.sfx?.playing ? '▶️ Playing' : '⏹️ Stopped'}</div>
              </div>
              <div className="flex gap-2 items-center">
                <button 
                  className="bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded text-xs"
                  onClick={() => {
                    console.log('⚔️ Play SFX button clicked');
                    if (playRemoteTrack) {
                      playRemoteTrack('sfx', 'sword.mp3', false);
                    }
                  }}
                >
                  ▶️
                </button>
                <button 
                  className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs"
                  onClick={() => {
                    if (stopRemoteTrack) {
                      stopRemoteTrack('sfx');
                    }
                  }}
                >
                  ⏹️
                </button>
                <div className="flex items-center gap-1 ml-2">
                  <span className="text-xs text-gray-400">Vol:</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={remoteTrackStates.sfx?.volume || 0.8}
                    onChange={(e) => {
                      if (setRemoteTrackVolume) {
                        setRemoteTrackVolume('sfx', parseFloat(e.target.value));
                      }
                    }}
                    className="w-16 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer slider-thumb-blue"
                  />
                  <span className="text-xs text-gray-400 min-w-[24px]">
                    {Math.round((remoteTrackStates.sfx?.volume || 0.8) * 100)}%
                  </span>
                </div>
              </div>
            </div>

            {!remoteTrackStates.music && (
              <div className="text-yellow-400 text-xs mt-2">
                💡 Expand this panel to unlock audio
              </div>
            )}
          </div>
        )}
      </div>


        </div>
      )}
    </div>
  );
}