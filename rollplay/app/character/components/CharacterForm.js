/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState } from 'react'
import Combobox from '../../shared/components/Combobox'
import NumericStepper from './NumericStepper'
import MultiClassSelector from './MultiClassSelector'
import AbilityScoreBuilder from './AbilityScoreBuilder'
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
    character_classes: initialData?.character_classes || [],  // Start empty - user adds first class
    level: initialData?.level || 0,
    ability_scores: initialData?.ability_scores || {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10
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

  const handleAbilityScoresChange = (newScores) => {
    setFormData(prev => ({
      ...prev,
      ability_scores: newScores
    }))
  }

  const handleClassesChange = (classes, totalLevel) => {
    setFormData(prev => ({
      ...prev,
      character_classes: classes,
      level: totalLevel
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    await onSubmit(formData)
  }

  const isFormValid = formData.name.trim() &&
                      formData.character_race &&
                      formData.character_classes.length > 0 &&
                      formData.character_classes.every(c => c.character_class && c.level >= 1)

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

      {/* Character Classes (Multi-class support) */}
      <MultiClassSelector
        characterClasses={formData.character_classes}
        totalLevel={formData.level}
        onChange={handleClassesChange}
        disabled={loading}
      />

      {/* Combat Stats: AC, Current HP, Max HP */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Combat Stats
        </label>
        <div className="flex items-center justify-center gap-8">
          <NumericStepper
            label="Armor Class"
            value={formData.ac}
            onChange={(val) => handleInputChange('ac', val)}
            min={1}
            max={50}
            showModifier={false}
          />
          <NumericStepper
            label="Current HP"
            value={formData.hp_current}
            onChange={(val) => handleInputChange('hp_current', val)}
            min={-100}
            max={999}
            showModifier={false}
          />
          <NumericStepper
            label="Max HP"
            value={formData.hp_max}
            onChange={(val) => handleInputChange('hp_max', val)}
            min={1}
            max={999}
            showModifier={false}
          />
        </div>
      </div>

      {/* Ability Scores */}
      <AbilityScoreBuilder
        scores={formData.ability_scores}
        onChange={handleAbilityScoresChange}
        disabled={loading}
      />

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
