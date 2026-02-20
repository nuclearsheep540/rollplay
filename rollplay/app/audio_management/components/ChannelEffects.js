/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React from 'react';

const EFFECT_TYPES = [
  { key: 'hpf', label: 'HPF', title: 'High-Pass Filter (removes low-end rumble)' },
  { key: 'lpf', label: 'LPF', title: 'Low-Pass Filter (muffled / distant sound)' },
  { key: 'reverb', label: 'RVB', title: 'Reverb (room ambiance)' },
];

export default function ChannelEffects({ trackId, effects, onToggleEffect, disabled }) {
  return (
    <div className="flex gap-1 pl-7 mb-1">
      {EFFECT_TYPES.map(({ key, label, title }) => {
        const isEnabled = effects?.[key]?.enabled || false;
        return (
          <button
            key={key}
            onClick={() => onToggleEffect(trackId, key)}
            disabled={disabled}
            title={title}
            className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors border ${
              isEnabled
                ? 'bg-rose-600 text-white border-rose-500 hover:bg-rose-700'
                : 'bg-gray-700 text-gray-400 border-gray-600 hover:bg-gray-600'
            } ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
