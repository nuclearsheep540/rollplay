/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { createPortal } from 'react-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faStop } from '@fortawesome/free-solid-svg-icons'

export default function EndGameModal({ game, onConfirm, onCancel, isEnding }) {
  if (!game || typeof document === 'undefined') return null

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
      <div className="bg-slate-800 border border-orange-500/30 p-6 rounded-lg shadow-2xl shadow-orange-500/20 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold text-orange-400 mb-4">End Game Session</h3>
        <p className="text-slate-300 mb-2">
          Are you sure you want to end <strong className="text-orange-400">"{game.name || 'this game session'}"</strong>?
        </p>
        <p className="text-sm text-slate-400 mb-6">All player progress will be saved and players will be disconnected.</p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isEnding}
            className="px-4 py-2 bg-slate-700 text-slate-300 border border-slate-600 rounded-lg hover:bg-slate-600 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isEnding}
            className="px-4 py-2 bg-orange-600 text-white border border-orange-500 rounded-lg hover:bg-orange-500 hover:shadow-lg hover:shadow-orange-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isEnding ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Ending...
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={faStop} />
                End Game
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
