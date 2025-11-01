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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
          <span className="ml-2 text-slate-400">Loading characters...</span>
        </div>
      )
    }

    if (error) {
      return (
        <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4">
          <p className="text-red-400">{error}</p>
        </div>
      )
    }

    if (characters.length === 0) {
      return (
        <div className="bg-slate-800 border border-purple-500/30 rounded-lg p-8 text-center">
          <p className="text-slate-300 text-lg mb-4">No characters found</p>
          <p className="text-slate-500">Create your first character to get started!</p>
        </div>
      )
    }

    return characters.map((char, index) => (
      <div key={char.id || index} className="bg-slate-800 p-4 rounded-lg border border-purple-500/30 hover:shadow-lg hover:shadow-purple-500/30 transition-all duration-200 flex flex-col">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3 flex-1">
            <div className="w-12 h-12 bg-purple-500/20 border-2 border-purple-500/50 rounded-full flex items-center justify-center text-purple-400 text-xl font-bold flex-shrink-0">
              {char.character_name ? char.character_name[0].toUpperCase() : '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-bold text-slate-200 truncate">{char.character_name || 'Unnamed Character'}</h3>
                {char.active_game && (
                  <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs font-semibold rounded-full border border-green-500/30 flex items-center gap-1 whitespace-nowrap">
                    <FontAwesomeIcon icon={faLock} className="text-xs" />
                    In Game
                  </span>
                )}
              </div>
              <p className="text-slate-400 text-sm">Level {char.level || 1} {char.character_race || 'Unknown'} {char.character_class || 'Unknown'}</p>
            </div>
          </div>
        </div>

        <div className="space-y-1.5 mb-3">
          <p className="text-slate-500 text-xs">HP: {char.hp_current || 0}/{char.hp_max || 0} | AC: {char.ac || 0}</p>
          <p className="text-slate-500 text-xs">Created: {char.created_at ? new Date(char.created_at).toLocaleDateString() : 'Unknown'}</p>
        </div>

        <div className="flex gap-2 mt-auto pt-3 border-t border-slate-700">
          <button
            onClick={() => router.push(`/character/edit/${char.id}`)}
            className="flex-1 px-3 py-2 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30 transition-all text-sm font-semibold flex items-center justify-center gap-2"
            title="Edit Character"
          >
            <FontAwesomeIcon icon={faPenToSquare} />
            Edit
          </button>
          <button
            onClick={() => handleDeleteClick(char)}
            className={`flex-1 px-3 py-2 rounded-lg border text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
              char.active_game
                ? 'bg-slate-700 text-slate-500 border-slate-600 cursor-not-allowed opacity-50'
                : 'bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30'
            }`}
            title="Delete Character"
            disabled={char.active_game}
          >
            <FontAwesomeIcon icon={faTrash} />
            Delete
          </button>
        </div>
      </div>
    ))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white uppercase">Your Characters</h1>
        <p className="mt-2 text-slate-400">Manage all your characters. Create new heroes, edit existing ones, or get them ready for the next adventure.</p>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end items-center mb-6 gap-3">
        <button className="bg-slate-700 text-slate-300 font-semibold px-4 py-2.5 rounded-lg border border-slate-600 hover:bg-slate-600 hover:border-slate-500 transition-all duration-200 flex items-center gap-2 text-sm">
          <FontAwesomeIcon icon={faCopy} />
          Clone Character
        </button>
        <button
          onClick={() => router.push('/character/create')}
          className="bg-purple-600 text-white font-semibold px-4 py-2.5 rounded-lg border border-purple-500 hover:bg-purple-500 hover:shadow-lg hover:shadow-purple-500/30 transition-all duration-200 flex items-center gap-2 text-sm"
        >
          <FontAwesomeIcon icon={faPlus} />
          Create New Character
        </button>
      </div>

      {/* Characters Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {renderCharacters()}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-purple-500/30 rounded-lg shadow-2xl shadow-purple-500/20 p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-purple-400 mb-2">Delete Character</h3>
            <p className="text-slate-300 mb-1">
              Are you sure you want to delete <strong className="text-purple-400">{characterToDelete?.character_name}</strong>?
            </p>
            <p className="text-sm text-slate-500 mb-4">This action cannot be undone.</p>

            {deleteError && (
              <div className="mb-4 bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-3 rounded">
                {deleteError}
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelDelete}
                disabled={deleteLoading}
                className="px-4 py-2 bg-slate-700 text-slate-300 border border-slate-600 rounded-lg hover:bg-slate-600 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleteLoading}
                className="px-4 py-2 bg-red-600 text-white border border-red-500 rounded-lg hover:bg-red-500 hover:shadow-lg hover:shadow-red-500/30 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {deleteLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Deleting...
                  </>
                ) : (
                  <>
                    <FontAwesomeIcon icon={faTrash} />
                    Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}