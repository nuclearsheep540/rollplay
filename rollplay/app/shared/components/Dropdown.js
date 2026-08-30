/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { Fragment } from 'react'
import { Menu, MenuButton, MenuItems, MenuItem, Transition } from '@headlessui/react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

const ALIGN_CLASSES = {
  left: 'left-0',
  right: 'right-0',
}

const VARIANT_CLASSES = {
  default: 'text-content-on-dark',
  danger: 'text-feedback-error',
}

// Two menu skins. 'compact' is the toolbar default; 'panel' matches the
// header's floating cards (SocialPanel) so account chrome reads as one family.
// Conflicting utilities are swapped wholesale rather than appended — Tailwind
// resolves rounded-sm vs rounded-xl by stylesheet order, not string order.
const SIZE_CLASSES = {
  compact: {
    panel: 'mt-1 min-w-[180px] rounded-sm shadow-lg py-1',
    item: 'px-3 py-2 text-sm',
  },
  panel: {
    panel: 'mt-3 min-w-[220px] rounded-xl shadow-2xl py-2',
    item: 'px-4 py-2.5 text-sm',
  },
}

/**
 * Accessible dropdown menu built on Headless UI Menu.
 *
 * Provides: role="menu" / role="menuitem", keyboard navigation,
 * click-outside-to-close, escape-to-close.
 *
 * @param {React.ReactNode} trigger - The button that opens the menu
 * @param {Array<{label: string, onClick: Function, icon?: object, variant?: string, disabled?: boolean}>} items
 * @param {'left'|'right'} align - Menu alignment (default 'right')
 * @param {'compact'|'panel'} size - Menu skin (default 'compact'); 'panel' matches header cards
 */
export default function Dropdown({ trigger, items, align = 'right', size = 'compact' }) {
  const skin = SIZE_CLASSES[size]

  return (
    <Menu as="div" className="relative">
      <MenuButton as={Fragment}>{trigger}</MenuButton>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <MenuItems
          className={`absolute ${ALIGN_CLASSES[align]} z-50 border border-border bg-surface-secondary focus:outline-none ${skin.panel}`}
        >
          {items.map((item, index) => (
            <MenuItem key={index} disabled={item.disabled}>
              <button
                onClick={item.onClick}
                className={`w-full text-left transition-all duration-100 flex items-center gap-2.5 ${skin.item} ${VARIANT_CLASSES[item.variant] || VARIANT_CLASSES.default} data-[focus]:bg-interactive-hover disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {item.icon && (
                  <FontAwesomeIcon icon={item.icon} className="w-4 text-center" />
                )}
                {item.label}
              </button>
            </MenuItem>
          ))}
        </MenuItems>
      </Transition>
    </Menu>
  )
}
