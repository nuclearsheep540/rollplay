/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * The 8° dial — Home's shared plate geometry.
 *
 * One slant angle drives every shape on the page, imported from the app's
 * wedge family (avatar pane ~8°, character strip 18°, workshop tiles 35°).
 * Same single-dial discipline as CharacterManager's STRIP_ANGLE_DEGREES.
 *
 * Dark cards are slanted PLATES: square left face where text lives, entire
 * right face leaning at the slant. Hero and working cards additionally break
 * their art through a seam parallel to that right face, so the art band
 * between them is itself a parallelogram.
 */

export const SLANT_ANGLE_DEGREES = 8
export const SLANT_RATIO = Math.tan((SLANT_ANGLE_DEGREES * Math.PI) / 180)

// Hero and working cards share a height, so they share a run.
export const PLATE_HEIGHT_PX = 300
export const PLATE_RUN_PX = Math.round(SLANT_RATIO * PLATE_HEIGHT_PX)

// A seam never crosses its card's midline — art owns the majority of the plate.
export const HERO_SEAM_PERCENT = 40
export const WORKING_SEAM_PERCENT = 42

// Contact shadows sit perpendicular to the slant, so every point of a seam
// projects to one stop on the gradient axis.
const SHADOW_ANGLE_DEGREES = 90 + SLANT_ANGLE_DEGREES
const SHADOW_FADE_PX = 90
const SHADOW_RGB = '5, 4, 3'

/**
 * Titles are free to run past the seam onto the art, where the backdrop is
 * whatever the campaign's image happens to be. This lifts them off it in the
 * plate's own shadow colour — invisible over the panel, legible over art.
 */
export const TEXT_SHADOW_ON_ART = `0 2px 10px rgba(${SHADOW_RGB}, 0.85), 0 1px 3px rgba(${SHADOW_RGB}, 0.7)`

/**
 * The plate silhouette: square left face, full right face leaning at the
 * slant. The slant's bottom vertex is a polygon point rather than an element
 * corner, so border-radius cannot round it — the three points before the
 * bottom-left corner approximate a 6px arc there.
 */
export function platePolygon(runPx = PLATE_RUN_PX) {
  return [
    '0 0',
    '100% 0',
    `calc(100% - ${runPx - 1}px) calc(100% - 5px)`,
    `calc(100% - ${runPx + 1}px) calc(100% - 1px)`,
    `calc(100% - ${runPx + 5}px) 100%`,
    '0 100%',
  ].join(', ')
}

/** Content side of a seam — everything left of the leaning cut. */
export function seamPanelPolygon(seamPercent, runPx = PLATE_RUN_PX) {
  return `0 0, calc(${seamPercent}% + ${runPx}px) 0, ${seamPercent}% 100%, 0 100%`
}

/** Art side of a seam — everything right of the leaning cut. */
export function seamArtPolygon(seamPercent, runPx = PLATE_RUN_PX) {
  return `calc(${seamPercent}% + ${runPx}px) 0, 100% 0, 100% 100%, ${seamPercent}% 100%`
}

/**
 * The shadow the content panel casts onto the art, anchored at the seam's
 * x-midpoint so it hugs the diagonal at any card width.
 */
export function seamContactShadow(seamPercent, runPx = PLATE_RUN_PX) {
  const anchor = `calc(${seamPercent}% + ${runPx / 2}px)`
  return `linear-gradient(${SHADOW_ANGLE_DEGREES}deg, rgba(${SHADOW_RGB}, 0.55) ${anchor}, rgba(${SHADOW_RGB}, 0) calc(${anchor} + ${SHADOW_FADE_PX}px))`
}

// Chips, CTAs and pills are parallelograms: skew the box, counter-skew the
// label so the text stays upright.
export const SKEW_BOX = `skewX(-${SLANT_ANGLE_DEGREES}deg)`
export const SKEW_LABEL = `skewX(${SLANT_ANGLE_DEGREES}deg)`
