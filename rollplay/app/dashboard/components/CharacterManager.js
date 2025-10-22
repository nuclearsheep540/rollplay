/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">Loading characters...</span>
        </div>
      )
    }

    if (error) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )
    }

    if (characters.length === 0) {
      return (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-8 text-center">
          <p className="text-slate-600 text-lg mb-4">No characters found</p>
          <p className="text-slate-500">Create your first character to get started!</p>
        </div>
      )
    }

    return characters.map((char, index) => (
      <div key={char.id || index} className="bg-white p-4 rounded-lg shadow-md border border-gray-200 flex items-center justify-between hover:shadow-lg transition-all duration-300">
        <div className="flex items-center flex-grow">
          <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-xl font-bold mr-4 flex-shrink-0">
            {char.character_name ? char.character_name[0].toUpperCase() : '?'}
          </div>
          <div className="flex-grow">
            <h3 className="text-lg font-bold text-slate-800">{char.character_name || 'Unnamed Character'}</h3>
            <p className="text-slate-600 text-sm">Level {char.level || 1} {char.character_race || 'Unknown'} {char.character_class || 'Unknown'}</p>
            <p className="text-slate-500 text-xs mt-1">Campaign: {char.campaign || 'No Campaign'}</p>
            <p className="text-slate-500 text-xs mt-1">Created: {char.created_at ? new Date(char.created_at).toLocaleDateString() : 'Unknown'}</p>
          </div>
        </div>
        <div className="flex space-x-2 flex-shrink-0">
          <button
            onClick={() => router.push(`/character/edit/${char.id}`)}
            className="p-2 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
            title="Edit Character"
          >
            <span className="text-lg">✎</span>
          </button>
          <button
            onClick={() => handleDeleteClick(char)}
            className="p-2 rounded-full bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
            title="Delete Character"
          >
            <span className="text-lg">🗑️</span>
          </button>
        </div>
      </div>
    ))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-slate-800">Your Characters</h1>
        <p className="mt-2 text-slate-600">This is your hub for managing all your characters. From here, you can create new heroes, edit existing ones, or get them ready for the next adventure. Each row provides detailed metadata for your characters.</p>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end items-center mb-6 space-x-4">
        <button className="bg-slate-300 text-slate-800 font-semibold px-5 py-3 rounded-xl shadow-md hover:bg-slate-400 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 flex items-center">
          <span className="text-xl mr-2">📋</span> Clone Character
        </button>
        <button 
          onClick={() => router.push('/character/create')}
          className="bg-indigo-600 text-white font-semibold px-5 py-3 rounded-xl shadow-md hover:bg-indigo-700 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 flex items-center"
        >
          <span className="text-xl mr-2">+</span> Create New Character
        </button>
      </div>

      {/* Characters List */}
      <div className="flex flex-col gap-4">
        {renderCharacters()}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Delete Character</h3>
            <p className="text-gray-600 mb-1">
              Are you sure you want to delete <strong>{characterToDelete?.character_name}</strong>?
            </p>
            <p className="text-sm text-gray-500 mb-4">This action cannot be undone.</p>

            {deleteError && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {deleteError}
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelDelete}
                disabled={deleteLoading}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleteLoading}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center"
              >
                {deleteLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Deleting...
                  </>
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}