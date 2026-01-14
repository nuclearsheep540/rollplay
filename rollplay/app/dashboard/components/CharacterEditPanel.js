/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSave, faTimes, faUndo } from '@fortawesome/free-solid-svg-icons'
import { COLORS, THEME } from '@/app/styles/colorTheme'
import { Button } from './shared/Button'

// Import form sub-components (these will need theme updates later)
import MultiClassSelector from '../../character/components/MultiClassSelector'
import AbilityScoreBuilder from '../../character/components/AbilityScoreBuilder'
import OriginBonusAllocator from '../../character/components/OriginBonusAllocator'
import NumericStepper from '../../character/components/NumericStepper'
import { CHARACTER_RACES, CHARACTER_BACKGROUNDS } from '../../shared/constants/characterEnums'

/**
 * CharacterEditPanel - Inline character editing within the dashboard drawer
 *
 * Features:
 * - Reuses existing form sub-components
 * - Themed styling matching dashboard design
 * - Scrollable panel layout for drawer context
 * - Dirty state tracking for unsaved changes
 */
export default function CharacterEditPanel({
  character,
  onSave,
  onCancel,
  isCloneMode = false
}) {
  // Initialize form data from character prop
  const [formData, setFormData] = useState(() => characterToFormData(character))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [validationErrors, setValidationErrors] = useState([])
  const [isDirty, setIsDirty] = useState(false)

  // Track original data for dirty detection
  const [originalData, setOriginalData] = useState(() => JSON.stringify(characterToFormData(character)))

  // Update form when character changes (e.g., switching to different character)
  useEffect(() => {
    const newFormData = characterToFormData(character)
    setFormData(newFormData)
    setOriginalData(JSON.stringify(newFormData))
    setIsDirty(false)
    setError(null)
    setValidationErrors([])
  }, [character?.id])

  // Track dirty state
  useEffect(() => {
    const currentData = JSON.stringify(formData)
    setIsDirty(currentData !== originalData)
  }, [formData, originalData])

  const handleInputChange = (field, value) => {
    setFormData(prev => {
      const newData = { ...prev, [field]: value }

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

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setValidationErrors([])

    try {
      // Prepare data for API
      const apiData = {
        character_name: formData.name.trim(),
        character_race: formData.character_race,
        background: formData.background || null,
        character_classes: formData.character_classes,
        level: formData.level,
        ability_scores: formData.ability_scores,
        origin_ability_bonuses: formData.origin_ability_bonuses,
        hp_max: formData.hp_max,
        hp_current: formData.hp_current,
        ac: formData.ac
      }

      // Different endpoint for clone vs edit
      const url = isCloneMode
        ? '/api/characters/'
        : `/api/characters/${character.id}`

      const method = isCloneMode ? 'POST' : 'PUT'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(apiData)
      })

      if (response.ok) {
        const updatedCharacter = await response.json()
        onSave(updatedCharacter)
      } else {
        const errorData = await response.json()

        if (errorData.detail && Array.isArray(errorData.detail)) {
          // Validation errors from backend
          setValidationErrors(errorData.detail.map(err => ({
            field: err.loc?.join('.') || 'unknown',
            message: err.msg || 'Validation error'
          })))
        } else {
          setError(errorData.detail || 'Failed to save character')
        }
      }
    } catch (err) {
      console.error('Error saving character:', err)
      setError('Failed to save character. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    if (isDirty) {
      // Could show confirmation dialog here - for now just cancel
      // The parent can implement confirmation if needed
    }
    onCancel()
  }

  const handleReset = () => {
    const resetData = characterToFormData(character)
    setFormData(resetData)
    setIsDirty(false)
  }

  const isFormValid = formData.name.trim() &&
                      formData.character_race &&
                      formData.character_classes.length > 0 &&
                      formData.character_classes.every(c => c.character_class && c.level >= 1)

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden"
      style={{
        backgroundColor: THEME.bgPanel,
        borderLeft: `2px solid ${THEME.borderSubtle}`
      }}
    >
      {/* Header - Fixed */}
      <div
        className="flex-shrink-0 flex items-center justify-between p-6 border-b"
        style={{ borderBottomColor: THEME.borderSubtle }}
      >
        <h3
          className="text-2xl font-semibold font-[family-name:var(--font-metamorphous)]"
          style={{ color: THEME.textOnDark }}
        >
          {isCloneMode ? 'Clone Character' : 'Edit Character'}
        </h3>
        <div className="flex items-center gap-3">
          {isDirty && (
            <span className="text-sm px-2 py-1 rounded-sm" style={{ color: COLORS.silver, backgroundColor: `${COLORS.graphite}60` }}>
              Unsaved changes
            </span>
          )}
          <button
            onClick={handleCancel}
            className="px-3 py-1 rounded-sm border hover:opacity-80 transition-opacity"
            style={{
              color: THEME.textSecondary,
              borderColor: THEME.borderSubtle,
              backgroundColor: THEME.bgSecondary
            }}
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Form Content - Scrollable */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-6 max-w-2xl">
          {/* Character Name */}
          <div>
            <label
              htmlFor="edit-name"
              className="block text-sm font-medium mb-2"
              style={{ color: THEME.textSecondary }}
            >
              Character Name <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              id="edit-name"
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              className="w-full px-4 py-2 rounded-sm border focus:outline-none focus:ring-2"
              style={{
                backgroundColor: THEME.bgSecondary,
                borderColor: THEME.borderSubtle,
                color: THEME.textOnDark,
                '--tw-ring-color': COLORS.silver
              }}
              placeholder="Enter character name"
              required
            />
          </div>

          {/* Character Race */}
          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: THEME.textSecondary }}
            >
              Character Race <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <select
              value={formData.character_race}
              onChange={(e) => handleInputChange('character_race', e.target.value)}
              className="w-full px-4 py-2 rounded-sm border focus:outline-none focus:ring-2"
              style={{
                backgroundColor: THEME.bgSecondary,
                borderColor: THEME.borderSubtle,
                color: THEME.textOnDark,
                '--tw-ring-color': COLORS.silver
              }}
            >
              <option value="">Select a race...</option>
              {CHARACTER_RACES.map(race => (
                <option key={race.value} value={race.value}>{race.label}</option>
              ))}
            </select>
          </div>

          {/* Character Background */}
          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: THEME.textSecondary }}
            >
              Character Background
            </label>
            <select
              value={formData.background}
              onChange={(e) => handleInputChange('background', e.target.value)}
              className="w-full px-4 py-2 rounded-sm border focus:outline-none focus:ring-2"
              style={{
                backgroundColor: THEME.bgSecondary,
                borderColor: THEME.borderSubtle,
                color: THEME.textOnDark,
                '--tw-ring-color': COLORS.silver
              }}
            >
              <option value="">Select a background...</option>
              {CHARACTER_BACKGROUNDS.map(bg => (
                <option key={bg.value} value={bg.value}>{bg.label}</option>
              ))}
            </select>
            <p className="text-xs mt-1" style={{ color: THEME.textSecondary }}>
              D&D 2024: Choose your character&apos;s background
            </p>
          </div>

          {/* Origin Ability Bonuses (D&D 2024) */}
          {formData.background && (
            <OriginBonusAllocator
              selectedBackground={formData.background}
              baseScores={formData.ability_scores}
              displayScores={getDisplayScores()}
              currentBonuses={formData.origin_ability_bonuses}
              onChange={handleOriginBonusesChange}
              disabled={saving}
            />
          )}

          {/* Character Classes */}
          <MultiClassSelector
            characterClasses={formData.character_classes}
            totalLevel={formData.level}
            onChange={handleClassesChange}
            disabled={saving}
          />

          {/* Combat Stats */}
          <div>
            <label
              className="block text-sm font-medium mb-3"
              style={{ color: THEME.textSecondary }}
            >
              Combat Stats
            </label>
            <div className="flex items-center justify-start gap-8 flex-wrap">
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
            disabled={saving}
          />

          {/* Validation Errors */}
          {validationErrors.length > 0 && (
            <div
              className="rounded-sm border p-4"
              style={{ backgroundColor: '#991b1b20', borderColor: '#dc2626' }}
            >
              <p className="font-medium mb-2" style={{ color: '#fca5a5' }}>Validation Errors:</p>
              <ul className="list-disc list-inside text-sm space-y-1" style={{ color: '#fca5a5' }}>
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
              className="rounded-sm border p-4"
              style={{ backgroundColor: '#991b1b20', borderColor: '#dc2626' }}
            >
              <p style={{ color: '#fca5a5' }}>{error}</p>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons - Fixed Footer */}
      <div
        className="flex-shrink-0 p-6 border-t"
        style={{ borderTopColor: THEME.borderSubtle, backgroundColor: THEME.bgPanel }}
      >
        <div className="flex gap-3 max-w-2xl">
          <Button
            variant="ghost"
            onClick={handleReset}
            disabled={saving || !isDirty}
            className="flex items-center"
          >
            <FontAwesomeIcon icon={faUndo} className="mr-2" />
            Reset
          </Button>
          <div className="flex-1" />
          <Button
            variant="ghost"
            onClick={handleCancel}
            disabled={saving}
          >
            <FontAwesomeIcon icon={faTimes} className="mr-2" />
            Cancel
          </Button>
          <Button
            variant="success"
            onClick={handleSave}
            disabled={saving || !isFormValid}
            className="flex items-center"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Saving...
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={faSave} className="mr-2" />
                {isCloneMode ? 'Create Clone' : 'Save Changes'}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * Convert character API response to form data structure
 */
function characterToFormData(character) {
  if (!character) {
    return {
      name: '',
      character_race: '',
      background: '',
      character_classes: [],
      level: 0,
      ability_scores: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10
      },
      origin_ability_bonuses: {},
      hp_max: 10,
      hp_current: 10,
      ac: 10
    }
  }

  return {
    name: character.character_name || '',
    character_race: character.character_race || '',
    background: character.background || '',
    character_classes: character.character_classes || [],
    level: character.level || 0,
    ability_scores: character.ability_scores || {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10
    },
    origin_ability_bonuses: character.origin_ability_bonuses || {},
    hp_max: character.hp_max || 10,
    hp_current: character.hp_current || 10,
    ac: character.ac || 10
  }
}
