/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { titleize } from '@/app/shared/utils/titleize'

/**
 * "Level 3 Elf Ranger / Rogue" from the v2 character shape
 * (species_code + class_entries). Missing pieces are simply omitted.
 */
export function characterMetaLine(char) {
  const species = titleize(char.species_code)
  const classes = char.class_entries?.length
    ? char.class_entries.map((entry) => titleize(entry.class_code)).join(' / ')
    : null
  return [`Level ${char.level || 1}`, species, classes].filter(Boolean).join(' ')
}
