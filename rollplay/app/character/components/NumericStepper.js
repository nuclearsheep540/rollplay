/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { THEME } from '@/app/styles/colorTheme'

/**
 * NumericStepper - Diablo 2 inspired ability score control
 *
 * Features large square buttons for increment/decrement with D&D modifier display
 */
export default function NumericStepper({
  label,
  value,
  onChange,
  min = 1,
  max = 20,
  disabled = false,
  showModifier = true,  // Show D&D modifier (only for ability scores)
  hasBonus = false,  // Highlight if this score has a background bonus
  bonusAmount = 0  // The actual bonus amount to display
}) {
  const handleIncrement = () => {
    if (value < max) onChange(value + 1)
  }

  const handleDecrement = () => {
    if (value > min) onChange(value - 1)
  }

  // Calculate D&D 5e ability modifier
  const getModifier = (score) => {
    return Math.floor((score - 10) / 2)
  }

  const formatModifier = (mod) => {
    return mod >= 0 ? `+${mod}` : `${mod}`
  }

  const modifier = getModifier(value)

  const isDecrementDisabled = disabled || value <= min
  const isIncrementDisabled = disabled || value >= max

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Label */}
      <label
        className="text-xs font-bold uppercase tracking-wider"
        style={{ color: THEME.textSecondary }}
      >
        {label}
      </label>

      {/* Controls Container */}
      <div className="flex items-center gap-3">
        {/* Decrement Button */}
        <button
          type="button"
          onClick={handleDecrement}
          disabled={isDecrementDisabled}
          className="w-10 h-10 rounded-sm font-bold text-xl transition-all duration-150 flex items-center justify-center border"
          style={{
            backgroundColor: THEME.bgSecondary,
            borderColor: isDecrementDisabled ? THEME.borderSubtle : THEME.borderDefault,
            color: isDecrementDisabled ? THEME.textSecondary : THEME.textOnDark,
            opacity: isDecrementDisabled ? 0.5 : 1,
            cursor: isDecrementDisabled ? 'not-allowed' : 'pointer'
          }}
          aria-label={`Decrease ${label}`}
        >
          −
        </button>

        {/* Value Display with optional Modifier */}
        <div
          className="flex flex-col items-center min-w-[70px] rounded-sm px-3 py-2 border-2"
          style={{
            backgroundColor: THEME.bgSecondary,
            borderColor: hasBonus ? '#22c55e' : THEME.borderDefault
          }}
        >
          <span
            className="text-3xl font-bold leading-none"
            style={{ color: hasBonus ? '#4ade80' : THEME.textOnDark }}
          >
            {value}
          </span>
          {bonusAmount > 0 && (
            <span
              className="text-xs font-semibold mt-1"
              style={{ color: '#4ade80' }}
            >
              (+{bonusAmount} bonus)
            </span>
          )}
          {showModifier && (
            <span
              className="text-xs font-semibold mt-1"
              style={{ color: THEME.textSecondary }}
            >
              {formatModifier(modifier)}
            </span>
          )}
        </div>

        {/* Increment Button */}
        <button
          type="button"
          onClick={handleIncrement}
          disabled={isIncrementDisabled}
          className="w-10 h-10 rounded-sm font-bold text-xl transition-all duration-150 flex items-center justify-center border"
          style={{
            backgroundColor: THEME.bgSecondary,
            borderColor: isIncrementDisabled ? THEME.borderSubtle : THEME.borderDefault,
            color: isIncrementDisabled ? THEME.textSecondary : THEME.textOnDark,
            opacity: isIncrementDisabled ? 0.5 : 1,
            cursor: isIncrementDisabled ? 'not-allowed' : 'pointer'
          }}
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>
    </div>
  )
}
