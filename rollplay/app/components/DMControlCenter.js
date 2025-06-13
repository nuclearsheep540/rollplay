import React, { useState } from 'react';

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
  clearDicePrompt           // UPDATED: Function to clear prompt(s)
}) {
  
  // State for main panel collapse
  const [isCollapsed, setIsCollapsed] = useState(false);

  // State for collapsible sections
  const [expandedSections, setExpandedSections] = useState({
    map: true,
    combat: true,
    audio: false,
    party: false
  });

  // State for seat and kick management
  const [isSeatManagement, setIsSeatManagement] = useState(false);
  const [isKickModalOpen, setIsKickModalOpen] = useState(false);
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

  // Function to handle seat count changes (unchanged)
  const handleSeatCountChange = async (newSeatCount) => {
    try {
      if (newSeatCount < 1 || newSeatCount > 8) {
        console.log('Seat count must be between 1 and 8');
        return;
      }

      const currentSeatCount = gameSeats.length;
      
      if (newSeatCount < currentSeatCount) {
        const seatsToRemove = gameSeats.slice(newSeatCount);
        const playersToEject = seatsToRemove.filter(seat => seat.playerName !== "empty");
        
        if (playersToEject.length > 0) {
          const playerNames = playersToEject.map(seat => seat.playerName).join(', ');
          const confirmEject = window.confirm(
            `This will remove ${playersToEject.length} seat(s) and eject: ${playerNames}. Continue?`
          );
          
          if (!confirmEject) {
            return;
          }
        }
      }

      setSeatCount(newSeatCount);
      
    } catch (error) {
      console.error('Error updating seat count:', error);
    }
  };

  // Function to handle player kick selection (unchanged)
  const selectPlayerToKick = (playerName) => {
    if (!playerName || playerName === "empty") {
      return;
    }

    const confirmKick = window.confirm(
      `Are you sure you want to kick ${playerName} from the game?`
    );
    
    if (confirmKick && handleKickPlayer) {
      handleKickPlayer(playerName);
      setIsKickModalOpen(false);
    }
  };

  // Function to handle clearing system messages (unchanged)
  const handleClearSystemClick = async () => {
    const confirmClear = window.confirm(
      'Are you sure you want to clear all system messages from the adventure log? This action cannot be undone.'
    );
    
    if (confirmClear && handleClearSystemMessages) {
      setIsClearingLogs(true);
      try {
        await handleClearSystemMessages();
      } catch (error) {
        console.error('Error clearing system messages:', error);
      } finally {
        setIsClearingLogs(false);
      }
    }
  };

  const handleClearAllClick = async () => {
    const confirmClear = window.confirm(
      'Are you sure you want to clear ALL adventure log messages? This will delete everything and cannot be undone.'
    );
    
    if (confirmClear && handleClearAllMessages) {
      setIsClearingAllLogs(true);
      try {
        await handleClearAllMessages();
      } catch (error) {
        console.error('Error clearing all messages:', error);
      } finally {
        setIsClearingAllLogs(false);
      }
    }
  };

  // NEW: Handle prompting specific player for specific roll type
  const handlePromptPlayerForRoll = (playerName, rollType) => {
    promptPlayerRoll(playerName, rollType);
    setIsPlayerSelectExpanded(false); // Collapse after prompting
    setSelectedPlayerForPrompt('');   // Reset selection
  };

  // Get list of players currently in seats (excluding empty seats)
  const activePlayers = gameSeats?.filter(seat => seat.playerName !== "empty") || [];

  if (!isDM) {
    return null;
  }

  return (
    <div className="bg-gradient-to-b from-red-900/15 to-slate-800/20 border-t border-white/10 flex-1 min-h-0 flex flex-col">
      {/* Collapsible Header */}
      <div 
        className="flex items-center justify-between cursor-pointer p-4 hover:bg-red-500/10 transition-all duration-200"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="text-red-500 font-bold text-base uppercase tracking-wider flex items-center gap-2">
          🎲 DM Command Center
        </div>
        <div className={`text-red-500 transition-transform duration-200 ${isCollapsed ? 'rotate-180' : ''}`}>
          ▼
        </div>
      </div>

      {/* Collapsible Content */}
      {!isCollapsed && (
        <div className="p-4 pt-0 flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col scrollbar-thin scrollbar-track-white/5 scrollbar-thumb-purple-500/30 hover:scrollbar-thumb-purple-500/50">
        {/* Roll Prompt Modal */}
      {rollPromptModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-amber-500/30 rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-amber-300 font-bold text-lg">
                🎲 Prompt {selectedPlayerForModal} to Roll
              </h3>
              <button 
                className="text-gray-400 hover:text-white transition-colors text-xl"
                onClick={() => setRollPromptModalOpen(false)}
              >
                ✕
              </button>
            </div>

            {/* Attack Rolls Section */}
            <div className="mb-6">
              <h4 className="text-emerald-400 font-semibold mb-3 text-base">
                Attack Rolls
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <button
                  className="text-left p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-lg transition-all duration-200 hover:bg-emerald-500/20 text-sm"
                  onClick={() => {
                    handlePromptPlayerForRoll(selectedPlayerForModal, "Attack Roll");
                    setRollPromptModalOpen(false);
                  }}
                >
                  <div className="font-medium">Attack Roll</div>
                  <div className="text-emerald-400/70 text-sm">Roll to hit target (d20 + modifiers)</div>
                </button>
                <button
                  className="text-left p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-lg transition-all duration-200 hover:bg-emerald-500/20 text-sm"
                  onClick={() => {
                    handlePromptPlayerForRoll(selectedPlayerForModal, "Damage Roll");
                    setRollPromptModalOpen(false);
                  }}
                >
                  <div className="font-medium">Damage Roll</div>
                  <div className="text-emerald-400/70 text-sm">Roll for damage if attack hits</div>
                </button>
              </div>
            </div>

            {/* Ability Checks Section */}
            <div className="mb-6">
              <h4 className="text-blue-400 font-semibold mb-3 text-base">
                Ability Checks
              </h4>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { name: "Strength Check", desc: "Lifting, pushing, breaking" },
                  { name: "Dexterity Check", desc: "Acrobatics, stealth" },
                  { name: "Constitution Check", desc: "Endurance, holding breath" },
                  { name: "Intelligence Check", desc: "Recall lore, solve puzzles" },
                  { name: "Wisdom Check", desc: "Perception, insight" },
                  { name: "Charisma Check", desc: "Persuasion, deception" }
                ].map((check, index) => (
                  <button
                    key={index}
                    className="text-left p-3 bg-blue-500/10 border border-blue-500/30 text-blue-300 rounded-lg transition-all duration-200 hover:bg-blue-500/20 text-sm"
                    onClick={() => {
                      handlePromptPlayerForRoll(selectedPlayerForModal, check.name);
                      setRollPromptModalOpen(false);
                    }}
                  >
                    <div className="font-medium">{check.name}</div>
                    <div className="text-blue-400/70 text-sm">{check.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Saving Throws Section */}
            <div className="mb-6">
              <h4 className="text-red-400 font-semibold mb-3 text-base">
                Saving Throws
              </h4>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { name: "Strength Save", desc: "Resist being moved or grappled" },
                  { name: "Dexterity Save", desc: "Avoid traps and area effects" },
                  { name: "Constitution Save", desc: "Resist poison and disease" },
                  { name: "Intelligence Save", desc: "Resist mental effects" },
                  { name: "Wisdom Save", desc: "Resist charm and fear" },
                  { name: "Charisma Save", desc: "Resist banishment" }
                ].map((save, index) => (
                  <button
                    key={index}
                    className="text-left p-3 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg transition-all duration-200 hover:bg-red-500/20 text-sm"
                    onClick={() => {
                      handlePromptPlayerForRoll(selectedPlayerForModal, save.name);
                      setRollPromptModalOpen(false);
                    }}
                  >
                    <div className="font-medium">{save.name}</div>
                    <div className="text-red-400/70 text-sm">{save.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Roll Section */}
            <div className="mb-6">
              <h4 className="text-purple-400 font-semibold mb-3 text-base">
                📝 Custom Roll
              </h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-gray-300 mb-2 text-sm">
                    What should {selectedPlayerForModal} roll for?
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Arcana check to identify the rune, History to recall ancient lore..."
                    className="w-full bg-slate-700 border border-slate-600 text-white rounded-md px-3 py-2 text-sm"
                    id="customRollInput"
                  />
                </div>
                <button
                  className="w-full bg-purple-500/20 border border-purple-500/40 text-purple-300 rounded-lg py-3 transition-all duration-200 hover:bg-purple-500/30 text-sm"
                  onClick={() => {
                    const customRoll = document.getElementById('customRollInput').value.trim();
                    if (customRoll) {
                      handlePromptPlayerForRoll(selectedPlayerForModal, customRoll);
                      setRollPromptModalOpen(false);
                    } else {
                      alert("Please enter what the player should roll for.");
                    }
                  }}
                >
                  🎲 Send Custom Roll Request
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button 
                className="px-4 py-2 bg-gray-600 border border-gray-500 text-gray-300 rounded-md transition-all duration-200 hover:bg-gray-500 text-sm"
                onClick={() => setRollPromptModalOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UPDATED: Active Dice Prompts Status (show list of active prompts) */}
      {activePrompts.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-amber-300 font-semibold text-sm">
              🎯 Active Prompts ({activePrompts.length})
            </div>
            {activePrompts.length > 1 && (
              <button
                className="bg-red-500/20 border border-red-500/40 text-red-300 rounded px-2 py-1 text-xs hover:bg-red-500/30 transition-all duration-200"
                onClick={() => clearDicePrompt(null, true)}
              >
                Clear All
              </button>
            )}
          </div>
          
          <div className="space-y-2">
            {activePrompts.map((prompt) => (
              <div key={prompt.id} className="p-3 bg-amber-500/20 border border-amber-500/40 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-amber-200 text-xs">
                      {prompt.player} • {prompt.rollType}
                    </div>
                    {prompt.promptedBy && (
                      <div className="text-amber-400/70 text-xs mt-1">
                        Prompted by {prompt.promptedBy}
                      </div>
                    )}
                  </div>
                  <button
                    className="bg-red-500/20 border border-red-500/40 text-red-300 rounded px-2 py-1 text-xs hover:bg-red-500/30 transition-all duration-200"
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
      <div className="mb-3 flex-shrink-0">
        <div 
          className="flex items-center justify-between cursor-pointer bg-purple-500/10 border border-purple-500/20 rounded transition-all duration-200 hover:bg-purple-500/15 hover:border-purple-500/30 mb-0 p-3"
          onClick={() => toggleSection('map')}
        >
          <span className="text-purple-300 font-semibold uppercase tracking-wide text-xs">
            🗺️ Map Controls
          </span>
          <span className={`text-purple-500 transition-transform duration-200 text-xs ${expandedSections.map ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </div>
        {expandedSections.map && (
          <div className="mt-2 animate-in slide-in-from-top-2 duration-200">
            <button className="w-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded text-left mb-1 transition-all duration-200 hover:bg-emerald-500/20 p-2 text-xs">
              📁 Upload Map
            </button>
            <button className="w-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded text-left mb-1 transition-all duration-200 hover:bg-emerald-500/20 p-2 text-xs">
              💾 Load Map
            </button>
            <button className="w-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded text-left mb-1 transition-all duration-200 hover:bg-emerald-500/20 p-2 text-xs">
              📏 Grid Settings
            </button>
          </div>
        )}
      </div>

      {/* Combat Management Section */}
      <div className="mb-3 flex-shrink-0">
        <div 
          className="flex items-center justify-between cursor-pointer bg-purple-500/10 border border-purple-500/20 rounded transition-all duration-200 hover:bg-purple-500/15 hover:border-purple-500/30 mb-0 p-3"
          onClick={() => toggleSection('combat')}
        >
          <span className="text-purple-300 font-semibold uppercase tracking-wide text-xs">
            ⚔️ Combat Management
          </span>
          <span className={`text-purple-500 transition-transform duration-200 text-xs ${expandedSections.combat ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </div>
        {expandedSections.combat && (
          <div className="mt-2 animate-in slide-in-from-top-2 duration-200" style={{ marginTop: 'calc(8px * var(--ui-scale))' }}>
            
            {/* Initiate Combat Toggle */}
            <div 
              className="w-full flex items-center justify-between p-2 rounded mb-1 bg-amber-500/10 border border-amber-500/40"
              style={{
                padding: 'calc(8px * var(--ui-scale))',
                borderRadius: 'calc(4px * var(--ui-scale))',
                marginBottom: 'calc(4px * var(--ui-scale))',
              }}
            >
              <span className="text-amber-300 font-medium" style={{
                fontSize: 'calc(12px * var(--ui-scale))',
              }}>
                ⚔️ Initiate Combat
              </span>
              
              <div 
                className={`relative inline-flex cursor-pointer rounded-full border-2 transition-all duration-300 ${
                  combatActive 
                    ? 'bg-emerald-500 border-emerald-400' 
                    : 'bg-gray-600 border-gray-500'
                }`}
                style={{
                  width: 'calc(44px * var(--ui-scale))',
                  height: 'calc(24px * var(--ui-scale))',
                  borderRadius: 'calc(12px * var(--ui-scale))',
                }}
                onClick={toggleCombat}
              >
                <div 
                  className={`inline-block rounded-full bg-white shadow-lg transform transition-transform duration-300 ${
                    combatActive ? 'translate-x-full' : 'translate-x-0'
                  }`}
                  style={{
                    width: 'calc(18px * var(--ui-scale))',
                    height: 'calc(18px * var(--ui-scale))',
                    borderRadius: 'calc(9px * var(--ui-scale))',
                    margin: 'calc(2px * var(--ui-scale))',
                  }}
                ></div>
              </div>
            </div>

            <button 
              className="w-full bg-amber-500/10 border border-amber-500/40 text-amber-300 rounded text-left mb-1 transition-all duration-200 hover:bg-amber-500/20"
              style={{
                padding: 'calc(8px * var(--ui-scale))',
                borderRadius: 'calc(4px * var(--ui-scale))',
                fontSize: 'calc(12px * var(--ui-scale))',
                marginBottom: 'calc(4px * var(--ui-scale))',
              }}
              onClick={() => {
                promptAllPlayersInitiative();
              }}
            >
              ⚡ Prompt All Players - Initiative
            </button>

            {/* UPDATED: Prompt Dice Throw - now shows player selection */}
            <div>
              <button 
                className={`w-full bg-amber-500/10 border border-amber-500/40 text-amber-300 rounded text-left mb-1 transition-all duration-200 hover:bg-amber-500/20 ${
                  isPlayerSelectExpanded && selectedPlayerForPrompt === 'general' ? 'bg-amber-500/20' : ''
                }`}
                style={{
                  padding: 'calc(8px * var(--ui-scale))',
                  borderRadius: 'calc(4px * var(--ui-scale))',
                  fontSize: 'calc(12px * var(--ui-scale))',
                  marginBottom: 'calc(4px * var(--ui-scale))',
                }}
                onClick={() => {
                  setIsPlayerSelectExpanded(!isPlayerSelectExpanded);
                  setSelectedPlayerForPrompt('general');
                }}
              >
                🎲 Prompt Player Roll {isPlayerSelectExpanded && selectedPlayerForPrompt === 'general' ? '▼' : '▶'}
              </button>

              {/* Player Selection (inline expansion like your original design) */}
              {isPlayerSelectExpanded && selectedPlayerForPrompt === 'general' && (
                <div className="ml-4 mb-2" style={{ marginLeft: 'calc(16px * var(--ui-scale))', marginBottom: 'calc(8px * var(--ui-scale))' }}>
                  {activePlayers.length > 0 ? (
                    activePlayers.map((player) => (
                      <button
                        key={player.seatId}
                        className="w-full text-left p-2 mb-1 bg-amber-500/5 border border-amber-500/20 text-amber-200 rounded transition-all duration-200 hover:bg-amber-500/15"
                        style={{
                          padding: 'calc(8px * var(--ui-scale))',
                          marginBottom: 'calc(4px * var(--ui-scale))',
                          borderRadius: 'calc(4px * var(--ui-scale))',
                          fontSize: 'calc(11px * var(--ui-scale))',
                        }}
                        onClick={() => {
                          // Open the roll type selection modal
                          setSelectedPlayerForModal(player.playerName);
                          setRollPromptModalOpen(true);
                        }}
                      >
                        {player.playerName}
                        {player.characterData && (
                          <span className="text-amber-400/70 ml-2">({player.characterData.class})</span>
                        )}
                      </button>
                    ))
                  ) : (
                    <div className="text-amber-400/70 text-center py-2" style={{
                      fontSize: 'calc(11px * var(--ui-scale))',
                      padding: 'calc(8px * var(--ui-scale))',
                    }}>
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
      <div className="mb-3 flex-shrink-0" style={{ marginBottom: 'calc(12px * var(--ui-scale))' }}>
        <div 
          className="flex items-center justify-between cursor-pointer bg-purple-500/10 border border-purple-500/20 rounded transition-all duration-200 hover:bg-purple-500/15 hover:border-purple-500/30 mb-0"
          style={{
            padding: 'calc(12px * var(--ui-scale))',
            borderRadius: 'calc(4px * var(--ui-scale))',
          }}
          onClick={() => toggleSection('audio')}
        >
          <span className="text-purple-300 font-semibold uppercase tracking-wide" style={{
            fontSize: 'calc(12px * var(--ui-scale))',
          }}>
            🎵 Audio Tracks
          </span>
          <span className={`text-purple-500 transition-transform duration-200 ${expandedSections.audio ? 'rotate-180' : ''}`} style={{
            fontSize: 'calc(12px * var(--ui-scale))',
          }}>
            ▼
          </span>
        </div>
        {expandedSections.audio && (
          <div className="mt-2 animate-in slide-in-from-top-2 duration-200" style={{ marginTop: 'calc(8px * var(--ui-scale))' }}>
            <div style={{ marginBottom: 'calc(8px * var(--ui-scale))' }}>
              {[
                { name: '🏰 Tavern Ambience', duration: '3:42 / 8:15' },
                { name: '⚔️ Combat Music', duration: '0:00 / 4:32' },
                { name: '🌲 Forest Sounds', duration: '0:00 / 12:08' }
              ].map((track, index) => (
                <div 
                  key={index}
                  className={`flex items-center justify-between rounded bg-purple-500/5 border transition-all duration-200 hover:bg-purple-500/10 ${
                    currentTrack === track.name && isPlaying 
                      ? 'border-purple-500/40 bg-purple-500/15' 
                      : 'border-purple-500/20'
                  }`}
                  style={{
                    padding: 'calc(8px * var(--ui-scale)) calc(12px * var(--ui-scale))',
                    marginBottom: 'calc(4px * var(--ui-scale))',
                    borderRadius: 'calc(4px * var(--ui-scale))',
                  }}
                >
                  <div className="flex-1">
                    <div className="text-purple-300 font-medium" style={{
                      fontSize: 'calc(10px * var(--ui-scale))',
                      marginBottom: 'calc(2px * var(--ui-scale))',
                    }}>{track.name}</div>
                    <div className="text-gray-500 font-mono" style={{
                      fontSize: 'calc(9px * var(--ui-scale))',
                    }}>{track.duration}</div>
                  </div>
                  <div style={{ marginLeft: 'calc(8px * var(--ui-scale))' }}>
                    <button 
                      className={`bg-transparent border rounded transition-all duration-200 ${
                        currentTrack === track.name && isPlaying 
                          ? 'text-amber-500 border-amber-500/40 hover:bg-amber-500/20' 
                          : 'text-purple-500 border-purple-500/30 hover:bg-purple-500/20'
                      }`}
                      style={{
                        padding: 'calc(4px * var(--ui-scale)) calc(6px * var(--ui-scale))',
                        borderRadius: 'calc(3px * var(--ui-scale))',
                        fontSize: 'calc(8px * var(--ui-scale))',
                      }}
                      onClick={() => handleTrackClick(track.name)}
                    >
                      {currentTrack === track.name && isPlaying ? '⏸️' : '▶️'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Party Management Section */}
      <div className="mb-3 flex-shrink-0" style={{ marginBottom: 'calc(12px * var(--ui-scale))' }}>
        <div 
          className="flex items-center justify-between cursor-pointer bg-purple-500/10 border border-purple-500/20 rounded transition-all duration-200 hover:bg-purple-500/15 hover:border-purple-500/30 mb-0"
          style={{
            padding: 'calc(12px * var(--ui-scale))',
            borderRadius: 'calc(4px * var(--ui-scale))',
          }}
          onClick={() => toggleSection('party')}
        >
          <span className="text-purple-300 font-semibold uppercase tracking-wide" style={{
            fontSize: 'calc(12px * var(--ui-scale))',
          }}>
            👥 Party Management
          </span>
          <span className={`text-purple-500 transition-transform duration-200 ${expandedSections.party ? 'rotate-180' : ''}`} style={{
            fontSize: 'calc(12px * var(--ui-scale))',
          }}>
            ▼
          </span>
        </div>
        {expandedSections.party && (
          <div className="mt-2 animate-in slide-in-from-top-2 duration-200" style={{ marginTop: 'calc(8px * var(--ui-scale))' }}>
            
            {/* Manage Seats with expandable interface */}
            <div 
              className={`w-full rounded text-left mb-1 transition-all duration-200 ${
                isSeatManagement 
                  ? 'bg-amber-500/15 border-2 border-amber-500/40' 
                  : 'bg-purple-500/10 border border-purple-500/30 hover:bg-purple-500/20'
              }`}
              style={{
                borderRadius: 'calc(4px * var(--ui-scale))',
                marginBottom: 'calc(4px * var(--ui-scale))',
              }}
            >
              <button 
                className="w-full text-left flex items-center justify-between transition-all duration-200"
                style={{
                  padding: 'calc(8px * var(--ui-scale))',
                  fontSize: 'calc(12px * var(--ui-scale))',
                }}
                onClick={() => setIsSeatManagement(!isSeatManagement)}
              >
                <span className={isSeatManagement ? 'text-amber-300' : 'text-purple-300'}>
                  🪑 Manage Seats
                </span>
                <span className={`transition-transform duration-200 ${isSeatManagement ? 'rotate-180 text-amber-500' : 'text-purple-500'}`}>
                  ▼
                </span>
              </button>

              {isSeatManagement && (
                <div 
                  className="border-t border-amber-500/30 bg-amber-500/5"
                  style={{
                    padding: 'calc(12px * var(--ui-scale))',
                    borderRadius: '0 0 calc(4px * var(--ui-scale)) calc(4px * var(--ui-scale))',
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-amber-300 font-medium" style={{
                      fontSize: 'calc(11px * var(--ui-scale))',
                    }}>
                      Current Seats: {gameSeats?.length || 0}
                    </span>
                    <span className="text-amber-500/70 text-xs">
                      Occupied: {gameSeats?.filter(seat => seat.playerName !== "empty").length || 0}
                    </span>
                  </div>

                  <div className="flex items-center justify-center gap-4">
                    <button
                      className={`flex items-center justify-center rounded transition-all duration-200 ${
                        !gameSeats || gameSeats.length <= 1 
                          ? 'bg-gray-600/20 border border-gray-500/30 text-gray-500 cursor-not-allowed' 
                          : 'bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30'
                      }`}
                      style={{
                        width: 'calc(32px * var(--ui-scale))',
                        height: 'calc(32px * var(--ui-scale))',
                        borderRadius: 'calc(6px * var(--ui-scale))',
                        fontSize: 'calc(14px * var(--ui-scale))',
                      }}
                      onClick={() => handleSeatCountChange((gameSeats?.length || 0) - 1)}
                      disabled={!gameSeats || gameSeats.length <= 1}
                    >
                      −
                    </button>

                    <div className="text-amber-300 font-bold text-center min-w-[40px]" style={{
                      fontSize: 'calc(16px * var(--ui-scale))',
                    }}>
                      {gameSeats?.length || 0}
                    </div>

                    <button
                      className={`flex items-center justify-center rounded transition-all duration-200 ${
                        !gameSeats || gameSeats.length >= 8 
                          ? 'bg-gray-600/20 border border-gray-500/30 text-gray-500 cursor-not-allowed' 
                          : 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30'
                      }`}
                      style={{
                        width: 'calc(32px * var(--ui-scale))',
                        height: 'calc(32px * var(--ui-scale))',
                        borderRadius: 'calc(6px * var(--ui-scale))',
                        fontSize: 'calc(14px * var(--ui-scale))',
                      }}
                      onClick={() => handleSeatCountChange((gameSeats?.length || 0) + 1)}
                      disabled={!gameSeats || gameSeats.length >= 8}
                    >
                      +
                    </button>
                  </div>

                  <div className="text-center mt-2 text-amber-500/60" style={{
                    fontSize: 'calc(9px * var(--ui-scale))',
                  }}>
                    Min: 1 seat • Max: 8 seats
                  </div>
                </div>
              )}
            </div>

            {/* Kick Player Button */}
            <button 
              className="w-full bg-purple-500/10 border border-purple-500/30 text-purple-300 rounded text-left mb-1 transition-all duration-200 hover:bg-purple-500/20" 
              style={{
                padding: 'calc(8px * var(--ui-scale))',
                borderRadius: 'calc(4px * var(--ui-scale))',
                fontSize: 'calc(12px * var(--ui-scale))',
                marginBottom: 'calc(4px * var(--ui-scale))',
              }}
              onClick={() => setIsKickModalOpen(true)}
            >
              🚪 Kick Player
            </button>

            {/* Clear System Messages Button */}
            <button 
              className={`w-full rounded text-left transition-all duration-200 ${
                isClearingLogs 
                  ? 'bg-gray-500/20 border border-gray-500/30 text-gray-400 cursor-not-allowed' 
                  : 'bg-orange-500/10 border border-orange-500/30 text-orange-300 hover:bg-orange-500/20'
              }`}
              style={{
                padding: 'calc(8px * var(--ui-scale))',
                borderRadius: 'calc(4px * var(--ui-scale))',
                fontSize: 'calc(12px * var(--ui-scale))',
                marginBottom: 'calc(4px * var(--ui-scale))',
              }}
              onClick={handleClearSystemClick}
              disabled={isClearingLogs}
            >
              {isClearingLogs ? '🧹 Clearing...' : '🧹 Clear System Messages'}
            </button>

            {/* Clear All Messages Button */}
            <button 
              className={`w-full rounded text-left transition-all duration-200 ${
                isClearingAllLogs 
                  ? 'bg-gray-500/20 border border-gray-500/30 text-gray-400 cursor-not-allowed' 
                  : 'bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20'
              }`}
              style={{
                padding: 'calc(8px * var(--ui-scale))',
                borderRadius: 'calc(4px * var(--ui-scale))',
                fontSize: 'calc(12px * var(--ui-scale))',
                marginBottom: 'calc(4px * var(--ui-scale))',
              }}
              onClick={handleClearAllClick}
              disabled={isClearingAllLogs}
            >
              {isClearingAllLogs ? '🗑️ Clearing...' : '🗑️ Clear All Messages'}
            </button>
          </div>
        )}
      </div>

      {/* Kick Player Modal */}
      {isKickModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div 
            className="bg-slate-800 border border-purple-500/30 rounded-lg shadow-2xl max-w-md w-full mx-4"
            style={{
              padding: 'calc(24px * var(--ui-scale))',
              borderRadius: 'calc(12px * var(--ui-scale))',
            }}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-purple-300 font-bold" style={{
                fontSize: 'calc(18px * var(--ui-scale))',
              }}>
                🚪 Kick Player
              </h3>
              <button 
                className="text-gray-400 hover:text-white transition-colors"
                onClick={() => setIsKickModalOpen(false)}
                style={{
                  fontSize: 'calc(20px * var(--ui-scale))',
                }}
              >
                ✕
              </button>
            </div>

            <div className="mb-6">
              <p className="text-gray-300 mb-4" style={{
                fontSize: 'calc(14px * var(--ui-scale))',
              }}>
                Select a player to remove from the game:
              </p>
              
              {activePlayers.length > 0 ? (
                <div className="space-y-2">
                  {activePlayers.map((player) => (
                    <button
                      key={player.seatId}
                      className="w-full text-left p-3 bg-red-500/10 border border-red-500/30 text-red-300 rounded transition-all duration-200 hover:bg-red-500/20 hover:border-red-500/50"
                      style={{
                        padding: 'calc(12px * var(--ui-scale))',
                        borderRadius: 'calc(8px * var(--ui-scale))',
                        fontSize: 'calc(14px * var(--ui-scale))',
                      }}
                      onClick={() => selectPlayerToKick(player.playerName)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{player.playerName}</div>
                          {player.characterData && (
                            <div className="text-red-400/70 text-sm">
                              {player.characterData.class} • Level {player.characterData.level}
                            </div>
                          )}
                        </div>
                        <div className="text-red-400">🚪</div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <div style={{ fontSize: 'calc(24px * var(--ui-scale))' }}>🪑</div>
                  <p style={{ fontSize: 'calc(14px * var(--ui-scale))' }}>
                    No players to kick
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button 
                className="px-4 py-2 bg-gray-600 border border-gray-500 text-gray-300 rounded transition-all duration-200 hover:bg-gray-500"
                style={{
                  padding: 'calc(8px * var(--ui-scale)) calc(16px * var(--ui-scale))',
                  borderRadius: 'calc(6px * var(--ui-scale))',
                  fontSize: 'calc(14px * var(--ui-scale))',
                }}
                onClick={() => setIsKickModalOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
        </div>
      )}
    </div>
  );
}