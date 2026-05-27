/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

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

function StepDot({ step, isCurrent, isComplete, onClick, clickable }) {
  const bg = isCurrent
    ? COLORS.silver
    : isComplete
    ? COLORS.graphite
    : 'transparent'
  const border = isCurrent || isComplete ? COLORS.silver : THEME.borderDefault
  const text = isCurrent || isComplete ? THEME.textBold : THEME.textSecondary

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={onClick}
      className="flex items-center gap-2 px-1 disabled:cursor-default"
    >
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold"
        style={{ backgroundColor: bg, borderColor: border, color: text }}
      >
        {isComplete ? '✓' : step.idx + 1}
      </span>
      <span
        className="text-sm whitespace-nowrap"
        style={{ color: isCurrent ? THEME.textBold : THEME.textSecondary, fontWeight: isCurrent ? 600 : 400 }}
      >
        {step.label}
      </span>
    </button>
  )
}

export default function WizardChrome({
  steps,
  currentStep,
  onJumpStep,
  saveState,
  draftId,
  avatarUrl,
  avatarIsUploading,
  avatarError,
  onAvatarFileChosen,
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
          isUploading={avatarIsUploading}
          error={avatarError}
          onFileChosen={onAvatarFileChosen}
        />
      </div>

      {/* Right: scrollable wizard column. */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
          {/* Progress strip */}
          <div className="mb-6 rounded-sm border px-4 py-3" style={{
            backgroundColor: COLORS.carbon,
            borderColor: THEME.borderSubtle,
          }}>
            <div className="flex items-center justify-between gap-3">
              <h1
                className="text-2xl font-bold font-[family-name:var(--font-metamorphous)]"
                style={{ color: THEME.textOnDark }}
              >
                Character Creation
              </h1>
              <SaveIndicator state={saveState} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              {steps.map((s, idx) => (
                <StepDot
                  key={s.id}
                  step={{ ...s, idx }}
                  isCurrent={idx === currentIdx}
                  isComplete={idx < currentIdx}
                  clickable={Boolean(draftId) && idx <= currentIdx}
                  onClick={() => onJumpStep(s.id)}
                />
              ))}
            </div>
          </div>

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
    </main>
  )
}
