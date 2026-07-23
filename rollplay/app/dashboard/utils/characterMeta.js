/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

export const titleize = (code) =>
  code ? code.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : null

/**
 * "Level 3 Elf Ranger / Rogue" from whichever fields the character
 * carries: legacy character_race/character_class strings, or the v2
 * species_code + class_entries. Missing pieces are simply omitted.
 */
export function characterMetaLine(char) {
  const species = char.character_race || titleize(char.species_code)
  const classes = char.character_class || (
    char.class_entries?.length
      ? char.class_entries.map((entry) => titleize(entry.class_code)).join(' / ')
      : null
  )
  return [`Level ${char.level || 1}`, species, classes].filter(Boolean).join(' ')
}
