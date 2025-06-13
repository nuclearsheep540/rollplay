import { React, useEffect, useState, useRef } from 'react'
import { getSeatColor } from '../utils/seatColors'
import ColorPicker from './ColorPicker'

export default function PlayerCard({
    seatId, 
    seats,
    thisPlayer, 
    isSitting, 
    sendSeatChange,
    currentTurn = null,
    onDiceRoll = null,
    playerData = null,
    onColorChange = null,
    currentColor = null
  }) {
  
  
    useEffect(() => {
      console.log(`Seat ${seatId} updated:`, seats[seatId]);
    }, [seats[seatId]]);
  
    const currentSeat = seats[seatId];
    const isOccupied = currentSeat.playerName !== "empty";
    const occupantName = currentSeat.playerName;
    const isMyTurn = currentTurn === occupantName;
    const isThisPlayerSeat = currentSeat.playerName === thisPlayer;
    
    // Check if player is already sitting somewhere
    const playerAlreadySeated = seats.some(seat => seat.playerName === thisPlayer);
  
    // Helper function to display player names in title case
    const toTitleCase = (name) => {
      if (!name || name === "empty") return name;
      return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    };


    function sitSeat() {
      // Only allow sitting if seat is empty AND player isn't already seated
      if (!isOccupied && !playerAlreadySeated) {
        const newSeats = [...seats];
        
        // Sit in the new seat
        newSeats[seatId] = {
          ...newSeats[seatId],
          playerName: thisPlayer,
          characterData: getCharacterData(thisPlayer),
          isActive: false
        };
        
        sendSeatChange(newSeats);
      }
    }
  
    function leaveSeat() {
      if (isThisPlayerSeat) {
        const newSeats = [...seats];
        newSeats[seatId] = {
          ...newSeats[seatId],
          playerName: "empty",
          characterData: null,
          isActive: false
        };
        
        sendSeatChange(newSeats);
      }
    }
  
    function getCharacterData(playerName) {
      const characterDatabase = {
        'Thorin': { class: 'Dwarf Fighter', level: 3, hp: 34, maxHp: 40, statusEffects: ['Blessed', 'Shield'] },
        'Elara': { class: 'Elf Wizard', level: 3, hp: 18, maxHp: 30, statusEffects: ['Mage Armor'] },
        'Finn': { class: 'Halfling Rogue', level: 2, hp: 23, maxHp: 24, statusEffects: [] },
        'Sister Meredith': { class: 'Human Cleric', level: 3, hp: 12, maxHp: 30, statusEffects: ['Concentrating'] }
      };
      
      return characterDatabase[playerName] || {
        class: 'Adventurer',
        level: 1,
        hp: 10,
        maxHp: 10,
        statusEffects: []
      };
    }
  
    // Calculate HP percentage for styling
    const hpPercentage = playerData ? (playerData.hp / playerData.maxHp) * 100 : 0;
    
    // Render empty seat
    if (!isOccupied) {
      return (
        <div 
          className={`
            rounded-lg border border-dashed text-center cursor-pointer transition-all duration-300
            p-[calc(12px*var(--ui-scale))] mb-[calc(12px*var(--ui-scale))]
            ${playerAlreadySeated 
              ? 'bg-emerald-500/5 border-gray-500/30 opacity-50 cursor-not-allowed' 
              : 'bg-emerald-500/5 border-emerald-500/30 hover:bg-emerald-500/10 hover:border-emerald-500/50'
            }
          `}
          onClick={playerAlreadySeated ? null : sitSeat}
        >
          <div 
            className="text-emerald-400 font-medium text-[calc(12px*var(--ui-scale))]"
          >
            {playerAlreadySeated 
              ? `🪑 Seat ${seatId + 1} - Leave current seat first`
              : `🪑 Seat ${seatId + 1} - Click to Join`
            }
          </div>
        </div>
      );
    }
  
    // Render occupied seat
    return (
      <div 
        className={`
          rounded-lg border transition-all duration-300 relative p-[calc(12px*var(--ui-scale))] mb-[calc(12px*var(--ui-scale))] border-l-4
          ${isMyTurn 
            ? 'bg-emerald-500/10 border-emerald-500/30 shadow-lg shadow-emerald-500/20' 
            : isThisPlayerSeat 
              ? 'bg-blue-500/10 border-blue-500/30' 
              : 'bg-white/5 border-white/10'
          }
        `}
        style={{
          borderLeftColor: `var(--seat-color-${seatId})`
        }}
      >
        {/* Turn Pulse Animation */}
        {isMyTurn && (
          <div className="absolute inset-0 rounded-lg border-2 border-emerald-400/50 animate-pulse pointer-events-none"></div>
        )}
        
        {/* Member Header */}
        <div 
          className="flex items-center justify-between mb-[calc(4px*var(--ui-scale))]"
        >
          <div 
            className="font-semibold text-blue-400 text-[calc(16px*var(--ui-scale))]"
          >
            {toTitleCase(occupantName)}
          </div>
          <div className="flex items-center gap-[calc(8px*var(--ui-scale))]">
            {isMyTurn && (
              <div 
                className="bg-emerald-500/20 text-emerald-400 px-[calc(6px*var(--ui-scale))] py-[calc(2px*var(--ui-scale))] rounded-full font-semibold uppercase tracking-wider text-[calc(9px*var(--ui-scale))]"
              >
                🎯 Active
              </div>
            )}
            
            {/* Color Picker - Only show for the player's own seat */}
            {isThisPlayerSeat && onColorChange && currentColor && (
              <div className="relative">
                <ColorPicker
                  currentColor={currentColor}
                  onColorChange={onColorChange}
                  playerName={occupantName}
                  seatIndex={seatId}
                />
              </div>
            )}
            
            {/* Exit Button - Repositioned to header */}
            {isThisPlayerSeat && (
              <button 
                className="bg-transparent border border-red-500/40 text-red-400 rounded transition-all duration-200 hover:bg-red-500/10 hover:border-red-500 flex items-center justify-center p-[calc(4px*var(--ui-scale))] w-[calc(24px*var(--ui-scale))] h-[calc(24px*var(--ui-scale))] text-[calc(10px*var(--ui-scale))]"
                onClick={leaveSeat}
                title="Leave Seat"
              >
                ✕
              </button>
            )}
          </div>
        </div>
        
        {playerData ? (
          <>
            {/* Character Class & Level */}
            <div 
              className="text-gray-400 text-[calc(13px*var(--ui-scale))] mb-[calc(10px*var(--ui-scale))]"
            >
              {playerData.class} • Level {playerData.level}
            </div>
            
            {/* HP Display */}
            <div 
              className="flex items-center gap-[calc(10px*var(--ui-scale))] mb-[calc(6px*var(--ui-scale))]"
            >
              {/* HP Bar Container */}
              <div 
                className="flex-1 bg-white/10 rounded-full overflow-hidden relative h-[calc(6px*var(--ui-scale))]"
                style={{
                  background: 'linear-gradient(90deg, #ef4444 0%, #ef4444 30%, #eab308 30%, #eab308 60%, #22c55e 60%, #22c55e 100%)',
                }}
              >
                {/* HP Fill Overlay */}
                <div 
                  className="absolute inset-0 bg-gray-800/80 transition-all duration-300"
                  style={{ 
                    left: `${hpPercentage}%`,
                  }}
                ></div>
              </div>
              
              {/* HP Text */}
              <div 
                className="text-gray-300 font-mono flex items-baseline text-[calc(14px*var(--ui-scale))] min-w-[calc(50px*var(--ui-scale))]"
              >
                <span 
                  className="text-white text-[calc(13px*var(--ui-scale))]"
                >
                  {playerData.hp}
                </span>
                <span className="mx-1">/</span>
                <span 
                  className="font-semibold text-[calc(15px*var(--ui-scale))]"
                >
                  {playerData.maxHp}
                </span>
              </div>
            </div>

            {/* Status Effects - Closer to HP */}
            <div 
              className="flex flex-wrap items-center gap-[calc(4px*var(--ui-scale))] mb-[calc(8px*var(--ui-scale))]"
            >
              {playerData.statusEffects && playerData.statusEffects.length > 0 ? (
                playerData.statusEffects.slice(0, 3).map((status, index) => (
                  <div
                    key={index}
                    className="bg-purple-500/20 border border-purple-400/60 text-purple-300 rounded-full px-[calc(6px*var(--ui-scale))] py-[calc(2px*var(--ui-scale))] font-medium text-[calc(9px*var(--ui-scale))]"
                  >
                    {status}
                  </div>
                ))
              ) : (
                <div
                  className="bg-gray-600/20 border border-gray-500/40 text-gray-400 rounded-full px-[calc(6px*var(--ui-scale))] py-[calc(2px*var(--ui-scale))] font-medium text-[calc(9px*var(--ui-scale))]"
                >
                  No Status Effects
                </div>
              )}
            </div>
          </>
        ) : (
          <div 
            className="text-gray-400 text-[calc(13px*var(--ui-scale))] mb-[calc(10px*var(--ui-scale))]"
          >
            Player • Seat {seatId + 1}
          </div>
        )}

        {/* Removed separate seat actions section - exit button now in header */}
      </div>
    );
  }