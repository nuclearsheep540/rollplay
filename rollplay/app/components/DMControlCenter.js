import React, { useState } from 'react';

export default function DMControlCenter({
  isDM,
  promptPlayerRoll,
  currentTrack,
  isPlaying,
  handleTrackClick,
  combatActive = true,
  setCombatActive
}) {
  
  // State for collapsible sections
  const [expandedSections, setExpandedSections] = useState({
    map: true,
    combat: true,
    audio: false,
    party: false
  });

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const toggleCombat = () => {
    setCombatActive(!combatActive);
  };

  if (!isDM) {
    return null;
  }

  return (
    <div className="bg-gradient-to-b from-red-900/15 to-slate-800/20 border-t border-white/10 p-4 flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col scrollbar-thin scrollbar-track-white/5 scrollbar-thumb-purple-500/30 hover:scrollbar-thumb-purple-500/50" style={{
      padding: 'calc(16px * var(--ui-scale))',
    }}>
      {/* Sticky Header */}
      <div className="text-red-500 font-bold mb-4 uppercase tracking-wider flex items-center gap-2 flex-shrink-0 sticky top-0 bg-gradient-to-b from-red-900/15 to-slate-800/20 z-10 pb-2" style={{
        fontSize: 'calc(16px * var(--ui-scale))',
        marginBottom: 'calc(16px * var(--ui-scale))',
        gap: 'calc(8px * var(--ui-scale))',
        paddingBottom: 'calc(8px * var(--ui-scale))',
      }}>
        🎭 DM Command Center
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
              
              {/* Toggle Switch */}
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
            <button 
              className="w-full bg-amber-500/10 border border-amber-500/40 text-amber-300 rounded text-left mb-1 transition-all duration-200 hover:bg-amber-500/20"
              style={{
                padding: 'calc(8px * var(--ui-scale))',
                borderRadius: 'calc(4px * var(--ui-scale))',
                fontSize: 'calc(12px * var(--ui-scale))',
                marginBottom: 'calc(4px * var(--ui-scale))',
              }}
              onClick={() => promptPlayerRoll('Dice Throw')}
            >
              🎲 Prompt Dice Throw
            </button>
            <button 
              className="w-full bg-amber-500/10 border border-amber-500/40 text-amber-300 rounded text-left mb-1 transition-all duration-200 hover:bg-amber-500/20"
              style={{
                padding: 'calc(8px * var(--ui-scale))',
                borderRadius: 'calc(4px * var(--ui-scale))',
                fontSize: 'calc(12px * var(--ui-scale))',
                marginBottom: 'calc(4px * var(--ui-scale))',
              }}
            >
              ✨ Status Effects
            </button>
            <button 
              className="w-full bg-amber-500/10 border border-amber-500/40 text-amber-300 rounded text-left mb-1 transition-all duration-200 hover:bg-amber-500/20"
              style={{
                padding: 'calc(8px * var(--ui-scale))',
                borderRadius: 'calc(4px * var(--ui-scale))',
                fontSize: 'calc(12px * var(--ui-scale))',
                marginBottom: 'calc(4px * var(--ui-scale))',
              }}
            >
              💊 Adjust HP
            </button>
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
            <button className="w-full bg-purple-500/10 border border-purple-500/30 text-purple-300 rounded text-left mb-1 transition-all duration-200 hover:bg-purple-500/20" style={{
              padding: 'calc(8px * var(--ui-scale))',
              borderRadius: 'calc(4px * var(--ui-scale))',
              fontSize: 'calc(12px * var(--ui-scale))',
              marginBottom: 'calc(4px * var(--ui-scale))',
            }}>
              📁 Upload Audio
            </button>
            <button className="w-full bg-purple-500/10 border border-purple-500/30 text-purple-300 rounded text-left mb-1 transition-all duration-200 hover:bg-purple-500/20" style={{
              padding: 'calc(8px * var(--ui-scale))',
              borderRadius: 'calc(4px * var(--ui-scale))',
              fontSize: 'calc(12px * var(--ui-scale))',
              marginBottom: 'calc(4px * var(--ui-scale))',
            }}>
              💾 Load Audio
            </button>
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
            <button className="w-full bg-purple-500/10 border border-purple-500/30 text-purple-300 rounded text-left mb-1 transition-all duration-200 hover:bg-purple-500/20" style={{
              padding: 'calc(8px * var(--ui-scale))',
              borderRadius: 'calc(4px * var(--ui-scale))',
              fontSize: 'calc(12px * var(--ui-scale))',
              marginBottom: 'calc(4px * var(--ui-scale))',
            }}>
              🪑 Manage Seats
            </button>
            <button className="w-full bg-purple-500/10 border border-purple-500/30 text-purple-300 rounded text-left mb-1 transition-all duration-200 hover:bg-purple-500/20" style={{
              padding: 'calc(8px * var(--ui-scale))',
              borderRadius: 'calc(4px * var(--ui-scale))',
              fontSize: 'calc(12px * var(--ui-scale))',
              marginBottom: 'calc(4px * var(--ui-scale))',
            }}>
              🚪 Kick Player
            </button>
          </div>
        )}
      </div>
    </div>
  );
}