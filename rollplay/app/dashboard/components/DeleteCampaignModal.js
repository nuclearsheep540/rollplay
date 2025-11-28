/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import ConfirmModal from '../../shared/components/ConfirmModal'
import { faTrash } from '@fortawesome/free-solid-svg-icons'

export default function DeleteCampaignModal({ campaign, onConfirm, onCancel, isDeleting }) {
  if (!campaign) return null

  return (
    <ConfirmModal
      show={!!campaign}
      title="Delete Campaign"
      message={
        <>
          Are you sure you want to delete <strong className="text-red-400">"{campaign.title || 'this campaign'}"</strong>?
        </>
      }
      description="This action cannot be undone. All associated game sessions will also be deleted."
      confirmText="Delete Campaign"
      onConfirm={onConfirm}
      onCancel={onCancel}
      isLoading={isDeleting}
      loadingText="Deleting..."
      icon={faTrash}
      variant="danger"
    />
  )
}
