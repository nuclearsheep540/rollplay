/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock } from '@fortawesome/free-solid-svg-icons';

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
const SNAP_BACK_MS = 200;

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
  // Refused drop: the ghost animates home to the chip instead of vanishing,
  // so a failed placement is visible (the hook's console.debug names why).
  const [snappingBack, setSnappingBack] = useState(false);
  const carryingRef = useRef(false);
  const snapBackTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (snapBackTimeoutRef.current) clearTimeout(snapBackTimeoutRef.current);
    };
  }, []);

  const handlePointerDown = useCallback((event) => {
    if (placed || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    // A fresh grab interrupts any snap-back in flight — the new ghost must
    // track the pointer without the homeward transition.
    if (snapBackTimeoutRef.current) {
      clearTimeout(snapBackTimeoutRef.current);
      snapBackTimeoutRef.current = null;
    }
    setSnappingBack(false);
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

    const dropPlaced = dropCarriedToken(event.clientX, event.clientY);
    if (dropPlaced) {
      setGhostPosition(null);
      return;
    }

    // Refused: fly the ghost home to the chip, then clear it.
    const chipRect = event.currentTarget.getBoundingClientRect();
    setSnappingBack(true);
    setGhostPosition({
      x: chipRect.left + chipRect.width / 2,
      y: chipRect.top + chipRect.height / 2,
    });
    snapBackTimeoutRef.current = setTimeout(() => {
      setGhostPosition(null);
      setSnappingBack(false);
    }, SNAP_BACK_MS);
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
            ? 'border-white/10'
            : 'cursor-grab border-white/20 text-gray-200 hover:bg-white/10'
        }`}
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        title={placed ? `${name} is on the map` : `Drag ${name} onto the map`}
      >
        {/* Placed chips dim the disc + name (the token lives on the board
            now) — but never the whole container, or the return CTA reads
            as disabled. */}
        <span
          className={`inline-block w-4 h-4 rounded-full border border-black/50 shrink-0${placed ? ' opacity-60' : ''}`}
          style={{ backgroundColor: color }}
        />
        <span className={placed ? 'truncate text-gray-400' : 'truncate'}>{name}</span>
        {placed ? (
          onReturn ? (
            <button
              onClick={onReturn}
              className="ml-auto text-[10px] uppercase tracking-wide text-gray-200 border border-white/30 rounded px-1.5 py-0.5 hover:bg-white/10 hover:text-white"
              title={`Return ${name}'s token from the map`}
            >
              ↩ return
            </button>
          ) : (
            // Locked tokens can't be returned (decision 18) — the padlock
            // beside this chip is the unlock.
            <span className="ml-auto text-[10px] text-gray-300" title="Locked — unlock to return">
              <FontAwesomeIcon icon={faLock} />
            </span>
          )
        ) : (
          <span className="ml-auto text-[10px] uppercase tracking-wide text-gray-300">drag</span>
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
            opacity: snappingBack ? 0.35 : 0.65,
            pointerEvents: 'none',
            zIndex: 9999,
            transition: snappingBack
              ? `left ${SNAP_BACK_MS}ms ease-in, top ${SNAP_BACK_MS}ms ease-in, opacity ${SNAP_BACK_MS}ms ease-in`
              : 'none',
          }}
        />,
        document.body
      )}
    </>
  );
}
