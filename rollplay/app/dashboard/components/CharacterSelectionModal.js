/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState } from 'react'
import { THEME } from '@/app/styles/colorTheme'
import { Button } from './shared/Button'

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
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{backgroundColor: THEME.overlayDark}}>
      <div className="rounded-sm shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border" style={{backgroundColor: THEME.bgSecondary, borderColor: THEME.borderDefault}}>
        {/* Header */}
        <div className="sticky top-0 border-b px-6 py-4 flex items-center justify-between" style={{backgroundColor: THEME.bgSecondary, borderBottomColor: THEME.borderSubtle}}>
          <div>
            <h2 className="text-2xl font-bold font-[family-name:var(--font-metamorphous)]" style={{color: THEME.textOnDark}}>Select Character</h2>
            <p className="text-sm mt-1" style={{color: THEME.textSecondary}}>
              Choose a character for <span className="font-semibold">{game.name}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="transition-colors hover:opacity-80"
            style={{color: THEME.textSecondary}}
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
            <div className="mb-4 border px-4 py-3 rounded-sm" style={{backgroundColor: '#7f1d1d', borderColor: '#dc2626', color: THEME.textAccent}}>
              {error}
            </div>
          )}

          {availableCharacters.length === 0 ? (
            <div className="text-center py-8">
              <p className="mb-4" style={{color: THEME.textOnDark}}>You don't have any available characters.</p>
              <p className="text-sm" style={{color: THEME.textSecondary}}>
                Create a new character or free up an existing one by leaving another game.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm mb-4" style={{color: THEME.textOnDark}}>
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
                    className="p-4 rounded-sm border-2 cursor-pointer transition-all"
                    style={{
                      borderColor: selectedCharacterId === char.id ? THEME.borderActive : THEME.borderDefault,
                      backgroundColor: selectedCharacterId === char.id ? THEME.bgPanel : THEME.bgSecondary
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-semibold" style={{color: THEME.textOnDark}}>
                            {char.character_name}
                          </h3>
                          {char.is_alive === false && (
                            <span className="px-2 py-1 text-xs font-semibold rounded-sm" style={{backgroundColor: '#7f1d1d', color: THEME.textAccent}}>
                              ☠ Deceased
                            </span>
                          )}
                        </div>
                        <p className="text-sm mt-1" style={{color: THEME.textSecondary}}>
                          Level {char.level} {char.character_race} {char.character_class}
                        </p>
                        <div className="flex gap-4 mt-2 text-sm" style={{color: THEME.textSecondary}}>
                          <span>HP: {char.hp_current}/{char.hp_max}</span>
                          <span>AC: {char.ac}</span>
                        </div>
                      </div>
                      <div className="ml-4">
                        {selectedCharacterId === char.id && (
                          <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{backgroundColor: '#166534'}}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{color: THEME.textAccent}}>
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
          <div className="sticky bottom-0 border-t px-6 py-4 flex items-center justify-end gap-3" style={{backgroundColor: THEME.bgSecondary, borderTopColor: THEME.borderSubtle}}>
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSelectCharacter}
              disabled={!selectedCharacterId || loading}
            >
              {loading ? 'Selecting...' : 'Select Character'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
