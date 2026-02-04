/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useRef } from 'react'
import { DialogTitle } from '@headlessui/react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import Modal from './Modal'
import Spinner from './Spinner'
import { Button } from '@/app/dashboard/components/shared/Button'

const VARIANT_STYLES = {
  danger: 'bg-feedback-error hover:brightness-110',
  warning: 'bg-feedback-warning hover:brightness-110',
  info: 'bg-feedback-info hover:brightness-110',
}

/**
 * Confirmation dialog built on Modal.
 *
 * Drop-in replacement for the hand-rolled ConfirmModal.
 * Same props interface, backed by Headless UI Dialog for focus trap,
 * escape-to-close, and ARIA.
 *
 * @param {boolean} show - Controls visibility
 * @param {string} title - Dialog title
 * @param {string} message - Primary message
 * @param {string} description - Secondary description
 * @param {string} confirmText - Confirm button label
 * @param {string} cancelText - Cancel button label
 * @param {Function} onConfirm - Called on confirm
 * @param {Function} onCancel - Called on cancel / escape / backdrop click
 * @param {boolean} isLoading - Disables buttons, shows spinner
 * @param {string} loadingText - Text shown while loading
 * @param {object} icon - FontAwesome icon object
 * @param {'danger'|'warning'|'info'} variant - Button color variant
 */
export default function ConfirmDialog({
  show,
  title,
  message,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  isLoading = false,
  loadingText = 'Processing...',
  icon,
  variant = 'danger',
}) {
  const cancelRef = useRef(null)

  return (
    <Modal open={show} onClose={isLoading ? () => {} : onCancel} size="sm" initialFocus={cancelRef}>
      <div className="p-6">
        {/* Icon */}
        {icon && (
          <div className="flex justify-center mb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-surface-elevated">
              <FontAwesomeIcon icon={icon} className="text-xl text-content-accent" />
            </div>
          </div>
        )}

        {/* Title */}
        {title && (
          <DialogTitle className="text-lg font-bold text-center text-content-on-dark mb-2">
            {title}
          </DialogTitle>
        )}

        {/* Message */}
        {message && (
          <p className="text-center text-content-secondary mb-1">{message}</p>
        )}

        {/* Description */}
        {description && (
          <p className="text-center text-sm text-content-secondary mb-6">{description}</p>
        )}

        {/* Buttons */}
        <div className="flex gap-3 mt-6">
          <button
            ref={cancelRef}
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 px-4 py-2 rounded-sm border border-border text-content-on-dark transition-all duration-100 hover:border-border-active disabled:opacity-50"
          >
            {cancelText}
          </button>

          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex-1 px-4 py-2 rounded-sm text-content-on-dark font-medium transition-all duration-100 disabled:opacity-50 flex items-center justify-center gap-2 ${VARIANT_STYLES[variant] || VARIANT_STYLES.danger}`}
          >
            {isLoading ? (
              <>
                <Spinner size="sm" />
                {loadingText}
              </>
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </Modal>
  )
}
