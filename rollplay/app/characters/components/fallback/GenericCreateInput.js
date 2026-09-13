/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

export default function GenericCreateInput({ configuration }) {
  return (
    <div className="rounded-md border border-dashed border-border px-4 py-3">
      <div className="text-[13px] font-medium text-[#37322F]">{configuration.label}</div>
      <div className="mt-1 text-[12.5px] text-content-muted">
        This version of the app can&apos;t fill this in yet. Your GM will set it up.
      </div>
    </div>
  )
}
