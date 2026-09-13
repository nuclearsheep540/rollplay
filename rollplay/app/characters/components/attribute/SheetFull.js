/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useEffect, useState } from 'react'

import { Stepper } from '../shared/Fields'

export default function SheetFull({ configuration, value, editable, onChange, pending }) {
  const [draft, setDraft] = useState(value?.score ?? 0)
  useEffect(() => setDraft(value?.score ?? 0), [value?.score])

  // The same minus/plus box as the create form and the hit-points row, stepping within
  // the GM's range; a typed value outside it is accepted, as everywhere. Each step is a
  // save, like hit points — the row is read mid-play, and a change should land at once.
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[12.5px] text-content-muted">{configuration.label}</span>
      {editable ? (
        <Stepper
          size="sm"
          ariaLabel={configuration.label}
          value={draft}
          min={configuration.minimum}
          max={configuration.maximum}
          disabled={pending}
          onChange={(next) => {
            setDraft(next)
            if (next !== '' && next !== value?.score) onChange({ ...value, score: next })
          }}
        />
      ) : (
        <span className="text-sm font-semibold">{value?.score ?? '—'}</span>
      )}
    </div>
  )
}
