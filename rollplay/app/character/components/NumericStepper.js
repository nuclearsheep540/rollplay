/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

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
  hasBonus = false  // Highlight if this score has a background bonus
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

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Label */}
      <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">
        {label}
      </label>

      {/* Controls Container */}
      <div className="flex items-center gap-3">
        {/* Decrement Button - Large Square (Diablo 2 style) */}
        <button
          type="button"
          onClick={handleDecrement}
          disabled={disabled || value <= min}
          className="w-10 h-10 bg-white hover:bg-indigo-50 active:bg-indigo-100
                     disabled:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed
                     border-2 border-gray-300 hover:border-indigo-500
                     disabled:border-gray-200
                     rounded font-bold text-gray-700 hover:text-indigo-600 text-xl
                     transition-all duration-150
                     flex items-center justify-center
                     shadow-sm hover:shadow-md"
          aria-label={`Decrease ${label}`}
        >
          −
        </button>

        {/* Value Display with optional Modifier */}
        <div className={`flex flex-col items-center min-w-[70px] bg-gradient-to-b rounded px-3 py-2 shadow-sm border-2 ${
          hasBonus
            ? 'from-green-50 to-white border-green-300'
            : 'from-indigo-50 to-white border-indigo-200'
        }`}>
          <span className={`text-3xl font-bold leading-none ${
            hasBonus ? 'text-green-600' : 'text-indigo-600'
          }`}>
            {value}
          </span>
          {showModifier && (
            <span className="text-xs font-semibold text-gray-500 mt-1">
              {formatModifier(modifier)}
            </span>
          )}
        </div>

        {/* Increment Button - Large Square (Diablo 2 style) */}
        <button
          type="button"
          onClick={handleIncrement}
          disabled={disabled || value >= max}
          className="w-10 h-10 bg-white hover:bg-indigo-50 active:bg-indigo-100
                     disabled:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed
                     border-2 border-gray-300 hover:border-indigo-500
                     disabled:border-gray-200
                     rounded font-bold text-gray-700 hover:text-indigo-600 text-xl
                     transition-all duration-150
                     flex items-center justify-center
                     shadow-sm hover:shadow-md"
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>
    </div>
  )
}
