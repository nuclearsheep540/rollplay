/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Point-Buy System Utilities - D&D 5e Standard Rules
 *
 * Standard point-buy uses 27 points to purchase ability scores from 8-15.
 * This represents base scores before racial bonuses and ASI.
 */

// D&D 5e point-buy costs (score → points)
const POINT_COSTS = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9
}

export const POINT_BUY_BUDGET = 27
export const POINT_BUY_MIN = 8
export const POINT_BUY_MAX = 15

/**
 * Get the point cost for a specific ability score
 * @param {number} score - Ability score (8-15)
 * @returns {number} Point cost
 */
export const getPointCost = (score) => {
  if (score < POINT_BUY_MIN || score > POINT_BUY_MAX) {
    throw new Error(`Score must be between ${POINT_BUY_MIN} and ${POINT_BUY_MAX}`)
  }
  return POINT_COSTS[score]
}

/**
 * Calculate total points spent on ability scores
 * @param {Object} scores - Ability scores object
 * @returns {number} Total points spent
 */
export const calculatePointsSpent = (scores) => {
  const abilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']

  let total = 0
  for (const ability of abilities) {
    const score = scores[ability]
    if (score < POINT_BUY_MIN || score > POINT_BUY_MAX) {
      throw new Error(`${ability} score must be between ${POINT_BUY_MIN} and ${POINT_BUY_MAX}`)
    }
    total += getPointCost(score)
  }

  return total
}

/**
 * Validate point-buy scores
 * @param {Object} scores - Ability scores object
 * @returns {Object} Validation result
 */
export const validatePointBuy = (scores) => {
  try {
    const pointsSpent = calculatePointsSpent(scores)
    const remaining = POINT_BUY_BUDGET - pointsSpent

    return {
      valid: pointsSpent <= POINT_BUY_BUDGET,
      pointsSpent,
      remaining,
      overBudget: pointsSpent > POINT_BUY_BUDGET
    }
  } catch (error) {
    return {
      valid: false,
      pointsSpent: 0,
      remaining: POINT_BUY_BUDGET,
      overBudget: false,
      error: error.message
    }
  }
}

/**
 * Get default point-buy scores (all 8s = 0 points spent)
 * @returns {Object} Default ability scores
 */
export const getDefaultPointBuyScores = () => ({
  strength: 8,
  dexterity: 8,
  constitution: 8,
  intelligence: 8,
  wisdom: 8,
  charisma: 8
})

/**
 * Check if a score can be increased within budget
 * @param {Object} scores - Current ability scores
 * @param {string} ability - Ability to increase
 * @returns {boolean} Can increase
 */
export const canIncreaseScore = (scores, ability) => {
  const currentScore = scores[ability]

  // Can't go above max
  if (currentScore >= POINT_BUY_MAX) {
    return false
  }

  // Check if we have enough points
  const currentCost = getPointCost(currentScore)
  const newCost = getPointCost(currentScore + 1)
  const costDifference = newCost - currentCost

  const validation = validatePointBuy(scores)
  return validation.remaining >= costDifference
}

/**
 * Check if a score can be decreased
 * @param {Object} scores - Current ability scores
 * @param {string} ability - Ability to decrease
 * @returns {boolean} Can decrease
 */
export const canDecreaseScore = (scores, ability) => {
  const currentScore = scores[ability]
  return currentScore > POINT_BUY_MIN
}

/**
 * Get recommended point distribution (balanced build)
 * @returns {Object} Recommended ability scores
 */
export const getRecommendedScores = () => ({
  strength: 13,    // 5 points
  dexterity: 12,   // 4 points
  constitution: 13, // 5 points
  intelligence: 10, // 2 points
  wisdom: 12,      // 4 points
  charisma: 14     // 7 points
  // Total: 27 points
})
