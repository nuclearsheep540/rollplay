/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React from 'react'

export default function DMChair({ dmName, isEmpty }) {
  
  // Helper function to capitalize names
  const toTitleCase = (str) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  };

  // Render empty DM chair
  if (isEmpty || !dmName) {
    return (
      <div 
        className={`
          rounded-lg border border-dashed text-center transition-all duration-300
          p-[calc(12px*var(--ui-scale))] mb-[calc(12px*var(--ui-scale))]
          bg-rose-500/5 border-rose-500/30 opacity-60
        `}
      >
        <div 
          className="text-rose-400 font-medium text-[calc(12px*var(--ui-scale))]"
        >
          👑 Dungeon Master - No DM Assigned
        </div>
      </div>
    );
  }

  // Render occupied DM chair
  return (
    <div 
      className={`
        rounded-lg border transition-all duration-300 relative p-[calc(12px*var(--ui-scale))] mb-[calc(12px*var(--ui-scale))] border-l-4
        bg-rose-500/10 border-rose-500/30 shadow-lg shadow-rose-500/20
      `}
      style={{
        borderLeftColor: '#ef4444' // Rose-500 equivalent for DM
      }}
    >
      {/* DM Header */}
      <div 
        className="flex items-center justify-between mb-[calc(4px*var(--ui-scale))]"
      >
        <div 
          className="font-semibold text-rose-400 text-[calc(16px*var(--ui-scale))]"
        >
          {toTitleCase(dmName)}
        </div>
        <div 
          className="bg-rose-500/20 text-rose-400 px-[calc(6px*var(--ui-scale))] py-[calc(2px*var(--ui-scale))] rounded-full font-semibold uppercase tracking-wider text-[calc(9px*var(--ui-scale))]"
        >
          DM
        </div>
      </div>
      
      {/* DM Role Description */}
      <div 
        className="text-rose-300 text-[calc(12px*var(--ui-scale))] opacity-80"
      >
        Dungeon Master
      </div>
    </div>
  );
}