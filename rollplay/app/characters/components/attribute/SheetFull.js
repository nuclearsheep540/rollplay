/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useEffect, useState } from 'react'

export default function SheetFull({ configuration, value, editable, onChange, pending }) {
  const [draft, setDraft] = useState(value?.score ?? 0)
  useEffect(() => setDraft(value?.score ?? 0), [value?.score])

  const commit = () => {
    if (draft !== value?.score) onChange({ ...value, score: Number(draft) })
  }

  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[12.5px] text-content-muted">{configuration.label}</span>
      {editable ? (
        <input
          type="number"
          className="w-[80px] px-2 py-1 rounded-sm border border-border bg-surface-primary text-center text-sm font-semibold disabled:opacity-60"
          value={draft}
          disabled={pending}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
        />
      ) : (
        <span className="text-sm font-semibold">{value?.score ?? '—'}</span>
      )}
    </div>
  )
}
