/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { COLORS } from '@/app/styles/colorTheme';

/**
 * Shared menu bar for the workshop tools. Callers pass their top-level
 * menus — e.g. File + Edit for the map config, File alone for the audio
 * tabs. The visual chrome stays identical across tools so the menu
 * feels like a property of the workshop, not the individual tool.
 *
 * menus: [{ label, items }]
 * items: [{ label, icon, onClick, disabled?, hint? }]
 *   hint - right-aligned shortcut text, e.g. '⌘Z'
 */
export default function FileMenuBar({ menus = [] }) {
  const [openIndex, setOpenIndex] = useState(null);

  useEffect(() => {
    if (openIndex === null) return;
    const close = () => setOpenIndex(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [openIndex]);

  return (
    <div
      className="flex items-center gap-0 border-b border-border text-xs select-none flex-shrink-0 text-content-bold"
      style={{ backgroundColor: COLORS.silver }}
    >
      {menus.map((menu, index) => (
        <div key={menu.label} className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setOpenIndex(openIndex === index ? null : index); }}
            // Desktop menu-bar behaviour: once any menu is open, sliding
            // across the bar switches menus without another click
            onMouseEnter={() => { if (openIndex !== null) setOpenIndex(index); }}
            className={`px-4 py-2 font-medium text-content-bold transition-colors ${
              openIndex === index ? 'opacity-70' : 'hover:opacity-70'
            }`}
          >
            {menu.label}
          </button>
          {openIndex === index && menu.items.length > 0 && (
            <div
              className="absolute top-full left-0 z-50 min-w-[200px] py-1 border border-border shadow-lg"
              style={{ backgroundColor: COLORS.silver }}
            >
              {menu.items.map((item, i) => (
                <button
                  key={i}
                  onClick={() => { setOpenIndex(null); item.onClick?.(); }}
                  disabled={item.disabled}
                  className="w-full flex items-center gap-3 px-4 py-2 text-xs text-content-bold hover:bg-surface-secondary hover:text-content-on-dark transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {item.icon && <FontAwesomeIcon icon={item.icon} className="text-[10px] w-3" />}
                  {item.label}
                  {item.hint && <span className="ml-auto pl-6 opacity-60">{item.hint}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
