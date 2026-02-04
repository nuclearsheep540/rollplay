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

/**
 * Accessible dropdown menu built on Headless UI Menu.
 *
 * Provides: role="menu" / role="menuitem", keyboard navigation,
 * click-outside-to-close, escape-to-close.
 *
 * @param {React.ReactNode} trigger - The button that opens the menu
 * @param {Array<{label: string, onClick: Function, icon?: object, variant?: string, disabled?: boolean}>} items
 * @param {'left'|'right'} align - Menu alignment (default 'right')
 */
export default function Dropdown({ trigger, items, align = 'right' }) {
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
          className={`absolute ${ALIGN_CLASSES[align]} z-50 mt-1 min-w-[180px] rounded-sm border border-border bg-surface-secondary shadow-lg py-1 focus:outline-none`}
        >
          {items.map((item, index) => (
            <MenuItem key={index} disabled={item.disabled}>
              <button
                onClick={item.onClick}
                className={`w-full text-left px-3 py-2 text-sm transition-all duration-100 flex items-center gap-2 ${VARIANT_CLASSES[item.variant] || VARIANT_CLASSES.default} data-[focus]:bg-interactive-hover disabled:opacity-40 disabled:cursor-not-allowed`}
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
