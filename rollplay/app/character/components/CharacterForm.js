/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState } from 'react'
import Combobox from '../../shared/components/Combobox'
import { CHARACTER_RACES, CHARACTER_CLASSES } from '../../shared/constants/characterEnums'

export default function CharacterForm({
  mode = 'create',
  initialData = null,
  onSubmit,
  onCancel,
  loading = false,
  error = null,
  validationErrors = []
}) {
  const [formData, setFormData] = useState({
    name: initialData?.character_name || '',
    character_race: initialData?.character_race || '',
    character_class: initialData?.character_class || '',
    level: initialData?.level || 1,
    ability_scores: initialData?.ability_scores || {
      strength: 1,
      dexterity: 1,
      constitution: 1,
      intelligence: 1,
      wisdom: 1,
      charisma: 1
    },
    hp_max: initialData?.hp_max || 10,
    hp_current: initialData?.hp_current || 10,
    ac: initialData?.ac || 10,
  })

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleAbilityScoreChange = (ability, value) => {
    const numValue = parseInt(value, 10) || 1
    setFormData(prev => ({
      ...prev,
      ability_scores: {
        ...prev.ability_scores,
        [ability]: numValue
      }
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    await onSubmit(formData)
  }

  const isFormValid = formData.name.trim() && formData.character_race && formData.character_class

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Character Name */}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
          Character Name <span className="text-red-500">*</span>
        </label>
        <input
          id="name"
          type="text"
          value={formData.name}
          onChange={(e) => handleInputChange('name', e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          placeholder="Enter character name"
          required
        />
      </div>

      {/* Character Race */}
      <Combobox
        label="Character Race"
        options={CHARACTER_RACES}
        value={formData.character_race}
        onChange={(value) => handleInputChange('character_race', value)}
        placeholder="Select a race..."
        required
      />

      {/* Character Class */}
      <Combobox
        label="Character Class"
        options={CHARACTER_CLASSES}
        value={formData.character_class}
        onChange={(value) => handleInputChange('character_class', value)}
        placeholder="Select a class..."
        required
      />

      {/* Level */}
      <div>
        <label htmlFor="level" className="block text-sm font-medium text-gray-700 mb-2">
          Level <span className="text-red-500">*</span>
        </label>
        <input
          id="level"
          type="number"
          min="1"
          max="20"
          value={formData.level}
          onChange={(e) => handleInputChange('level', parseInt(e.target.value, 10) || 1)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          required
        />
      </div>

      {/* HP and AC */}

      <label htmlFor="hp_current" className="block text-sm font-medium text-gray-700 mb-2">
          Current HP <span className="text-red-500">*</span>
        </label>
        <input
          id="hp_current"
          type="number"
          min="-100"
          max="999"
          value={formData.hp_current}
          onChange={(e) => handleInputChange('hp_current', parseInt(e.target.value, 10) || 1)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          required
        />

      <label htmlFor="hp_max" className="block text-sm font-medium text-gray-700 mb-2">
          Max HP <span className="text-red-500">*</span>
        </label>
        <input
          id="hp_max"
          type="number"
          min="1"
          max="999"
          value={formData.hp_max}
          onChange={(e) => handleInputChange('hp_max', parseInt(e.target.value, 10) || 1)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          required
        />

      <label htmlFor="ac" className="block text-sm font-medium text-gray-700 mb-2">
          Armor Class <span className="text-red-500">*</span>
        </label>
        <input
          id="ac"
          type="number"
          min="1"
          max="50"
          value={formData.ac}
          onChange={(e) => handleInputChange('ac', parseInt(e.target.value, 10) || 1)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          required
        />

      {/* Ability Scores */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Ability Scores
        </label>
        <div className="grid grid-cols-3 gap-4">
          {/* Strength */}
          <div>
            <label htmlFor="strength" className="block text-xs font-medium text-gray-600 mb-1">
              STR
            </label>
            <input
              id="strength"
              type="number"
              min="1"
              max="30"
              value={formData.ability_scores.strength}
              onChange={(e) => handleAbilityScoreChange('strength', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Dexterity */}
          <div>
            <label htmlFor="dexterity" className="block text-xs font-medium text-gray-600 mb-1">
              DEX
            </label>
            <input
              id="dexterity"
              type="number"
              min="1"
              max="30"
              value={formData.ability_scores.dexterity}
              onChange={(e) => handleAbilityScoreChange('dexterity', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Constitution */}
          <div>
            <label htmlFor="constitution" className="block text-xs font-medium text-gray-600 mb-1">
              CON
            </label>
            <input
              id="constitution"
              type="number"
              min="1"
              max="30"
              value={formData.ability_scores.constitution}
              onChange={(e) => handleAbilityScoreChange('constitution', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Intelligence */}
          <div>
            <label htmlFor="intelligence" className="block text-xs font-medium text-gray-600 mb-1">
              INT
            </label>
            <input
              id="intelligence"
              type="number"
              min="1"
              max="30"
              value={formData.ability_scores.intelligence}
              onChange={(e) => handleAbilityScoreChange('intelligence', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Wisdom */}
          <div>
            <label htmlFor="wisdom" className="block text-xs font-medium text-gray-600 mb-1">
              WIS
            </label>
            <input
              id="wisdom"
              type="number"
              min="1"
              max="30"
              value={formData.ability_scores.wisdom}
              onChange={(e) => handleAbilityScoreChange('wisdom', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Charisma */}
          <div>
            <label htmlFor="charisma" className="block text-xs font-medium text-gray-600 mb-1">
              CHA
            </label>
            <input
              id="charisma"
              type="number"
              min="1"
              max="30"
              value={formData.ability_scores.charisma}
              onChange={(e) => handleAbilityScoreChange('charisma', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 font-medium mb-2">Validation Errors:</p>
          <ul className="list-disc list-inside text-red-600 text-sm space-y-1">
            {validationErrors.map((err, idx) => (
              <li key={idx}>
                <strong>{err.field}:</strong> {err.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* General Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-4 pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="flex-1 px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading || !isFormValid}
          className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
              {mode === 'create' ? 'Creating...' : 'Updating...'}
            </>
          ) : (
            mode === 'create' ? 'Create Character' : 'Update Character'
          )}
        </button>
      </div>
    </form>
  )
}
