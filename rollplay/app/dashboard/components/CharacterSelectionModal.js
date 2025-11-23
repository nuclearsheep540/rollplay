/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState } from 'react'

export default function CharacterSelectionModal({ game, characters, onClose, onCharacterSelected, currentCharacterId = null, isActiveSession = false }) {
  const [selectedCharacterId, setSelectedCharacterId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Filter out the currently selected character if swapping
  const availableCharacters = currentCharacterId
    ? characters.filter(char => char.id !== currentCharacterId)
    : characters

  const handleSelectCharacter = async () => {
    if (!selectedCharacterId) {
      setError('Please select a character')
      return
    }

    try {
      setLoading(true)
      setError(null)

      // Use different endpoint for active session character change
      const endpoint = isActiveSession
        ? `/api/games/${game.id}/change-character-active?new_character_id=${selectedCharacterId}`
        : `/api/games/${game.id}/select-character?character_id=${selectedCharacterId}`

      const method = isActiveSession ? 'PUT' : 'POST'

      const response = await fetch(endpoint, {
        method,
        credentials: 'include'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to select character')
      }

      // Success - call callback
      onCharacterSelected()
    } catch (err) {
      console.error('Error selecting character:', err)
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Select Character</h2>
            <p className="text-sm text-slate-600 mt-1">
              Choose a character for <span className="font-semibold">{game.name}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            disabled={loading}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {availableCharacters.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-600 mb-4">You don't have any available characters.</p>
              <p className="text-sm text-slate-500">
                Create a new character or free up an existing one by leaving another game.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-600 mb-4">
                {isActiveSession
                  ? 'Select a new character to use in this active session.'
                  : 'Select a character to lock to this game. Once selected, this character cannot be used in other games until you leave.'
                }
              </p>

              <div className="space-y-3">
                {availableCharacters.map((char) => (
                  <div
                    key={char.id}
                    onClick={() => setSelectedCharacterId(char.id)}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedCharacterId === char.id
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-semibold text-slate-800">
                            {char.character_name}
                          </h3>
                          {char.is_alive === false && (
                            <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded">
                              ☠ Deceased
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-600 mt-1">
                          Level {char.level} {char.character_race} {char.character_class}
                        </p>
                        <div className="flex gap-4 mt-2 text-sm text-slate-500">
                          <span>HP: {char.hp_current}/{char.hp_max}</span>
                          <span>AC: {char.ac}</span>
                        </div>
                      </div>
                      <div className="ml-4">
                        {selectedCharacterId === char.id && (
                          <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {availableCharacters.length > 0 && (
          <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-white border border-slate-300 text-slate-700 rounded hover:bg-slate-50 transition-colors font-semibold"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              onClick={handleSelectCharacter}
              className="px-6 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!selectedCharacterId || loading}
            >
              {loading ? 'Selecting...' : 'Select Character'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
