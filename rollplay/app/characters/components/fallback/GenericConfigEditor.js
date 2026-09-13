/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

/**
 * A component this build has no editor for — a backend that knows more than this deploy.
 * Shows what is there and changes nothing, so the draft survives a save untouched rather
 * than being silently rewritten by a form that does not understand it.
 */
export default function GenericConfigEditor({ configuration }) {
  return (
    <div className="rounded-md border border-dashed border-border px-4 py-3 text-[12.5px] text-content-muted">
      This version of the app doesn&apos;t have an editor for “{configuration.type}”. Its settings are
      kept as they are.
    </div>
  )
}
