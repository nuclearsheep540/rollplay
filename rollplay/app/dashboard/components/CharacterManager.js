/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faPenToSquare,
  faTrash,
  faLock,
  faPlus,
  faCopy
} from '@fortawesome/free-solid-svg-icons'
import { COLORS, THEME } from '@/app/styles/colorTheme'
import { Button } from './shared/Button'

export default function CharacterManager({ user }) {
  const router = useRouter()
  const [characters, setCharacters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [characterToDelete, setCharacterToDelete] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  // Selection and resize state for horizontal scroll layout
  const [selectedCharacter, setSelectedCharacter] = useState(null)
  const [isResizing, setIsResizing] = useState(false)

  // Fetch characters from API
  const fetchCharacters = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/characters/', {
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

  // Toggle character selection for drawer
  const toggleCharacterDetails = (character) => {
    setSelectedCharacter(prev =>
      prev?.id === character.id ? null : character
    )
  }

  // Handle clone character action
  const handleClone = async (character) => {
    try {
      const response = await fetch(`/api/characters/${character.id}/clone`, {
        method: 'POST',
        credentials: 'include'
      })

      if (response.ok) {
        const clonedCharacter = await response.json()
        router.push(`/character/edit/${clonedCharacter.id}`)
      } else {
        const errorData = await response.json()
        console.error('Failed to clone character:', errorData.detail)
      }
    } catch (error) {
      console.error('Error cloning character:', error)
    }
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

    setDeleteLoading(true)
    setDeleteError(null)

    try {
      const response = await fetch(`/api/characters/${characterToDelete.id}`, {
        method: 'DELETE',
        credentials: 'include'
      })

      if (response.ok) {
        // Remove character from list
        setCharacters(characters.filter(c => c.id !== characterToDelete.id))
        // Close modal
        setShowDeleteModal(false)
        setCharacterToDelete(null)
      } else {
        const errorData = await response.json()
        setDeleteError(errorData.detail || 'Failed to delete character')
      }
    } catch (error) {
      console.error('Error deleting character:', error)
      setDeleteError('Failed to delete character')
    } finally {
      setDeleteLoading(false)
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
  const CARD_WIDTH = 'clamp(280px, 35vw, 420px)'

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
        aspectRatio: '9/16',
        opacity: selectedCharacter ? 0 : 1,
        pointerEvents: selectedCharacter ? 'none' : 'auto',
        transition: selectedCharacter
          ? 'opacity 100ms cubic-bezier(0.42, 0, 1, 1)'
          : 'opacity 100ms cubic-bezier(0.42, 0, 1, 1) 50ms'
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
            onClick={() => setSelectedCharacter(null)}
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
              {['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'].map(ability => (
                <div
                  key={ability}
                  className="p-3 rounded-sm border text-center"
                  style={{backgroundColor: THEME.bgSecondary, borderColor: THEME.borderSubtle}}
                >
                  <p className="text-xl font-bold" style={{color: THEME.textOnDark}}>
                    {selectedCharacter.ability_scores?.[ability] || 10}
                  </p>
                  <p className="text-xs uppercase" style={{color: THEME.textSecondary}}>
                    {ability.slice(0, 3)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-6 border-t space-y-3" style={{borderTopColor: THEME.borderSubtle}}>
            {/* Edit and Clone on same row */}
            <div className="flex gap-3">
              <Button
                variant="primary"
                className="flex-1 justify-center"
                onClick={() => router.push(`/character/edit/${selectedCharacter.id}`)}
              >
                <FontAwesomeIcon icon={faPenToSquare} className="mr-2" />
                Edit Character
              </Button>
              <Button
                variant="primary"
                className="flex-1 justify-center"
                onClick={() => handleClone(selectedCharacter)}
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
        className="h-full flex flex-col cursor-pointer"
        style={{
          backgroundImage: 'url(/heroes.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          width: CARD_WIDTH,
          minWidth: CARD_WIDTH
        }}
        onClick={() => setSelectedCharacter(null)}
      >
        {/* Dark overlay for the entire card */}
        <div
          className="h-full w-full flex flex-col relative"
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
    <div className="space-y-6">
      {/* Header - simplified without button (Create card at end of row) */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold font-[family-name:var(--font-metamorphous)]" style={{color: THEME.textBold}}>Character Management</h1>
        <p className="mt-2" style={{color: THEME.textPrimary}}>Create and manage your adventurers</p>
      </div>

      {/* Loading/Error states */}
      {loading && renderLoading()}
      {!loading && error && renderError()}

      {/* Character Display - switches between horizontal scroll and expanded side-by-side */}
      {!loading && !error && (
        <>
          {/* When NO character selected: Horizontal scroll row */}
          {!selectedCharacter && (
            <div
              className="flex gap-4 overflow-x-auto pb-4"
              style={{
                flexWrap: 'nowrap',
                paddingLeft: 'clamp(0.5rem, 2.5vw, 3.5rem)',
                paddingRight: 'clamp(0.5rem, 2.5vw, 3.5rem)',
                scrollbarWidth: 'thin',
                WebkitOverflowScrolling: 'touch'
              }}
            >
              {/* Character Cards */}
              {characters.map(char => renderCharacterCard(char))}

              {/* Create New Character Card - always visible */}
              {renderCreateCard()}
            </div>
          )}

          {/* When character IS selected: Full-width side-by-side layout */}
          {selectedCharacter && (
            <div
              className="flex rounded-sm overflow-hidden border-2"
              style={{
                position: 'relative',
                left: 'calc(50% - 50vw)',
                width: '100vw',
                minHeight: '500px',
                backgroundColor: THEME.bgPanel,
                borderColor: THEME.borderSubtle
              }}
            >
              {/* Left side: Selected character card - hero style, no padding */}
              <div className="flex-shrink-0">
                {renderSelectedCard()}
              </div>

              {/* Right side: Stats panel */}
              {renderStatsPanel()}
            </div>
          )}
        </>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50" style={{backgroundColor: THEME.overlayDark}}>
          <div className="border rounded-sm shadow-2xl p-6 max-w-md w-full mx-4" style={{backgroundColor: THEME.bgSecondary, borderColor: THEME.borderDefault}}>
            <h3 className="text-xl font-bold mb-2" style={{color: THEME.textAccent}}>Delete Character</h3>
            <p className="mb-1" style={{color: THEME.textPrimary}}>
              Are you sure you want to delete <strong style={{color: THEME.textAccent}}>{characterToDelete?.character_name}</strong>?
            </p>
            <p className="text-sm mb-4" style={{color: THEME.textSecondary}}>This action cannot be undone.</p>

            {deleteError && (
              <div className="mb-4 border px-4 py-3 rounded-sm" style={{backgroundColor: '#991b1b', borderColor: '#dc2626', color: '#fca5a5'}}>
                {deleteError}
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <Button
                variant="ghost"
                onClick={handleCancelDelete}
                disabled={deleteLoading}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirmDelete}
                disabled={deleteLoading}
              >
                {deleteLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
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
        </div>
      )}
    </div>
  )
}