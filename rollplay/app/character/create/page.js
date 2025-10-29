/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import CharacterForm from '../components/CharacterForm'

export default function CreateCharacter() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [validationErrors, setValidationErrors] = useState([])

  const handleSubmit = async (formData) => {
    setLoading(true)
    setError(null)
    setValidationErrors([])

    try {
      const response = await fetch('/api/characters/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        router.push('/dashboard')
      } else {
        const errorData = await response.json()

        if (errorData.errors && Array.isArray(errorData.errors)) {
          setValidationErrors(errorData.errors)
        } else {
          setError(errorData.detail || 'Failed to create character')
        }
      }
    } catch (err) {
      console.error('Error creating character:', err)
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Create New Character</h1>
            <p className="mt-2 text-gray-600">Fill in the details to create your new D&D character</p>
          </div>

          {/* Form */}
          <CharacterForm
            mode="create"
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