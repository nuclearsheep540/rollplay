/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { COLORS, THEME } from '@/app/styles/colorTheme'
import { Button } from './shared/Button'

export default function FinishSessionModal({ game, onConfirm, onCancel, isFinishing }) {
  const [countdown, setCountdown] = useState(3)

  useEffect(() => {
    if (!game) return

    // Reset countdown when modal opens
    setCountdown(3)

    // Start countdown timer
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [game])

  if (!game || typeof document === 'undefined') return null

  return createPortal(
    <div className="flex items-center justify-center fixed inset-0 z-50" style={{backgroundColor: THEME.overlayDark, backdropFilter: 'blur(4px)'}}>
      <div className="border p-6 rounded-sm shadow-2xl max-w-md w-full mx-4" style={{backgroundColor: THEME.bgSecondary, borderColor: THEME.borderDefault}}>
        <h3 className="text-lg font-semibold font-[family-name:var(--font-metamorphous)] mb-4" style={{color: THEME.textOnDark}}>Finish Session</h3>
        <p className="mb-2" style={{color: THEME.textOnDark}}>
          This will finish the session for this campaign, ending this game entirely. All data will be saved and you won't be able to resume. Continue?
        </p>
        <p className="text-sm mb-6" style={{color: THEME.textOnDark}}>Finished sessions are preserved in your campaign history.</p>

        <div className="flex justify-center gap-3">
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={isFinishing}
          >
            Cancel
          </Button>
          <button
            onClick={onConfirm}
            disabled={isFinishing || countdown > 0}
            className="px-4 py-2 rounded-sm border transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: '#991b1b',
              color: COLORS.smoke,
              borderColor: '#dc2626'
            }}
          >
            {isFinishing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 inline-block mr-2" style={{borderColor: COLORS.smoke}}></div>
                Finishing...
              </>
            ) : countdown > 0 ? (
              `Finish Session (${countdown})`
            ) : (
              'Finish Session'
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
