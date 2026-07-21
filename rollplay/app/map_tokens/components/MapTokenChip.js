/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import React, { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * MapTokenChip — a token's home in a panel (party drawer for PCs, the DM's
 * creator section for NPC drafts). Unplaced: drag it out onto the map to
 * place (decision 14) — pointer capture keeps events on the chip, a
 * fixed-position ghost disc follows the pointer (portaled to <body> so
 * drawer transforms can't skew it), and the drop point goes through the
 * hook's dropCarriedToken. Placed: the chip persists and carries the
 * "return" CTA that takes the token back off the board (the removal path —
 * right-click on the disc lost to the OS context menu, 2026-07-21).
 */

const GHOST_DIAMETER_PX = 44;

export default function MapTokenChip({
  token,          // token payload sans position: { id, kind, owner_user_id, character_id, label, footprint }
  name,           // display name for the chip
  color,          // disc color (character color / DM-rose)
  placed = false, // on-map already — chip shows the "return" CTA instead of dragging
  onReturn = null, // called when the user clicks "return" on a placed chip
  beginCarry,
  cancelCarry,
  dropCarriedToken,
}) {
  const [ghostPosition, setGhostPosition] = useState(null); // {x, y} client px while carrying
  const carryingRef = useRef(false);

  const handlePointerDown = useCallback((event) => {
    if (placed || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    carryingRef.current = true;
    beginCarry(token);
    setGhostPosition({ x: event.clientX, y: event.clientY });
  }, [placed, token, beginCarry]);

  const handlePointerMove = useCallback((event) => {
    if (!carryingRef.current) return;
    setGhostPosition({ x: event.clientX, y: event.clientY });
  }, []);

  const handlePointerUp = useCallback((event) => {
    if (!carryingRef.current) return;
    carryingRef.current = false;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
    setGhostPosition(null);
    dropCarriedToken(event.clientX, event.clientY);
  }, [dropCarriedToken]);

  const handlePointerCancel = useCallback((event) => {
    if (!carryingRef.current) return;
    carryingRef.current = false;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
    setGhostPosition(null);
    cancelCarry();
  }, [cancelCarry]);

  return (
    <>
      <div
        className={`flex items-center gap-2 px-2 py-1 rounded border text-xs select-none ${
          placed
            ? 'opacity-50 border-white/10 text-gray-400'
            : 'cursor-grab border-white/20 text-gray-200 hover:bg-white/10'
        }`}
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        title={placed ? `${name} is on the map` : `Drag ${name} onto the map`}
      >
        <span
          className="inline-block w-4 h-4 rounded-full border border-black/50 shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="truncate">{name}</span>
        {placed ? (
          <button
            onClick={onReturn}
            className="ml-auto text-[10px] uppercase tracking-wide text-gray-300 border border-white/25 rounded px-1.5 py-0.5 hover:bg-white/10 hover:text-white"
            title={`Return ${name}'s token from the map`}
          >
            ↩ return
          </button>
        ) : (
          <span className="ml-auto text-[10px] uppercase tracking-wide text-gray-500">drag</span>
        )}
      </div>

      {ghostPosition && typeof document !== 'undefined' && createPortal(
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: ghostPosition.x,
            top: ghostPosition.y,
            width: GHOST_DIAMETER_PX,
            height: GHOST_DIAMETER_PX,
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            backgroundColor: color,
            border: '2px solid rgba(0, 0, 0, 0.55)',
            boxShadow: '0 6px 14px rgba(0, 0, 0, 0.55)',
            opacity: 0.65,
            pointerEvents: 'none',
            zIndex: 9999,
          }}
        />,
        document.body
      )}
    </>
  );
}
