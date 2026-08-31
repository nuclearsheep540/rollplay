/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { COLORS } from '@/app/styles/colorTheme'
import NewsImageBrowser from './NewsImageBrowser'

/**
 * The image store, as a rail beside the writing surface.
 *
 * Two ways to place an image, matching the two things images are for here:
 * click inserts at the cursor (in-content illustration), drag onto a banner
 * slot sets that banner (frame art). Drag uses pointer-agnostic HTML5 DnD —
 * desktop-first, as the app is.
 *
 * The rail sticks alongside the article rather than scrolling away with it:
 * choosing an image is something you do while writing, so it has to be
 * reachable wherever you are in the document. The grid scrolls within itself
 * once it outgrows four rows, so a large library never pushes the rail taller
 * than the screen and defeats the sticking.
 */
export default function NewsImageRail({ postId, onInsert }) {
  return (
    <aside
      className="news-image-rail w-[290px] flex-none rounded-[10px] p-[18px]"
      style={{ backgroundColor: COLORS.carbon, border: '1px solid #3A352F' }}
    >
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: COLORS.gold }}>
        Images
      </div>

      <NewsImageBrowser
        postId={postId}
        columns={2}
        draggable
        scrollWithin
        onSelect={(image) => onInsert?.(image.key)}
      />

      <p className="mt-4 text-[11.5px] leading-relaxed" style={{ color: COLORS.silver }}>
        Click to insert at the cursor, or drag onto a banner slot to set it.
      </p>
    </aside>
  )
}
