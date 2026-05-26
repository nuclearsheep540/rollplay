/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Dice Rolling Utilities - D&D 5e Standard Methods
 *
 * Supports multiple rolling methods:
 * - 4d6 drop lowest (standard method)
 * - 3d6 straight (classic method)
 * - 4d6 drop lowest reroll 1s (heroic method)
 */

/**
 * Roll a single die
 * @param {number} sides - Number of sides on the die
 * @returns {number} Result (1 to sides)
 */
export const rollDie = (sides = 6) => {
  return Math.floor(Math.random() * sides) + 1
}

/**
 * Roll multiple dice
 * @param {number} count - Number of dice to roll
 * @param {number} sides - Number of sides per die
 * @returns {number[]} Array of results
 */
export const rollDice = (count, sides = 6) => {
  const results = []
  for (let i = 0; i < count; i++) {
    results.push(rollDie(sides))
  }
  return results
}

/**
 * Roll 4d6 and drop the lowest (standard D&D method)
 * @returns {Object} { total, rolls, dropped }
 */
export const roll4d6DropLowest = () => {
  const rolls = rollDice(4, 6)
  const sorted = [...rolls].sort((a, b) => a - b)
  const dropped = sorted[0]
  const kept = sorted.slice(1)
  const total = kept.reduce((sum, val) => sum + val, 0)

  return {
    total,
    rolls,
    kept,
    dropped
  }
}

/**
 * Roll 3d6 straight (classic method)
 * @returns {Object} { total, rolls }
 */
export const roll3d6 = () => {
  const rolls = rollDice(3, 6)
  const total = rolls.reduce((sum, val) => sum + val, 0)

  return {
    total,
    rolls
  }
}

/**
 * Roll ability scores using specified method
 * @param {string} method - Rolling method ('4d6-drop-lowest', '3d6')
 * @returns {Object} Ability scores object
 */
export const rollAbilityScores = (method = '4d6-drop-lowest') => {
  const abilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']
  const scores = {}

  for (const ability of abilities) {
    let result
    if (method === '3d6') {
      result = roll3d6()
    } else {
      result = roll4d6DropLowest()
    }
    scores[ability] = result.total
  }

  return scores
}

/**
 * Roll all ability scores with detailed information
 * @param {string} method - Rolling method
 * @returns {Object} { scores, details }
 */
export const rollAbilityScoresDetailed = (method = '4d6-drop-lowest') => {
  const abilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']
  const scores = {}
  const details = {}

  for (const ability of abilities) {
    let result
    if (method === '3d6') {
      result = roll3d6()
    } else {
      result = roll4d6DropLowest()
    }
    scores[ability] = result.total
    details[ability] = result
  }

  return { scores, details }
}

/**
 * Calculate ability score total and average
 * @param {Object} scores - Ability scores object
 * @returns {Object} { total, average }
 */
export const calculateScoreStats = (scores) => {
  const values = Object.values(scores)
  const total = values.reduce((sum, val) => sum + val, 0)
  const average = total / values.length

  return {
    total,
    average: Math.round(average * 10) / 10
  }
}

/**
 * Check if rolled scores are valid (no score below 8, total >= 70)
 * Common house rule to prevent unlucky characters
 * @param {Object} scores - Ability scores object
 * @returns {boolean} Valid
 */
export const areScoresValid = (scores) => {
  const values = Object.values(scores)
  const hasLowScore = values.some(s => s < 8)
  const stats = calculateScoreStats(scores)

  return !hasLowScore && stats.total >= 70
}
