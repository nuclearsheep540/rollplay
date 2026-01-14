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
import { THEME } from '@/app/styles/colorTheme'

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
  originBonuses = {},
  disabled = false
}) {
  const [mode, setMode] = useState('manual')

  const handleModeChange = (newMode) => {
    setMode(newMode)

    // When switching to point-buy, always reset to default valid scores
    // This ensures we start with a valid point-buy allocation (all 8s)
    if (newMode === 'point-buy') {
      const defaults = getDefaultPointBuyScores()
      // Add origin bonuses back to the reset values
      const displayDefaults = { ...defaults }
      Object.entries(originBonuses).forEach(([ability, bonus]) => {
        displayDefaults[ability] = defaults[ability] + bonus
      })
      onChange(displayDefaults)
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
        <label className="block text-sm font-medium mb-2" style={{ color: THEME.textSecondary }}>
          Ability Score Entry Method
        </label>

        {/* Single info banner for all modes */}
        {Object.keys(originBonuses).length > 0 && (
          <div
            className="mb-3 text-sm p-3 rounded-sm border"
            style={{ backgroundColor: THEME.bgSecondary, borderColor: THEME.borderDefault, color: THEME.textSecondary }}
          >
            Displayed scores include your background bonuses. Point-buy calculations and roll validations are based on your base scores only.
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleModeChange('manual')}
            disabled={disabled}
            className="flex-1 px-4 py-2 rounded-sm font-medium transition-colors disabled:opacity-50 border"
            style={{
              backgroundColor: mode === 'manual' ? THEME.borderDefault : THEME.bgSecondary,
              borderColor: mode === 'manual' ? THEME.borderActive : THEME.borderSubtle,
              color: mode === 'manual' ? THEME.textOnDark : THEME.textSecondary
            }}
          >
            Manual
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('point-buy')}
            disabled={disabled}
            className="flex-1 px-4 py-2 rounded-sm font-medium transition-colors disabled:opacity-50 border"
            style={{
              backgroundColor: mode === 'point-buy' ? THEME.borderDefault : THEME.bgSecondary,
              borderColor: mode === 'point-buy' ? THEME.borderActive : THEME.borderSubtle,
              color: mode === 'point-buy' ? THEME.textOnDark : THEME.textSecondary
            }}
          >
            Point-Buy
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('roll-dice')}
            disabled={disabled}
            className="flex-1 px-4 py-2 rounded-sm font-medium transition-colors disabled:opacity-50 border"
            style={{
              backgroundColor: mode === 'roll-dice' ? THEME.borderDefault : THEME.bgSecondary,
              borderColor: mode === 'roll-dice' ? THEME.borderActive : THEME.borderSubtle,
              color: mode === 'roll-dice' ? THEME.textOnDark : THEME.textSecondary
            }}
          >
            Roll Dice
          </button>
        </div>
      </div>

      {/* Content based on mode */}
      <div>
        {mode === 'manual' && (
          <div className="space-y-2">
            <div className="text-sm mb-3" style={{ color: THEME.textSecondary }}>
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
                  hasBonus={originBonuses[key] > 0}
                  bonusAmount={originBonuses[key] || 0}
                />
              ))}
            </div>
          </div>
        )}

        {mode === 'point-buy' && (
          <PointBuyCalculator
            scores={scores}
            onChange={onChange}
            originBonuses={originBonuses}
            disabled={disabled}
          />
        )}

        {mode === 'roll-dice' && (
          <DiceRoller
            scores={scores}
            onChange={onChange}
            originBonuses={originBonuses}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  )
}
