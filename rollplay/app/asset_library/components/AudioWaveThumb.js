/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import React, { useMemo } from 'react'
import { ASSET_TYPE_COLORS } from '@/app/styles/colorTheme'

/**
 * Decorative pseudo-waveform for audio asset thumbnails.
 *
 * Bars are seeded deterministically from the asset id so a track keeps
 * the same "waveform" across renders and sessions - no audio analysis,
 * no backend. Music reads as a rolling wave; SFX as sparse spikes.
 */

function hashString(value) {
  let hash = 9
  for (const char of value) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 387420489)
  }
  return hash >>> 0
}

function buildBars(seed, assetType, barCount) {
  const bars = []
  let state = hashString(seed)
  for (let index = 0; index < barCount; index++) {
    state = Math.imul(state ^ (index + 7), 2654435761) >>> 0
    if (assetType === 'sfx') {
      // Sparse spikes over a low floor
      bars.push(index % 5 === 2 ? 25 + (state % 65) : 8 + (state % 20))
    } else {
      bars.push(20 + (state % 62))
    }
  }
  return bars
}

export default function AudioWaveThumb({ asset, barCount = 32 }) {
  const bars = useMemo(
    () => buildBars(String(asset.id), asset.asset_type, barCount),
    [asset.id, asset.asset_type, barCount]
  )
  const color = ASSET_TYPE_COLORS[asset.asset_type] || ASSET_TYPE_COLORS.music

  return (
    <div className="flex h-full w-full items-center gap-[2px] bg-surface-elevated px-4 py-5" aria-hidden="true">
      {bars.map((height, index) => (
        <div
          key={index}
          className="flex-1 rounded-[1px]"
          style={{ height: `${height}%`, backgroundColor: color, opacity: 0.75 }}
        />
      ))}
    </div>
  )
}
