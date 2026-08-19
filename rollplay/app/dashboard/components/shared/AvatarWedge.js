/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useAvatarImage } from '@/app/shared/hooks/useAvatarImage'

// Angled reveal of a character portrait on a card's right side, with a dark
// gradient perpendicular to the slope so the text on the left stays readable.
// Same visual language as the workshop tool cards.
const WEDGE_CLIP = 'polygon(33% 0, 100% 0, 100% 100%, 0 100%)'
const WEDGE_SCRIM = 'linear-gradient(105deg, rgba(0, 0, 0, 0.55) 15%, transparent 45%)'

/**
 * AvatarWedge — the right-side portrait wedge shared by the campaign drawer's
 * party cards and the character-selection modal's choice cards.
 *
 * Extracted because those two were byte-identical, comments included. The
 * other two avatar surfaces deliberately do NOT use this: the character strip
 * card is a parallelogram with a flat overlay and greyscale/zoom behaviour,
 * and CharacterAvatarPane is a full-pane forward-slash. They share the hook,
 * not the geometry — which is why useAvatarImage is the reusable unit and this
 * component only sits on top of it where the shape genuinely repeats.
 *
 * Purely decorative, hence aria-hidden: the character's name and meta are real
 * text elsewhere in the card.
 */
export function AvatarWedge({ avatarUrl, avatarAssetId, focalArea }) {
  const { imageUrl, focalPosition } = useAvatarImage(avatarUrl, avatarAssetId, focalArea)

  return (
    <div
      aria-hidden="true"
      className="absolute top-0 bottom-0 right-0 pointer-events-none bg-cover bg-center"
      style={{
        // Div wraps just the wedge's bounding box (right 42 % of the card) so
        // `bg-cover` fits the character image to the wedge region instead of
        // the whole card. Clip-path coords + gradient stops are expressed in
        // this local frame.
        width: '42%',
        clipPath: WEDGE_CLIP,
        backgroundImage: `${WEDGE_SCRIM}, url('${imageUrl}')`,
        // backgroundPosition applies to every layer, but the gradient has no
        // intrinsic size — `cover` fits it exactly to the box, so no position
        // can shift it. Only the portrait moves.
        ...(focalPosition ? { backgroundPosition: focalPosition } : {}),
      }}
    />
  )
}
