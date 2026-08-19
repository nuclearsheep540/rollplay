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
import { characterMetaLine } from '../utils/characterMeta'
import { useImageFocalPosition } from '@/app/shared/hooks/useImageFocalPosition'

/**
 * One selectable character row. A component rather than inline JSX because
 * the avatar's focal bias is a hook (tokens v3, decision 36) and hooks can't
 * run inside the list's map.
 */
function CharacterChoiceCard({ char, isSelected, onSelect }) {
  // Bias only a real avatar: /heroes.png has no focal area, and the hook
  // returns undefined without one, so the bg-center class stands unchanged.
  const focalPosition = useImageFocalPosition(char.avatar_url, char.avatar_focal_area)

  return (
    <div
      onClick={onSelect}
      className={`relative overflow-hidden rounded-sm border-2 cursor-pointer transition-all ${
        isSelected
          ? 'border-border-active bg-surface-panel'
          : 'border-border bg-surface-secondary'
      }`}
    >
      {/* Avatar wedge - same diagonal as the campaign party cards */}
      <div
        aria-hidden="true"
        className="absolute top-0 bottom-0 right-0 pointer-events-none bg-cover bg-center"
        style={{
          width: '42%',
          clipPath: 'polygon(33% 0, 100% 0, 100% 100%, 0 100%)',
          backgroundImage: `linear-gradient(105deg, rgba(0, 0, 0, 0.55) 15%, transparent 45%), url('${char.avatar_url || '/heroes.png'}')`,
          // backgroundPosition applies to every layer, but the gradient has
          // no intrinsic size — `cover` fits it exactly to the box, so no
          // position can shift it. Only the portrait moves.
          ...(focalPosition ? { backgroundPosition: focalPosition } : {}),
        }}
      />

      <div className="relative z-10 max-w-[62%] p-4">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="truncate text-lg font-semibold text-content-on-dark">
            {char.character_name}
          </h3>
          {char.is_alive === false && (
            <span className="shrink-0 px-2 py-1 text-xs font-semibold rounded-sm bg-feedback-error/15 text-content-accent">
              ☠ Deceased
            </span>
          )}
        </div>
        <p className="text-sm mt-1 truncate text-content-secondary">
          {characterMetaLine(char)}
        </p>
        <div className="flex gap-4 mt-2 text-sm text-content-secondary">
          <span>HP: {char.hp_current}/{char.hp_max}</span>
          <span>AC: {char.ac}</span>
        </div>
      </div>

      {/* Selection check - floats above the wedge */}
      {isSelected && (
        <div className="absolute top-2 right-2 z-20 w-6 h-6 rounded-full flex items-center justify-center bg-feedback-success">
          <svg className="w-4 h-4 text-content-on-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
    </div>
  )
}

export default function CharacterSelectionModal({ campaign, characters, onClose, onCharacterSelected, onCreateCharacter = null, currentCharacterId = null, sessionActive = false }) {
  const [selectedCharacterId, setSelectedCharacterId] = useState(null)
  const [error, setError] = useState(null)
  const selectCharacterMutation = useSelectCharacter()

  // During an active session you may ADD a character (none → one) but not SWAP an existing one
  // (that would desync the live game). The backend enforces the same rule; this just avoids a
  // doomed attempt. Adding (no current character) stays fully available.
  const swapBlocked = sessionActive && !!currentCharacterId

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

          {swapBlocked ? (
            <div className="text-center py-8">
              <p className="mb-2 font-semibold text-content-on-dark">Character locked</p>
              <p className="text-sm text-content-secondary">
                You can&apos;t change your character while a session is active. Pause or finish the session first.
              </p>
            </div>
          ) : availableCharacters.length === 0 ? (
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
                  <CharacterChoiceCard
                    key={char.id}
                    char={char}
                    isSelected={selectedCharacterId === char.id}
                    onSelect={() => setSelectedCharacterId(char.id)}
                  />
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
        {!swapBlocked && availableCharacters.length > 0 && (
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
