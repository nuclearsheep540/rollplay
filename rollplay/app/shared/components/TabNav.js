/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { TabGroup, TabList, Tab } from '@headlessui/react'

/**
 * Accessible tab navigation built on Headless UI TabGroup.
 *
 * Provides: role="tablist" / role="tab", arrow key navigation,
 * aria-selected on active tab.
 *
 * @param {Array<{id: string, label: string}>} tabs - Tab definitions
 * @param {string} activeTab - Currently active tab id
 * @param {Function} onTabChange - Called with tab id on selection
 */
export default function TabNav({ tabs, activeTab, onTabChange }) {
  const selectedIndex = tabs.findIndex((t) => t.id === activeTab)

  return (
    <TabGroup
      selectedIndex={selectedIndex === -1 ? 0 : selectedIndex}
      onChange={(index) => onTabChange(tabs[index].id)}
    >
      <TabList className="flex border-b border-border">
        {tabs.map((tab) => (
          <Tab
            key={tab.id}
            className="flex-1 py-4 px-6 text-base font-[family-name:var(--font-metamorphous)] border-b-2 transition-all duration-200 outline-none text-content-secondary border-transparent data-[selected]:text-content-on-dark data-[selected]:border-border-active data-[hover]:text-content-on-dark"
          >
            {tab.label}
          </Tab>
        ))}
      </TabList>
    </TabGroup>
  )
}
