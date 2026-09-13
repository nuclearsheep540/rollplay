/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { FieldHeader } from '../shared/Fields'
import ChoiceChips from './ChoiceChips'

/** The player's answer to an identity, in the shape the GM chose for it. */
export default function CreateInput({ configuration, value, error, onChange, readOnly = false }) {
  const input = configuration.input

  return (
    <div>
      <FieldHeader label={configuration.label} required={configuration.required} description={configuration.description} />
      {input.kind === 'text' ? (
        <input
          className={`w-full max-w-[520px] box-border px-3 py-2 rounded-sm border bg-[#F7F4F3] text-[#1F1F1F] text-base ${
            error ? 'border-feedback-error' : 'border-[#37322F]'
          }`}
          aria-invalid={!!error}
          readOnly={readOnly}
          maxLength={input.max_length}
          value={value?.answer?.text ?? ''}
          onChange={(event) => onChange({ ...value, answer: { kind: 'text', text: event.target.value } })}
        />
      ) : (
        <ChoiceChips
          input={input}
          answer={value?.answer}
          invalid={!!error}
          disabled={readOnly}
          onChange={(answer) => onChange({ ...value, answer })}
        />
      )}
      {error && <div className="mt-1.5 text-[12.5px] text-feedback-error">{error}</div>}
    </div>
  )
}
