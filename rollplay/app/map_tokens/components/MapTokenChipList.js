/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import React from 'react';

import { getSeatColorHex } from '../../utils/seatColors';
import MapTokenChip from './MapTokenChip';

/**
 * MapTokenChipList — the party drawer's "Map tokens" section (plan §3.6).
 *
 * One chip per seated character: unplaced chips drag onto the map to
 * place; placed chips carry the "return" CTA that takes the token back
 * off the board. Memoized so drawer re-renders skip it while seats/tokens
 * are unchanged.
 */
function MapTokenChipList({
  gameSeats = [],
  tokens = [],
  seatColorByIndex = {},
  beginCarry,
  cancelCarry,
  dropCarriedToken,
  removeToken,
}) {
  const chipSeats = gameSeats.filter(seat =>
    seat.userId !== 'empty' && seat.characterData?.character_id);
  if (!chipSeats.length) return null;

  return (
    <div className="mb-2">
      <div className="text-[10px] uppercase tracking-wide text-gray-500 px-1 mb-1">
        Map tokens
      </div>
      <div className="space-y-1">
        {chipSeats.map(seat => {
          const characterName = seat.characterData.character_name || seat.playerName || 'Adventurer';
          const placedToken = tokens.find(token =>
            token.kind === 'pc' && token.owner_user_id === seat.userId);
          return (
            <MapTokenChip
              key={seat.userId}
              token={{
                kind: 'pc',
                owner_user_id: seat.userId,
                character_id: seat.characterData.character_id,
                label: characterName,
                footprint: 1,
              }}
              name={characterName}
              color={seatColorByIndex[seat.seatId] || getSeatColorHex(seat.seatId)}
              placed={!!placedToken}
              onReturn={placedToken ? () => removeToken(placedToken.id) : null}
              beginCarry={beginCarry}
              cancelCarry={cancelCarry}
              dropCarriedToken={dropCarriedToken}
            />
          );
        })}
      </div>
    </div>
  );
}

export default React.memo(MapTokenChipList);
