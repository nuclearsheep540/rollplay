/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useCallback, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/**
 * Which section and sub-tab the builder is showing, kept in the URL.
 *
 * In the URL so a GM can link someone straight to the Character section and a refresh
 * lands where they were — the same reason the workshop keeps its tool there.
 */

export const SECTIONS = [
  { key: 'overview', label: 'Overview', subTabs: [{ key: 'story', label: 'Story' }, { key: 'setup', label: 'Setup' }] },
  // How the campaign is played: the system, by name for now. Its mechanics come later;
  // characters are the part of it configured under Character.
  { key: 'system', label: 'System', subTabs: [{ key: 'rules', label: 'Rules' }] },
  { key: 'world', label: 'World', subTabs: [{ key: 'tables', label: 'Tables' }, { key: 'reference', label: 'Reference' }] },
  {
    key: 'character',
    label: 'Character',
    subTabs: [
      { key: 'components', label: 'Components' },
      { key: 'preview', label: 'Preview' },
      { key: 'versions', label: 'Versions' },
    ],
  },
]

export function useBuilderNav() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const sectionKey = searchParams.get('section') || 'overview'
  const section = useMemo(
    () => SECTIONS.find((entry) => entry.key === sectionKey) || SECTIONS[0],
    [sectionKey],
  )
  const tabKey = searchParams.get('tab') || section.subTabs[0].key
  const tab = section.subTabs.find((entry) => entry.key === tabKey) || section.subTabs[0]

  const go = useCallback(
    (nextSection, nextTab) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('section', nextSection)
      // Changing section drops the old section's tab rather than carrying a name that
      // means nothing here — "Setup" is not a World sub-tab.
      if (nextTab) params.set('tab', nextTab)
      else params.delete('tab')
      // Pushed, not replaced: every section or tab a GM opens is a place they can go back
      // to. (The one replace in the builder is CampaignBuilder's, turning /campaign/new
      // into /campaign/{id} after the first save — Back must never land on "new" again.)
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  return {
    sections: SECTIONS,
    section,
    sectionKey: section.key,
    tabKey: tab.key,
    setSection: (key) => go(key),
    setTab: (key) => go(section.key, key),
  }
}
