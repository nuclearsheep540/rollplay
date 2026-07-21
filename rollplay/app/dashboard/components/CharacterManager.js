/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useEffect, useRef, useState } from 'react'
import { authFetch } from '@/app/shared/utils/authFetch'
import { useRouter, useSearchParams } from 'next/navigation'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faTrash,
  faLock,
  faPlus,
  faPenToSquare,
} from '@fortawesome/free-solid-svg-icons'
import { COLORS, THEME } from '@/app/styles/colorTheme'
import Modal from '@/app/shared/components/Modal'
import Spinner from '@/app/shared/components/Spinner'
import { Button } from './shared/Button'
import { useDeleteCharacter } from '../hooks/mutations/useCharacterMutations'
import CharacterAvatarPane from '@/app/(authenticated)/character/components/CharacterAvatarPane'
import CharacterSheet from '@/app/(authenticated)/character/components/CharacterSheet'

export default function CharacterManager({
  user,
  onExpandedChange,
  expandCharacterId,
  clearExpandCharacterId,
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [characters, setCharacters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [characterToDelete, setCharacterToDelete] = useState(null)
  const [deleteError, setDeleteError] = useState(null)
  const deleteCharacterMutation = useDeleteCharacter()

  // Selection and resize state for horizontal scroll layout
  const [selectedCharacter, setSelectedCharacter] = useState(null)
  const [isResizing, setIsResizing] = useState(false)

  // Native wheel listener (React's onWheel is passive, so preventDefault
  // there is a no-op). Attaches non-passive so we can swallow the vertical
  // scroll and convert it into horizontal — otherwise the page scrolls Y
  // while the cards stay put.
  const scrollRowRef = useRef(null)
  useEffect(() => {
    const el = scrollRowRef.current
    if (!el) return
    const onWheel = (e) => {
      if (e.deltaY === 0) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [loading, error, selectedCharacter])

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false)
  const [isCloneMode, setIsCloneMode] = useState(false)

  // Fetch characters from API
  const fetchCharacters = async () => {
    try {
      setLoading(true)
      const response = await authFetch('/api/characters/me', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      })

      if (response.ok) {
        const charactersData = await response.json()
        setCharacters(charactersData)
      } else {
        console.error('Failed to fetch characters:', response.status)
        setError('Failed to load characters')
      }
    } catch (error) {
      console.error('Error fetching characters:', error)
      setError('Failed to load characters')
    } finally {
      setLoading(false)
    }
  }

  // Fetch characters when component mounts or user changes
  useEffect(() => {
    if (user) {
      fetchCharacters()
    }
  }, [user])

  // Sync edit mode from URL parameter
  useEffect(() => {
    const editParam = searchParams.get('edit')
    if (editParam && characters.length > 0) {
      const charToEdit = characters.find(c => c.id === editParam)
      if (charToEdit) {
        setSelectedCharacter(charToEdit)
        setIsEditing(true)
        setIsCloneMode(false)
      }
      return
    }

    // Keep local edit mode in sync when URL edit param is cleared.
    if (!editParam && !isCloneMode) {
      setIsEditing(false)
    }
  }, [searchParams, characters, isCloneMode])

  // Resize handler - disable transitions during window resize
  useEffect(() => {
    let resizeTimer
    const handleResize = () => {
      setIsResizing(true)
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => setIsResizing(false), 100)
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      clearTimeout(resizeTimer)
    }
  }, [])

  // Notify parent when expanded state changes and cleanup on unmount
  useEffect(() => {
    onExpandedChange?.(!!selectedCharacter)
  }, [selectedCharacter, onExpandedChange])

  // Auto-expand character from URL param (mirrors CampaignManager's
  // expandCampaignId pattern). Fires once characters have loaded so the
  // freshly-created character (set via /dashboard?expand_character_id=...)
  // surfaces in its drawer instead of the tile row.
  useEffect(() => {
    if (expandCharacterId && !loading) {
      const character = characters.find((c) => c.id === expandCharacterId)
      if (character && selectedCharacter?.id !== character.id) {
        setSelectedCharacter(character)
      }
      clearExpandCharacterId?.()
    }
  }, [expandCharacterId, characters, loading])

  // Reset expanded state on unmount
  useEffect(() => {
    return () => {
      onExpandedChange?.(false)
    }
  }, [])

  // Toggle character selection for drawer
  const toggleCharacterDetails = (character) => {
    setSelectedCharacter(prev =>
      prev?.id === character.id ? null : character
    )
    // Exit edit mode when toggling selection
    setIsEditing(false)
    setIsCloneMode(false)
    // Parent notification handled by useEffect watching selectedCharacter
  }

  // Enter edit mode with URL update
  const enterEditMode = () => {
    if (!selectedCharacter) return
    setIsEditing(true)
    setIsCloneMode(false)

    // Update URL with edit parameter
    const current = new URLSearchParams(Array.from(searchParams.entries()))
    current.set('edit', selectedCharacter.id)
    router.push(`/dashboard?${current.toString()}`)
  }

  // Enter clone mode (edit panel in create mode)
  const enterCloneMode = () => {
    if (!selectedCharacter) return
    setIsEditing(true)
    setIsCloneMode(true)
    // Don't add URL param for clone mode - it's not bookmarkable
  }

  // Exit edit mode and clean URL
  const exitEditMode = () => {
    setIsEditing(false)
    setIsCloneMode(false)

    // Remove edit parameter from URL
    const current = new URLSearchParams(Array.from(searchParams.entries()))
    current.delete('edit')
    const query = current.toString()
    router.push(`/dashboard${query ? `?${query}` : ''}`)
  }

  // Handle save from edit panel
  const handleEditSave = (updatedCharacter) => {
    if (isCloneMode) {
      // Clone creates a new character - add to list and select it
      setCharacters(prev => [...prev, updatedCharacter])
      setSelectedCharacter(updatedCharacter)
    } else {
      // Edit updates existing character
      setCharacters(prev => prev.map(c =>
        c.id === updatedCharacter.id ? updatedCharacter : c
      ))
      setSelectedCharacter(updatedCharacter)
    }
    exitEditMode()
  }

  // Handle delete button click - show confirmation modal
  const handleDeleteClick = (character) => {
    setCharacterToDelete(character)
    setShowDeleteModal(true)
    setDeleteError(null)
  }

  // Handle confirmed delete action
  const handleConfirmDelete = async () => {
    if (!characterToDelete) return

    try {
      setDeleteError(null)
      await deleteCharacterMutation.mutateAsync({
        id: characterToDelete.id,
        isDraft: Boolean(characterToDelete.is_draft),
      })
      // Remove from local state for immediate UI feedback
      setCharacters(characters.filter(c => c.id !== characterToDelete.id))
      if (selectedCharacter?.id === characterToDelete.id) {
        setSelectedCharacter(null)
      }
      setShowDeleteModal(false)
      setCharacterToDelete(null)
    } catch (err) {
      setDeleteError(err.message)
    }
  }

  // Handle cancel delete
  const handleCancelDelete = () => {
    setShowDeleteModal(false)
    setCharacterToDelete(null)
    setDeleteError(null)
  }

  // Render loading state
  const renderLoading = () => (
    <div className="flex justify-center items-center py-8">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{borderColor: THEME.textAccent}}></div>
      <span className="ml-2" style={{color: THEME.textSecondary}}>Loading characters...</span>
    </div>
  )

  // Render error state
  const renderError = () => (
    <div className="rounded-sm border p-4" style={{backgroundColor: '#991b1b', borderColor: '#dc2626'}}>
      <p style={{color: '#fca5a5'}}>{error}</p>
    </div>
  )

  // Cards fill the scroll row's full height; width is derived from the
  // 9:16 portrait aspect ratio. Min/max keep the cards usable on extreme
  // viewports without re-introducing a fixed-width clamp.
  const CARD_STYLE = {
    height: '100%',
    width: 'auto',
    aspectRatio: '9/16',
    minWidth: '140px',
    maxWidth: '600px',
  }

  // Render character card (9:16 portrait aspect ratio for modern devices)
  const renderCharacterCard = (char) => (
    <div
      key={char.id}
      className="flex-shrink-0 rounded-sm border-2 overflow-hidden cursor-pointer"
      style={{
        ...CARD_STYLE,
        backgroundColor: THEME.bgPanel,
        borderColor: selectedCharacter?.id === char.id ? THEME.borderActive : THEME.borderDefault,
        transition: isResizing ? 'none' : 'border-color 200ms ease-in-out',
        display: 'grid',
        gridTemplateRows: '3fr 1fr'
      }}
      onClick={() => toggleCharacterDetails(char)}
    >
      {/* Avatar area - 3/4 of card height; per-character avatar with
          hero-image fallback */}
      <div
        className="flex items-center justify-center relative"
        style={{
          backgroundImage: `url(${char.avatar_url || '/heroes.png'})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        {/* Overlay for badge readability - much lighter over a real
            avatar so the portrait stays visible */}
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: char.avatar_url ? `${COLORS.onyx}26` : `${COLORS.onyx}80`
          }}
        />

        {/* In Game badge */}
        {char.active_game && (
          <div className="absolute top-3 right-3 z-10">
            <span
              className="px-3 py-1.5 text-sm font-semibold rounded-sm border flex items-center gap-1.5"
              style={{backgroundColor: '#16a34a', borderColor: '#22c55e', color: 'white'}}
            >
              <FontAwesomeIcon icon={faLock} className="text-sm" />
              In Game
            </span>
          </div>
        )}
      </div>

      {/* Name + Level bar - 1/4 of card height, centered text */}
      <div
        className="p-4 border-t flex flex-col justify-center items-center text-center"
        style={{
          borderTopColor: THEME.borderSubtle
        }}
      >
        <h3 className="text-lg font-[family-name:var(--font-metamorphous)] truncate w-full" style={{color: THEME.textOnDark}}>
          {char.character_name || 'Unnamed'}
        </h3>
        <p className="text-sm" style={{color: THEME.textSecondary}}>
          Level {char.level || 1} {char.character_race || ''}
        </p>
      </div>
    </div>
  )

  // Render Create New Character card - matches Campaign template styling but portrait
  const renderCreateCard = () => (
    <div
      className="flex-shrink-0 rounded-sm overflow-hidden"
      style={CARD_STYLE}
    >
      <button
        onClick={() => router.push('/character/create')}
        className="w-full h-full relative"
        style={{
          backgroundColor: 'transparent'
        }}
      >
        {/* Knocked-out overlay - matches Campaign template */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center p-6"
          style={{
            backgroundColor: `${THEME.bgPanel}40` // 25% opacity for knocked-out effect
          }}
        >
          <FontAwesomeIcon
            icon={faPlus}
            className="text-7xl mb-4 opacity-50"
            style={{color: COLORS.smoke}}
          />
          <h4 className="text-2xl font-[family-name:var(--font-metamorphous)] mb-2 opacity-50 text-center" style={{color: THEME.textPrimary}}>
            Create New Character
          </h4>
        </div>
      </button>
    </div>
  )

  // Render stats panel — shares CharacterSheet with the /character/[id]
  // read-only route so both surfaces show the exact same data. Drawer chrome
  // (Close, Delete) lives here; sheet body is delegated.
  const renderStatsPanel = () => {
    if (!selectedCharacter) return null

    return (
      // Transparent — the drawer overlay paints the page colour. Avoids a
      // double-painted layer (carbon under graphite) that previously made
      // this surface read darker than the wizard. No left border either:
      // the wedge avatar pane provides the visual division on its own.
      <div className="flex-1 p-6 overflow-y-auto">
        {/* Drawer chrome — Close on the right, Edit + Delete on the left.
            Edit reuses the wizard via ?id=… (same surface as create); the
            backend's lock check (active_campaign) gates whether the PATCHes
            land, so we disable the button locally for the same condition
            to avoid a click-then-error round-trip. */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              onClick={() => router.push(`/character/create?id=${selectedCharacter.id}`)}
              disabled={Boolean(selectedCharacter.active_campaign)}
            >
              <FontAwesomeIcon icon={faPenToSquare} className="mr-2" />
              Edit
            </Button>
            <Button
              variant="danger"
              onClick={() => handleDeleteClick(selectedCharacter)}
              disabled={Boolean(selectedCharacter.active_campaign)}
            >
              <FontAwesomeIcon icon={faTrash} className="mr-2" />
              Delete
            </Button>
          </div>
          <button
            onClick={() => {
              setSelectedCharacter(null)
              onExpandedChange?.(false)
            }}
            className="px-3 py-1 rounded-sm border hover:opacity-80 transition-opacity"
            style={{
              color: THEME.textSecondary,
              borderColor: THEME.borderSubtle,
              backgroundColor: THEME.bgSecondary,
            }}
          >
            Close
          </button>
        </div>

        <CharacterSheet character={selectedCharacter} />
      </div>
    )
  }

  // Render the avatar pane on the left side of the expanded drawer — uses
  // the same wedge-clipped pane as the wizard + read-only sheet, in
  // ``readOnly`` mode (no edit affordances). The In-Game badge stays as a
  // local overlay since it's drawer-specific context.
  const renderSelectedCard = () => {
    if (!selectedCharacter) return null

    const char = selectedCharacter
    return (
      <div
        className="relative flex flex-col"
        style={{
          width: 'clamp(320px, 30vw, 800px)',
          minWidth: 'clamp(320px, 30vw, 800px)',
          height: '100%',
        }}
      >
        <CharacterAvatarPane avatarUrl={char.avatar_url} readOnly />

        {char.active_game && (
          <div className="absolute top-4 right-8 z-10">
            <span
              className="px-3 py-1.5 text-sm font-semibold rounded-sm border flex items-center gap-1.5"
              style={{ backgroundColor: '#16a34a', borderColor: '#22c55e', color: 'white' }}
            >
              <FontAwesomeIcon icon={faLock} className="text-sm" />
              In Game
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Loading/Error states */}
      {loading && renderLoading()}
      {!loading && error && renderError()}

      {/* Content area - flex-1 min-h-0 to fill remaining space */}
      {/* Pattern: separate tile view and expanded view as siblings (like CampaignManager) */}
      <div className="flex-1 min-h-0 relative">
        {/* Tile scroll area - hidden when expanded */}
        {!loading && !error && (
          <div
            ref={scrollRowRef}
            className="flex gap-4 overflow-x-auto h-full items-stretch"
            style={{
              paddingLeft: 'clamp(0.5rem, 2.5vw, 3.5rem)',
              paddingRight: 'clamp(0.5rem, 2.5vw, 3.5rem)',
              paddingBottom: '1rem',
              scrollbarWidth: 'thin',
              WebkitOverflowScrolling: 'touch',
              opacity: selectedCharacter ? 0 : 1,
              pointerEvents: selectedCharacter ? 'none' : 'auto',
              transition: isResizing ? 'none' : 'opacity 200ms ease-in-out'
            }}
          >
            {/* Character Cards */}
            {characters.map((char) => renderCharacterCard(char))}
            {/* Create New Character Card */}
            {renderCreateCard()}
          </div>
        )}

        {/* Expanded view - separate full-width overlay (like CampaignManager's drawer).
            Background matches the wizard / read-only sheet so the "view a
            finalised character" surface reads as one consistent page colour
            no matter which entry point the player came from. */}
        <div
          className="absolute top-0 bottom-0 flex"
          style={{
            left: selectedCharacter ? 'calc(50% - 50vw)' : '0',
            width: selectedCharacter ? '100vw' : '100%',
            backgroundColor: COLORS.graphite,
            opacity: selectedCharacter ? 1 : 0,
            pointerEvents: selectedCharacter ? 'auto' : 'none',
            transition: isResizing
              ? 'none'
              : selectedCharacter
                ? 'opacity 200ms ease-in-out, left 200ms ease-in-out, width 200ms ease-in-out'
                : 'opacity 200ms ease-in-out 50ms, left 200ms ease-in-out, width 200ms ease-in-out'
          }}
        >
          {/* Inner content constrained to max-width for consistency with campaigns */}
          <div className="flex h-full" style={{ maxWidth: '1600px', width: '100%' }}>
            {/* Left side: Selected character hero card */}
            {selectedCharacter && renderSelectedCard()}
            {/* Right side: Stats panel. Inline edit was removed with the
                v1 schema rewrite — finalised characters now redirect to
                the read-only /character/{id} sheet, drafts resume in the
                wizard at /character/create?id=… */}
            {selectedCharacter && renderStatsPanel()}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal open={showDeleteModal} onClose={deleteCharacterMutation.isPending ? () => {} : handleCancelDelete} size="md">
        <div className="p-6">
          <h3 className="text-xl font-bold mb-2 text-content-accent">Delete Character</h3>
          <p className="mb-1 text-content-on-dark">
            Are you sure you want to delete <strong className="text-content-accent">{characterToDelete?.character_name}</strong>?
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
    </div>
  )
}