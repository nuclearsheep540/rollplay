/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState } from 'react'
import NumericStepper from './NumericStepper'
import PointBuyCalculator from './PointBuyCalculator'
import DiceRoller from './DiceRoller'
import { getDefaultPointBuyScores } from '../utils/pointBuyCalculations'

/**
 * AbilityScoreBuilder - Unified interface for setting ability scores
 *
 * Supports multiple input modes:
 * - Manual: Direct input (1-20 range)
 * - Point-Buy: D&D 2024 27-point system (8-15 range)
 * - Roll Dice: 4d6 drop lowest (3-18 range)
 */
export default function AbilityScoreBuilder({
  scores,
  onChange,
  disabled = false
}) {
  const [mode, setMode] = useState('manual')

  const handleModeChange = (newMode) => {
    setMode(newMode)

    // When switching to point-buy, initialize with default scores if needed
    if (newMode === 'point-buy') {
      const hasInvalidScores = Object.values(scores).some(s => s < 8 || s > 15)
      if (hasInvalidScores) {
        onChange(getDefaultPointBuyScores())
      }
    }
  }

  const handleAbilityScoreChange = (ability, value) => {
    const numValue = parseInt(value, 10) || 1
    onChange({
      ...scores,
      [ability]: numValue
    })
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
      {/* Mode selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Ability Score Entry Method
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleModeChange('manual')}
            disabled={disabled}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
              mode === 'manual'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            } disabled:opacity-50`}
          >
            Manual
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('point-buy')}
            disabled={disabled}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
              mode === 'point-buy'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            } disabled:opacity-50`}
          >
            Point-Buy
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('roll-dice')}
            disabled={disabled}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
              mode === 'roll-dice'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            } disabled:opacity-50`}
          >
            Roll Dice
          </button>
        </div>
      </div>

      {/* Content based on mode */}
      <div>
        {mode === 'manual' && (
          <div className="space-y-2">
            <div className="text-sm text-gray-600 mb-3">
              Manually set each ability score (1-20)
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              {abilities.map(({ key, label }) => (
                <NumericStepper
                  key={key}
                  label={label}
                  value={scores[key]}
                  onChange={(val) => handleAbilityScoreChange(key, val)}
                  min={1}
                  max={20}
                  disabled={disabled}
                  showModifier={true}
                />
              ))}
            </div>
          </div>
        )}

        {mode === 'point-buy' && (
          <PointBuyCalculator
            scores={scores}
            onChange={onChange}
            disabled={disabled}
          />
        )}

        {mode === 'roll-dice' && (
          <DiceRoller
            scores={scores}
            onChange={onChange}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  )
}
