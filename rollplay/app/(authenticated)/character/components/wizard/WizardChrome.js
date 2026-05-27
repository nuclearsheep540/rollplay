/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPenToSquare } from '@fortawesome/free-regular-svg-icons'

import { THEME, COLORS } from '@/app/styles/colorTheme'

import CharacterAvatarPane from '../CharacterAvatarPane'

const SRD_ATTRIBUTION =
  'Content from D&D SRD 5.2.1, © Wizards of the Coast, used under CC BY 4.0.'

function SaveIndicator({ state }) {
  const label =
    state === 'saving' ? 'Saving…' :
    state === 'saved' ? 'Saved' :
    state === 'error' ? 'Save failed' :
    ''
  const color =
    state === 'error' ? '#f87171' :
    state === 'saved' ? COLORS.silver :
    THEME.textSecondary

  return (
    <span
      className="text-xs uppercase tracking-wide transition-opacity duration-200"
      style={{ color, opacity: label ? 1 : 0 }}
    >
      {label || 'Idle'}
    </span>
  )
}

/**
 * One stage indicator row in the vertical stage column on the right side
 * of the wizard. Label sits on the LEFT of the numbered dot — labels are
 * right-aligned via the parent column so the numbers line up vertically.
 */
function StepDot({ step, isCurrent, isComplete, onClick, clickable }) {
  const bg = isCurrent
    ? COLORS.silver
    : isComplete
    ? COLORS.graphite
    : 'transparent'
  const border = isCurrent || isComplete ? COLORS.silver : THEME.borderDefault
  const dotText = isCurrent || isComplete ? THEME.textBold : THEME.textSecondary

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={onClick}
      className="flex items-center gap-3 disabled:cursor-default w-full justify-end"
    >
      <span
        className="text-sm whitespace-nowrap"
        style={{
          color: isCurrent ? COLORS.onyx : THEME.textSecondary,
          fontWeight: isCurrent ? 600 : 400,
        }}
      >
        {step.label}
      </span>
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold shrink-0"
        style={{ backgroundColor: bg, borderColor: border, color: dotText }}
      >
        {isComplete ? '✓' : step.idx + 1}
      </span>
    </button>
  )
}

// Vertical separator between stacked stage indicators — three small dots
// stacked under the number column, muted so the active indicator stays the
// eye-catcher. Each dot lives in a ``w-6`` span (matching the numbered
// dot's width) aligned to the right edge of the stage column, so the dot
// centres line up vertically with the numbered-dot centres above and below.
function StepSeparator() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col items-end gap-0.5 select-none py-1"
      style={{ color: THEME.borderDefault }}
    >
      <span className="w-6 text-center text-[10px] leading-none">·</span>
      <span className="w-6 text-center text-[10px] leading-none">·</span>
      <span className="w-6 text-center text-[10px] leading-none">·</span>
    </div>
  )
}

/**
 * Persistent character-name header. Always editable: typing updates the
 * input locally, ``onRename`` is called when the user blurs or hits Enter
 * (no debounce — server PATCH cost is tiny, and rename has no UI side
 * effects elsewhere so we don't need keystroke-level updates).
 */
function NameHeader({ value, onRename }) {
  const inputRef = useRef(null)
  const [draft, setDraft] = useState(value ?? '')
  const [editing, setEditing] = useState(false)

  // Keep the local input in sync when the source value updates (e.g. after
  // a rename round-trip, or when the wizard first mounts with a new draft).
  useEffect(() => {
    if (!editing) setDraft(value ?? '')
  }, [value, editing])

  const commit = () => {
    setEditing(false)
    const trimmed = (draft || '').trim()
    if (!trimmed) {
      setDraft(value ?? '')
      return
    }
    if (trimmed === value) return
    onRename?.(trimmed)
  }

  const startEdit = () => {
    setEditing(true)
    // Defer focus so the input is mounted before we try to focus it.
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  return (
    <div className="flex items-center gap-3 min-w-0">
      <input
        ref={inputRef}
        type="text"
        maxLength={50}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setEditing(true)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur()
          } else if (e.key === 'Escape') {
            setDraft(value ?? '')
            setEditing(false)
            e.currentTarget.blur()
          }
        }}
        placeholder="Character name"
        aria-label="Character name"
        className="flex-1 min-w-0 bg-transparent border-0 border-b text-3xl font-bold font-[family-name:var(--font-metamorphous)] focus:outline-none focus:ring-0 transition-colors py-1 -mb-px"
        style={{
          color: THEME.textBold,
          borderBottomColor: editing ? COLORS.silver : 'transparent',
        }}
      />
      <button
        type="button"
        onClick={startEdit}
        aria-label="Edit character name"
        className="shrink-0 p-2 rounded hover:bg-black/5 transition-colors"
        style={{ color: editing ? COLORS.onyx : THEME.textSecondary }}
      >
        <FontAwesomeIcon icon={faPenToSquare} className="h-5 w-5" />
      </button>
    </div>
  )
}

export default function WizardChrome({
  steps,
  currentStep,
  onJumpStep,
  saveState,
  draftId,
  characterName,
  characterSubtitle,
  onRename,
  avatarUrl,
  avatarIsBusy,
  avatarError,
  onOpenAvatarPicker,
  children,
}) {
  const currentIdx = steps.findIndex((s) => s.id === currentStep)

  return (
    // Two-column layout, each filling the viewport below the authenticated
    // layout's SiteHeader. Avatar pane fixed at ~33vw on the left with a
    // forward-slash wedge eating into its right edge; wizard content fills
    // the remaining space on the right.
    <main
      className="flex-1 flex min-h-0 overflow-hidden"
      style={{ backgroundColor: THEME.bgPrimary, color: THEME.textPrimary }}
    >
      {/* Left: avatar pane. Width set in vw so it scales smoothly across
          viewports. (Responsive narrow-screen guard removed because the
          Tailwind ``lg:block`` utility wasn't being JIT-compiled until a
          dev-server restart; if a tablet/mobile layout is needed later,
          re-introduce with an inline media query or restart-safe approach.) */}
      <div className="shrink-0" style={{ width: '33vw' }}>
        <CharacterAvatarPane
          avatarUrl={avatarUrl}
          isBusy={avatarIsBusy}
          error={avatarError}
          onOpenPicker={onOpenAvatarPicker}
        />
      </div>

      {/* Middle: scrollable wizard column (name header + step body). */}
      <div className="flex-1 overflow-y-auto min-w-0">
        {/* Left-aligned (no mx-auto) so the form sits flush against the
            avatar pane rather than floating centred. ``pl-8`` re-introduces
            the 32px gutter between the avatar and the form. No right padding
            — width is capped by max-w-3xl, the remainder is empty space
            before the stages sidebar. */}
        <div className="max-w-3xl pl-8 py-8">
          {/* Standalone name header — no card, larger heading. Save
              indicator sits to its right so the user sees mutation feedback
              next to the most-edited field. */}
          <header className="mb-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <NameHeader value={characterName} onRename={onRename} />
              </div>
              <SaveIndicator state={saveState} />
            </div>
            {/* Build-summary subtitle. Populates incrementally as the
                wizard's species / class / background selections land on
                the server. Empty by default (no draft state to summarise),
                so the row simply collapses out of the layout. */}
            {characterSubtitle && (
              <p
                className="mt-1 text-sm italic"
                style={{ color: THEME.textSecondary }}
              >
                {characterSubtitle}
              </p>
            )}
          </header>

          {/* Step body */}
          <div
            className="rounded-sm border p-6 sm:p-8"
            style={{ backgroundColor: COLORS.carbon, borderColor: THEME.borderSubtle, color: THEME.textOnDark }}
          >
            {children}
          </div>

          {/* SRD attribution */}
          <p className="mt-4 text-xs text-center" style={{ color: THEME.textPrimary, opacity: 0.6 }}>
            {SRD_ATTRIBUTION}
          </p>
        </div>
      </div>

      {/* Right: vertical stage column. ``flex items-center`` on the nav
          itself vertically centres the stages list within the full pane
          height (the nav stretches to fill the main row's cross-axis by
          default). Labels right-aligned; numbered dots in a tidy column. */}
      <nav
        aria-label="Wizard progress"
        className="shrink-0 flex items-center pr-6 pl-2"
        style={{ width: '13rem' }}
      >
        <div className="flex flex-col items-end w-full">
          {steps.map((s, idx) => (
            <span key={s.id} className="contents">
              {idx > 0 && <StepSeparator />}
              <StepDot
                step={{ ...s, idx }}
                isCurrent={idx === currentIdx}
                isComplete={idx < currentIdx}
                clickable={Boolean(draftId) && idx <= currentIdx}
                onClick={() => onJumpStep(s.id)}
              />
            </span>
          ))}
        </div>
      </nav>
    </main>
  )
}
