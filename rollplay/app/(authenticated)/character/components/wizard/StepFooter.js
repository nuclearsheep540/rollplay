/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { THEME, COLORS } from '@/app/styles/colorTheme'

export default function StepFooter({
  onBack,
  onNext,
  backLabel = '← Back',
  nextLabel = 'Next →',
  nextDisabled = false,
}) {
  return (
    <div className="flex justify-between items-center pt-4 border-t" style={{ borderColor: THEME.borderSubtle }}>
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 rounded-sm border text-sm"
          style={{
            backgroundColor: 'transparent',
            borderColor: THEME.borderDefault,
            color: THEME.textOnDark,
          }}
        >
          {backLabel}
        </button>
      ) : (
        // Empty spacer so the Next button stays right-aligned via justify-between.
        <span />
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className="px-5 py-2 rounded-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ backgroundColor: COLORS.silver, color: COLORS.onyx }}
      >
        {nextLabel}
      </button>
    </div>
  )
}
