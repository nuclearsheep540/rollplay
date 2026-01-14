/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState } from 'react'
import { Combobox as HeadlessCombobox } from '@headlessui/react'
import { THEME } from '@/app/styles/colorTheme'

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
 * @param {string} helperText - Optional helper text below label
 * @param {boolean} required - Whether the field is required
 */
export default function Combobox({
  options = [],
  value,
  onChange,
  placeholder = 'Select an option...',
  label,
  helperText,
  required = false
}) {
  const [query, setQuery] = useState('')

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
        <label className="block text-sm font-medium mb-1" style={{ color: THEME.textSecondary }}>
          {label}
          {required && <span className="ml-1" style={{ color: '#f87171' }}>*</span>}
        </label>
      )}
      {helperText && (
        <p className="text-xs mb-2" style={{ color: THEME.textSecondary }}>{helperText}</p>
      )}

      <HeadlessCombobox value={value} onChange={onChange}>
        <div className="relative">
          <HeadlessCombobox.Button as="div" className="relative cursor-pointer">
            <HeadlessCombobox.Input
              className="w-full px-3 py-2 pr-10 border rounded-sm focus:outline-none focus:ring-1 sm:text-sm cursor-pointer"
              style={{
                backgroundColor: THEME.bgSecondary,
                borderColor: THEME.borderDefault,
                color: THEME.textOnDark
              }}
              displayValue={() => selectedOption?.label || ''}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={placeholder}
            />
            <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
              <svg
                className="h-5 w-5"
                style={{ color: THEME.textSecondary }}
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
            </span>
          </HeadlessCombobox.Button>

          <HeadlessCombobox.Options
            className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-sm py-1 text-base shadow-lg ring-1 ring-opacity-5 focus:outline-none sm:text-sm"
            style={{
              backgroundColor: THEME.bgSecondary,
              ringColor: THEME.borderDefault
            }}
          >
            {filteredOptions.length === 0 && query !== '' ? (
              <div className="relative cursor-default select-none px-4 py-2" style={{ color: THEME.textSecondary }}>
                Nothing found.
              </div>
            ) : (
              filteredOptions.map((option) => (
                <HeadlessCombobox.Option
                  key={option.value}
                  value={option.value}
                  className="relative cursor-pointer select-none py-2 pl-10 pr-4 data-[focus]:bg-[#37322F]"
                  style={{ color: THEME.textOnDark }}
                >
                  {({ selected }) => (
                    <>
                      <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                        {option.label}
                      </span>
                      {selected && (
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3" style={{ color: THEME.textAccent }}>
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
