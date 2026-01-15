/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { createPortal } from 'react-dom'
import { COLORS, THEME } from '@/app/styles/colorTheme'
import { Button } from './shared/Button'

export default function PauseSessionModal({ game, onConfirm, onCancel, isPausing }) {
  if (!game || typeof document === 'undefined') return null

  return createPortal(
    <div className="flex items-center justify-center fixed inset-0 z-50" style={{backgroundColor: THEME.overlayDark, backdropFilter: 'blur(4px)'}}>
      <div className="border p-6 rounded-sm shadow-2xl max-w-md w-full mx-4" style={{backgroundColor: THEME.bgSecondary, borderColor: THEME.borderDefault}}>
        <h3 className="text-lg font-semibold font-[family-name:var(--font-metamorphous)] mb-4" style={{color: THEME.textOnDark}}>Pause Session</h3>
        <p className="mb-2" style={{color: THEME.textOnDark}}>
          Pause <strong>"{game.name || 'this session'}"</strong>?
        </p>
        <p className="text-sm mb-6" style={{color: THEME.textOnDark}}>All progress will be saved and you can resume this session anytime.</p>

        <div className="flex justify-center gap-3">
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={isPausing}
          >
            Cancel
          </Button>
          <button
            onClick={onConfirm}
            disabled={isPausing}
            className="px-4 py-2 rounded-sm border transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: '#d97706',
              color: COLORS.smoke,
              borderColor: '#fbbf24'
            }}
          >
            {isPausing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 inline-block mr-2" style={{borderColor: COLORS.smoke}}></div>
                Pausing...
              </>
            ) : (
              'Pause Session'
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
