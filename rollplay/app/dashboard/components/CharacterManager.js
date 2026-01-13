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

  const renderCharacters = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{borderColor: THEME.textAccent}}></div>
          <span className="ml-2" style={{color: THEME.textSecondary}}>Loading characters...</span>
        </div>
      )
    }

    if (error) {
      return (
        <div className="rounded-sm border p-4" style={{backgroundColor: '#991b1b', borderColor: '#dc2626'}}>
          <p style={{color: '#fca5a5'}}>{error}</p>
        </div>
      )
    }

    if (characters.length === 0) {
      return (
        <div className="border rounded-sm p-8 text-center" style={{backgroundColor: THEME.bgPanel, borderColor: THEME.borderSubtle}}>
          <p className="text-lg mb-4" style={{color: THEME.textPrimary}}>No characters found</p>
          <p style={{color: THEME.textSecondary}}>Create your first character to get started!</p>
        </div>
      )
    }

    return characters.map((char, index) => (
      <div key={char.id || index} className="rounded-sm border transition-all duration-200 flex flex-col overflow-hidden w-full max-w-[320px] min-w-[240px] mx-auto" style={{backgroundColor: THEME.bgPanel, borderColor: THEME.borderSubtle}}>
        {/* Portrait Banner Area - 3:4 aspect ratio */}
        <div className="aspect-[3/4] w-full border-b-2 flex items-center justify-center relative" style={{backgroundColor: `${THEME.bgSecondary}`, borderBottomColor: THEME.borderDefault}}>
          <div className="w-24 h-24 rounded-full flex items-center justify-center border-2" style={{backgroundColor: `${THEME.textAccent}30`, borderColor: `${THEME.textAccent}80`}}>
            <span className="text-5xl font-bold" style={{color: THEME.textAccent}}>
              {char.character_name ? char.character_name[0].toUpperCase() : '?'}
            </span>
          </div>
          {char.active_game && (
            <div className="absolute top-2 right-2">
              <span className="px-2 py-1 backdrop-blur-sm text-white text-xs font-semibold rounded-sm border flex items-center gap-1 shadow-lg" style={{backgroundColor: '#16a34a', borderColor: '#22c55e'}}>
                <FontAwesomeIcon icon={faLock} className="text-xs" />
                In Game
              </span>
            </div>
          )}
        </div>

        {/* Character Info - Centered */}
        <div className="p-4 text-center flex flex-col flex-1">
          <h3 className="text-xl font-bold mb-1 truncate px-2" style={{color: THEME.textPrimary}}>
            {char.character_name || 'Unnamed Character'}
          </h3>
          <p className="text-sm mb-2" style={{color: THEME.textSecondary}}>
            Level {char.level || 1} {char.character_race || 'Unknown'} {char.character_classes && char.character_classes.length > 0
              ? char.character_classes.map(c => c.character_class).join(' / ')
              : 'Unknown'}
          </p>

          {/* Stats Row - Inline with bullets */}
          <div className="text-xs mb-2" style={{color: THEME.textSecondary}}>
            <span>HP: {char.hp_current || 0}/{char.hp_max || 0}</span>
            <span className="mx-2">•</span>
            <span>AC: {char.ac || 0}</span>
          </div>

          <p className="text-xs mb-4" style={{color: THEME.textSecondary}}>
            Created: {char.created_at ? new Date(char.created_at).toLocaleDateString() : 'Unknown'}
          </p>

          {/* Icon-Only Action Buttons */}
          <div className="flex justify-center gap-3 mt-auto pt-3 border-t" style={{borderTopColor: THEME.borderSubtle}}>
            <button
              onClick={() => router.push(`/character/edit/${char.id}`)}
              className="w-10 h-10 rounded-sm border transition-all flex items-center justify-center"
              style={{backgroundColor: THEME.bgSecondary, color: THEME.textAccent, borderColor: THEME.borderActive}}
              title="Edit Character"
            >
              <FontAwesomeIcon icon={faPenToSquare} />
            </button>
            <button
              onClick={async () => {
                try {
                  const response = await fetch(`/api/characters/${char.id}/clone`, {
                    method: 'POST',
                    credentials: 'include'
                  })

                  if (response.ok) {
                    const clonedCharacter = await response.json()
                    // Redirect to edit page of the newly cloned character
                    router.push(`/character/edit/${clonedCharacter.id}`)
                  } else {
                    const errorData = await response.json()
                    console.error('Failed to clone character:', errorData.detail)
                    // Optionally show error to user
                  }
                } catch (error) {
                  console.error('Error cloning character:', error)
                }
              }}
              className="w-10 h-10 rounded-sm border transition-all flex items-center justify-center"
              style={{backgroundColor: THEME.bgSecondary, color: THEME.textPrimary, borderColor: THEME.borderDefault}}
              title="Clone Character"
            >
              <FontAwesomeIcon icon={faCopy} />
            </button>
            <button
              onClick={() => handleDeleteClick(char)}
              disabled={char.active_game}
              className="w-10 h-10 rounded-sm border flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: char.active_game ? THEME.bgSecondary : '#991b1b',
                color: char.active_game ? THEME.textSecondary : '#fca5a5',
                borderColor: char.active_game ? THEME.borderDefault : '#dc2626'
              }}
              title="Delete Character"
            >
              <FontAwesomeIcon icon={faTrash} />
            </button>
          </div>
        </div>
      </div>
    ))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-4xl font-bold font-[family-name:var(--font-metamorphous)]" style={{color: THEME.textPrimary}}>Character Management</h1>
          <p className="mt-2" style={{color: THEME.textSecondary}}>Create and manage your adventurers</p>
        </div>
        <Button
          variant="primary"
          onClick={() => router.push('/character/create')}
          size="md"
        >
          <FontAwesomeIcon icon={faPlus} className="mr-2" />
          Create Character
        </Button>
      </div>

      {/* Characters Grid */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 320px))' }}>
        {renderCharacters()}
      </div>

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