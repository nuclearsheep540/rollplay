/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useEffect, useState } from 'react'

export default function SheetFull({ configuration, value, editable, onChange, pending }) {
  const [draft, setDraft] = useState(value?.text ?? '')
  useEffect(() => setDraft(value?.text ?? ''), [value?.text])

  const commit = () => {
    if (draft !== (value?.text ?? '')) onChange({ ...value, text: draft })
  }

  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[12.5px] text-content-muted">{configuration.label}</span>
      {editable ? (
        <input
          className="w-[180px] px-2 py-1 rounded-sm border border-border bg-surface-primary text-right text-sm disabled:opacity-60"
          maxLength={configuration.max_length}
          value={draft}
          disabled={pending}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
        />
      ) : (
        <span className="text-sm font-semibold">{value?.text ?? '—'}</span>
      )}
    </div>
  )
}
