/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import ConfirmModal from '../../shared/components/ConfirmModal'
import { faTrash } from '@fortawesome/free-solid-svg-icons'

export default function DeleteSessionModal({ session, onConfirm, onCancel, isDeleting }) {
  if (!session) return null

  return (
    <ConfirmModal
      show={!!session}
      title="Delete Session"
      message={
        <>
          Are you sure you want to delete <strong className="text-red-400">"{session.name || 'this session'}"</strong>?
        </>
      }
      description="This action cannot be undone."
      confirmText="Delete Session"
      onConfirm={onConfirm}
      onCancel={onCancel}
      isLoading={isDeleting}
      loadingText="Deleting..."
      icon={faTrash}
      variant="danger"
    />
  )
}
