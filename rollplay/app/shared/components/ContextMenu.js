/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import * as RadixContextMenu from '@radix-ui/react-context-menu'

/**
 * Accessible context menu (right-click) built on Radix UI.
 *
 * Provides: right-click trigger, keyboard nav, focus management,
 * sub-menus, escape-to-close, and proper ARIA roles.
 *
 * @param {React.ReactNode} children - The element that triggers the context menu on right-click
 * @param {Array} items - Menu items: { label, onClick?, icon?, variant?, disabled?, active?, subItems? }
 *   subItems follow the same shape for nested sub-menus.
 *   Use active: true on disabled items to show a checkmark instead of a faded style.
 */
export default function ContextMenu({ children, items }) {
  return (
    <RadixContextMenu.Root>
      <RadixContextMenu.Trigger asChild>
        {children}
      </RadixContextMenu.Trigger>

      <RadixContextMenu.Portal>
        <RadixContextMenu.Content
          className="min-w-[180px] rounded-sm border border-border bg-surface-panel shadow-xl py-1 z-50"
        >
          {items.map((item, index) => {
            if (item.separator) {
              return (
                <RadixContextMenu.Separator
                  key={`sep-${index}`}
                  className="h-px my-1 bg-border-subtle"
                />
              )
            }

            if (item.subItems) {
              return (
                <RadixContextMenu.Sub key={item.label}>
                  <RadixContextMenu.SubTrigger
                    className="flex items-center gap-2 px-3 py-2 text-sm text-content-on-dark outline-none data-[highlighted]:bg-interactive-hover cursor-default"
                    disabled={item.disabled}
                  >
                    {item.icon && <span className="w-4 text-center text-content-secondary">{item.icon}</span>}
                    <span className="flex-1">{item.label}</span>
                    <span className="text-content-secondary text-xs ml-4">&#x25B8;</span>
                  </RadixContextMenu.SubTrigger>

                  <RadixContextMenu.Portal>
                    <RadixContextMenu.SubContent
                      className="min-w-[160px] rounded-sm border border-border bg-surface-panel shadow-xl py-1 z-50"
                      sideOffset={4}
                    >
                      {item.subItems.map((subItem) => (
                        <RadixContextMenu.Item
                          key={subItem.label}
                          className={`flex items-center gap-2 px-3 py-2 text-sm outline-none cursor-default ${
                            subItem.active
                              ? 'text-content-secondary pointer-events-none'
                              : 'text-content-on-dark data-[highlighted]:bg-interactive-hover disabled:opacity-50 disabled:pointer-events-none'
                          }`}
                          disabled={subItem.disabled}
                          onSelect={subItem.onClick}
                        >
                          {subItem.icon && <span className="w-4 text-center text-content-secondary">{subItem.icon}</span>}
                          <span className="flex-1">{subItem.label}</span>
                          {subItem.active && <span className="text-xs text-content-secondary ml-2">&#x2713;</span>}
                        </RadixContextMenu.Item>
                      ))}
                    </RadixContextMenu.SubContent>
                  </RadixContextMenu.Portal>
                </RadixContextMenu.Sub>
              )
            }

            const variantClass = item.variant === 'danger'
              ? 'text-feedback-error data-[highlighted]:text-feedback-error'
              : 'text-content-on-dark'

            return (
              <RadixContextMenu.Item
                key={item.label}
                className={`flex items-center gap-2 px-3 py-2 text-sm outline-none data-[highlighted]:bg-interactive-hover cursor-default disabled:opacity-50 disabled:pointer-events-none ${variantClass}`}
                disabled={item.disabled}
                onSelect={item.onClick}
              >
                {item.icon && <span className="w-4 text-center text-content-secondary">{item.icon}</span>}
                <span>{item.label}</span>
              </RadixContextMenu.Item>
            )
          })}
        </RadixContextMenu.Content>
      </RadixContextMenu.Portal>
    </RadixContextMenu.Root>
  )
}
