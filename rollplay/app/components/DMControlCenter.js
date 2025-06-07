import React, { useState } from 'react';

export default function DMControlCenter({
  isDM,
  promptPlayerRoll,
  currentTrack,
  isPlaying,
  handleTrackClick
}) {
  
  // State for collapsible sections
  const [expandedSections, setExpandedSections] = useState({
    map: true,
    rolls: true,
    audio: false,
    party: false
  });

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  if (!isDM) {
    return null;
  }

  return (
    <div className="bg-gradient-to-b from-red-900/15 to-slate-800/20 border-t border-white/10 p-4 flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col scrollbar-thin scrollbar-track-white/5 scrollbar-thumb-purple-500/30 hover:scrollbar-thumb-purple-500/50">
      {/* Sticky Header */}
      <div className="text-red-500 text-base font-bold mb-4 uppercase tracking-wider flex items-center gap-2 flex-shrink-0 sticky top-0 bg-gradient-to-b from-red-900/15 to-slate-800/20 z-10 pb-2">
        🎭 DM Command Center
      </div>

      {/* Map Controls Section */}
      <div className="mb-3 flex-shrink-0">
        <div 
          className="flex items-center justify-between cursor-pointer p-3 bg-purple-500/10 border border-purple-500/20 rounded transition-all duration-200 hover:bg-purple-500/15 hover:border-purple-500/30 mb-0"
          onClick={() => toggleSection('map')}
        >
          <span className="text-purple-300 text-xs font-semibold uppercase tracking-wide">
            🗺️ Map Controls
          </span>
          <span className={`text-purple-500 text-xs transition-transform duration-200 ${expandedSections.map ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </div>
        {expandedSections.map && (
          <div className="mt-2 animate-in slide-in-from-top-2 duration-200">
            <button className="w-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-2 rounded text-left text-xs mb-1 transition-all duration-200 hover:bg-emerald-500/20">
              📁 Upload Map
            </button>
            <button className="w-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-2 rounded text-left text-xs mb-1 transition-all duration-200 hover:bg-emerald-500/20">
              💾 Load Map
            </button>
            <button className="w-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-2 rounded text-left text-xs mb-1 transition-all duration-200 hover:bg-emerald-500/20">
              📏 Grid Settings
            </button>
          </div>
        )}
      </div>

      {/* Roll Management Section */}
      <div className="mb-3 flex-shrink-0">
        <div 
          className="flex items-center justify-between cursor-pointer p-3 bg-purple-500/10 border border-purple-500/20 rounded transition-all duration-200 hover:bg-purple-500/15 hover:border-purple-500/30 mb-0"
          onClick={() => toggleSection('rolls')}
        >
          <span className="text-purple-300 text-xs font-semibold uppercase tracking-wide">
            🎲 Roll Management
          </span>
          <span className={`text-purple-500 text-xs transition-transform duration-200 ${expandedSections.rolls ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </div>
        {expandedSections.rolls && (
          <div className="mt-2 animate-in slide-in-from-top-2 duration-200">
            <button 
              className="w-full bg-amber-500/10 border border-amber-500/40 text-amber-300 p-2 rounded text-left text-xs mb-1 transition-all duration-200 hover:bg-amber-500/20"
              onClick={() => promptPlayerRoll('Ability Check')}
            >
              🎯 Prompt Ability Check
            </button>
            <button 
              className="w-full bg-amber-500/10 border border-amber-500/40 text-amber-300 p-2 rounded text-left text-xs mb-1 transition-all duration-200 hover:bg-amber-500/20"
              onClick={() => promptPlayerRoll('Saving Throw')}
            >
              🛡️ Prompt Saving Throw
            </button>
            <button 
              className="w-full bg-amber-500/10 border border-amber-500/40 text-amber-300 p-2 rounded text-left text-xs mb-1 transition-all duration-200 hover:bg-amber-500/20"
              onClick={() => promptPlayerRoll('Attack Roll')}
            >
              ⚔️ Prompt Attack Roll
            </button>
            <button 
              className="w-full bg-amber-500/10 border border-amber-500/40 text-amber-300 p-2 rounded text-left text-xs mb-1 transition-all duration-200 hover:bg-amber-500/20"
              onClick={() => promptPlayerRoll('Damage Roll')}
            >
              💥 Prompt Damage Roll
            </button>
            <button 
              className="w-full bg-amber-500/10 border border-amber-500/40 text-amber-300 p-2 rounded text-left text-xs mb-1 transition-all duration-200 hover:bg-amber-500/20"
              onClick={() => promptPlayerRoll('Initiative')}
            >
              ⚡ Prompt Initiative
            </button>
            <button 
              className="w-full bg-amber-500/10 border border-amber-500/40 text-amber-300 p-2 rounded text-left text-xs mb-1 transition-all duration-200 hover:bg-amber-500/20"
              onClick={() => promptPlayerRoll('Skill Check')}
            >
              📊 Prompt Skill Check
            </button>
            <button 
              className="w-full bg-amber-500/10 border border-amber-500/40 text-amber-300 p-2 rounded text-left text-xs mb-1 transition-all duration-200 hover:bg-amber-500/20"
              onClick={() => promptPlayerRoll('Hit Dice')}
            >
              ❤️ Prompt Hit Dice
            </button>
            <button 
              className="w-full bg-amber-500/10 border border-amber-500/40 text-amber-300 p-2 rounded text-left text-xs mb-1 transition-all duration-200 hover:bg-amber-500/20"
              onClick={() => promptPlayerRoll('Death Save')}
            >
              💀 Prompt Death Save
            </button>
          </div>
        )}
      </div>

      {/* Audio Tracks Section */}
      <div className="mb-3 flex-shrink-0">
        <div 
          className="flex items-center justify-between cursor-pointer p-3 bg-purple-500/10 border border-purple-500/20 rounded transition-all duration-200 hover:bg-purple-500/15 hover:border-purple-500/30 mb-0"
          onClick={() => toggleSection('audio')}
        >
          <span className="text-purple-300 text-xs font-semibold uppercase tracking-wide">
            🎵 Audio Tracks
          </span>
          <span className={`text-purple-500 text-xs transition-transform duration-200 ${expandedSections.audio ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </div>
        {expandedSections.audio && (
          <div className="mt-2 animate-in slide-in-from-top-2 duration-200">
            <div className="mb-2">
              {[
                { name: '🏰 Tavern Ambience', duration: '3:42 / 8:15' },
                { name: '⚔️ Combat Music', duration: '0:00 / 4:32' },
                { name: '🌲 Forest Sounds', duration: '0:00 / 12:08' }
              ].map((track, index) => (
                <div 
                  key={index}
                  className={`flex items-center justify-between p-2 mb-1 rounded bg-purple-500/5 border transition-all duration-200 hover:bg-purple-500/10 ${
                    currentTrack === track.name && isPlaying 
                      ? 'border-purple-500/40 bg-purple-500/15' 
                      : 'border-purple-500/20'
                  }`}
                >
                  <div className="flex-1">
                    <div className="text-purple-300 text-xs font-medium mb-0.5">{track.name}</div>
                    <div className="text-gray-500 text-xs font-mono">{track.duration}</div>
                  </div>
                  <div className="ml-2">
                    <button 
                      className={`bg-transparent border px-2 py-1 rounded text-xs transition-all duration-200 ${
                        currentTrack === track.name && isPlaying 
                          ? 'text-amber-500 border-amber-500/40 hover:bg-amber-500/20' 
                          : 'text-purple-500 border-purple-500/30 hover:bg-purple-500/20'
                      }`}
                      onClick={() => handleTrackClick(track.name)}
                    >
                      {currentTrack === track.name && isPlaying ? '⏸️' : '▶️'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button className="w-full bg-purple-500/10 border border-purple-500/30 text-purple-300 p-2 rounded text-left text-xs mb-1 transition-all duration-200 hover:bg-purple-500/20">
              📁 Upload Audio
            </button>
            <button className="w-full bg-purple-500/10 border border-purple-500/30 text-purple-300 p-2 rounded text-left text-xs mb-1 transition-all duration-200 hover:bg-purple-500/20">
              💾 Load Audio
            </button>
          </div>
        )}
      </div>

      {/* Party Management Section */}
      <div className="mb-3 flex-shrink-0">
        <div 
          className="flex items-center justify-between cursor-pointer p-3 bg-purple-500/10 border border-purple-500/20 rounded transition-all duration-200 hover:bg-purple-500/15 hover:border-purple-500/30 mb-0"
          onClick={() => toggleSection('party')}
        >
          <span className="text-purple-300 text-xs font-semibold uppercase tracking-wide">
            👥 Party Management
          </span>
          <span className={`text-purple-500 text-xs transition-transform duration-200 ${expandedSections.party ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </div>
        {expandedSections.party && (
          <div className="mt-2 animate-in slide-in-from-top-2 duration-200">
            <button className="w-full bg-purple-500/10 border border-purple-500/30 text-purple-300 p-2 rounded text-left text-xs mb-1 transition-all duration-200 hover:bg-purple-500/20">
              🪑 Manage Seats
            </button>
            <button className="w-full bg-purple-500/10 border border-purple-500/30 text-purple-300 p-2 rounded text-left text-xs mb-1 transition-all duration-200 hover:bg-purple-500/20">
              🚪 Kick Player
            </button>
            <button className="w-full bg-purple-500/10 border border-purple-500/30 text-purple-300 p-2 rounded text-left text-xs mb-1 transition-all duration-200 hover:bg-purple-500/20">
              💊 Adjust HP
            </button>
          </div>
        )}
      </div>
    </div>
  );
}