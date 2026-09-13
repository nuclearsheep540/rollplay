/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useRef } from 'react'

import Dropdown from '@/app/shared/components/Dropdown'
import { pieceFor, labelForType } from '@/app/characters/components/registry'
import { SKEW_BOX, SKEW_LABEL } from '@/app/styles/plateGeometry'

/**
 * One configured component in the GM's list.
 *
 * The card owns what every component has — a type chip, a label, the duplicate and
 * delete actions, a grip, and the flags every component carries (Secret, and Required
 * where the type has it) — and delegates the parameters to the type's own editor. Nothing
 * here knows what hit points are, and nothing here knows where in the list it sits: drag
 * callbacks say only "before me" or "after me", and the list decides what that means.
 */
export default function ComponentCard({
  configuration,
  onChange,
  onDuplicate,
  onRemove,
  // Where this card can be sent without dragging: one menu item per destination, as
  // Dropdown items. Empty when there is nowhere else to go, and the button stays hidden.
  moveOptions = [],
  // Whether what is in hand may land on this card. When it may not — a group over a card
  // inside another group — the card leaves the event alone, so it bubbles to the group,
  // which places the drop before or after itself. Claiming it would make the card dead.
  droppable = true,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragging = false,
}) {
  const cardRef = useRef(null)
  const ConfigEditor = pieceFor(configuration.type, 'ConfigEditor')

  // Which half of the card the cursor is in decides whether a drop lands before or after
  // it. Without this a drop "on" a card is ambiguous, and the placeholder would sometimes
  // show a slot the drop does not go to.
  const positionFor = (event) => {
    const rect = cardRef.current?.getBoundingClientRect()
    if (!rect) return 'after'
    return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
  }
  // Required is a Name thing today; it appears only where the configuration carries it,
  // so a type without the concept never shows a switch that would do nothing.
  const hasRequired = Object.prototype.hasOwnProperty.call(configuration, 'required')

  return (
    <div
      ref={cardRef}
      className={`flex overflow-hidden rounded-md border border-[#E5DECF] bg-white transition-opacity ${
        isDragging ? 'opacity-40' : ''
      }`}
      onDragOver={(event) => {
        if (!droppable) return
        event.preventDefault()
        // A card inside a group sits inside another drop target; the group must not also
        // hear this and offer a slot beside itself.
        event.stopPropagation()
        // "move", not the default "copy" — the copy effect is what drew a + cursor.
        event.dataTransfer.dropEffect = 'move'
        onDragOver?.(positionFor(event))
      }}
      onDrop={(event) => {
        if (!droppable) return
        event.preventDefault()
        event.stopPropagation()
        onDrop?.(positionFor(event))
      }}
    >
      <div
        draggable
        onDragStart={(event) => {
          // A drag only truly starts once data is set — without this Safari and Chrome
          // draw a copy cursor and no drag image. The ghost is the whole card, not the
          // grip that is draggable.
          event.dataTransfer.setData('text/plain', configuration.id)
          event.dataTransfer.effectAllowed = 'move'
          if (cardRef.current) event.dataTransfer.setDragImage(cardRef.current, 24, 24)
          onDragStart?.()
        }}
        onDragEnd={() => onDragEnd?.()}
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

          <div className="flex items-center gap-2 shrink-0">
            {moveOptions.length > 0 && (
              <Dropdown
                align="right"
                items={moveOptions}
                trigger={
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#37322F] text-[12px] font-medium text-[#37322F] hover:border-[#D9A441] hover:text-[#9A7526]"
                  >
                    Move to
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 6l4 4 4-4" />
                    </svg>
                  </button>
                }
              />
            )}
            <button
              type="button"
              onClick={onDuplicate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#37322F] text-[12px] font-medium text-[#37322F] hover:border-[#D9A441] hover:text-[#9A7526]"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
                <rect x="5.5" y="5.5" width="8" height="8" rx="1.2" />
                <path d="M10.5 5.5V3.7a1.2 1.2 0 0 0-1.2-1.2H3.7a1.2 1.2 0 0 0-1.2 1.2v5.6a1.2 1.2 0 0 0 1.2 1.2h1.8" />
              </svg>
              Duplicate
            </button>
            <button
              type="button"
              title="Remove component"
              onClick={onRemove}
              className="inline-flex items-center justify-center w-8 h-8 rounded border border-[#37322F] text-[#37322F] hover:border-feedback-error hover:text-feedback-error"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <path d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.6 8h4.8l.6-8" />
              </svg>
            </button>
          </div>
        </div>

        <div>
          <div className="text-[11px] font-semibold tracking-[0.12em] uppercase text-content-muted mb-1.5">
            Description <span className="normal-case tracking-normal font-normal">(optional)</span>
          </div>
          <textarea
            rows={2}
            maxLength={240}
            placeholder="A sentence or two players see under the label."
            className="w-full box-border px-3 py-2 rounded-sm border border-[#37322F] bg-[#F7F4F3] text-[13px] leading-snug resize-none"
            value={configuration.description ?? ''}
            onChange={(event) =>
              onChange({ ...configuration, description: event.target.value.trim() ? event.target.value : null })
            }
          />
        </div>

        {/* Parameters on the left, the flags every component carries bottom-right —
            Required above Secret, so the two switches read as one column. */}
        <div className="flex items-end justify-between gap-6">
          <div className="grow min-w-0 flex flex-col gap-4">
            <ConfigEditor configuration={configuration} onChange={onChange} />
          </div>
          <div className="shrink-0 flex flex-col items-start gap-1.5 pb-0.5">
            {hasRequired && (
              <label className="flex items-center gap-1.5 text-[12.5px] text-[#37322F] cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!configuration.required}
                  onChange={(event) => onChange({ ...configuration, required: event.target.checked })}
                />
                Required
              </label>
            )}
            <label className="flex items-center gap-1.5 text-[12.5px] text-[#37322F] cursor-pointer">
              <input
                type="checkbox"
                checked={!!configuration.secret}
                onChange={(event) => onChange({ ...configuration, secret: event.target.checked })}
              />
              Secret
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}
