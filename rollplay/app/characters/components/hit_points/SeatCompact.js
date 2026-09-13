/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

/**
 * A bar and a caption. The zero point is rendered and nothing else happens at it — what
 * running out means is the table's decision, never the app's.
 */
export default function SeatCompact({ configuration, value }) {
  const rules = configuration.rules
  let fraction = 0
  let caption = '—'

  if (rules.representation === 'int') {
    const current = value?.state?.current ?? rules.minimum
    const span = rules.maximum - rules.minimum
    fraction = span > 0 ? (current - rules.minimum) / span : 0
    caption = `${current} / ${rules.maximum}`
  } else {
    const weight = value?.state?.current_weight ?? 0
    fraction = weight
    caption = rules.scale.find((step) => step.weight === weight)?.label ?? String(weight)
  }

  const clamped = Math.max(0, Math.min(1, fraction))

  return (
    <div className="mt-1.5">
      <div className="text-[11px] uppercase tracking-widest text-content-secondary">{configuration.label}</div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-[rgba(181,173,166,0.35)] overflow-hidden">
        <div className="h-full rounded-full bg-[#D9A441]" style={{ width: `${clamped * 100}%` }} />
      </div>
      <div className="mt-0.5 text-[11px] text-content-secondary">{caption}</div>
    </div>
  )
}
