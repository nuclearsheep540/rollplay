/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

export default function CreateInput({ configuration, value, onChange }) {
  return (
    <div>
      <label className="block text-[13px] font-medium mb-2 text-[#37322F]">
        {configuration.label}
        {configuration.required && <span className="ml-1.5 text-[#9A7526]">required</span>}
      </label>
      <input
        className="w-full box-border px-3 py-2 rounded-sm border border-[#37322F] bg-[#F7F4F3] text-[#1F1F1F] text-base"
        maxLength={configuration.max_length}
        value={value?.text ?? ''}
        onChange={(event) => onChange({ ...value, text: event.target.value })}
      />
    </div>
  )
}
