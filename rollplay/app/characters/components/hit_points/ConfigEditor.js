/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { NumberField, SelectField, TextField } from '../shared/Fields'

/**
 * Both representations of hit points, behind one selector.
 *
 * Switching representation replaces `rules` wholesale with that representation's defaults
 * rather than trying to translate: a number and an ordered scale have no honest mapping
 * between them, and a half-translated one would be worse than starting clean.
 */

const INT_DEFAULTS = { representation: 'int', minimum: 1, maximum: 10 }
const WEIGHTED_DEFAULTS = {
  representation: 'weighted',
  starting_weight: 1.0,
  scale: [
    { weight: 1.0, label: 'Full' },
    { weight: 0.5, label: 'Half' },
    { weight: 0.0, label: 'Zero' },
  ],
}

export default function ConfigEditor({ configuration, onChange }) {
  const rules = configuration.rules
  const setRules = (next) => onChange({ ...configuration, rules: next })

  const representationSelect = (
    <SelectField
      label="Representation"
      value={rules.representation}
      options={[
        { value: 'int', label: 'Number' },
        { value: 'weighted', label: 'Weighted scale' },
      ]}
      onChange={(representation) =>
        setRules(representation === 'int' ? { ...INT_DEFAULTS } : { ...WEIGHTED_DEFAULTS })
      }
    />
  )

  if (rules.representation === 'int') {
    return (
      <>
        <div className="grid grid-cols-[200px_repeat(2,140px)] gap-4 items-end">
          {representationSelect}
          <NumberField label="Minimum" value={rules.minimum} min={0} onChange={(minimum) => setRules({ ...rules, minimum })} />
          <NumberField label="Maximum" value={rules.maximum} min={1} onChange={(maximum) => setRules({ ...rules, maximum })} />
        </div>
        <div className="text-[12.5px] text-content-muted leading-snug">
          The lowest and highest maximum a player may set. In play, hit points run from that maximum down to 0.
        </div>
      </>
    )
  }

  const updateStep = (index, patch) => {
    const scale = rules.scale.map((step, position) => (position === index ? { ...step, ...patch } : step))
    setRules({ ...rules, scale })
  }

  const removeStep = (index) => {
    const scale = rules.scale.filter((step, position) => position !== index)
    const startingStillPresent = scale.some((step) => step.weight === rules.starting_weight)
    setRules({
      ...rules,
      scale,
      starting_weight: startingStillPresent ? rules.starting_weight : scale[0]?.weight ?? 1.0,
    })
  }

  return (
    <>
      <div className="grid grid-cols-[200px_1fr] gap-4 items-start">
        <div className="flex flex-col gap-4">
          {representationSelect}
          <SelectField
            label="Starting step"
            value={String(rules.starting_weight)}
            options={rules.scale.map((step) => ({ value: String(step.weight), label: step.label }))}
            onChange={(weight) => setRules({ ...rules, starting_weight: Number(weight) })}
          />
        </div>
        <div>
          <label className="block text-[13px] font-medium mb-2 text-[#37322F]">Scale, best to worst</label>
          <div className="flex flex-col gap-1.5">
            {rules.scale.map((step, index) => (
              <div key={index} className="grid grid-cols-[80px_1fr_28px] gap-2 items-center">
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  className="w-full box-border px-2 py-2 rounded-sm border border-[#37322F] bg-[#F7F4F3] text-sm"
                  value={step.weight}
                  onChange={(event) => updateStep(index, { weight: Number(event.target.value) })}
                />
                <TextField value={step.label} maxLength={40} onChange={(label) => updateStep(index, { label })} />
                <button
                  type="button"
                  className="text-content-muted hover:text-feedback-error"
                  title="Remove step"
                  onClick={() => removeStep(index)}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              className="self-start mt-1 px-3 py-2 text-xs rounded-lg border border-[#37322F] text-[#37322F]"
              onClick={() => setRules({ ...rules, scale: [...rules.scale, { weight: 0.0, label: 'New step' }] })}
            >
              + Add step
            </button>
          </div>
        </div>
      </div>
      <div className="text-[12.5px] text-content-muted leading-snug">
        An ordered scale. Damage moves a character down it. The last step is the zero point.
      </div>
    </>
  )
}
