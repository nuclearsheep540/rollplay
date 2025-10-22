/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Character Enum Constants
 *
 * IMPORTANT: These must match the backend enums exactly!
 * Backend location: api-site/modules/characters/domain/character_aggregate.py
 *
 * CharacterRace enum values
 * CharacterClass enum values
 */

export const CHARACTER_RACES = [
  { value: 'Human', label: 'Human' },
  { value: 'Elf', label: 'Elf' },
  { value: 'Dwarf', label: 'Dwarf' },
  { value: 'Halfling', label: 'Halfling' },
  { value: 'Dragonborn', label: 'Dragonborn' },
  { value: 'Gnome', label: 'Gnome' },
  { value: 'Half-Elf', label: 'Half-Elf' },
  { value: 'Half-Orc', label: 'Half-Orc' },
  { value: 'Tiefling', label: 'Tiefling' },
]

export const CHARACTER_CLASSES = [
  { value: 'Barbarian', label: 'Barbarian' },
  { value: 'Bard', label: 'Bard' },
  { value: 'Cleric', label: 'Cleric' },
  { value: 'Druid', label: 'Druid' },
  { value: 'Fighter', label: 'Fighter' },
  { value: 'Monk', label: 'Monk' },
  { value: 'Paladin', label: 'Paladin' },
  { value: 'Ranger', label: 'Ranger' },
  { value: 'Rogue', label: 'Rogue' },
  { value: 'Sorcerer', label: 'Sorcerer' },
  { value: 'Warlock', label: 'Warlock' },
  { value: 'Wizard', label: 'Wizard' },
]
