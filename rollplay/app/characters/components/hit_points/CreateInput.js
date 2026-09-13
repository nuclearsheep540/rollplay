/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { SKEW_BOX, SKEW_LABEL } from '@/app/styles/plateGeometry'

export default function CreateInput({ configuration, value, onChange }) {
  const rules = configuration.rules

  if (rules.representation === 'int') {
    return (
      <div>
        <label className="block text-[13px] font-medium mb-2 text-[#37322F]">{configuration.label}</label>
        <div className="flex items-center gap-3">
          <input
            type="number"
            className="w-[90px] box-border px-3 py-2 rounded-sm border border-[#37322F] bg-[#F7F4F3] text-center text-lg font-semibold"
            value={value?.state?.current ?? ''}
            onChange={(event) =>
              onChange({ ...value, state: { representation: 'int', current: Number(event.target.value) } })
            }
          />
          <div className="text-[12.5px] text-content-muted">
            {rules.minimum} to {rules.maximum}. Starts at {rules.starting}.
          </div>
        </div>
      </div>
    )
  }

  const startingStep = rules.scale.find((step) => step.weight === rules.starting_weight)

  return (
    <div>
      <label className="block text-[13px] font-medium mb-2 text-[#37322F]">{configuration.label}</label>
      <div className="flex gap-1.5 flex-wrap">
        {rules.scale.map((step) => {
          const selected = value?.state?.current_weight === step.weight
          return (
            <button
              key={step.weight}
              type="button"
              style={{ transform: SKEW_BOX }}
              className={`px-2.5 py-1 rounded-sm text-[11px] font-semibold tracking-widest uppercase border ${
                selected ? 'bg-[#D9A441] text-[#241C08] border-[#D9A441]' : 'border-[rgba(31,31,31,0.35)] text-[#1F1F1F]'
              }`}
              onClick={() =>
                onChange({ ...value, state: { representation: 'weighted', current_weight: step.weight } })
              }
            >
              <span className="inline-block" style={{ transform: SKEW_LABEL }}>
                {step.label}
              </span>
            </button>
          )
        })}
      </div>
      {startingStep && (
        <div className="mt-2 text-[12.5px] text-content-muted">Starts at {startingStep.label}.</div>
      )}
    </div>
  )
}
