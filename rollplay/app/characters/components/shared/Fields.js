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

export function NumberField({ label, value, min, max, step, onChange, allowEmpty = false }) {
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


/**
 * A number with a minus on the left and a plus on the right.
 *
 * The buttons step within the configuration's range; the box itself accepts what is typed,
 * because a value outside the range is a version difference the GM is shown, never a
 * thing the form refuses (see CharacterSheet's docstring in the contracts).
 */
export function Stepper({ value, min, max, onChange, size = 'md', disabled = false, ariaLabel }) {
  const boxHeight = size === 'sm' ? 'h-8' : 'h-11'
  const boxText = size === 'sm' ? 'text-sm' : 'text-lg'
  const buttonSize = size === 'sm' ? 'w-8 h-8 text-base' : 'w-11 h-11 text-xl'

  const clamp = (next) => {
    let bounded = next
    if (min !== undefined && min !== null) bounded = Math.max(min, bounded)
    if (max !== undefined && max !== null) bounded = Math.min(max, bounded)
    return bounded
  }
  const step = (delta) => onChange(clamp((Number(value) || 0) + delta))

  return (
    <div className="inline-flex items-stretch rounded-sm border border-[#37322F] bg-[#F7F4F3] overflow-hidden">
      <button
        type="button"
        aria-label="Decrease"
        disabled={disabled}
        onClick={() => step(-1)}
        className={`${buttonSize} flex items-center justify-center border-r border-[#37322F] text-[#37322F] hover:bg-[#EDE7DA] disabled:opacity-50`}
      >
        −
      </button>
      <input
        type="number"
        aria-label={ariaLabel}
        className={`number-plain w-[72px] ${boxHeight} ${boxText} text-center font-semibold bg-transparent outline-none`}
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))}
      />
      <button
        type="button"
        aria-label="Increase"
        disabled={disabled}
        onClick={() => step(1)}
        className={`${buttonSize} flex items-center justify-center border-l border-[#37322F] text-[#37322F] hover:bg-[#EDE7DA] disabled:opacity-50`}
      >
        +
      </button>
    </div>
  )
}

/** The form's field anatomy: label, then its description, then the control. */
export function FieldHeader({ label, required = false, hint, description }) {
  return (
    <div className="mb-2.5">
      <div className="text-[13px] font-medium text-[#37322F]">
        {label}
        {required && <span className="ml-1.5 text-[#9A7526]">required</span>}
      </div>
      {hint && <div className="mt-0.5 text-[12.5px] text-content-muted">{hint}</div>}
      {/* The GM's own words about this component, between the hint and the control.
          Capped at a reading measure: the form fills the frame, the sentence must not. */}
      {description && (
        <div className="mt-1.5 max-w-[68ch] text-[13px] leading-snug text-[#37322F]">{description}</div>
      )}
    </div>
  )
}
