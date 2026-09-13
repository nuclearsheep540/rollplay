/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useRef, useState } from 'react'

import { SKEW_BOX, SKEW_LABEL } from '@/app/styles/plateGeometry'

/**
 * A GM-named section of the form, holding the component cards dragged into it.
 *
 * Two drop surfaces, kept apart: the card as a whole is a top-level target — a drop on
 * its upper half lands before the group, its lower half after — and the tail row inside
 * is the way in, appending to the members. The member cards between are targets of their
 * own and stop the event, so the group never offers a slot beside itself for a drop that
 * was aimed inside it. The grip drags the whole group; removing it dissolves it and
 * leaves the members where it stood.
 *
 * Collapsed is a view state, not part of the config: it folds the members away so a long
 * form can be arranged at a glance, and it is forgotten when the page is left.
 */
export default function GroupCard({
  group,
  isDragging = false,
  memberInHand = false,
  tailHighlighted = false,
  onRename,
  onUngroup,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onTailDragOver,
  onTailDrop,
  children,
}) {
  const cardRef = useRef(null)
  const [collapsed, setCollapsed] = useState(false)

  const positionFor = (event) => {
    const rect = cardRef.current?.getBoundingClientRect()
    if (!rect) return 'after'
    return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
  }

  // The tail shows itself when there is something to say: always for an empty group, so
  // it explains what it is for; otherwise only while a component is in hand.
  const showsTail = group.components.length === 0 || memberInHand

  return (
    <section
      ref={cardRef}
      className={`rounded-lg border border-[#E5DECF] bg-[#FBF9F5] transition-opacity ${isDragging ? 'opacity-40' : ''}`}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        onDragOver?.(positionFor(event))
      }}
      onDrop={(event) => {
        event.preventDefault()
        onDrop?.(positionFor(event))
      }}
    >
      <div className="flex items-center gap-3 px-3 pt-2.5 pb-2.5">
        <div
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData('text/plain', group.id)
            event.dataTransfer.effectAllowed = 'move'
            if (cardRef.current) event.dataTransfer.setDragImage(cardRef.current, 24, 24)
            onDragStart?.()
          }}
          onDragEnd={() => onDragEnd?.()}
          title="Drag to reorder the group"
          className="w-7 h-8 shrink-0 cursor-grab rounded-sm bg-[#F6F1E6] border border-[#E5DECF] flex items-center justify-center"
        >
          <svg width="14" height="16" viewBox="0 0 14 16" fill="#B5ADA6" aria-hidden="true">
            <circle cx="4" cy="3" r="1.4" /><circle cx="10" cy="3" r="1.4" />
            <circle cx="4" cy="8" r="1.4" /><circle cx="10" cy="8" r="1.4" />
            <circle cx="4" cy="13" r="1.4" /><circle cx="10" cy="13" r="1.4" />
          </svg>
        </div>
        <span
          className="inline-flex px-2.5 py-0.5 rounded-sm bg-[#D9A441] text-[#241C08] text-[11px] font-semibold tracking-[0.1em] uppercase shrink-0"
          style={{ transform: SKEW_BOX }}
        >
          <span className="inline-block" style={{ transform: SKEW_LABEL }}>Group</span>
        </span>
        <input
          className="w-[240px] box-border px-3 py-1.5 rounded-sm border border-[#37322F] bg-[#F7F4F3] font-semibold text-[14px]"
          value={group.label}
          maxLength={60}
          aria-label="Group name"
          onChange={(event) => onRename({ label: event.target.value })}
        />
        <span className="grow flex justify-center">
          <button
            type="button"
            onClick={() => setCollapsed((current) => !current)}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand the group' : 'Collapse the group'}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-content-muted hover:text-[#9A7526]"
          >
            {collapsed && (
              <span className="text-[12px]">
                {group.components.length} component{group.components.length === 1 ? '' : 's'}
              </span>
            )}
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className={`transition-transform ${collapsed ? '-rotate-90' : ''}`}
            >
              <path d="M4 6l4 4 4-4" />
            </svg>
          </button>
        </span>
        <button
          type="button"
          onClick={onUngroup}
          title="Dissolve the group; its components stay"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#37322F] text-[12px] font-medium text-[#37322F] hover:border-[#D9A441] hover:text-[#9A7526]"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 3H3.5A1.5 1.5 0 0 0 2 4.5v7A1.5 1.5 0 0 0 3.5 13H5M11 3h1.5A1.5 1.5 0 0 1 14 4.5v7a1.5 1.5 0 0 1-1.5 1.5H11M6 8h4" />
          </svg>
          Remove group
        </button>
      </div>

      {!collapsed && (
        <div className="px-3 pb-3 flex flex-col gap-3">
          {children}
          {showsTail && (
            <div
              onDragOver={(event) => {
                // Only a component can come in; a group in hand falls through to the card,
                // which places it after this group instead.
                if (!memberInHand) return
                event.preventDefault()
                event.stopPropagation()
                event.dataTransfer.dropEffect = 'move'
                onTailDragOver?.()
              }}
              onDrop={(event) => {
                if (!memberInHand) return
                event.preventDefault()
                event.stopPropagation()
                onTailDrop?.()
              }}
              className={`rounded-md border border-dashed px-4 py-3 text-center text-[12.5px] text-content-muted ${
                tailHighlighted ? 'border-[#D9A441] bg-[#FBF7EF]' : 'border-[#E5DECF]'
              }`}
            >
              {group.components.length === 0 ? 'Drag components in here' : `Drop to add to ${group.label || 'this group'}`}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
