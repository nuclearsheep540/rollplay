/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState } from 'react'
import Combobox from '../../shared/components/Combobox'
import NumericStepper from './NumericStepper'
import { CHARACTER_CLASSES } from '../../shared/constants/characterEnums'

/**
 * MultiClassSelector - Manage character classes for multi-class support
 *
 * Features:
 * - Add/remove classes (1-3 classes)
 * - Individual level management per class
 * - Automatic total level calculation
 * - D&D 5e validation (level 3+ required for multi-classing)
 */
export default function MultiClassSelector({
  characterClasses = [],  // Array of {character_class: string, level: number}
  totalLevel,
  onChange,
  disabled = false
}) {
  const [addingClass, setAddingClass] = useState(false)
  const [newClassName, setNewClassName] = useState('')
  const [newClassLevel, setNewClassLevel] = useState(1)

  // Calculate which classes are already selected
  const selectedClassNames = characterClasses.map(c => c.character_class)
  const availableClasses = CHARACTER_CLASSES.filter(
    cls => !selectedClassNames.includes(cls.value)
  )

  // Calculate total from all class levels
  const calculatedTotal = characterClasses.reduce((sum, c) => sum + c.level, 0)

  const handleAddClass = () => {
    if (!newClassName) return

    const updatedClasses = [
      ...characterClasses,
      { character_class: newClassName, level: newClassLevel }
    ]

    const newTotal = updatedClasses.reduce((sum, c) => sum + c.level, 0)

    onChange(updatedClasses, newTotal)
    setAddingClass(false)
    setNewClassName('')
    setNewClassLevel(1)
  }

  const handleRemoveClass = (index) => {
    if (characterClasses.length <= 1) return // Must have at least 1 class

    const updatedClasses = characterClasses.filter((_, i) => i !== index)
    const newTotal = updatedClasses.reduce((sum, c) => sum + c.level, 0)

    onChange(updatedClasses, newTotal)
  }

  const handleUpdateClassLevel = (index, newLevel) => {
    const updatedClasses = characterClasses.map((cls, i) =>
      i === index ? { ...cls, level: newLevel } : cls
    )

    const newTotal = updatedClasses.reduce((sum, c) => sum + c.level, 0)

    onChange(updatedClasses, newTotal)
  }

  const canAddClass = characterClasses.length < 3 && !addingClass
  const canRemoveClass = characterClasses.length > 1

  // Calculate max level for each class based on remaining total
  const getMaxLevelForClass = (currentLevel) => {
    const otherClassesTotal = calculatedTotal - currentLevel
    const maxPossible = 20 - otherClassesTotal
    return Math.min(20, Math.max(1, maxPossible))
  }

  return (
    <div className="space-y-4">
      {/* Header with total level display */}
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">
          Character Classes
        </label>
        <div className="text-sm font-semibold text-indigo-600">
          Total Level: {calculatedTotal}
        </div>
      </div>

      {/* Existing classes list */}
      <div className="space-y-3">
        {characterClasses.length === 0 && (
          <div className="text-sm text-gray-500 italic text-center py-4">
            Click "Add Class" below to get started
          </div>
        )}
        {characterClasses.map((classInfo, index) => (
          <div key={index} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            {/* Class name display */}
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-600 mb-1">Class</div>
              <div className="text-lg font-semibold text-gray-800">
                {classInfo.character_class}
              </div>
            </div>

            {/* Class level stepper */}
            <div className="flex-shrink-0">
              <NumericStepper
                label="Level"
                value={classInfo.level}
                onChange={(val) => handleUpdateClassLevel(index, val)}
                min={1}
                max={getMaxLevelForClass(classInfo.level)}
                disabled={disabled}
                showModifier={false}
              />
            </div>

            {/* Remove button */}
            {canRemoveClass && !disabled && (
              <button
                type="button"
                onClick={() => handleRemoveClass(index)}
                className="flex-shrink-0 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                aria-label="Remove class"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add new class section */}
      {addingClass ? (
        <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-200 space-y-4">
          <div className="text-sm font-medium text-indigo-900 mb-2">Add New Class</div>

          <div className="grid grid-cols-2 gap-4">
            {/* Class selection */}
            <div>
              <Combobox
                label="Class"
                options={availableClasses}
                value={newClassName}
                onChange={setNewClassName}
                placeholder="Select a class..."
              />
            </div>

            {/* Level selection */}
            <div className="flex items-end">
              <NumericStepper
                label="Starting Level"
                value={newClassLevel}
                onChange={setNewClassLevel}
                min={1}
                max={Math.min(20, 20 - calculatedTotal)}
                showModifier={false}
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAddClass}
              disabled={!newClassName}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Class
            </button>
            <button
              type="button"
              onClick={() => {
                setAddingClass(false)
                setNewClassName('')
                setNewClassLevel(1)
              }}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        /* Add class button */
        canAddClass && !disabled && (
          <button
            type="button"
            onClick={() => setAddingClass(true)}
            className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-indigo-400 hover:text-indigo-600 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Class
          </button>
        )
      )}

      {/* Multi-class info/warning */}
      {characterClasses.length === 1 && calculatedTotal < 3 && (
        <div className="text-xs text-gray-500 italic">
          💡 Multi-classing requires level 3+ in D&D 5e
        </div>
      )}

      {/* Level validation warning */}
      {calculatedTotal !== totalLevel && (
        <div className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-200">
          ⚠️ Warning: Class levels ({calculatedTotal}) don't match total level field ({totalLevel})
        </div>
      )}
    </div>
  )
}
