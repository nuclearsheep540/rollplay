/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useEffect, useState } from 'react'

import { SKEW_BOX, SKEW_LABEL } from '@/app/styles/plateGeometry'
import { Stepper } from '../shared/Fields'

export default function SheetFull({ configuration, value, editable, onChange, pending }) {
  const rules = configuration.rules
  const current = value?.state?.current
  const maximum = value?.state?.maximum
  const [draft, setDraft] = useState(current ?? 0)
  useEffect(() => setDraft(current ?? 0), [current])

  if (rules.representation === 'weighted') {
    const current = value?.state?.current_weight
    return (
      <div className="py-1.5">
        <div className="text-[12.5px] text-content-muted mb-1.5">{configuration.label}</div>
        <div className="flex gap-1.5 flex-wrap">
          {rules.scale.map((step) => (
            <button
              key={step.weight}
              type="button"
              disabled={!editable || pending}
              style={{ transform: SKEW_BOX }}
              className={`px-2.5 py-1 rounded-sm text-[11px] font-semibold tracking-widest uppercase border disabled:opacity-60 ${
                step.weight === current
                  ? 'bg-[#D9A441] text-[#241C08] border-[#D9A441]'
                  : 'border-border text-content-primary'
              }`}
              onClick={() =>
                onChange({ ...value, state: { representation: 'weighted', current_weight: step.weight } })
              }
            >
              <span className="inline-block" style={{ transform: SKEW_LABEL }}>
                {step.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // Current moves between 0 and the character's own maximum — the GM's range bounded the
  // entry, not play. The maximum is the character's too (a level-up raises it), so it is
  // a second, smaller stepper rather than a fixed caption.
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[12.5px] text-content-muted">{configuration.label}</span>
      {editable ? (
        <div className="flex items-center gap-2">
          <Stepper
            size="sm"
            ariaLabel={configuration.label}
            value={draft}
            min={0}
            max={maximum}
            disabled={pending}
            onChange={(next) => {
              setDraft(next)
              if (next !== '' && next !== current) {
                onChange({ ...value, state: { representation: 'int', maximum, current: next } })
              }
            }}
          />
          <span className="text-[11px] text-content-muted">/</span>
          <Stepper
            size="sm"
            ariaLabel={`${configuration.label} maximum`}
            value={maximum}
            min={1}
            disabled={pending}
            onChange={(next) => {
              if (next === '' || next === maximum) return
              onChange({ ...value, state: { representation: 'int', maximum: next, current: Math.min(current ?? next, next) } })
            }}
          />
        </div>
      ) : (
        <span className="text-sm font-semibold">
          {current ?? '—'} / {maximum ?? '—'}
        </span>
      )}
    </div>
  )
}
