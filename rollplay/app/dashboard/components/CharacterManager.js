/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect } from 'react'
import { authFetch } from '@/app/shared/utils/authFetch'
import { useRouter, useSearchParams } from 'next/navigation'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faPenToSquare,
  faTrash,
  faLock,
  faPlus,
  faCopy
} from '@fortawesome/free-solid-svg-icons'
import { COLORS, THEME } from '@/app/styles/colorTheme'
import Modal from '@/app/shared/components/Modal'
import Spinner from '@/app/shared/components/Spinner'
import { Button } from './shared/Button'
import CharacterEditPanel from './CharacterEditPanel'
import { useDeleteCharacter } from '../hooks/mutations/useCharacterMutations'

export default function CharacterManager({ user, onExpandedChange }) {
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

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false)
  const [isCloneMode, setIsCloneMode] = useState(false)

  // Fetch characters from API
  const fetchCharacters = async () => {
    try {
      setLoading(true)
      const response = await authFetch('/api/characters/', {
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
    }
  }, [searchParams, characters])

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
      await deleteCharacterMutation.mutateAsync(characterToDelete.id)
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

  // Card width constant - used by both character cards and create card
  // Based on available height (~55vh after header/tabs/title/padding) * 9/16 aspect ratio
  // Min 140px for very small screens, max 600px for large displays
  const CARD_WIDTH = 'clamp(140px, calc(55vh * 0.5625), 600px)'

  // Render character card (9:16 portrait aspect ratio for modern devices)
  const renderCharacterCard = (char) => (
    <div
      key={char.id}
      className="flex-shrink-0 rounded-sm border-2 overflow-hidden cursor-pointer"
      style={{
        width: CARD_WIDTH,
        aspectRatio: '9/16',
        backgroundColor: THEME.bgPanel,
        borderColor: selectedCharacter?.id === char.id ? THEME.borderActive : THEME.borderDefault,
        transition: isResizing ? 'none' : 'border-color 200ms ease-in-out',
        display: 'grid',
        gridTemplateRows: '3fr 1fr'
      }}
      onClick={() => toggleCharacterDetails(char)}
    >
      {/* Avatar area - 3/4 of card height with hero background */}
      <div
        className="flex items-center justify-center relative"
        style={{
          backgroundImage: 'url(/heroes.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        {/* Dark overlay for readability */}
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: `${COLORS.onyx}80`
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
      style={{
        width: CARD_WIDTH,
        aspectRatio: '9/16'
      }}
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

  // Render stats panel (portrait-oriented, for side-by-side layout)
  const renderStatsPanel = () => {
    if (!selectedCharacter) return null

    return (
      <div
        className="flex-1 p-6 overflow-y-auto"
        style={{
          backgroundColor: THEME.bgPanel,
          borderLeft: `2px solid ${THEME.borderSubtle}`
        }}
      >
        {/* Header with Close button */}
        <div className="flex items-center justify-between mb-6">
          <h3
            className="text-2xl font-semibold font-[family-name:var(--font-metamorphous)]"
            style={{color: THEME.textOnDark}}
          >
            {selectedCharacter.character_name}
          </h3>
          <button
            onClick={() => {
              setSelectedCharacter(null)
              onExpandedChange?.(false)
            }}
            className="px-3 py-1 rounded-sm border hover:opacity-80 transition-opacity"
            style={{
              color: THEME.textSecondary,
              borderColor: THEME.borderSubtle,
              backgroundColor: THEME.bgSecondary
            }}
          >
            Close
          </button>
        </div>

        {/* Stats stacked vertically for portrait layout */}
        <div className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold uppercase" style={{color: THEME.textAccent}}>Basic Info</h4>
            <div
              className="p-4 rounded-sm border"
              style={{backgroundColor: THEME.bgSecondary, borderColor: THEME.borderSubtle}}
            >
              <p className="text-lg" style={{color: THEME.textOnDark}}>
                Level {selectedCharacter.level} {selectedCharacter.character_race}
              </p>
              <p style={{color: THEME.textSecondary}}>
                {selectedCharacter.character_classes?.map(c => c.character_class).join(' / ') || 'No Class'}
              </p>
              {selectedCharacter.background && (
                <p className="text-sm mt-2" style={{color: THEME.textSecondary}}>
                  Background: {selectedCharacter.background}
                </p>
              )}
            </div>
          </div>

          {/* Combat Stats */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold uppercase" style={{color: THEME.textAccent}}>Combat Stats</h4>
            <div className="grid grid-cols-2 gap-4">
              <div
                className="p-4 rounded-sm border text-center"
                style={{backgroundColor: THEME.bgSecondary, borderColor: THEME.borderSubtle}}
              >
                <p className="text-3xl font-bold" style={{color: THEME.textOnDark}}>
                  {selectedCharacter.ac || 0}
                </p>
                <p className="text-sm" style={{color: THEME.textSecondary}}>AC</p>
              </div>
              <div
                className="p-4 rounded-sm border text-center"
                style={{backgroundColor: THEME.bgSecondary, borderColor: THEME.borderSubtle}}
              >
                <p className="text-3xl font-bold" style={{color: THEME.textOnDark}}>
                  {selectedCharacter.hp_current || 0}/{selectedCharacter.hp_max || 0}
                </p>
                <p className="text-sm" style={{color: THEME.textSecondary}}>HP</p>
              </div>
            </div>
          </div>

          {/* Ability Scores - 2x3 grid for portrait */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold uppercase" style={{color: THEME.textAccent}}>Ability Scores</h4>
            <div className="grid grid-cols-2 gap-3">
              {['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'].map(ability => {
                const score = selectedCharacter.ability_scores?.[ability] || 10
                const modifier = Math.floor((score - 10) / 2)
                const modifierStr = modifier >= 0 ? `+${modifier}` : `${modifier}`
                return (<div
                  key={ability}
                  className="p-3 rounded-sm border text-center"
                  style={{backgroundColor: THEME.bgSecondary, borderColor: THEME.borderSubtle}}
                >
                  <p className="text-xs uppercase mb-1" style={{color: THEME.textSecondary}}>
                    {ability}
                  </p>
                  <p className="text-xl font-bold" style={{color: THEME.textOnDark}}>
                    {modifierStr}
                  </p>
                  <p className="text-sm" style={{color: THEME.textSecondary}}>
                    {score}
                  </p>
                </div>
              )
              })}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-6 border-t space-y-3" style={{borderTopColor: THEME.borderSubtle}}>
            {/* Edit and Clone on same row */}
            <div className="flex gap-3">
              <Button
                variant="primary"
                className="flex-1 justify-center"
                onClick={enterEditMode}
              >
                <FontAwesomeIcon icon={faPenToSquare} className="mr-2" />
                Edit Character
              </Button>
              <Button
                variant="primary"
                className="flex-1 justify-center"
                onClick={enterCloneMode}
              >
                <FontAwesomeIcon icon={faCopy} className="mr-2" />
                Clone Character
              </Button>
            </div>
            <Button
              variant="danger"
              className="w-full justify-center"
              onClick={() => handleDeleteClick(selectedCharacter)}
              disabled={selectedCharacter.active_game}
            >
              <FontAwesomeIcon icon={faTrash} className="mr-2" />
              Delete Character
            </Button>
          </div>

          {/* Created Date */}
          <p className="text-xs" style={{color: THEME.textSecondary}}>
            Created: {selectedCharacter.created_at ? new Date(selectedCharacter.created_at).toLocaleDateString() : 'Unknown'}
          </p>
        </div>
      </div>
    )
  }

  // Render selected character card for expanded view (left side) - hero style, fills container
  const renderSelectedCard = () => {
    if (!selectedCharacter) return null

    const char = selectedCharacter
    return (
      <div
        className="flex flex-col cursor-pointer"
        style={{
          backgroundImage: 'url(/heroes.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          width: 'clamp(320px, 30vw, 800px)', // Scales with viewport, larger max for wide screens
          minWidth: 'clamp(320px, 30vw, 800px)',
          height: '100%' // Fill parent height
        }}
        onClick={() => {
          setSelectedCharacter(null)
          onExpandedChange?.(false)
        }}
      >
        {/* Dark overlay for the entire card */}
        <div
          className="flex-1 w-full flex flex-col relative"
          style={{
            backgroundColor: `${COLORS.onyx}70`
          }}
        >
          {/* In Game badge - top right */}
          {char.active_game && (
            <div className="absolute top-4 right-4 z-10">
              <span
                className="px-3 py-1.5 text-sm font-semibold rounded-sm border flex items-center gap-1.5"
                style={{backgroundColor: '#16a34a', borderColor: '#22c55e', color: 'white'}}
              >
                <FontAwesomeIcon icon={faLock} className="text-sm" />
                In Game
              </span>
            </div>
          )}

          {/* Spacer to push content to bottom */}
          <div className="flex-1" />

          {/* Name + Level at bottom with gradient fade */}
          <div
            className="p-6 flex flex-col justify-end"
            style={{
              background: `linear-gradient(to top, ${COLORS.onyx}E6 0%, ${COLORS.onyx}80 50%, transparent 100%)`,
              minHeight: '120px'
            }}
          >
            <h3 className="text-2xl font-[family-name:var(--font-metamorphous)]" style={{color: THEME.textOnDark}}>
              {char.character_name || 'Unnamed'}
            </h3>
            <p className="text-base mt-1" style={{color: THEME.textSecondary}}>
              Level {char.level || 1} {char.character_race || ''}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header - flex-shrink-0 to maintain size, reduced margin when expanded */}
      <div className={`flex-shrink-0 ${selectedCharacter ? 'mb-4' : 'mb-8'}`}>
        <h1 className="text-4xl font-bold font-[family-name:var(--font-metamorphous)]" style={{color: THEME.textBold}}>Character Management</h1>
        <p className="mt-2" style={{color: THEME.textPrimary}}>Create and manage your adventurers</p>
      </div>

      {/* Loading/Error states */}
      {loading && renderLoading()}
      {!loading && error && renderError()}

      {/* Content area - flex-1 min-h-0 to fill remaining space */}
      {/* Pattern: separate tile view and expanded view as siblings (like CampaignManager) */}
      <div className="flex-1 min-h-0 relative">
        {/* Tile scroll area - hidden when expanded */}
        {!loading && !error && (
          <div
            className="flex gap-4 overflow-x-auto h-full items-start"
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

        {/* Expanded view - separate full-width overlay (like CampaignManager's drawer) */}
        <div
          className="absolute top-0 bottom-0 flex"
          style={{
            left: selectedCharacter ? 'calc(50% - 50vw)' : '0',
            width: selectedCharacter ? '100vw' : '100%',
            backgroundColor: THEME.bgPanel,
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
            {/* Right side: Stats panel OR Edit panel */}
            {selectedCharacter && (isEditing ? (
              <CharacterEditPanel
                character={selectedCharacter}
                onSave={handleEditSave}
                onCancel={exitEditMode}
                isCloneMode={isCloneMode}
              />
            ) : (
              renderStatsPanel()
            ))}
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