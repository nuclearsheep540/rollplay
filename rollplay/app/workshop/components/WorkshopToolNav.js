/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMap, faMusic, faShieldHalved, faClapperboard } from '@fortawesome/free-solid-svg-icons';

const TOOLS = [
  {
    id: 'maps',
    label: 'Map Config',
    description: 'Grid overlays and alignment',
    icon: faMap,
    enabled: true,
  },
  {
    id: 'audio',
    label: 'Audio Workstation',
    description: 'Loop points, BPM, and waveforms',
    icon: faMusic,
    enabled: false,
  },
  {
    id: 'npcs',
    label: 'NPC Barracks',
    description: 'Stat blocks and portraits',
    icon: faShieldHalved,
    enabled: false,
  },
  {
    id: 'scenes',
    label: 'Scene Builder',
    description: 'Pre-built encounter layouts',
    icon: faClapperboard,
    enabled: false,
  },
];

export default function WorkshopToolNav({ activeTool, onToolChange }) {
  return (
    <div className="grid grid-cols-4 gap-4 mb-8">
      {TOOLS.map((tool) => {
        const isActive = activeTool === tool.id;
        const isDisabled = !tool.enabled;

        return (
          <button
            key={tool.id}
            onClick={() => !isDisabled && onToolChange(tool.id)}
            disabled={isDisabled}
            className={`relative flex flex-col items-center gap-3 px-4 py-6 rounded-sm border transition-all ${
              isActive
                ? 'bg-surface-secondary border-border-active'
                : isDisabled
                  ? 'bg-transparent border-border/30 cursor-not-allowed opacity-40'
                  : 'bg-transparent border-border hover:border-border-active hover:bg-surface-elevated'
            }`}
          >
            <FontAwesomeIcon
              icon={tool.icon}
              className={`text-2xl ${isActive ? 'text-content-on-dark' : 'text-content-secondary'}`}
            />
            <div className="text-center">
              <div className={`text-sm font-semibold ${isActive ? 'text-content-on-dark' : 'text-content-secondary'}`}>
                {tool.label}
              </div>
              <div className="text-xs text-content-secondary/60 mt-1">
                {tool.description}
              </div>
            </div>
            {isDisabled && (
              <span className="absolute top-2 right-2 text-[10px] font-medium text-content-secondary/50 uppercase tracking-wider">
                Soon
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
