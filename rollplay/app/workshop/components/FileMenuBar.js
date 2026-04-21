/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

/**
 * Shared menu bar for the Audio Workstation tabs. Each tab passes its own
 * `items` array — the visual chrome stays identical across tabs so the
 * menu feels like a property of the workstation, not the individual tab.
 *
 * items: [{ label, icon, onClick, disabled? }]
 */
export default function FileMenuBar({ items = [] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);

  return (
    <div
      className="flex items-center gap-0 border-b border-border text-xs select-none flex-shrink-0"
      style={{ backgroundColor: '#B5ADA6', color: '#0B0A09' }}
    >
      <div className="relative">
        <button
          onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
          className={`px-4 py-2 font-medium transition-colors ${
            open ? 'opacity-70' : 'hover:opacity-70'
          }`}
          style={{ color: '#0B0A09' }}
        >
          File
        </button>
        {open && items.length > 0 && (
          <div
            className="absolute top-full left-0 z-50 min-w-[200px] py-1 border border-border shadow-lg"
            style={{ backgroundColor: '#B5ADA6', color: '#0B0A09' }}
          >
            {items.map((item, i) => (
              <button
                key={i}
                onClick={() => { setOpen(false); item.onClick?.(); }}
                disabled={item.disabled}
                className="w-full flex items-center gap-3 px-4 py-2 text-xs hover:bg-surface-secondary hover:text-content-on-dark transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ color: '#0B0A09' }}
              >
                {item.icon && <FontAwesomeIcon icon={item.icon} className="text-[10px] w-3" />}
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
