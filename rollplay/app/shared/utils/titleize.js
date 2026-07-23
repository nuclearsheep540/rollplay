/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * "half_orc" → "Half Orc" — human-readable labels from stable content
 * codes (species, classes, skills, feats, ...). Returns '' for missing
 * codes so the result is always safe to interpolate.
 */
export function titleize(code) {
  return (code ?? '').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}
