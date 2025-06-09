import React, { useState, useEffect } from 'react';

export default function HorizontalInitiativeTracker({ 
  initiativeOrder, 
  handleInitiativeClick,
  currentTurn,
  combatActive = true // Add combat state prop
}) {
  // Animation state management
  const [isVisible, setIsVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  // Handle combat state changes with proper animation timing
  useEffect(() => {
    if (combatActive) {
      // Show: first add to DOM, then animate in
      setShouldRender(true);
      
      // Use requestAnimationFrame to ensure DOM is rendered before animation
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsVisible(true);
        });
      });
    } else {
      // Hide: first animate out, then remove from DOM
      setIsVisible(false);
      // Wait for animation to complete before removing from DOM
      const hideTimer = setTimeout(() => {
        setShouldRender(false);
      }, 300); // Match this with CSS transition duration
      return () => clearTimeout(hideTimer);
    }
  }, [combatActive]);

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
      
      {/* Map Background */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: "url('https://runefoundry.com/cdn/shop/files/ForestWaterfallIsometric_digital_grid_day.jpg?v=1688628972&width=1946')",
          opacity: 0.6,
        }}
      >
        {/* Dark overlay for better contrast with UI elements */}
        <div className="absolute inset-0 bg-black/30"></div>
      </div>

      {/* Initiative Order - Animated show/hide based on combat state */}
      {shouldRender && (
        <div 
          className={`absolute left-1/2 top-[calc(24px*var(--ui-scale))] z-10 transition-all duration-300 ease-out ${
            isVisible 
              ? 'transform -translate-x-1/2 translate-y-0 opacity-100' 
              : 'transform -translate-x-1/2 -translate-y-full opacity-0'
          }`}
        >
          {/* Backdrop */}
          <div className="bg-slate-600/40 backdrop-blur-sm rounded-lg p-[calc(8px*var(--ui-scale))]">
            {/* Character Portraits - BG3 Style */}
            <div className="flex items-center gap-[calc(10px*var(--ui-scale))]">
              {initiativeOrder.map((character, index) => (
                <div
                  key={index}
                  className={`
                    relative group transition-all duration-300 cursor-pointer
                    ${character.active 
                      ? 'scale-110 z-20' 
                      : 'scale-100'
                    }
                  `}
                  onClick={() => handleInitiativeClick(character.name)}
                >
                  {/* Character Frame - Subtle container with party/enemy colors */}
                  <div className={`
                    rounded transition-all duration-300 p-[calc(2.4px*var(--ui-scale))]
                    ${character.active 
                      ? 'bg-emerald-500/20 border-2 border-emerald-400/80' 
                      : isEnemy(character.name)
                        ? 'bg-black/20 border-2 border-red-400/60'
                        : 'bg-black/20 border-2 border-blue-400/60'
                    }
                  `}>
                    
                    {/* Character Portrait - 2:3 Rectangle (20% bigger) */}
                    <div className={`
                      rounded transition-all duration-300 flex items-center justify-center text-white font-bold shadow-md overflow-hidden w-[calc(38px*var(--ui-scale))] h-[calc(58px*var(--ui-scale))] text-[calc(14px*var(--ui-scale))]
                      ${getBackgroundColor(character.name)}
                    `}>
                      {/* Placeholder for future avatar image */}
                      <div className="w-full h-full bg-black/20 flex items-center justify-center text-white/50 text-[calc(10px*var(--ui-scale))]">
                        IMG
                      </div>
                    </div>
                  </div>

                  {/* Active Turn Glow Effect - Reduced spread */}
                  {character.active && (
                    <div 
                      className="absolute inset-0 rounded pointer-events-none animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.8),0_0_16px_rgba(74,222,128,0.4)]"
                    ></div>
                  )}

                  {/* Name Tooltip - Appears on hover */}
                  <div className="absolute -bottom-12 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-30">
                    <div className="bg-black/90 text-white py-[calc(5px*var(--ui-scale))] px-[calc(10px*var(--ui-scale))] rounded whitespace-nowrap backdrop-blur-sm text-[calc(13px*var(--ui-scale))]">
                      {character.name}
                    </div>
                    {/* Tooltip Arrow */}
                    <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1 w-0 h-0 border-l-[calc(5px*var(--ui-scale))] border-r-[calc(5px*var(--ui-scale))] border-b-[calc(5px*var(--ui-scale))] border-transparent border-b-black/90"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Combat Status Indicators (Bottom Right) - Only show during combat */}
      {shouldRender && (
        <div 
          className={`absolute bottom-[calc(24px*var(--ui-scale))] right-[calc(24px*var(--ui-scale))] z-10 transition-all duration-300 ease-out delay-100 ${
            isVisible 
              ? 'transform translate-x-0 opacity-100' 
              : 'transform translate-x-full opacity-0'
          }`}
        >
          <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-lg shadow-xl p-[calc(16px*var(--ui-scale))]">
            <div className="text-emerald-400 font-semibold text-[calc(14px*var(--ui-scale))] mb-[calc(8px*var(--ui-scale))]">Combat Active</div>
            <div className="flex items-center text-white/70 gap-[calc(12px*var(--ui-scale))] text-[calc(12px*var(--ui-scale))]">
              <div className="flex items-center gap-[calc(4px*var(--ui-scale))]">
                <div className="bg-emerald-400 rounded-full animate-pulse w-[calc(8px*var(--ui-scale))] h-[calc(8px*var(--ui-scale))]"></div>
                <span>Turn 1</span>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}