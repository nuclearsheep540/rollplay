/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState } from 'react'
import { DialogTitle } from '@headlessui/react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus } from '@fortawesome/free-solid-svg-icons'
import Modal from '@/app/shared/components/Modal'
import { Button } from './shared/Button'
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
    <Modal
      open={true}
      onClose={selectCharacterMutation.isPending ? () => {} : onClose}
      size="2xl"
    >
      <div className="max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-border-subtle px-6 py-4 flex items-center justify-between bg-surface-secondary">
          <div>
            <DialogTitle className="text-2xl font-bold font-[family-name:var(--font-metamorphous)] text-content-on-dark">
              Select Character
            </DialogTitle>
            <p className="text-sm mt-1 text-content-secondary">
              Choose a character for <span className="font-semibold">{campaign.title}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="transition-colors hover:opacity-80 text-content-secondary"
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
            <div className="mb-4 border px-4 py-3 rounded-sm bg-feedback-error/15 border-feedback-error text-content-accent">
              {error}
            </div>
          )}

          {availableCharacters.length === 0 ? (
            <div className="text-center py-8">
              <p className="mb-4 text-content-on-dark">You don&apos;t have any available characters.</p>
              <p className="text-sm mb-6 text-content-secondary">
                Create a new character or free up an existing one by leaving another campaign.
              </p>
              {onCreateCharacter && (
                <button
                  onClick={onCreateCharacter}
                  className="w-full py-8 rounded-sm border-2 border-dashed transition-all hover:opacity-80 flex items-center justify-center gap-2 bg-transparent text-content-secondary border-border"
                >
                  <FontAwesomeIcon icon={faPlus} />
                  Create New Character
                </button>
              )}
            </div>
          ) : (
            <>
              <p className="text-sm mb-4 text-content-on-dark">
                Select a character to use in this campaign. Once selected, this character cannot be used in other campaigns until you release it or leave.
              </p>

              <div className="space-y-3">
                {availableCharacters.map((char) => (
                  <div
                    key={char.id}
                    onClick={() => setSelectedCharacterId(char.id)}
                    className={`p-4 rounded-sm border-2 cursor-pointer transition-all ${
                      selectedCharacterId === char.id
                        ? 'border-border-active bg-surface-panel'
                        : 'border-border bg-surface-secondary'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-semibold text-content-on-dark">
                            {char.character_name}
                          </h3>
                          {char.is_alive === false && (
                            <span className="px-2 py-1 text-xs font-semibold rounded-sm bg-feedback-error/15 text-content-accent">
                              ☠ Deceased
                            </span>
                          )}
                        </div>
                        <p className="text-sm mt-1 text-content-secondary">
                          Level {char.level} {char.character_race} {char.character_class}
                        </p>
                        <div className="flex gap-4 mt-2 text-sm text-content-secondary">
                          <span>HP: {char.hp_current}/{char.hp_max}</span>
                          <span>AC: {char.ac}</span>
                        </div>
                      </div>
                      <div className="ml-4">
                        {selectedCharacterId === char.id && (
                          <div className="w-6 h-6 rounded-full flex items-center justify-center bg-feedback-success">
                            <svg className="w-4 h-4 text-content-on-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  className="w-full mt-4 py-8 rounded-sm border-2 border-dashed transition-all hover:opacity-80 flex items-center justify-center gap-2 bg-transparent text-content-secondary border-border"
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
          <div className="sticky bottom-0 z-10 border-t border-border-subtle px-6 py-4 flex items-center justify-end gap-3 bg-surface-secondary">
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
    </Modal>
  )
}
