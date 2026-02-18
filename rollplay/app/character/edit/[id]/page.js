/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect } from 'react'
import { authFetch } from '@/app/shared/utils/authFetch'
import { useRouter, useParams } from 'next/navigation'
import CharacterForm from '../../components/CharacterForm'

export default function EditCharacter() {
  const router = useRouter()
  const params = useParams()
  const characterId = params.id

  const [loading, setLoading] = useState(false)
  const [fetchingCharacter, setFetchingCharacter] = useState(true)
  const [error, setError] = useState(null)
  const [validationErrors, setValidationErrors] = useState([])
  const [characterData, setCharacterData] = useState(null)

  // Fetch character data on mount
  useEffect(() => {
    const fetchCharacter = async () => {
      try {
        const response = await authFetch(`/api/characters/${characterId}`, {
          method: 'GET',
          credentials: 'include'
        })

        if (response.ok) {
          const data = await response.json()
          setCharacterData(data)
        } else {
          const errorData = await response.json()
          setError(errorData.detail || 'Failed to load character')
        }
      } catch (err) {
        console.error('Error fetching character:', err)
        setError('Failed to load character')
      } finally {
        setFetchingCharacter(false)
      }
    }

    if (characterId) {
      fetchCharacter()
    }
  }, [characterId])

  const handleSubmit = async (formData) => {
    setLoading(true)
    setError(null)
    setValidationErrors([])

    try {
      const response = await authFetch(`/api/characters/${characterId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        router.push('/dashboard?tab=characters')
      } else {
        const errorData = await response.json()

        if (errorData.errors && Array.isArray(errorData.errors)) {
          setValidationErrors(errorData.errors)
        } else {
          setError(errorData.detail || 'Failed to update character')
        }
      }
    } catch (err) {
      console.error('Error updating character:', err)
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    router.push('/dashboard?tab=characters')
  }

  // Loading state while fetching character
  if (fetchingCharacter) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
              <span className="ml-3 text-gray-600 text-lg">Loading character...</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Error state if character couldn't be loaded
  if (error && !characterData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
              <p className="text-red-700 text-lg font-medium mb-4">{error}</p>
              <button
                onClick={() => router.push('/dashboard')}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Edit Character</h1>
            <p className="mt-2 text-gray-600">Update the details for {characterData?.character_name}</p>
          </div>

          {/* Form */}
          <CharacterForm
            mode="edit"
            initialData={characterData}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            loading={loading}
            error={error}
            validationErrors={validationErrors}
          />
        </div>
      </div>
    </div>
  )
}
