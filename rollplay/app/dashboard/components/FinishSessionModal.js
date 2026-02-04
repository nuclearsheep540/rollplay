/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect } from 'react'
import Modal from '@/app/shared/components/Modal'
import Spinner from '@/app/shared/components/Spinner'
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

  return (
    <Modal open={!!game} onClose={isFinishing ? () => {} : onCancel} size="sm">
      <div className="p-6">
        <h3 className="text-lg font-semibold font-[family-name:var(--font-metamorphous)] mb-4 text-content-on-dark">
          Finish Session
        </h3>
        <p className="mb-2 text-content-on-dark">
          This will finish the session for this campaign, ending this game entirely. All data will be saved and you won&apos;t be able to resume. Continue?
        </p>
        <p className="text-sm mb-6 text-content-on-dark">
          Finished sessions are preserved in your campaign history.
        </p>

        <div className="flex justify-center gap-3">
          <Button variant="ghost" onClick={onCancel} disabled={isFinishing}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={onConfirm}
            disabled={isFinishing || countdown > 0}
          >
            {isFinishing ? (
              <span className="flex items-center gap-2">
                <Spinner size="sm" />
                Finishing...
              </span>
            ) : countdown > 0 ? (
              `Finish Session (${countdown})`
            ) : (
              'Finish Session'
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
