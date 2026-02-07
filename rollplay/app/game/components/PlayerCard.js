import { React, useEffect, useState, useRef } from 'react'
import { getSeatColor } from '../../utils/seatColors'
import ColorPicker from './ColorPicker'

export default function PlayerCard({
    seatId,
    seats,
    thisPlayer,
    isSitting,
    currentTurn = null,
    onDiceRoll = null,
    playerData = null,
    onColorChange = null,
    currentColor = null,
  }) {


    useEffect(() => {
      console.log(`Seat ${seatId} updated:`, seats[seatId]);
    }, [seats[seatId]]);

    const currentSeat = seats[seatId];
    const isOccupied = currentSeat.playerName !== "empty";
    const occupantName = currentSeat.playerName;
    const isMyTurn = currentTurn === occupantName;
    const isThisPlayerSeat = currentSeat.playerName === thisPlayer;

    // Get the actual seat color from CSS custom property
    const getActualSeatColor = (seatIndex) => {
      if (typeof window !== 'undefined') {
        const style = getComputedStyle(document.documentElement);
        const cssColor = style.getPropertyValue(`--seat-color-${seatIndex}`).trim();
        if (cssColor) {
          return cssColor;
        }
      }
      // Fallback to default color mapping if CSS variable not set
      const colorMap = {
        'blue': '#3b82f6',
        'red': '#ef4444',
        'green': '#22c55e',
        'orange': '#f97316',
        'purple': '#a855f7',
        'cyan': '#06b6d4',
        'pink': '#ec4899',
        'lime': '#65a30d'
      };
      return colorMap[getSeatColor(seatIndex)] || '#3b82f6';
    };

    // Helper function to display player names in title case
    const toTitleCase = (name) => {
      if (!name || name === "empty") return name;
      return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    };

    // Calculate HP percentage for styling
    const hpPercentage = playerData ? (playerData.hp / playerData.maxHp) * 100 : 0;

    // Render empty seat (static placeholder — seats are auto-assigned via Enter Session overlay)
    if (!isOccupied) {
      return (
        <div className="rounded-lg border border-dashed border-gray-500/30 bg-white/5 text-center
          p-[calc(12px*var(--ui-scale))] mb-[calc(12px*var(--ui-scale))]">
          <div className="text-gray-500 font-medium text-[calc(12px*var(--ui-scale))]">
            🪑 Seat {seatId + 1}
          </div>
        </div>
      );
    }

    // Render occupied seat
    return (
      <div
        className={`
          rounded-lg border transition-all duration-300 relative p-[calc(8px*var(--ui-scale))] mb-[calc(8px*var(--ui-scale))] border-l-4
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
            {isThisPlayerSeat && onColorChange && (
              <div className="relative">
                <ColorPicker
                  currentColor={getActualSeatColor(seatId)}
                  onColorChange={onColorChange}
                  playerName={occupantName}
                  seatIndex={seatId}
                />
              </div>
            )}
          </div>
        </div>

        {playerData ? (
          <>
            {/* Character Class & Level */}
            <div
              className="text-gray-400 text-[calc(13px*var(--ui-scale))] mb-[calc(4px*var(--ui-scale))]"
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
      </div>
    );
  }
