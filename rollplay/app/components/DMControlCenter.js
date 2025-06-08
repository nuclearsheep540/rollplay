import React, { useState } from 'react';

export default function DMControlCenter({
  isDM,
  promptPlayerRoll,
  currentTrack,
  isPlaying,
  handleTrackClick,
  combatActive = true,
  setCombatActive,
  gameSeats,           
  setSeatCount,        
  roomId,              
  handleKickPlayer,    // Function to handle player kicks
  handleClearSystemMessages // Function to clear system messages
}) {
  
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
  
  // State for roll prompting
  const [isRollPromptModalOpen, setIsRollPromptModalOpen] = useState(false);
  const [selectedPlayerForRoll, setSelectedPlayerForRoll] = useState(null);
  const [isDicePromptExpanded, setIsDicePromptExpanded] = useState(false);
  const [customRollText, setCustomRollText] = useState('');

  // D&D Roll Types - Simplified and Color Coded (Reordered)
  const rollTypes = {
    'Attack Rolls': {
      color: 'green',
      bgColor: 'rgba(34, 197, 94, 0.1)',
      borderColor: 'rgba(34, 197, 94, 0.3)',
      textColor: '#4ade80',
      rolls: [
        { name: 'Attack Roll', description: 'Roll to hit target (d20 + modifiers)' },
        { name: 'Damage Roll', description: 'Roll for damage if attack hits' }
      ]
    },
    'Ability Checks': {
      color: 'blue',
      bgColor: 'rgba(59, 130, 246, 0.1)',
      borderColor: 'rgba(59, 130, 246, 0.3)',
      textColor: '#60a5fa',
      rolls: [
        { name: 'Strength Check', description: 'Lifting, pushing, breaking' },
        { name: 'Dexterity Check', description: 'Acrobatics, stealth' },
        { name: 'Constitution Check', description: 'Endurance, holding breath' },
        { name: 'Intelligence Check', description: 'Recall lore, solve puzzles' },
        { name: 'Wisdom Check', description: 'Perception, insight' },
        { name: 'Charisma Check', description: 'Persuasion, deception' }
      ]
    },
    'Saving Throws': {
      color: 'red',
      bgColor: 'rgba(239, 68, 68, 0.1)',
      borderColor: 'rgba(239, 68, 68, 0.3)',
      textColor: '#f87171',
      rolls: [
        { name: 'Strength Save', description: 'Resist being moved or grappled' },
        { name: 'Dexterity Save', description: 'Avoid traps and area effects' },
        { name: 'Constitution Save', description: 'Resist poison and disease' },
        { name: 'Intelligence Save', description: 'Resist mental effects' },
        { name: 'Wisdom Save', description: 'Resist charm and fear' },
        { name: 'Charisma Save', description: 'Resist banishment' }
      ]
    }
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const toggleCombat = () => {
    setCombatActive(!combatActive);
  };

  // Function to handle player selection for roll prompt
  const selectPlayerForRollPrompt = (playerName) => {
    setSelectedPlayerForRoll(playerName);
    setIsRollPromptModalOpen(true);
  };

  // Function to send roll prompt to player
  const sendRollPromptToPlayer = (rollType) => {
    if (selectedPlayerForRoll && promptPlayerRoll) {
      promptPlayerRoll(rollType, selectedPlayerForRoll);
      setIsRollPromptModalOpen(false);
      setSelectedPlayerForRoll(null);
      setCustomRollText(''); // Clear custom text
    }
  };

  // Function to send custom roll prompt
  const sendCustomRollPrompt = () => {
    if (selectedPlayerForRoll && promptPlayerRoll && customRollText.trim()) {
      promptPlayerRoll(customRollText.trim(), selectedPlayerForRoll);
      setIsRollPromptModalOpen(false);
      setSelectedPlayerForRoll(null);
      setCustomRollText(''); // Clear custom text
    }
  };

  // Function to handle seat count changes
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

  // Function to handle player kick selection
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

  // Function to handle clearing system messages
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

  // Get list of players currently in seats (excluding empty seats)
  const activePlayers = gameSeats?.filter(seat => seat.playerName !== "empty") || [];

  if (!isDM) {
    return null;
  }

  return (
    <div className="bg-gradient-to-b from-red-900/15 to-slate-800/20 border-t border-white/10 p-4 flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col scrollbar-thin scrollbar-track-white/5 scrollbar-thumb-purple-500/30 hover:scrollbar-thumb-purple-500/50" style={{
      padding: 'calc(16px * var(--ui-scale))',
    }}>
      {/* Sticky Header */}
      <div className="text-red-500 font-bold mb-4 uppercase tracking-wider flex items-center gap-2 flex-shrink-0 sticky top-0 z-10 pb-2" style={{
        fontSize: 'calc(16px * var(--ui-scale))',
        marginBottom: 'calc(16px * var(--ui-scale))',
        gap: 'calc(8px * var(--ui-scale))',
        paddingBottom: 'calc(8px * var(--ui-scale))',
        justifyContent: 'center'
      }}>
        DM Command Center
      </div>

      {/* Map Controls Section */}
      <div className="mb-3 flex-shrink-0" style={{ marginBottom: 'calc(12px * var(--ui-scale))' }}>
        <div 
          className="flex items-center justify-between cursor-pointer bg-purple-500/10 border border-purple-500/20 rounded transition-all duration-200 hover:bg-purple-500/15 hover:border-purple-500/30 mb-0"
          style={{
            padding: 'calc(12px * var(--ui-scale))',
            borderRadius: 'calc(4px * var(--ui-scale))',
          }}
          onClick={() => toggleSection('map')}
        >
          <span className="text-purple-300 font-semibold uppercase tracking-wide" style={{
            fontSize: 'calc(12px * var(--ui-scale))',
          }}>
            🗺️ Map Controls
          </span>
          <span className={`text-purple-500 transition-transform duration-200 ${expandedSections.map ? 'rotate-180' : ''}`} style={{
            fontSize: 'calc(12px * var(--ui-scale))',
          }}>
            ▼
          </span>
        </div>
        {expandedSections.map && (
          <div className="mt-2 animate-in slide-in-from-top-2 duration-200" style={{ marginTop: 'calc(8px * var(--ui-scale))' }}>
            <button className="w-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded text-left mb-1 transition-all duration-200 hover:bg-emerald-500/20" style={{
              padding: 'calc(8px * var(--ui-scale))',
              borderRadius: 'calc(4px * var(--ui-scale))',
              fontSize: 'calc(12px * var(--ui-scale))',
              marginBottom: 'calc(4px * var(--ui-scale))',
            }}>
              📁 Upload Map
            </button>
            <button className="w-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded text-left mb-1 transition-all duration-200 hover:bg-emerald-500/20" style={{
              padding: 'calc(8px * var(--ui-scale))',
              borderRadius: 'calc(4px * var(--ui-scale))',
              fontSize: 'calc(12px * var(--ui-scale))',
              marginBottom: 'calc(4px * var(--ui-scale))',
            }}>
              💾 Load Map
            </button>
            <button className="w-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded text-left mb-1 transition-all duration-200 hover:bg-emerald-500/20" style={{
              padding: 'calc(8px * var(--ui-scale))',
              borderRadius: 'calc(4px * var(--ui-scale))',
              fontSize: 'calc(12px * var(--ui-scale))',
              marginBottom: 'calc(4px * var(--ui-scale))',
            }}>
              📏 Grid Settings
            </button>
          </div>
        )}
      </div>

      {/* Combat Management Section */}
      <div className="mb-3 flex-shrink-0" style={{ marginBottom: 'calc(12px * var(--ui-scale))' }}>
        <div 
          className="flex items-center justify-between cursor-pointer bg-purple-500/10 border border-purple-500/20 rounded transition-all duration-200 hover:bg-purple-500/15 hover:border-purple-500/30 mb-0"
          style={{
            padding: 'calc(12px * var(--ui-scale))',
            borderRadius: 'calc(4px * var(--ui-scale))',
          }}
          onClick={() => toggleSection('combat')}
        >
          <span className="text-purple-300 font-semibold uppercase tracking-wide" style={{
            fontSize: 'calc(12px * var(--ui-scale))',
          }}>
            ⚔️ Combat Management
          </span>
          <span className={`text-purple-500 transition-transform duration-200 ${expandedSections.combat ? 'rotate-180' : ''}`} style={{
            fontSize: 'calc(12px * var(--ui-scale))',
          }}>
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
              onClick={() => promptPlayerRoll('Initiative')}
            >
              ⚡ Prompt Initiative
            </button>
            
            {/* Dice Roll Prompts - Expandable */}
            <div 
              className={`w-full rounded text-left mb-1 transition-all duration-200 ${
                isDicePromptExpanded 
                  ? 'bg-amber-500/15 border-2 border-amber-500/40' 
                  : 'bg-amber-500/10 border border-amber-500/40 hover:bg-amber-500/20'
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
                onClick={() => setIsDicePromptExpanded(!isDicePromptExpanded)}
              >
                <span className={isDicePromptExpanded ? 'text-amber-300' : 'text-amber-300'}>
                  🎲 Prompt Dice Roll
                </span>
                <span className={`transition-transform duration-200 ${isDicePromptExpanded ? 'rotate-180 text-amber-500' : 'text-amber-500'}`}>
                  ▼
                </span>
              </button>

              {isDicePromptExpanded && (
                <div 
                  className="border-t border-amber-500/30 bg-amber-500/5"
                  style={{
                    padding: 'calc(12px * var(--ui-scale))',
                    borderRadius: '0 0 calc(4px * var(--ui-scale)) calc(4px * var(--ui-scale))',
                  }}
                >
                  <div className="mb-3">
                    <span className="text-amber-300 font-medium" style={{
                      fontSize: 'calc(11px * var(--ui-scale))',
                    }}>
                      Select a player to prompt:
                    </span>
                  </div>

                  {activePlayers.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2">
                      {activePlayers.map((player) => (
                        <button
                          key={player.seatId}
                          className="w-full text-left p-2 bg-amber-500/20 border border-amber-500/40 text-amber-200 rounded transition-all duration-200 hover:bg-amber-500/30 hover:border-amber-500/60"
                          style={{
                            padding: 'calc(8px * var(--ui-scale))',
                            borderRadius: 'calc(6px * var(--ui-scale))',
                            fontSize: 'calc(12px * var(--ui-scale))',
                          }}
                          onClick={() => selectPlayerForRollPrompt(player.playerName)}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium">{player.playerName}</div>
                              {player.characterData && (
                                <div className="text-amber-300/70 text-xs">
                                  {player.characterData.class} • Level {player.characterData.level}
                                </div>
                              )}
                            </div>
                            <div className="text-amber-400">🎯</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-amber-500/60">
                      <div style={{ fontSize: 'calc(20px * var(--ui-scale))' }}>🪑</div>
                      <p style={{ fontSize: 'calc(12px * var(--ui-scale))' }}>
                        No active players to prompt
                      </p>
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
          </div>
        )}
      </div>

      {/* Roll Prompt Modal - Simplified and Color Coded */}
      {isRollPromptModalOpen && selectedPlayerForRoll && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div 
            className="bg-slate-800 border border-amber-500/30 rounded-lg shadow-2xl max-w-2xl w-full mx-4"
            style={{
              padding: 'calc(24px * var(--ui-scale))',
              borderRadius: 'calc(12px * var(--ui-scale))',
            }}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-amber-300 font-bold" style={{
                fontSize: 'calc(18px * var(--ui-scale))',
              }}>
                🎲 Prompt {selectedPlayerForRoll} to Roll
              </h3>
              <button 
                className="text-gray-400 hover:text-white transition-colors"
                onClick={() => {
                  setIsRollPromptModalOpen(false);
                  setSelectedPlayerForRoll(null);
                  setCustomRollText(''); // Clear custom text
                }}
                style={{
                  fontSize: 'calc(20px * var(--ui-scale))',
                }}
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {Object.entries(rollTypes).map(([category, categoryData]) => (
                <div key={category} className="space-y-3">
                  <h4 
                    className="font-semibold border-b pb-2"
                    style={{
                      fontSize: 'calc(16px * var(--ui-scale))',
                      color: categoryData.textColor,
                      borderBottomColor: categoryData.borderColor
                    }}
                  >
                    {category}
                  </h4>
                  <div 
                    className="grid grid-cols-2 gap-3"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gap: `calc(12px * var(--ui-scale))`
                    }}
                  >
                    {categoryData.rolls.map((roll) => (
                      <button
                        key={roll.name}
                        className="w-full text-left p-3 rounded transition-all duration-200"
                        style={{
                          padding: 'calc(12px * var(--ui-scale))',
                          borderRadius: 'calc(8px * var(--ui-scale))',
                          fontSize: 'calc(14px * var(--ui-scale))',
                          backgroundColor: categoryData.bgColor,
                          border: `1px solid ${categoryData.borderColor}`,
                          color: categoryData.textColor,
                          cursor: 'pointer'
                        }}
                        onClick={() => sendRollPromptToPlayer(roll.name)}
                      >
                        <div className="font-medium mb-1" style={{ userSelect: 'none' }}>{roll.name}</div>
                        <div 
                          className="text-sm opacity-75"
                          style={{
                            fontSize: 'calc(12px * var(--ui-scale))',
                            userSelect: 'none'
                          }}
                        >
                          {roll.description}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Custom Roll Section */}
            <div className="space-y-3 mt-8 pt-6 border-t border-gray-600">
              <h4 
                className="font-semibold pb-2"
                style={{
                  fontSize: 'calc(16px * var(--ui-scale))',
                  color: '#a78bfa', // Purple color for custom
                }}
              >
                📝 Custom Roll
              </h4>
              
              <div className="space-y-3">
                <div>
                  <label 
                    className="block text-sm font-medium mb-2"
                    style={{
                      fontSize: 'calc(12px * var(--ui-scale))',
                      color: '#cbd5e1'
                    }}
                  >
                    What should {selectedPlayerForRoll} roll for?
                  </label>
                  <input
                    type="text"
                    value={customRollText}
                    onChange={(e) => setCustomRollText(e.target.value)}
                    placeholder="e.g., Arcana check to identify the rune, History to recall ancient lore..."
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    style={{
                      padding: 'calc(8px * var(--ui-scale)) calc(12px * var(--ui-scale))',
                      borderRadius: 'calc(6px * var(--ui-scale))',
                      fontSize: 'calc(14px * var(--ui-scale))',
                      backgroundColor: '#334155',
                      border: '1px solid #475569',
                      color: 'white'
                    }}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && customRollText.trim()) {
                        sendCustomRollPrompt();
                      }
                    }}
                  />
                </div>
                
                <button
                  onClick={sendCustomRollPrompt}
                  disabled={!customRollText.trim()}
                  className={`w-full p-3 rounded transition-all duration-200 ${
                    customRollText.trim() 
                      ? 'bg-purple-500/20 border-purple-500/40 text-purple-300 hover:bg-purple-500/30' 
                      : 'bg-gray-600/20 border-gray-500/30 text-gray-500 cursor-not-allowed'
                  }`}
                  style={{
                    padding: 'calc(12px * var(--ui-scale))',
                    borderRadius: 'calc(8px * var(--ui-scale))',
                    fontSize: 'calc(14px * var(--ui-scale))',
                    backgroundColor: customRollText.trim() ? 'rgba(168, 85, 247, 0.2)' : 'rgba(107, 114, 128, 0.2)',
                    border: customRollText.trim() ? '1px solid rgba(168, 85, 247, 0.4)' : '1px solid rgba(107, 114, 128, 0.3)',
                    color: customRollText.trim() ? '#c4b5fd' : '#9ca3af',
                    cursor: customRollText.trim() ? 'pointer' : 'not-allowed'
                  }}
                >
                  📤 Send Custom Roll Request
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button 
                className="px-4 py-2 bg-gray-600 border border-gray-500 text-gray-300 rounded transition-all duration-200 hover:bg-gray-500"
                style={{
                  padding: 'calc(8px * var(--ui-scale)) calc(16px * var(--ui-scale))',
                  borderRadius: 'calc(6px * var(--ui-scale))',
                  fontSize: 'calc(14px * var(--ui-scale))',
                }}
                onClick={() => {
                  setIsRollPromptModalOpen(false);
                  setSelectedPlayerForRoll(null);
                  setCustomRollText(''); // Clear custom text
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
  );
}