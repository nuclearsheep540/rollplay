/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { createPortal } from 'react-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { THEME } from '@/app/styles/colorTheme'
import { Button } from '@/app/dashboard/components/shared/Button'

/**
 * Reusable confirmation modal component
 *
 * @param {Object} props
 * @param {boolean} props.show - Whether to show the modal
 * @param {string} props.title - Modal title
 * @param {string} props.message - Main confirmation message (supports JSX)
 * @param {string} [props.description] - Optional secondary description text
 * @param {string} props.confirmText - Text for confirm button
 * @param {string} [props.cancelText='Cancel'] - Text for cancel button
 * @param {Function} props.onConfirm - Callback when confirmed
 * @param {Function} props.onCancel - Callback when cancelled
 * @param {boolean} [props.isLoading=false] - Loading state for async operations
 * @param {string} [props.loadingText='Processing...'] - Text shown during loading
 * @param {Object} [props.icon] - FontAwesome icon to display
 * @param {string} [props.variant='danger'] - Visual variant: 'danger' (red) | 'warning' (orange) | 'info' (blue)
 */
export default function ConfirmModal({
  show,
  title,
  message,
  description,
  confirmText,
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  isLoading = false,
  loadingText = 'Processing...',
  icon,
  variant = 'danger'
}) {
  if (!show || typeof document === 'undefined') return null

  return createPortal(
    <div className="flex items-center justify-center fixed inset-0 z-50" style={{backgroundColor: THEME.overlayDark, backdropFilter: 'blur(4px)'}}>
      <div className="border p-6 rounded-sm shadow-2xl max-w-md w-full mx-4" style={{backgroundColor: THEME.bgSecondary, borderColor: THEME.borderDefault}}>
        <h3 className="text-lg font-semibold font-[family-name:var(--font-metamorphous)] mb-4" style={{color: THEME.textOnDark}}>{title}</h3>
        <p className="mb-2" style={{color: THEME.textOnDark}}>{message}</p>
        {description && (
          <p className="text-sm mb-6" style={{color: THEME.textOnDark}}>{description}</p>
        )}

        <div className="flex justify-end gap-3">
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <Button
            variant={variant}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 mr-2" style={{borderColor: THEME.textAccent}}></div>
                {loadingText}
              </>
            ) : (
              <>
                {icon && <FontAwesomeIcon icon={icon} className="mr-2" />}
                {confirmText}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
