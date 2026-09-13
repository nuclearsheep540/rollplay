import { React, useEffect, useState, useRef } from 'react'
import { getSeatColor } from '../../utils/seatColors'
import { resolveName } from '../resolveDisplayName'
import ColorPicker from './ColorPicker'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGamepad } from '@fortawesome/free-solid-svg-icons'
import { flatComponents, pieceFor } from '@/app/characters/components/registry'

// What a seat card shows of a character: hit points only, in v1. The sheet is where the
// rest lives; the card is read at a glance.
const SEAT_CARD_TYPES = ['hit_points']

export default function PlayerCard({
    seatId,
    seats,
    thisUserId,
    isSitting,
    currentTurn = null,
    onDiceRoll = null,
    playerData = null,
    configuration = null,
    onColorChange = null,
    currentColor = null,
    usedColors = [],
  }) {


    useEffect(() => {
      console.log(`Seat ${seatId} updated:`, seats[seatId]);
    }, [seats[seatId]]);

    const currentSeat = seats[seatId];
    const isOccupied = currentSeat.userId && currentSeat.userId !== "empty";
    const occupantName = currentSeat.playerName;
    const isMyTurn = currentTurn === currentSeat.userId;
    const isThisPlayerSeat = currentSeat.userId === thisUserId;

    // The seat's title is the character's display name (the room's word), else the
    // screen name. Under it: the hit-points components the config declares, in config
    // order, each rendered by its type's SeatCompact — and only those the room let this
    // viewer see (a secret value is absent, and absent renders nothing).
    const displayCharacterName = resolveName(playerData?.display_name, occupantName);
    const seatComponents = configuration
      ? flatComponents(configuration.components).filter(
          (entry) => SEAT_CARD_TYPES.includes(entry.type) && playerData?.values?.[entry.id],
        )
      : [];

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

    // Render empty seat (static placeholder — seats are auto-assigned via Enter Session overlay)
    if (!isOccupied) {
      return (
        <div className="rounded-lg border border-dashed border-gray-500/30 bg-white/5 text-center
          p-[calc(12px*var(--ui-scale))] mb-[calc(12px*var(--ui-scale))]">
          <div className="text-gray-500 font-medium text-[calc(12px*var(--ui-scale))]">
            <FontAwesomeIcon icon={faGamepad} style={{ marginRight: '6px' }} />Seat {seatId + 1}
          </div>
        </div>
      );
    }

    // Render occupied seat
    return (
      <div
        className={`
          rounded-lg border transition-colors duration-300 relative p-[calc(8px*var(--ui-scale))] mb-[calc(8px*var(--ui-scale))] border-l-4
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
            {toTitleCase(displayCharacterName)}
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
                  userId={currentSeat.userId}
                  playerName={occupantName}
                  usedColors={usedColors}
                />
              </div>
            )}
          </div>
        </div>

        {playerData?.character_id ? (
          <div className="flex flex-col gap-[calc(4px*var(--ui-scale))] mb-[calc(6px*var(--ui-scale))]">
            {seatComponents.map((entry) => {
              const SeatCompact = pieceFor(entry.type, 'SeatCompact');
              return <SeatCompact key={entry.id} configuration={entry} value={playerData.values[entry.id]} />;
            })}
          </div>
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
