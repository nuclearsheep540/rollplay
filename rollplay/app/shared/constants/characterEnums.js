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

export const CHARACTER_BACKGROUNDS = [
  { value: 'Acolyte', label: 'Acolyte' },
  { value: 'Artisan', label: 'Artisan' },
  { value: 'Charlatan', label: 'Charlatan' },
  { value: 'Criminal', label: 'Criminal' },
  { value: 'Entertainer', label: 'Entertainer' },
  { value: 'Farmer', label: 'Farmer' },
  { value: 'Guard', label: 'Guard' },
  { value: 'Guide', label: 'Guide' },
  { value: 'Hermit', label: 'Hermit' },
  { value: 'Merchant', label: 'Merchant' },
  { value: 'Noble', label: 'Noble' },
  { value: 'Sage', label: 'Sage' },
  { value: 'Sailor', label: 'Sailor' },
  { value: 'Scribe', label: 'Scribe' },
  { value: 'Soldier', label: 'Soldier' },
  { value: 'Wayfarer', label: 'Wayfarer' },
]

/**
 * Background → Ability Score Mappings (D&D 2024)
 * Source: Player's Handbook 2024, Chapter 4 (Pages 176-184)
 *
 * Each background grants bonuses to 3 specific abilities.
 * Player chooses distribution: +2/+1 or +1/+1/+1
 */
export const BACKGROUND_ABILITIES = {
  'Acolyte': ['intelligence', 'wisdom', 'charisma'],
  'Artisan': ['strength', 'dexterity', 'intelligence'],
  'Charlatan': ['dexterity', 'constitution', 'charisma'],
  'Criminal': ['dexterity', 'constitution', 'intelligence'],
  'Entertainer': ['strength', 'dexterity', 'charisma'],
  'Farmer': ['strength', 'constitution', 'wisdom'],
  'Guard': ['strength', 'intelligence', 'wisdom'],
  'Guide': ['dexterity', 'constitution', 'wisdom'],
  'Hermit': ['constitution', 'wisdom', 'charisma'],
  'Merchant': ['constitution', 'intelligence', 'charisma'],
  'Noble': ['strength', 'intelligence', 'charisma'],
  'Sage': ['constitution', 'intelligence', 'wisdom'],
  'Sailor': ['strength', 'dexterity', 'wisdom'],
  'Scribe': ['dexterity', 'intelligence', 'wisdom'],
  'Soldier': ['strength', 'dexterity', 'constitution'],
  'Wayfarer': ['dexterity', 'wisdom', 'charisma'],
}
