/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { pieceFor, labelForType } from '@/app/characters/components/registry'
import { SKEW_BOX, SKEW_LABEL } from '@/app/styles/plateGeometry'

/**
 * One configured component in the GM's list.
 *
 * The card owns what every component has — a type chip, a label, a Secret toggle, a grip
 * and a delete — and delegates the parameters to the type's own editor. Nothing here
 * knows what hit points are.
 */
export default function ComponentCard({
  configuration,
  index,
  onChange,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
}) {
  const ConfigEditor = pieceFor(configuration.type, 'ConfigEditor')

  return (
    <div
      className="flex overflow-hidden rounded-md border border-[#E5DECF] bg-white"
      onDragOver={(event) => {
        event.preventDefault()
        onDragOver?.(index)
      }}
      onDrop={(event) => {
        event.preventDefault()
        onDrop?.(index)
      }}
    >
      <div
        draggable
        onDragStart={() => onDragStart?.(index)}
        title="Drag to reorder"
        className="w-9 shrink-0 cursor-grab bg-[#F6F1E6] border-r border-[#E5DECF] flex items-center justify-center"
      >
        <svg width="14" height="16" viewBox="0 0 14 16" fill="#B5ADA6" aria-hidden="true">
          <circle cx="4" cy="3" r="1.4" /><circle cx="10" cy="3" r="1.4" />
          <circle cx="4" cy="8" r="1.4" /><circle cx="10" cy="8" r="1.4" />
          <circle cx="4" cy="13" r="1.4" /><circle cx="10" cy="13" r="1.4" />
        </svg>
      </div>

      <div className="grow px-6 py-5 flex flex-col gap-4 min-w-0">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="inline-flex px-2.5 py-0.5 rounded-sm bg-[#1F1F1F] text-[#F7F4F3] text-[11px] font-semibold tracking-[0.1em] uppercase shrink-0"
              style={{ transform: SKEW_BOX }}
            >
              <span className="inline-block" style={{ transform: SKEW_LABEL }}>
                {labelForType(configuration.type)}
              </span>
            </span>
            <div className="flex items-center gap-2 min-w-0">
              {/* The caption matters: this box holds the label players will see on the
                  form, not a value. Without it "Name / Name" reads as a name field. */}
              <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-content-muted shrink-0">
                Label
              </span>
              <input
                className="w-[240px] box-border px-3 py-2 rounded-sm border border-[#37322F] bg-[#F7F4F3] font-semibold text-[15px]"
                value={configuration.label}
                maxLength={60}
                onChange={(event) => onChange({ ...configuration, label: event.target.value })}
              />
            </div>
          </div>
          <div className="flex items-center gap-4 text-content-muted shrink-0">
            <label className="flex items-center gap-1.5 text-[12.5px] text-[#37322F] cursor-pointer">
              <input
                type="checkbox"
                checked={!!configuration.secret}
                onChange={(event) => onChange({ ...configuration, secret: event.target.checked })}
              />
              Secret
            </label>
            <button type="button" title="Remove component" onClick={onRemove} className="hover:text-feedback-error">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.6 8h4.8l.6-8" />
              </svg>
            </button>
          </div>
        </div>

        <ConfigEditor configuration={configuration} onChange={onChange} />
      </div>
    </div>
  )
}
