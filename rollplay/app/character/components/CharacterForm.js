/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect } from 'react'
import Combobox from '../../shared/components/Combobox'
import NumericStepper from './NumericStepper'
import MultiClassSelector from './MultiClassSelector'
import AbilityScoreBuilder from './AbilityScoreBuilder'
import OriginBonusAllocator from './OriginBonusAllocator'
import { CHARACTER_RACES, CHARACTER_CLASSES, CHARACTER_BACKGROUNDS } from '../../shared/constants/characterEnums'
import { THEME } from '@/app/styles/colorTheme'

export default function CharacterForm({
  mode = 'create',
  initialData = null,
  onSubmit,
  onCancel,
  onFormChange,
  loading = false,
  error = null,
  validationErrors = []
}) {
  const [formData, setFormData] = useState({
    name: initialData?.character_name || '',
    character_race: initialData?.character_race || '',
    background: initialData?.background || '',
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
    origin_ability_bonuses: initialData?.origin_ability_bonuses || {},
    hp_max: initialData?.hp_max || 10,
    hp_current: initialData?.hp_current || 10,
    ac: initialData?.ac || 10,
  })

  // Update form when initialData changes (for edit mode when API data loads, or clone mode)
  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.character_name || '',
        character_race: initialData.character_race || '',
        background: initialData.background || '',
        character_classes: initialData.character_classes || [],
        level: initialData.level || 0,
        ability_scores: initialData.ability_scores || {
          strength: 10,
          dexterity: 10,
          constitution: 10,
          intelligence: 10,
          wisdom: 10,
          charisma: 10
        },
        origin_ability_bonuses: initialData.origin_ability_bonuses || {},
        hp_max: initialData.hp_max || 10,
        hp_current: initialData.hp_current || 10,
        ac: initialData.ac || 10,
      })
    }
  }, [initialData])

  // Notify parent of form changes for live preview
  useEffect(() => {
    onFormChange?.(formData)
  }, [formData, onFormChange])

  const handleInputChange = (field, value) => {
    setFormData(prev => {
      const newData = {
        ...prev,
        [field]: value
      }

      // If background changes, clear origin bonuses
      if (field === 'background' && prev.background !== value) {
        newData.origin_ability_bonuses = {}
      }

      return newData
    })
  }

  const handleAbilityScoresChange = (newScores) => {
    setFormData(prev => ({
      ...prev,
      ability_scores: newScores
    }))
  }

  // Calculate display scores (base + origin bonuses)
  const getDisplayScores = () => {
    const display = { ...formData.ability_scores }
    Object.entries(formData.origin_ability_bonuses).forEach(([ability, bonus]) => {
      display[ability] = (display[ability] || 10) + bonus
    })
    return display
  }

  // Calculate base scores from display scores (subtract origin bonuses)
  const getBaseScoresFromDisplay = (displayScores) => {
    const base = { ...displayScores }
    Object.entries(formData.origin_ability_bonuses).forEach(([ability, bonus]) => {
      base[ability] = (base[ability] || 10) - bonus
    })
    return base
  }

  const handleDisplayScoresChange = (newDisplayScores) => {
    const baseScores = getBaseScoresFromDisplay(newDisplayScores)
    setFormData(prev => ({
      ...prev,
      ability_scores: baseScores
    }))
  }

  const handleClassesChange = (classes, totalLevel) => {
    setFormData(prev => ({
      ...prev,
      character_classes: classes,
      level: totalLevel
    }))
  }

  const handleOriginBonusesChange = (bonuses) => {
    setFormData(prev => ({
      ...prev,
      origin_ability_bonuses: bonuses
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
        <label
          htmlFor="name"
          className="block text-sm font-medium mb-2"
          style={{ color: THEME.textSecondary }}
        >
          Character Name <span style={{ color: '#f87171' }}>*</span>
        </label>
        <input
          id="name"
          type="text"
          value={formData.name}
          onChange={(e) => handleInputChange('name', e.target.value)}
          className="w-full px-4 py-2 border rounded-sm focus:ring-1 focus:outline-none"
          style={{
            backgroundColor: THEME.bgSecondary,
            borderColor: THEME.borderDefault,
            color: THEME.textOnDark
          }}
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

      {/* Character Background (D&D 2024) */}
      <Combobox
        label="Character Background"
        options={CHARACTER_BACKGROUNDS}
        value={formData.background}
        onChange={(value) => handleInputChange('background', value)}
        placeholder="Select a background..."
        helperText="D&D 2024: Choose your character's background"
      />

      {/* Origin Ability Bonuses (D&D 2024) - Immediately after background */}
      {formData.background && (
        <OriginBonusAllocator
          selectedBackground={formData.background}
          baseScores={formData.ability_scores}
          displayScores={getDisplayScores()}
          currentBonuses={formData.origin_ability_bonuses}
          onChange={handleOriginBonusesChange}
          disabled={loading}
        />
      )}

      {/* Character Classes (Multi-class support) */}
      <MultiClassSelector
        characterClasses={formData.character_classes}
        totalLevel={formData.level}
        onChange={handleClassesChange}
        disabled={loading}
      />

      {/* Combat Stats: AC, Current HP, Max HP */}
      <div>
        <label className="block text-sm font-medium mb-3" style={{ color: THEME.textSecondary }}>
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
        scores={getDisplayScores()}
        onChange={handleDisplayScoresChange}
        originBonuses={formData.origin_ability_bonuses}
        disabled={loading}
      />

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div
          className="rounded-sm p-4 border"
          style={{ backgroundColor: '#991b1b20', borderColor: '#dc2626' }}
        >
          <p className="font-medium mb-2" style={{ color: '#fca5a5' }}>Validation Errors:</p>
          <ul className="list-disc list-inside text-sm space-y-1" style={{ color: '#f87171' }}>
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
        <div
          className="rounded-sm p-4 border"
          style={{ backgroundColor: '#991b1b20', borderColor: '#dc2626' }}
        >
          <p style={{ color: '#fca5a5' }}>{error}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-4 pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="flex-1 px-6 py-3 rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed border"
          style={{
            backgroundColor: THEME.bgSecondary,
            borderColor: THEME.borderDefault,
            color: THEME.textOnDark
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading || !isFormValid}
          className="flex-1 px-6 py-3 rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center border"
          style={{
            backgroundColor: '#166534',
            borderColor: '#22c55e',
            color: THEME.textOnDark
          }}
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
