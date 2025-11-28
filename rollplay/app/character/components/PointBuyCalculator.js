/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState } from 'react'
import NumericStepper from './NumericStepper'
import {
  validatePointBuy,
  canIncreaseScore,
  canDecreaseScore,
  getDefaultPointBuyScores,
  getRecommendedScores,
  POINT_BUY_BUDGET,
  POINT_BUY_MIN,
  POINT_BUY_MAX
} from '../utils/pointBuyCalculations'

/**
 * PointBuyCalculator - D&D 2024 Point-Buy System
 *
 * Standard 27-point buy system (scores 8-15)
 * Represents base character creation before background bonuses
 */
export default function PointBuyCalculator({
  scores,
  onChange,
  originBonuses = {},
  disabled = false
}) {
  // Calculate base scores (remove bonuses for validation)
  const getBaseScores = () => {
    const base = { ...scores }
    Object.entries(originBonuses).forEach(([ability, bonus]) => {
      base[ability] = (base[ability] || 10) - bonus
    })
    return base
  }

  const baseScores = getBaseScores()
  const validation = validatePointBuy(baseScores)

  const handleScoreChange = (ability, newValue) => {
    // Calculate what the base score would be (subtract bonus)
    const bonus = originBonuses[ability] || 0
    const newBaseValue = newValue - bonus

    // Validate point-buy range on BASE score (8-15)
    if (newBaseValue < POINT_BUY_MIN || newBaseValue > POINT_BUY_MAX) {
      return
    }

    const newScores = { ...scores, [ability]: newValue }
    const newBaseScores = getBaseScores()
    newBaseScores[ability] = newBaseValue

    // Check if new BASE scores are within budget
    const newValidation = validatePointBuy(newBaseScores)
    if (newValidation.valid) {
      onChange(newScores)
    }
  }

  const handleReset = () => {
    const defaults = getDefaultPointBuyScores()
    // Add origin bonuses back to the reset values (we're working with display scores)
    const displayDefaults = { ...defaults }
    Object.entries(originBonuses).forEach(([ability, bonus]) => {
      displayDefaults[ability] = defaults[ability] + bonus
    })
    onChange(displayDefaults)
  }

  const handleRecommended = () => {
    const recommended = getRecommendedScores()
    // Add origin bonuses back to the recommended values (we're working with display scores)
    const displayRecommended = { ...recommended }
    Object.entries(originBonuses).forEach(([ability, bonus]) => {
      displayRecommended[ability] = recommended[ability] + bonus
    })
    onChange(displayRecommended)
  }

  const abilities = [
    { key: 'strength', label: 'STR' },
    { key: 'dexterity', label: 'DEX' },
    { key: 'constitution', label: 'CON' },
    { key: 'intelligence', label: 'INT' },
    { key: 'wisdom', label: 'WIS' },
    { key: 'charisma', label: 'CHA' }
  ]

  return (
    <div className="space-y-4">
      {/* Header with point budget */}
      <div className={`text-2xl font-bold ${
        validation.overBudget ? 'text-red-600' :
        validation.remaining === 0 ? 'text-green-600' :
        'text-indigo-600'
      }`}>
        {validation.pointsSpent} / {POINT_BUY_BUDGET} points
        {validation.remaining > 0 && (
          <span className="text-lg ml-2">
            ({validation.remaining} remaining)
          </span>
        )}
      </div>

      {/* Quick actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleReset}
          disabled={disabled}
          className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors disabled:opacity-50"
        >
          Reset (All 8s)
        </button>
        <button
          type="button"
          onClick={handleRecommended}
          disabled={disabled}
          className="px-3 py-1 text-xs bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 transition-colors disabled:opacity-50"
        >
          Recommended Build
        </button>
      </div>

      {/* Ability scores grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
        {abilities.map(({ key, label }) => {
          const bonus = originBonuses[key] || 0
          return (
            <NumericStepper
              key={key}
              label={label}
              value={scores[key]}
              onChange={(val) => handleScoreChange(key, val)}
              min={POINT_BUY_MIN + bonus}
              max={POINT_BUY_MAX + bonus}
              disabled={disabled}
              showModifier={true}
              hasBonus={bonus > 0}
            />
          )
        })}
      </div>

      {/* Budget warning */}
      {validation.overBudget && (
        <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-200">
          ⚠️ Over budget! Reduce some scores to stay within 27 points.
        </div>
      )}

      {/* Perfect budget message */}
      {validation.remaining === 0 && (
        <div className="text-sm text-green-600 bg-green-50 p-3 rounded-lg border border-green-200">
          ✓ All 27 points allocated!
        </div>
      )}
    </div>
  )
}
