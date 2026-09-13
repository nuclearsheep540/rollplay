/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useEffect, useState } from 'react'

import { SKEW_BOX, SKEW_LABEL } from '@/app/styles/plateGeometry'

export default function SheetFull({ configuration, value, editable, onChange, pending }) {
  const rules = configuration.rules
  const [draft, setDraft] = useState(value?.state?.current ?? 0)
  useEffect(() => setDraft(value?.state?.current ?? 0), [value?.state?.current])

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

  const step = (delta) => {
    const next = Math.max(rules.minimum, Math.min(rules.maximum, Number(draft) + delta))
    setDraft(next)
    onChange({ ...value, state: { representation: 'int', current: next } })
  }

  const commit = () => {
    const next = Number(draft)
    if (next !== value?.state?.current) {
      onChange({ ...value, state: { representation: 'int', current: next } })
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[12.5px] text-content-muted">{configuration.label}</span>
      {editable ? (
        <div className="flex items-center gap-1.5">
          <button type="button" disabled={pending} className="px-2 py-0.5 rounded border border-border disabled:opacity-60" onClick={() => step(-1)}>
            −
          </button>
          <input
            type="number"
            className="w-[64px] px-1 py-1 rounded-sm border border-border bg-surface-primary text-center text-sm font-semibold disabled:opacity-60"
            value={draft}
            disabled={pending}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
          />
          <button type="button" disabled={pending} className="px-2 py-0.5 rounded border border-border disabled:opacity-60" onClick={() => step(1)}>
            +
          </button>
          <span className="ml-1 text-[11px] text-content-muted">/ {rules.maximum}</span>
        </div>
      ) : (
        <span className="text-sm font-semibold">
          {value?.state?.current ?? '—'} / {rules.maximum}
        </span>
      )}
    </div>
  )
}
