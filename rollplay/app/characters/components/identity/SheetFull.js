/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useEffect, useState } from 'react'

import ChoiceChips from './ChoiceChips'
import { answerText } from './answerText'

export default function SheetFull({ configuration, value, editable, onChange, pending }) {
  const input = configuration.input
  const text = value?.answer?.text ?? ''
  const [draft, setDraft] = useState(text)
  useEffect(() => setDraft(text), [text])

  if (input.kind !== 'text') {
    return (
      <div className="py-1.5">
        <div className="text-[12.5px] text-content-muted mb-1.5">{configuration.label}</div>
        {editable ? (
          <ChoiceChips
            input={input}
            answer={value?.answer}
            disabled={pending}
            onDark
            onChange={(answer) => onChange({ ...value, answer })}
          />
        ) : (
          <span className="text-sm font-semibold">{answerText(value)}</span>
        )}
      </div>
    )
  }

  const commit = () => {
    if (draft !== text) onChange({ ...value, answer: { kind: 'text', text: draft } })
  }

  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[12.5px] text-content-muted">{configuration.label}</span>
      {editable ? (
        <input
          className="w-[180px] px-2 py-1 rounded-sm border border-border bg-surface-primary text-content-primary text-right text-sm disabled:opacity-60"
          maxLength={input.max_length}
          value={draft}
          disabled={pending}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
        />
      ) : (
        <span className="text-sm font-semibold">{answerText(value)}</span>
      )}
    </div>
  )
}
