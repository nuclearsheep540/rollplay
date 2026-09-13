/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { SKEW_BOX, SKEW_LABEL } from '@/app/styles/plateGeometry'
import { FieldHeader, Stepper } from '../shared/Fields'

export default function CreateInput({ configuration, value, onChange }) {
  const rules = configuration.rules

  if (rules.representation === 'int') {
    // What the player enters is the character's own maximum — the GM's range bounds the
    // entry, nothing more — and current begins equal to it.
    return (
      <div>
        <FieldHeader
          label={configuration.label}
          hint={rules.minimum === rules.maximum ? `Maximum ${rules.maximum}` : `Maximum ${rules.minimum} to ${rules.maximum}`}
          description={configuration.description}
        />
        <Stepper
          ariaLabel={configuration.label}
          value={value?.state?.maximum}
          min={rules.minimum}
          max={rules.maximum}
          onChange={(maximum) => onChange({ ...value, state: { representation: 'int', maximum, current: maximum } })}
        />
      </div>
    )
  }

  return (
    <div>
      <FieldHeader label={configuration.label} description={configuration.description} />
      <div className="flex gap-1.5 flex-wrap max-w-[720px]">
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
    </div>
  )
}
