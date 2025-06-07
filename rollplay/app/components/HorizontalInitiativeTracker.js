import React from 'react';

export default function HorizontalInitiativeTracker({ 
  initiativeOrder, 
  handleInitiativeClick,
  currentTurn 
}) {
  
  // Determine if character is an enemy/NPC
  const isEnemy = (name) => {
    return name.includes('#') || name.toLowerCase().includes('bandit') || name.toLowerCase().includes('goblin');
  };

  // Get background color based on character type
  const getBackgroundColor = (name) => {
    if (isEnemy(name)) {
      return 'bg-red-600'; // Red for enemies
    }
    return 'bg-gray-600'; // Gray for players
  };

  return (
    <div className="grid-area-map-canvas bg-gradient-to-br from-slate-900/80 via-slate-800/60 to-slate-900/80 relative flex flex-col items-center justify-center border border-white/5 overflow-hidden">
      
      {/* Map Placeholder Background */}
      <div className="absolute inset-0 flex items-center justify-center opacity-20">
        <div className="text-center text-white/30">
          <div className="text-6xl mb-4">🗺️</div>
          <div className="text-xl mb-2">The Blood on the Vine Tavern</div>
          <div className="text-sm">Upload a battle map to begin</div>
        </div>
      </div>

      {/* Initiative Order Overlay */}
      <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-10">
        <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-xl px-6 py-4 shadow-2xl">
          {/* Header */}
          <div className="text-center mb-4">
            <div className="text-amber-400 text-sm font-semibold uppercase tracking-wider">
              ⚡ Initiative Order
            </div>
          </div>

          {/* Character Portraits */}
          <div className="flex items-start justify-center gap-6">
            {initiativeOrder.map((character, index) => (
              <div
                key={index}
                className="relative flex flex-col items-center w-20"
              >
                {/* Character Portrait - Rectangular with image placeholder */}
                <div className="relative">
                  <div className={`
                    w-16 h-12 rounded-lg border-2 transition-all duration-300 flex items-center justify-center text-white font-bold text-lg shadow-lg overflow-hidden mx-auto
                    ${character.active 
                      ? 'border-amber-400 shadow-amber-400/50 shadow-lg ring-2 ring-amber-400/30' 
                      : 'border-white/30'
                    }
                    ${getBackgroundColor(character.name)}
                  `}>
                    {/* Placeholder for future avatar image */}
                    <div className="w-full h-full bg-black/20 flex items-center justify-center text-xs text-white/50">
                      IMG
                    </div>
                  </div>

                  {/* Initiative Number Badge - Top Center */}
                  <div className={`
                    absolute -top-3 left-1/2 transform -translate-x-1/2 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all duration-300
                    ${character.active 
                      ? 'bg-amber-400 border-amber-300 text-black' 
                      : 'bg-slate-700 border-slate-600 text-white'
                    }
                  `}>
                    {character.initiative}
                  </div>
                </div>

                {/* Character Name - Always visible, centered, constrained width */}
                <div className={`
                  text-center mt-3 text-xs font-medium transition-all duration-300 w-full px-1 leading-tight
                  ${character.active 
                    ? 'text-amber-400' 
                    : 'text-white/70'
                  }
                `}>
                  {character.name}
                </div>

                {/* Turn Order Connector */}
                {index < initiativeOrder.length - 1 && (
                  <div className="absolute top-6 -right-12 transform -translate-y-1/2 z-0">
                    <div className="w-6 h-0.5 bg-gradient-to-r from-white/30 to-white/10"></div>
                    <div className="absolute top-1/2 right-0 transform -translate-y-1/2 w-0 h-0 border-l-2 border-t border-b border-transparent border-l-white/30"></div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Current Turn Display */}
          <div className="text-center mt-4 pt-3 border-t border-white/10">
            <div className="text-amber-400 text-sm font-medium">
              Current Turn: <span className="text-white font-semibold">{currentTurn}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions (Bottom Left) */}
      <div className="absolute bottom-6 left-6 z-10">
        <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-lg px-4 py-3 shadow-xl">
          <div className="flex gap-2">
            <button className="px-3 py-1.5 bg-red-500/20 border border-red-500/40 text-red-400 text-xs rounded hover:bg-red-500/30 transition-all duration-200">
              End Turn
            </button>
            <button className="px-3 py-1.5 bg-blue-500/20 border border-blue-500/40 text-blue-400 text-xs rounded hover:bg-blue-500/30 transition-all duration-200">
              Next Turn
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}