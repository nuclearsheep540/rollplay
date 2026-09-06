/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import ConfirmModal from '../../shared/components/ConfirmModal'
import { faRotateLeft } from '@fortawesome/free-solid-svg-icons'

/**
 * Confirm a fresh run: the table cleared and everything back to baseline.
 *
 * The only destructive verb in the lifecycle, so the copy names exactly what
 * goes — including the players, which is the point of a reset — and what stays.
 * A GM must never discover afterwards that "reset" meant "un-invite everyone".
 * The countdown is the same friction the old permanent finish carried.
 */
export default function ResetGameModal({ campaign, onConfirm, onCancel, isResetting }) {
  if (!campaign) return null

  return (
    <ConfirmModal
      show={!!campaign}
      title="Reset Game"
      message={
        <>
          Reset the game for <strong className="text-red-400">&ldquo;{campaign.title}&rdquo;</strong>?
        </>
      }
      description="Everything returns to baseline. Player tokens are removed and NPC tokens go back to where the map was authored. The adventure log, the schedule and what was on screen are cleared. Every player is removed from the campaign and their characters released — invite them again to play. Your maps, assets and notes stay. This cannot be undone."
      confirmText="Reset Game"
      confirmDelaySeconds={3}
      onConfirm={onConfirm}
      onCancel={onCancel}
      isLoading={isResetting}
      loadingText="Resetting..."
      icon={faRotateLeft}
      variant="danger"
    />
  )
}
