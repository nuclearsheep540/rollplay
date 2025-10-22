/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useRef } from 'react'
import { Combobox as HeadlessCombobox } from '@headlessui/react'

/**
 * Reusable Searchable Combobox Component
 *
 * A searchable dropdown that filters options as the user types.
 * Built with Headless UI for accessibility and Tailwind for styling.
 *
 * @param {Array} options - Array of {value, label} objects
 * @param {string} value - Currently selected value
 * @param {Function} onChange - Callback when selection changes
 * @param {string} placeholder - Placeholder text
 * @param {string} label - Label for the input
 * @param {boolean} required - Whether the field is required
 */
export default function Combobox({
  options = [],
  value,
  onChange,
  placeholder = 'Select an option...',
  label,
  required = false
}) {
  const [query, setQuery] = useState('')
  const buttonRef = useRef(null)

  const handleInputFocus = () => {
    setQuery('')
    // Trigger button click to open dropdown
    if (buttonRef.current) {
      buttonRef.current.click()
    }
  }

  // Filter options based on user input
  const filteredOptions =
    query === ''
      ? options
      : options.filter((option) =>
          option.label.toLowerCase().includes(query.toLowerCase())
        )

  // Find the selected option object
  const selectedOption = options.find(opt => opt.value === value)

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <HeadlessCombobox value={value} onChange={onChange}>
        <div className="relative">
          <HeadlessCombobox.Input
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
            displayValue={() => selectedOption?.label || ''}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={handleInputFocus}
            placeholder={placeholder}
            required={required}
          />

          <HeadlessCombobox.Button ref={buttonRef} className="absolute inset-y-0 right-0 flex items-center pr-2">
            <svg
              className="h-5 w-5 text-gray-400"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M10 3a.75.75 0 01.55.24l3.25 3.5a.75.75 0 11-1.1 1.02L10 4.852 7.3 7.76a.75.75 0 01-1.1-1.02l3.25-3.5A.75.75 0 0110 3zm-3.76 9.2a.75.75 0 011.06.04l2.7 2.908 2.7-2.908a.75.75 0 111.1 1.02l-3.25 3.5a.75.75 0 01-1.1 0l-3.25-3.5a.75.75 0 01.04-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </HeadlessCombobox.Button>

          <HeadlessCombobox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
            {filteredOptions.length === 0 && query !== '' ? (
              <div className="relative cursor-default select-none px-4 py-2 text-gray-700">
                Nothing found.
              </div>
            ) : (
              filteredOptions.map((option) => (
                <HeadlessCombobox.Option
                  key={option.value}
                  value={option.value}
                  className={({ active }) =>
                    `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                      active ? 'bg-indigo-600 text-white' : 'text-gray-900'
                    }`
                  }
                >
                  {({ selected, active }) => (
                    <>
                      <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                        {option.label}
                      </span>
                      {selected && (
                        <span
                          className={`absolute inset-y-0 left-0 flex items-center pl-3 ${
                            active ? 'text-white' : 'text-indigo-600'
                          }`}
                        >
                          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </span>
                      )}
                    </>
                  )}
                </HeadlessCombobox.Option>
              ))
            )}
          </HeadlessCombobox.Options>
        </div>
      </HeadlessCombobox>
    </div>
  )
}
