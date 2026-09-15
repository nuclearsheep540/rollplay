/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

/**
 * The System section: how this campaign is played. D&D 5e, Coriolis, something the GM
 * made up — the campaign's own reference document. A name for now; the mechanics it
 * describes (combat, dice, turns) come later. Characters are the part of the system
 * that is configured, not described, and live under Character.
 */
export default function SystemSection({ fields, onFieldChange }) {
  return (
    <div className="max-w-[820px] flex flex-col gap-6">
      <div>
        <div className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#9A7526] mb-2">System</div>
        <div className="font-[family-name:var(--font-metamorphous)] text-[28px] text-content-primary">What system does this campaign run on</div>
        <div className="mt-1.5 max-w-[620px] text-[12.5px] leading-relaxed text-content-muted">
          The game system your campaign runs on. Section is still WIP
        </div>
      </div>

      <div className="rounded-md border border-[#E5DECF] bg-white px-6 py-5">
        <label className="block text-[13px] font-medium mb-2 text-[#37322F]" htmlFor="system-name">
          System name
        </label>
        <input
          id="system-name"
          className="w-full max-w-[420px] box-border px-3 py-2 rounded-sm border border-[#37322F] bg-[#F7F4F3] text-[#1F1F1F] text-sm"
          placeholder="D&D 5e, Coriolis, or your own"
          maxLength={80}
          value={fields.systemName}
          onChange={(event) => onFieldChange({ systemName: event.target.value })}
        />
      </div>
    </div>
  )
}
