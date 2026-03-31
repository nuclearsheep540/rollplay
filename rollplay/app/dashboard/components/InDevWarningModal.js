/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useEffect } from 'react'
import Modal from '@/app/shared/components/Modal'

export default function InDevWarningModal({ show, onClose }) {
  useEffect(() => {
    if (!show) return
    const handler = (e) => {
      if (e.key === 'Enter') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [show])

  return (
    <Modal open={show} onClose={onClose} size="md">
      <div className="p-6 text-center">
        <h3 className="text-2xl font-bold text-content-on-dark mb-4">Heads Up!</h3>
        <p className="text-content-on-dark mb-6">
          Tabletop Tavern is still in-development, expect lots of bugs and features to feel incomplete while I work on this project. If you have any feature requests or find any bugs please let me know!
        </p>
        <button
          onClick={onClose}
          className="px-6 py-2 rounded-sm font-semibold transition-all bg-interactive-hover text-content-primary hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-border-active"
        >
          Understood
        </button>
      </div>
    </Modal>
  )
}
