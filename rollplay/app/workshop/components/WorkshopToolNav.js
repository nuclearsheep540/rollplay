/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMap, faImage, faMusic, faShieldHalved, faClapperboard } from '@fortawesome/free-solid-svg-icons';

const TOOLS = [
  {
    id: 'maps',
    label: 'Map Config',
    description: 'Grid overlays and alignment',
    icon: faMap,
    enabled: true,
  },
  {
    id: 'images',
    label: 'Image Config',
    description: 'Display modes and cinematic effects',
    icon: faImage,
    enabled: true,
  },
  {
    id: 'audio',
    label: 'Audio Workstation',
    description: 'Loop points, BPM, and waveforms',
    icon: faMusic,
    enabled: true,
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
    <div className="grid grid-cols-4 gap-5 mb-8">
      {TOOLS.map((tool) => {
        const isActive = activeTool === tool.id;
        const isDisabled = !tool.enabled;

        return (
          <button
            key={tool.id}
            onClick={() => !isDisabled && onToolChange(tool.id)}
            disabled={isDisabled}
            className={`relative flex flex-col items-center gap-4 px-5 py-8 rounded border-2 transition-all ${
              isDisabled
                ? 'bg-surface-secondary/40 border-border/10 cursor-not-allowed'
                : isActive
                  ? 'bg-surface-secondary border-border-active shadow-lg'
                  : 'bg-surface-secondary border-border/60 hover:border-border-active hover:shadow-lg'
            }`}
          >
            <FontAwesomeIcon
              icon={tool.icon}
              className={`text-3xl ${
                isDisabled
                  ? 'text-content-secondary/30'
                  : isActive
                    ? 'text-content-on-dark'
                    : 'text-content-secondary hover:text-content-on-dark'
              }`}
            />
            <div className="text-center">
              <div className={`text-sm font-semibold ${
                isDisabled
                  ? 'text-content-secondary/30'
                  : 'text-content-on-dark'
              }`}>
                {tool.label}
              </div>
              <div className={`text-xs mt-1 ${
                isDisabled
                  ? 'text-content-secondary/20'
                  : 'text-content-secondary'
              }`}>
                {tool.description}
              </div>
            </div>
            {isDisabled && (
              <span className="absolute top-2.5 right-3 text-[10px] font-medium text-content-secondary/40 uppercase tracking-wider">
                Soon
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
