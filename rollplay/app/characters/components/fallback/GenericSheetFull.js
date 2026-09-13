/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

/** Label and raw value: enough to see it exists, never enough to corrupt it. */
export default function GenericSheetFull({ configuration, value }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[12.5px] text-content-muted">{configuration.label}</span>
      <span className="text-sm font-mono text-content-muted">{JSON.stringify(value ?? null)}</span>
    </div>
  )
}
