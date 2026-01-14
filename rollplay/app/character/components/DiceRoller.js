/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState } from 'react'
import NumericStepper from './NumericStepper'
import {
  rollAbilityScoresDetailed,
  calculateScoreStats,
  areScoresValid
} from '../utils/diceRolling'
import { THEME } from '@/app/styles/colorTheme'

/**
 * DiceRoller - Roll ability scores using 4d6 drop lowest
 *
 * Features:
 * - Roll all ability scores at once
 * - Show roll details (which dice were dropped)
 * - Reroll all scores
 * - Manual adjustment after rolling (8-15 range only after rolling)
 * - Score statistics (total, average)
 */
export default function DiceRoller({
  scores,
  onChange,
  originBonuses = {},
  disabled = false
}) {
  const [rollDetails, setRollDetails] = useState(null)
  const [rollCount, setRollCount] = useState(0)

  const handleRollAll = () => {
    const result = rollAbilityScoresDetailed('4d6-drop-lowest')

    // Add origin bonuses to rolled values (we're working with display scores)
    const displayScores = { ...result.scores }
    Object.entries(originBonuses).forEach(([ability, bonus]) => {
      displayScores[ability] = result.scores[ability] + bonus
    })

    onChange(displayScores)
    setRollDetails(result.details)
    setRollCount(rollCount + 1)
  }

  const handleScoreChange = (ability, newValue) => {
    // Calculate what the base score would be (subtract bonus)
    const bonus = originBonuses[ability] || 0
    const newBaseValue = newValue - bonus

    // Allow manual adjustment within reasonable range (on base score)
    if (newBaseValue < 1 || newBaseValue > 18) {
      return
    }

    onChange({
      ...scores,
      [ability]: newValue
    })
  }

  // Calculate stats on base scores (without bonuses) for roll validation
  const getBaseScores = () => {
    const base = { ...scores }
    Object.entries(originBonuses).forEach(([ability, bonus]) => {
      base[ability] = (base[ability] || 10) - bonus
    })
    return base
  }

  const baseScores = getBaseScores()
  const stats = calculateScoreStats(baseScores)
  const isValid = areScoresValid(baseScores)

  const abilities = [
    { key: 'strength', label: 'STR', shortLabel: 'Strength' },
    { key: 'dexterity', label: 'DEX', shortLabel: 'Dexterity' },
    { key: 'constitution', label: 'CON', shortLabel: 'Constitution' },
    { key: 'intelligence', label: 'INT', shortLabel: 'Intelligence' },
    { key: 'wisdom', label: 'WIS', shortLabel: 'Wisdom' },
    { key: 'charisma', label: 'CHA', shortLabel: 'Charisma' }
  ]

  const hasRolled = rollCount > 0

  return (
    <div className="space-y-4">
      {/* Roll button and stats */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <button
          type="button"
          onClick={handleRollAll}
          disabled={disabled}
          className="px-6 py-3 rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium border"
          style={{
            backgroundColor: THEME.borderDefault,
            borderColor: THEME.borderActive,
            color: THEME.textOnDark
          }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {hasRolled ? 'Reroll All' : 'Roll 4d6 Drop Lowest'}
        </button>

        {hasRolled && (
          <div className="text-sm">
            <span style={{ color: THEME.textSecondary }}>Total: </span>
            <span className="font-bold" style={{ color: isValid ? '#4ade80' : '#fbbf24' }}>
              {stats.total}
            </span>
            <span className="ml-3" style={{ color: THEME.textSecondary }}>Average: </span>
            <span className="font-bold" style={{ color: THEME.textOnDark }}>{stats.average}</span>
          </div>
        )}
      </div>

      {/* Info message before first roll */}
      {!hasRolled && (
        <div
          className="text-sm italic text-center py-4 rounded-sm"
          style={{ backgroundColor: THEME.bgSecondary, color: THEME.textSecondary }}
        >
          Click the button above to roll 4d6 and drop the lowest die for each ability score
        </div>
      )}

      {/* Rolled scores */}
      {hasRolled && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            {abilities.map(({ key, label }) => {
              const detail = rollDetails?.[key]
              const score = scores[key]
              const bonus = originBonuses[key] || 0

              return (
                <div key={key} className="space-y-2">
                  <NumericStepper
                    label={label}
                    value={score}
                    onChange={(val) => handleScoreChange(key, val)}
                    min={1 + bonus}
                    max={18 + bonus}
                    disabled={disabled}
                    showModifier={true}
                    hasBonus={bonus > 0}
                  />

                  {/* Roll detail */}
                  {detail && (
                    <div className="text-xs text-center">
                      <div style={{ color: THEME.textSecondary }}>
                        Rolled: {detail.rolls.join(', ')}
                      </div>
                      <div style={{ color: THEME.textSecondary, opacity: 0.6 }}>
                        Dropped: <span className="line-through">{detail.dropped}</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Validity warning */}
          {!isValid && (
            <div
              className="text-sm p-3 rounded-sm border"
              style={{ backgroundColor: '#78350f20', borderColor: '#f59e0b', color: '#fbbf24' }}
            >
              Unlucky rolls! Total is below 70 or a score is below 8. Consider rerolling.
            </div>
          )}

          {/* Good rolls message */}
          {isValid && stats.total >= 75 && (
            <div
              className="text-sm p-3 rounded-sm border"
              style={{ backgroundColor: '#16653420', borderColor: '#22c55e', color: '#4ade80' }}
            >
              Great rolls! Total of {stats.total} is above average.
            </div>
          )}
        </>
      )}
    </div>
  )
}
