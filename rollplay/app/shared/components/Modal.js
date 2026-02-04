/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { Fragment } from 'react'
import { Dialog, DialogBackdrop, DialogPanel, Transition, TransitionChild } from '@headlessui/react'

const SIZE_CLASSES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
}

/**
 * Accessible modal wrapper built on Headless UI Dialog.
 *
 * Provides: focus trap, escape-to-close, backdrop click-to-close,
 * role="dialog", aria-modal, and transition animations.
 *
 * @param {boolean} open - Controls visibility
 * @param {Function} onClose - Called on escape / backdrop click
 * @param {'sm'|'md'|'lg'|'xl'|'2xl'} size - Max-width preset (default 'md')
 * @param {React.Ref} initialFocus - Element to focus on open
 * @param {string} panelClassName - Override panel classes (replaces default bg/border/text)
 * @param {React.ReactNode} children - Modal content
 */
export default function Modal({ open, onClose, size = 'md', initialFocus, panelClassName, children }) {
  return (
    <Transition show={open} as={Fragment}>
      <Dialog onClose={onClose} initialFocus={initialFocus} className="relative z-50">
        {/* Backdrop */}
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <DialogBackdrop className="fixed inset-0 bg-overlay-dark backdrop-blur-sm" />
        </TransitionChild>

        {/* Panel */}
        <div className="fixed inset-0 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <DialogPanel
              className={panelClassName
                ? `${SIZE_CLASSES[size]} w-full ${panelClassName}`
                : `${SIZE_CLASSES[size]} w-full bg-surface-secondary border border-border text-content-on-dark rounded-sm shadow-2xl`
              }
            >
              {children}
            </DialogPanel>
          </TransitionChild>
        </div>
        </div>
      </Dialog>
    </Transition>
  )
}
