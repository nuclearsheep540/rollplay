/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

/**
 * The small inputs every component's parameter editor is built from.
 *
 * They exist because three editors needed the same labelled number box, not to be a
 * general form kit — anything more elaborate belongs in the component that needs it.
 */

const INPUT_CLASS =
  'w-full box-border px-3 py-2 rounded-sm border border-[#37322F] bg-[#F7F4F3] text-[#1F1F1F] text-sm'

export function NumberField({ label, value, min, max, step, onChange, allowEmpty = false, hint }) {
  return (
    <div>
      <label className="block text-[13px] font-medium mb-2 text-[#37322F]">{label}</label>
      <input
        type="number"
        className={INPUT_CLASS}
        value={value ?? ''}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const raw = event.target.value
          if (raw === '') {
            onChange(allowEmpty ? null : min ?? 0)
            return
          }
          onChange(Number(raw))
        }}
      />
      {hint && <div className="mt-1.5 text-[12px] text-content-muted">{hint}</div>}
    </div>
  )
}

export function TextField({ label, value, maxLength, onChange, className = '' }) {
  return (
    <div>
      {label && <label className="block text-[13px] font-medium mb-2 text-[#37322F]">{label}</label>}
      <input
        className={`${INPUT_CLASS} ${className}`}
        value={value ?? ''}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

export function CheckboxField({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 pb-2.5 text-[13px] text-[#37322F] cursor-pointer">
      <input type="checkbox" checked={!!checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  )
}

export function SelectField({ label, value, options, onChange }) {
  return (
    <div>
      <label className="block text-[13px] font-medium mb-2 text-[#37322F]">{label}</label>
      <select className={INPUT_CLASS} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
