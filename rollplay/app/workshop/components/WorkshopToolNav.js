/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMap, faImage, faMusic, faShieldHalved, faClapperboard } from '@fortawesome/free-solid-svg-icons';

const TOOLS = [
  {
    id: 'maps',
    label: 'Map Config',
    description: 'Grid overlays, fog of war, and alignment',
    icon: faMap,
    image: '/ui/map_config.webp',
    enabled: true,
  },
  {
    id: 'images',
    label: 'Image Config',
    description: 'Display modes and cinematic effects',
    icon: faImage,
    image: '/ui/image_workshop.webp',
    enabled: true,
  },
  {
    id: 'audio',
    label: 'Audio Workstation',
    description: 'Loop points, BPM, presets, and waveforms',
    icon: faMusic,
    image: '/ui/audio_workshop.webp',
    enabled: true,
  },
  {
    id: 'npcs',
    label: 'NPC Barracks',
    description: 'Stat blocks and portraits',
    icon: faShieldHalved,
    image: '/ui/npc_barracks.webp',
    enabled: false,
  },
  {
    id: 'scenes',
    label: 'Scene Builder',
    description: 'Pre-built encounter layouts',
    icon: faClapperboard,
    image: '/ui/scene_builder.webp',
    enabled: false,
  },
];

// Wedge geometry: a parallelogram revealing the image on the right side
// of the tile. Points are (top-left, top-right, bottom-right, bottom-left).
// Horizontal offset between top and bottom gives the slant — at a tile
// height of 150 px and width 700 px, a 15 % offset (105 px) resolves to
// roughly 35° from vertical (atan(105/150) ≈ 35°). Shift both
// percentages left/right together to reveal more/less of the image
// without changing the angle.
const WEDGE_CLIP = 'polygon(57% 0, 100% 0, 100% 100%, 43% 100%)';
// Inner shadow cast by the diagonal edge onto the image. Angle 125°
// is perpendicular to the 35° diagonal, so all points on the diagonal
// project to the same percentage of the gradient axis (50% — the tile
// centre). Anything before 50% falls in the tile-content area and is
// clipped away by WEDGE_CLIP, so we anchor the shadow at 50% and fade
// it out over the first ~12% of image territory. The result is a dark
// edge that hugs the diagonal, not a floating band mid-image.
const WEDGE_INNER_SHADOW = 'linear-gradient(125deg, rgba(0, 0, 0, 0.55) 50%, transparent 62%)';

export default function WorkshopToolNav({ activeTool, onToolChange }) {
  return (
    // Responsive grid: each column capped at 700 px; auto-fit decides
    // how many columns fit. Container max-width is 2 × 700 + 12 px gap,
    // so at most 2 columns render even on very wide screens. `min(100%,
    // 700px)` as the track minimum prevents horizontal overflow on
    // containers narrower than 700 px.
    <div
      className="grid gap-3 mb-8 mx-auto justify-center"
      style={{
        maxWidth: '1412px',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 700px), 700px))',
      }}
    >
      {TOOLS.map((tool) => {
        const isActive = activeTool === tool.id;
        const isDisabled = !tool.enabled;

        return (
          <button
            key={tool.id}
            onClick={() => !isDisabled && onToolChange(tool.id)}
            disabled={isDisabled}
            className={`group relative flex items-center gap-6 px-6 py-10 min-h-[150px] rounded border-2 overflow-hidden transition-all duration-200 ease-out ${
              isDisabled
                ? 'bg-surface-secondary/40 border-border/10 cursor-not-allowed'
                : isActive
                  ? 'bg-surface-secondary border-border-active shadow-lg scale-[1.01]'
                  : 'bg-surface-secondary border-border/60 hover:border-border-active hover:shadow-lg hover:scale-[1.02]'
            }`}
          >
            {/* Wedge-clipped image layer — one element doing the lot:
                the `background` property stacks the inner-shadow
                gradient over the asset, `clip-path` reveals the right
                portion at 35°, and filters handle the disabled look.
                No extra DOM needed. */}
            <div
              className="absolute inset-0 pointer-events-none bg-cover bg-center"
              style={{
                clipPath: WEDGE_CLIP,
                backgroundImage: `${WEDGE_INNER_SHADOW}, url(${tool.image})`,
                filter: isDisabled ? 'grayscale(1) brightness(0.4)' : undefined,
              }}
            />

            {/* Content layer — icon + text on the left, above the image. */}
            <FontAwesomeIcon
              icon={tool.icon}
              className={`relative z-10 text-4xl w-12 ${
                isDisabled
                  ? 'text-content-secondary/30'
                  : isActive
                    ? 'text-content-on-dark'
                    : 'text-content-secondary group-hover:text-content-on-dark'
              }`}
            />
            <div className="relative z-10 text-left">
              <div className={`text-base font-semibold ${
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
              <span className="absolute top-2.5 right-3 z-10 text-[10px] font-medium text-content-secondary/40 uppercase tracking-wider">
                Soon
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
