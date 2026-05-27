/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronRight, faXmark } from '@fortawesome/free-solid-svg-icons'

import { THEME, COLORS } from '@/app/styles/colorTheme'

/**
 * Shared wrapper for the wizard's picker-style tiles (class, background,
 * species in future). Three rendering modes drive the look:
 *
 *  - ``collapsed`` — picker row, just the name + summary chip + chevron.
 *    Click anywhere on the row fires ``onExpand``.
 *  - ``expandedToPick`` — picker row, expanded. Renders ``children`` (the
 *    tile-specific info body) plus a "Select {selectLabel}" button at the
 *    bottom-right. Clicking the header again collapses (``onCollapse``).
 *  - ``selected`` — a tile the player has already chosen. Always expanded;
 *    renders ``children`` (tile-specific info + config controls). A small
 *    ✕ in the top-right calls ``onRemove`` (when provided).
 *
 * The wrapper owns: chevron animation, header styling, border highlight
 * for selected, ✕ button, and the Select button. The caller is responsible
 * for the body content (info section, config controls) via ``children``.
 */
export default function ExpandableTile({
  name,
  summary,
  mode,
  selectLabel,
  onExpand,
  onCollapse,
  onSelect,
  onRemove,
  children,
}) {
  const isExpanded = mode === 'expandedToPick' || mode === 'selected'
  const isClickableHeader = mode === 'collapsed' || mode === 'expandedToPick'

  const HeaderTag = isClickableHeader ? 'button' : 'div'
  const headerProps = isClickableHeader
    ? {
        type: 'button',
        onClick: mode === 'collapsed' ? onExpand : onCollapse,
      }
    : {}

  return (
    <div
      className="rounded-sm border overflow-hidden"
      style={{
        borderColor: mode === 'selected' ? COLORS.silver : THEME.borderSubtle,
        backgroundColor: `${COLORS.smoke}05`,
      }}
    >
      <HeaderTag
        {...headerProps}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors"
        style={{
          backgroundColor:
            mode === 'expandedToPick' || mode === 'selected'
              ? `${COLORS.silver}10`
              : 'transparent',
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {isClickableHeader && (
            <FontAwesomeIcon
              icon={faChevronRight}
              className="h-3 w-3 transition-transform"
              style={{
                color: THEME.textSecondary,
                transform: mode === 'expandedToPick' ? 'rotate(90deg)' : 'rotate(0deg)',
              }}
            />
          )}
          <span className="font-semibold" style={{ color: THEME.textOnDark }}>
            {name}
          </span>
          {summary && (
            <span className="text-xs" style={{ color: THEME.textSecondary }}>
              {summary}
            </span>
          )}
        </div>

        {mode === 'selected' && onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            className="shrink-0 p-1 rounded hover:bg-rose-500/20"
            style={{ color: '#fca5a5' }}
            aria-label={`Remove ${name}`}
            title={`Remove ${name}`}
          >
            <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
          </button>
        )}
      </HeaderTag>

      {isExpanded && (
        <div className="px-4 py-4 space-y-4 border-t" style={{ borderColor: THEME.borderSubtle }}>
          {children}

          {mode === 'expandedToPick' && (
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={onSelect}
                className="px-4 py-2 rounded-sm font-semibold text-sm"
                style={{ backgroundColor: COLORS.silver, color: COLORS.onyx }}
              >
                Select {selectLabel ?? name}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
