/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import ConfirmModal from '../../shared/components/ConfirmModal'
import { faPause } from '@fortawesome/free-solid-svg-icons'

export default function PauseSessionModal({ game, onConfirm, onCancel, isPausing }) {
  if (!game) return null

  return (
    <ConfirmModal
      show={!!game}
      title="Pause Session"
      message={
        <>
          Pause <strong className="text-orange-400">"{game.name || 'this session'}"</strong>?
        </>
      }
      description="All progress will be saved and you can resume this session anytime."
      confirmText="Pause Session"
      onConfirm={onConfirm}
      onCancel={onCancel}
      isLoading={isPausing}
      loadingText="Pausing..."
      icon={faPause}
      variant="warning"
    />
  )
}
