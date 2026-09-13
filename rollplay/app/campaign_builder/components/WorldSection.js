/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

/**
 * The World section, deliberately a stub in v1.
 *
 * Shown rather than hidden so a GM can see where reference tables will live and what they
 * will be for — display-only, never enforced. The examples are ghosted because they are
 * illustrations, not data anyone can save.
 */
export default function WorldSection() {
  return (
    <div className="max-w-[820px] rounded-xl border border-dashed border-[#E5DECF] bg-[#FBF7EF] px-8 py-7">
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#9A7526] mb-2.5">World</div>
      <div className="flex items-center gap-3">
        <div className="font-[family-name:var(--font-metamorphous)] text-[26px] text-content-primary">Reference tables for your world</div>
        <span className="px-2 py-0.5 rounded-sm border border-[#B5ADA6] text-[10px] font-semibold uppercase tracking-[0.1em] text-content-muted">
          Not in v1
        </span>
      </div>
      <p className="mt-3 max-w-[620px] text-[13px] leading-relaxed text-[#4C463E]">
        Travel pace, mounts, prices, light sources. Whatever your table needs to look up mid-game.
        Display-only, never enforced. Not part of the first release.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-5 opacity-55 pointer-events-none">
        <ExampleTable
          caption="Travel pace"
          headers={['Pace', 'A day', 'Notice things']}
          rows={[
            ['Slow', 'Short', 'Easily'],
            ['Steady', 'Normal', 'Usually'],
            ['Hard', 'Long', 'Rarely'],
          ]}
        />
        <ExampleTable
          caption="Lodging"
          headers={['Comfort', 'A night']}
          rows={[
            ['Rough', 'Cheap'],
            ['Plain', 'Modest'],
            ['Fine', 'Dear'],
          ]}
        />
      </div>

      <div className="mt-5 inline-flex px-4 py-2.5 rounded-lg border border-[#37322F] text-[13px] text-[#37322F] opacity-55 pointer-events-none">
        + Add table
      </div>
    </div>
  )
}

function ExampleTable({ caption, headers, rows }) {
  return (
    <div>
      <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-content-muted mb-2">{caption}</div>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} className="text-left text-[11px] uppercase tracking-[0.12em] text-content-muted px-2.5 py-2 border-b border-[#E5DECF]">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]} className="even:bg-[#F6F1E6]">
              {row.map((cell) => (
                <td key={cell} className="px-2.5 py-2 border-b border-[#F0EBE1]">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
