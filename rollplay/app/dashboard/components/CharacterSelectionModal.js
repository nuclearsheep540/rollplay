/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState } from 'react'
import { THEME } from '@/app/styles/colorTheme'
import { Button } from './shared/Button'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus } from '@fortawesome/free-solid-svg-icons'
import { useSelectCharacter } from '../hooks/mutations/useCharacterMutations'

export default function CharacterSelectionModal({ campaign, characters, onClose, onCharacterSelected, onCreateCharacter = null, currentCharacterId = null }) {
  const [selectedCharacterId, setSelectedCharacterId] = useState(null)
  const [error, setError] = useState(null)
  const selectCharacterMutation = useSelectCharacter()

  // Filter out the currently selected character if swapping, and characters locked to OTHER campaigns
  const availableCharacters = characters.filter(char => {
    // Exclude current character if swapping
    if (currentCharacterId && char.id === currentCharacterId) return false
    // Exclude characters locked to a different campaign
    if (char.active_campaign && char.active_campaign !== campaign.id) return false
    return true
  })

  const handleSelectCharacter = async () => {
    if (!selectedCharacterId) {
      setError('Please select a character')
      return
    }

    try {
      setError(null)
      await selectCharacterMutation.mutateAsync({
        campaignId: campaign.id,
        characterId: selectedCharacterId,
      })
      onCharacterSelected()
    } catch (err) {
      setError(err.message)
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
              Choose a character for <span className="font-semibold">{campaign.title}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="transition-colors hover:opacity-80"
            style={{color: THEME.textSecondary}}
            disabled={selectCharacterMutation.isPending}
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
              <p className="text-sm mb-6" style={{color: THEME.textSecondary}}>
                Create a new character or free up an existing one by leaving another campaign.
              </p>
              {onCreateCharacter && (
                <button
                  onClick={onCreateCharacter}
                  className="w-full py-8 rounded-sm border-2 border-dashed transition-all hover:opacity-80 flex items-center justify-center gap-2"
                  style={{
                    backgroundColor: 'transparent',
                    color: THEME.textSecondary,
                    borderColor: THEME.borderDefault
                  }}
                >
                  <FontAwesomeIcon icon={faPlus} />
                  Create New Character
                </button>
              )}
            </div>
          ) : (
            <>
              <p className="text-sm mb-4" style={{color: THEME.textOnDark}}>
                Select a character to use in this campaign. Once selected, this character cannot be used in other campaigns until you release it or leave.
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

              {/* Create New Character button */}
              {onCreateCharacter && (
                <button
                  onClick={onCreateCharacter}
                  className="w-full mt-4 py-8 rounded-sm border-2 border-dashed transition-all hover:opacity-80 flex items-center justify-center gap-2"
                  style={{
                    backgroundColor: 'transparent',
                    color: THEME.textSecondary,
                    borderColor: THEME.borderDefault
                  }}
                >
                  <FontAwesomeIcon icon={faPlus} />
                  Create New Character
                </button>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {availableCharacters.length > 0 && (
          <div className="sticky bottom-0 border-t px-6 py-4 flex items-center justify-end gap-3" style={{backgroundColor: THEME.bgSecondary, borderTopColor: THEME.borderSubtle}}>
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={selectCharacterMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSelectCharacter}
              disabled={!selectedCharacterId || selectCharacterMutation.isPending}
            >
              {selectCharacterMutation.isPending ? 'Selecting...' : 'Select Character'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
