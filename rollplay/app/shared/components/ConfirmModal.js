/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { createPortal } from 'react-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

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

  // Variant-based styling
  const variantStyles = {
    danger: {
      border: 'border-red-500/30',
      shadow: 'shadow-red-500/20',
      titleColor: 'text-red-400',
      buttonBg: 'bg-red-600',
      buttonBorder: 'border-red-500',
      buttonHover: 'hover:bg-red-500'
    },
    warning: {
      border: 'border-orange-500/30',
      shadow: 'shadow-orange-500/20',
      titleColor: 'text-orange-400',
      buttonBg: 'bg-orange-600',
      buttonBorder: 'border-orange-500',
      buttonHover: 'hover:bg-orange-500 hover:shadow-lg hover:shadow-orange-500/30'
    },
    info: {
      border: 'border-blue-500/30',
      shadow: 'shadow-blue-500/20',
      titleColor: 'text-blue-400',
      buttonBg: 'bg-blue-600',
      buttonBorder: 'border-blue-500',
      buttonHover: 'hover:bg-blue-500'
    }
  }

  const styles = variantStyles[variant] || variantStyles.danger

  return createPortal(
    <div
      className="flex items-center justify-center"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(2, 6, 23, 0.9)',
        backdropFilter: 'blur(4px)',
        zIndex: 50
      }}
    >
      <div className={`bg-slate-800 border ${styles.border} p-6 rounded-lg shadow-2xl ${styles.shadow} max-w-md w-full mx-4`}>
        <h3 className={`text-lg font-semibold ${styles.titleColor} mb-4`}>{title}</h3>
        <p className="text-slate-300 mb-2">{message}</p>
        {description && (
          <p className="text-sm text-slate-400 mb-6">{description}</p>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 bg-slate-700 text-slate-300 border border-slate-600 rounded-lg hover:bg-slate-600 transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 ${styles.buttonBg} text-white border ${styles.buttonBorder} rounded-lg ${styles.buttonHover} transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2`}
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                {loadingText}
              </>
            ) : (
              <>
                {icon && <FontAwesomeIcon icon={icon} />}
                {confirmText}
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
