/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { SKEW_BOX, SKEW_LABEL } from '@/app/styles/plateGeometry'

/**
 * The GM's options as skewed chips, in the same family as the weighted hit-points
 * scale. One chip lit for a single choice; any number for several. A choice no longer
 * on the list still shows lit — it is the player's answer, and a version difference
 * is theirs to see, not something the form quietly drops.
 */
export default function ChoiceChips({ input, answer, onChange, disabled = false, invalid = false, onDark = false }) {
  const single = input.kind === 'single_select'
  const chosen = single ? (answer?.choice ? [answer.choice] : []) : answer?.choices ?? []
  const options = [...input.options, ...chosen.filter((choice) => !input.options.includes(choice))]

  const toggle = (option) => {
    if (single) {
      onChange({ kind: 'single_select', choice: option })
      return
    }
    const next = chosen.includes(option) ? chosen.filter((choice) => choice !== option) : [...chosen, option]
    onChange({ kind: 'multi_select', choices: next })
  }

  const idle = onDark ? 'border-border text-content-primary' : 'border-[rgba(31,31,31,0.35)] text-[#1F1F1F]'

  return (
    <div className={`flex gap-1.5 flex-wrap max-w-[720px] ${invalid ? 'rounded-sm outline outline-1 outline-feedback-error p-1' : ''}`}>
      {options.map((option) => {
        const selected = chosen.includes(option)
        return (
          <button
            key={option}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            style={{ transform: SKEW_BOX }}
            className={`px-2.5 py-1 rounded-sm text-[11px] font-semibold tracking-widest uppercase border disabled:opacity-60 ${
              selected ? 'bg-[#D9A441] text-[#241C08] border-[#D9A441]' : idle
            }`}
            onClick={() => toggle(option)}
          >
            <span className="inline-block" style={{ transform: SKEW_LABEL }}>
              {option}
            </span>
          </button>
        )
      })}
    </div>
  )
}
