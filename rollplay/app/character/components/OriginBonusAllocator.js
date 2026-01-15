/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import { BACKGROUND_ABILITIES } from '../../shared/constants/characterEnums'
import Combobox from '../../shared/components/Combobox'
import { THEME } from '@/app/styles/colorTheme'

const ABILITIES = [
  { value: 'strength', label: 'Strength' },
  { value: 'dexterity', label: 'Dexterity' },
  { value: 'constitution', label: 'Constitution' },
  { value: 'intelligence', label: 'Intelligence' },
  { value: 'wisdom', label: 'Wisdom' },
  { value: 'charisma', label: 'Charisma' },
]

export default function OriginBonusAllocator({
  selectedBackground,
  baseScores,
  displayScores,
  currentBonuses = {},
  onChange,
  disabled = false
}) {
  // Two modes: "2_1" (+2/+1) or "1_1_1" (+1/+1/+1)
  const [mode, setMode] = useState('2_1')

  // Selections for each mode
  const [mode2_1, setMode2_1] = useState({
    plus2: '',
    plus1: ''
  })

  const [mode1_1_1, setMode1_1_1] = useState({
    first: '',
    second: '',
    third: ''
  })

  // Track if mode change was user-initiated to prevent useEffect from overriding
  // Using ref so it doesn't trigger re-renders or cause useEffect to re-run
  const userChangedModeRef = useRef(false)

  // Initialize from currentBonuses if provided (only on external changes, not user mode switches)
  useEffect(() => {
    // Skip if user just changed the mode - let their selection stand
    if (userChangedModeRef.current) {
      userChangedModeRef.current = false
      return
    }

    if (Object.keys(currentBonuses).length === 0) {
      // Reset selections when bonuses are cleared (e.g., background changed)
      // But don't change the mode - user may have just switched
      setMode2_1({ plus2: '', plus1: '' })
      setMode1_1_1({ first: '', second: '', third: '' })
      return
    }

    const bonusValues = Object.values(currentBonuses)
    const bonusKeys = Object.keys(currentBonuses)

    if (bonusValues.includes(2)) {
      // Mode +2/+1
      setMode('2_1')
      const plus2Ability = bonusKeys.find(key => currentBonuses[key] === 2)
      const plus1Ability = bonusKeys.find(key => currentBonuses[key] === 1)
      setMode2_1({
        plus2: plus2Ability || '',
        plus1: plus1Ability || ''
      })
    } else if (bonusKeys.length > 0) {
      // Mode +1/+1/+1 (only if there are actual bonuses)
      setMode('1_1_1')
      setMode1_1_1({
        first: bonusKeys[0] || '',
        second: bonusKeys[1] || '',
        third: bonusKeys[2] || ''
      })
    }
  }, [currentBonuses])

  // Build bonuses object based on current selections
  const buildBonuses = () => {
    const bonuses = {}

    if (mode === '2_1') {
      if (mode2_1.plus2) bonuses[mode2_1.plus2] = 2
      if (mode2_1.plus1) bonuses[mode2_1.plus1] = 1
    } else {
      if (mode1_1_1.first) bonuses[mode1_1_1.first] = 1
      if (mode1_1_1.second) bonuses[mode1_1_1.second] = 1
      if (mode1_1_1.third) bonuses[mode1_1_1.third] = 1
    }

    return bonuses
  }

  // Validate selections
  const validate = () => {
    const bonuses = buildBonuses()
    const selectedAbilities = Object.keys(bonuses)

    // Check for duplicates
    if (new Set(selectedAbilities).size !== selectedAbilities.length) {
      return { valid: false, error: 'Cannot select the same ability twice' }
    }

    // Check that all selections are made
    const requiredCount = mode === '2_1' ? 2 : 3
    if (selectedAbilities.length !== requiredCount) {
      return { valid: false, error: 'Please select all abilities' }
    }

    // Check max 20 rule
    for (const [ability, bonus] of Object.entries(bonuses)) {
      const baseScore = baseScores[ability] || 10
      const finalScore = baseScore + bonus
      if (finalScore > 20) {
        return {
          valid: false,
          error: `${ABILITIES.find(a => a.value === ability)?.label} would exceed max 20 (${baseScore} + ${bonus} = ${finalScore})`
        }
      }
    }

    return { valid: true, error: null }
  }

  // Update parent when selections change - send partial bonuses immediately
  useEffect(() => {
    const bonuses = buildBonuses()
    const currentBonusString = JSON.stringify(bonuses)
    const prevBonusString = JSON.stringify(currentBonuses)

    // Send bonuses immediately even if incomplete (allows reactive updates)
    if (currentBonusString !== prevBonusString) {
      onChange(bonuses)
    }
  }, [mode, mode2_1, mode1_1_1])

  const handleModeChange = (newMode) => {
    userChangedModeRef.current = true
    setMode(newMode)
    // Reset selections when switching modes
    if (newMode === '2_1') {
      setMode2_1({ plus2: '', plus1: '' })
    } else {
      setMode1_1_1({ first: '', second: '', third: '' })
    }
  }

  const validation = validate()
  const bonuses = buildBonuses()

  // Get available abilities (filter by background, then exclude already selected)
  const getAvailableAbilities = (currentSelection) => {
    // Filter to only abilities allowed by the selected background
    const allowedAbilities = selectedBackground && BACKGROUND_ABILITIES[selectedBackground]
      ? ABILITIES.filter(a => BACKGROUND_ABILITIES[selectedBackground].includes(a.value))
      : ABILITIES

    // Then exclude already selected abilities
    const selected = Object.values(mode === '2_1' ? mode2_1 : mode1_1_1).filter(v => v && v !== currentSelection)
    return allowedAbilities.filter(a => !selected.includes(a.value))
  }

  return (
    <div
      className="space-y-4 p-4 rounded-sm border"
      style={{ backgroundColor: THEME.bgSecondary, borderColor: THEME.borderSubtle }}
    >
      <div>
        <h3 className="text-sm font-semibold mb-2" style={{ color: THEME.textOnDark }}>
          Background Origin Bonuses
        </h3>
        <p className="text-xs mb-3" style={{ color: THEME.textSecondary }}>
          {selectedBackground
            ? `Choose how to allocate bonuses from your ${selectedBackground} background (D&D 2024 rules)`
            : 'Select a background to allocate origin bonuses (D&D 2024 rules)'}
        </p>
      </div>

      {/* Mode Selection */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => !disabled && handleModeChange('2_1')}
          disabled={disabled}
          className="flex items-center space-x-3 cursor-pointer w-full text-left disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span
            className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
            style={{ borderColor: THEME.textAccent }}
          >
            {mode === '2_1' && (
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: THEME.textAccent }}
              />
            )}
          </span>
          <span className="text-sm" style={{ color: THEME.textOnDark }}>+2 to one ability, +1 to another</span>
        </button>

        <button
          type="button"
          onClick={() => !disabled && handleModeChange('1_1_1')}
          disabled={disabled}
          className="flex items-center space-x-3 cursor-pointer w-full text-left disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span
            className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
            style={{ borderColor: THEME.textAccent }}
          >
            {mode === '1_1_1' && (
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: THEME.textAccent }}
              />
            )}
          </span>
          <span className="text-sm" style={{ color: THEME.textOnDark }}>+1 to three different abilities</span>
        </button>
      </div>

      {/* Mode +2/+1 Selectors */}
      {mode === '2_1' && (
        <div className="space-y-3">
          <Combobox
            label="+2 Bonus"
            options={getAvailableAbilities(mode2_1.plus2).map(ability => ({
              value: ability.value,
              label: `${ability.label} (+2)`
            }))}
            value={mode2_1.plus2}
            onChange={(value) => setMode2_1({ ...mode2_1, plus2: value })}
            placeholder="Select ability..."
          />

          <Combobox
            label="+1 Bonus"
            options={getAvailableAbilities(mode2_1.plus1).map(ability => ({
              value: ability.value,
              label: `${ability.label} (+1)`
            }))}
            value={mode2_1.plus1}
            onChange={(value) => setMode2_1({ ...mode2_1, plus1: value })}
            placeholder="Select ability..."
          />
        </div>
      )}

      {/* Mode +1/+1/+1 Selectors */}
      {mode === '1_1_1' && (
        <div className="space-y-3">
          {['first', 'second', 'third'].map((key, index) => (
            <Combobox
              key={key}
              label={`+1 Bonus #${index + 1}`}
              options={getAvailableAbilities(mode1_1_1[key]).map(ability => ({
                value: ability.value,
                label: `${ability.label} (+1)`
              }))}
              value={mode1_1_1[key]}
              onChange={(value) => setMode1_1_1({ ...mode1_1_1, [key]: value })}
              placeholder="Select ability..."
            />
          ))}
        </div>
      )}

      {/* Validation Error */}
      {!validation.valid && (
        <div className="text-xs mt-2" style={{ color: '#f87171' }}>
          {validation.error}
        </div>
      )}
    </div>
  )
}
