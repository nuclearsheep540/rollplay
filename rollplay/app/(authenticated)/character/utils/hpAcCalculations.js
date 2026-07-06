/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Client-side HP/AC math for the creation wizard. Mirrors the backend rules math
 * (shared/rulesets/dnd_2024.py: compute_hp_max + list_ac_methods) so the Ability Scores step can
 * show live suggestions as the player edits CON/DEX/WIS on that same step, rather than waiting for
 * a save. The backend remains the source of truth on save; this is point-of-choice feedback.
 */

import { rollDie } from './diceRolling'

export const abilityMod = (score) => Math.floor(((score ?? 10) - 10) / 2)

// SRD "Fixed Hit Points" average for a hit die (d6→4, d8→5, d10→6, d12→7).
export const averageForDie = (die) => Math.floor(die / 2) + 1

// Primary class first — its first level is the one that gets the maximum hit die.
function orderedEntries(classEntries) {
  return [...(classEntries || [])].sort((a, b) =>
    a.is_primary === b.is_primary ? 0 : a.is_primary ? -1 : 1,
  )
}

export function totalLevel(classEntries) {
  return (classEntries || []).reduce((sum, e) => sum + (e.level || 0), 0)
}

// The primary class's hit-die size — the fixed level-1 HP (before CON).
export function level1MaxDie(classEntries, classByCode) {
  const entries = orderedEntries(classEntries)
  const primary = entries.find((e) => e.is_primary) ?? entries[0]
  return primary ? classByCode.get(primary.class_code)?.hit_die ?? 8 : 8
}

/**
 * The "gained" levels that take a hit-die roll/average — every level EXCEPT the primary's first
 * (which is a fixed max). Primary-first order, one entry per level, each { index, classCode,
 * className, die }. index is a stable 0-based key for the per-level roll state.
 */
export function gainedLevelDice(classEntries, classByCode) {
  const slots = []
  let firstUsed = false
  let index = 0
  for (const e of orderedEntries(classEntries)) {
    const cls = classByCode.get(e.class_code)
    const die = cls?.hit_die ?? 8
    for (let lvl = 1; lvl <= (e.level || 0); lvl++) {
      if (!firstUsed) { firstUsed = true; continue } // primary L1 = fixed max, not a roll slot
      slots.push({ index: index++, classCode: e.class_code, className: cls?.name ?? e.class_code, die })
    }
  }
  return slots
}

// Average HP — mirrors compute_hp_max: max die at L1 + average per gained level, + CON × total level.
export function averageHp(classEntries, classByCode, conMod) {
  const lvl = totalLevel(classEntries)
  if (lvl === 0) return Math.max(1, 10 + conMod)
  let dice = level1MaxDie(classEntries, classByCode)
  for (const slot of gainedLevelDice(classEntries, classByCode)) dice += averageForDie(slot.die)
  return Math.max(1, dice + conMod * lvl)
}

// HP from a { index: rolledValue } map. Unrolled gained levels fall back to their average so the
// total is always valid; CON × total level is added on top (updates live if CON changes).
export function hpFromRolls(classEntries, classByCode, conMod, rollsByIndex = {}) {
  const lvl = totalLevel(classEntries)
  if (lvl === 0) return Math.max(1, 10 + conMod)
  let dice = level1MaxDie(classEntries, classByCode)
  for (const slot of gainedLevelDice(classEntries, classByCode)) {
    dice += rollsByIndex[slot.index] ?? averageForDie(slot.die)
  }
  return Math.max(1, dice + conMod * lvl)
}

// Roll every gained level at once → { index: rolledValue }.
export function rollAllLevels(slots) {
  const out = {}
  for (const slot of slots) out[slot.index] = rollDie(slot.die)
  return out
}

/**
 * Unarmored AC methods — mirrors list_ac_methods. Base 10+DEX for everyone, plus Barbarian
 * (10+DEX+CON) / Monk (10+DEX+WIS) Unarmored Defense. Best (highest AC) first. Armor-based AC is a
 * runtime equipment concern and is intentionally not modelled at creation.
 */
export function acMethods(classEntries, dexMod, conMod, wisMod) {
  const classes = new Set((classEntries || []).map((e) => e.class_code))
  const methods = [{ code: 'unarmored', label: 'Unarmored (10 + DEX)', ac: 10 + dexMod }]
  if (classes.has('barbarian')) {
    methods.push({ code: 'barbarian_unarmored_defense', label: 'Unarmored Defense (Barbarian)', ac: 10 + dexMod + conMod })
  }
  if (classes.has('monk')) {
    methods.push({ code: 'monk_unarmored_defense', label: 'Unarmored Defense (Monk)', ac: 10 + dexMod + wisMod })
  }
  return methods.sort((a, b) => b.ac - a.ac)
}
