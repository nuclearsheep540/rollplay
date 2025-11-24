/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import ConfirmModal from '../../shared/components/ConfirmModal'
import { faCheckCircle } from '@fortawesome/free-solid-svg-icons'

export default function FinishSessionModal({ game, onConfirm, onCancel, isFinishing }) {
  if (!game) return null

  return (
    <ConfirmModal
      show={!!game}
      title="Finish Session"
      message={
        <>
          This will finish the session for this campaign, ending this game entirely. All data will be saved and you won't be able to resume. Continue?
        </>
      }
      description="Finished sessions are preserved in your campaign history."
      confirmText="Finish Session"
      onConfirm={onConfirm}
      onCancel={onCancel}
      isLoading={isFinishing}
      loadingText="Finishing..."
      icon={faCheckCircle}
      variant="warning"
    />
  )
}
