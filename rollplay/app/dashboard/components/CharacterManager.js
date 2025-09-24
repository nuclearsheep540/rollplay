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
            {char.name ? char.name[0].toUpperCase() : '?'}
          </div>
          <div className="flex-grow">
            <h3 className="text-lg font-bold text-slate-800">{char.name || 'Unnamed Character'}</h3>
            <p className="text-slate-600 text-sm">Level {char.level || 1} {char.character_race || 'Unknown'} {char.character_class || 'Unknown'}</p>
            <p className="text-slate-500 text-xs mt-1">Campaign: {char.campaign || 'No Campaign'}</p>
            <p className="text-slate-500 text-xs mt-1">Created: {char.created_at ? new Date(char.created_at).toLocaleDateString() : 'Unknown'}</p>
          </div>
        </div>
        <div className="flex space-x-2 flex-shrink-0">
          <button className="p-2 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors" title="Edit Character">
            <span className="text-lg">✎</span>
          </button>
          <button className="p-2 rounded-full bg-indigo-100 text-indigo-600 hover:bg-indigo-200 transition-colors" title="View Character">
            <span className="text-lg">📖</span>
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
    </div>
  )
}