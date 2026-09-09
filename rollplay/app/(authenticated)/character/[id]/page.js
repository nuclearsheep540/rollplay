/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPenToSquare, faTrash } from '@fortawesome/free-solid-svg-icons'

import { THEME, COLORS } from '@/app/styles/colorTheme'
import Modal from '@/app/shared/components/Modal'
import Spinner from '@/app/shared/components/Spinner'
import { Button } from '@/app/dashboard/components/shared/Button'
import { useDeleteCharacter } from '@/app/dashboard/hooks/mutations/useCharacterMutations'

import CharacterAvatarPane from '../components/CharacterAvatarPane'
import CharacterSheet from '../components/CharacterSheet'
import { useCharacterDraft } from '../hooks/useCharacterDraft'

const SRD_ATTRIBUTION =
  'Content from D&D SRD 5.2.1, © Wizards of the Coast, used under CC BY 4.0.'

/**
 * THE character view — every entry point (home hand, characters strip,
 * wizard finalise, a pasted link) lands here, and this is the only surface
 * that renders a character outside the wizard. Viewing never implies
 * editing: draft or finalised, the wizard (/character/create?id=…) is only
 * reachable through the explicit Edit affordance below.
 */
export default function CharacterDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id
  const { data: character, isLoading, isError, error } = useCharacterDraft(id)

  const deleteCharacterMutation = useDeleteCharacter()
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  const handleDeleteClick = () => {
    setShowDeleteModal(true)
    setDeleteError(null)
  }

  const handleCancelDelete = () => {
    setShowDeleteModal(false)
    setDeleteError(null)
  }

  const handleConfirmDelete = async () => {
    try {
      setDeleteError(null)
      await deleteCharacterMutation.mutateAsync({
        id: character.id,
        isDraft: Boolean(character.is_draft),
      })
      router.push('/dashboard?tab=characters')
    } catch (err) {
      setDeleteError(err.message)
    }
  }

  if (isLoading) {
    return (
      <main className="flex-1 flex items-center justify-center" style={{ color: THEME.textSecondary }}>
        Loading character…
      </main>
    )
  }

  if (isError) {
    return (
      <main className="flex-1 flex items-center justify-center" style={{ color: '#f87171' }}>
        {error?.message ?? 'Failed to load character'}
      </main>
    )
  }

  if (!character) {
    return null
  }

  // The backend's lock check (active_campaign) gates edits and deletes; we
  // disable locally for the same condition to avoid a click-then-error
  // round-trip.
  const isLocked = Boolean(character.active_campaign)

  return (
    // Same two-column shell as the wizard's WizardChrome: avatar pane on the
    // left at 33vw, sheet on the right filling the remaining width. Graphite
    // page, no panel chrome — sheet content sits directly on the background.
    <main
      className="flex-1 flex min-h-0 overflow-hidden"
      style={{ backgroundColor: COLORS.graphite, color: THEME.textOnDark }}
    >
      <div className="shrink-0" style={{ width: '33vw' }}>
        <CharacterAvatarPane
          avatarUrl={character.avatar_url}
          avatarAssetId={character.avatar_asset_id}
          focalArea={character.avatar_focal_area}
          readOnly
        />
      </div>

      <div className="flex-1 overflow-y-auto min-w-0">
        <div className="max-w-3xl pl-8 pr-6 py-8">
          <div className="mb-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => router.push('/dashboard?tab=characters')}
              className="text-sm"
              style={{ color: THEME.textOnDark }}
            >
              ← Back to characters
            </button>

            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                onClick={() => router.push(`/character/create?id=${character.id}`)}
                disabled={isLocked}
              >
                <FontAwesomeIcon icon={faPenToSquare} className="mr-2" />
                {character.is_draft ? 'Continue creating' : 'Edit'}
              </Button>
              <Button
                variant="danger"
                onClick={handleDeleteClick}
                disabled={isLocked}
              >
                <FontAwesomeIcon icon={faTrash} className="mr-2" />
                Delete
              </Button>
            </div>
          </div>

          {character.is_draft && (
            <p className="mb-4 text-xs uppercase tracking-wide" style={{ color: THEME.textSecondary }}>
              Draft — this character isn&apos;t finished yet
            </p>
          )}

          <div className="p-6 sm:p-8" style={{ color: THEME.textOnDark }}>
            <CharacterSheet character={character} />
          </div>

          <p
            className="mt-4 text-xs text-center"
            style={{ color: THEME.textOnDark, opacity: 0.5 }}
          >
            {SRD_ATTRIBUTION}
          </p>
        </div>
      </div>

      <Modal open={showDeleteModal} onClose={deleteCharacterMutation.isPending ? () => {} : handleCancelDelete} size="md">
        <div className="p-6">
          <h3 className="text-xl font-bold mb-2 text-content-accent">Delete Character</h3>
          <p className="mb-1 text-content-on-dark">
            Are you sure you want to delete <strong className="text-content-accent">{character.character_name}</strong>?
          </p>
          <p className="text-sm mb-4 text-content-secondary">This action cannot be undone.</p>

          {deleteError && (
            <div className="mb-4 border px-4 py-3 rounded-sm bg-feedback-error/15 border-feedback-error text-feedback-error">
              {deleteError}
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <Button
              variant="ghost"
              onClick={handleCancelDelete}
              disabled={deleteCharacterMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmDelete}
              disabled={deleteCharacterMutation.isPending}
            >
              {deleteCharacterMutation.isPending ? (
                <>
                  <Spinner size="sm" className="border-white mr-2" />
                  Deleting...
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faTrash} className="mr-2" />
                  Delete
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </main>
  )
}
