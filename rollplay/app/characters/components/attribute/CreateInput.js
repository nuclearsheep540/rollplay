/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

export default function CreateInput({ configuration, value, onChange }) {
  const hint =
    configuration.default === null || configuration.default === undefined
      ? `${configuration.minimum} to ${configuration.maximum}`
      : `${configuration.minimum} to ${configuration.maximum}, default ${configuration.default}`

  return (
    <div className="rounded-xl border border-[#E5DECF] bg-[#FBF7EF] px-4 py-3.5 flex flex-col gap-2">
      <div className="font-semibold text-[13.5px] text-[#141210]">{configuration.label}</div>
      <input
        type="number"
        className="w-full box-border px-3 py-2 rounded-sm border border-[#37322F] bg-[#F7F4F3] text-center text-lg font-semibold"
        value={value?.score ?? ''}
        onChange={(event) => onChange({ ...value, score: Number(event.target.value) })}
      />
      <div className="text-[12.5px] text-content-muted">{hint}</div>
    </div>
  )
}
