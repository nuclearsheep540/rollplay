/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { authFetch } from '@/app/shared/utils/authFetch'

/** The campaign's character config: the host's draft, its published versions, the diff. */
export function useCharacterConfigState(campaignId) {
  return useQuery({
    queryKey: ['campaigns', campaignId, 'character-config'],
    enabled: !!campaignId,
    queryFn: async () => {
      const response = await authFetch(`/api/campaigns/${campaignId}/character-config`, {
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Could not load the character config')
      return response.json()
    },
  })
}

export function useSaveCharacterConfigDraft(campaignId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (config) => {
      const response = await authFetch(`/api/campaigns/${campaignId}/character-config/draft`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(config),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.detail || 'Could not save the character config')
      }
      return response.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId, 'character-config'] }),
  })
}

export function usePublishCharacterConfig(campaignId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const response = await authFetch(`/api/campaigns/${campaignId}/character-config/publish`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.detail || 'Could not publish')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', campaignId, 'character-config'] })
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })
}

/** The platform's component vocabulary. Changes only on deploy, so it is cached for an hour. */
export function useComponentCatalogue() {
  return useQuery({
    queryKey: ['components'],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const response = await authFetch('/api/components', { credentials: 'include' })
      if (!response.ok) throw new Error('Could not load the component catalogue')
      return response.json()
    },
  })
}

const DEFAULTS_BY_TYPE = {
  name: { label: 'Name', secret: false, max_length: 60, required: true },
  hit_points: {
    label: 'Hit points',
    secret: false,
    rules: { representation: 'int', minimum: 0, maximum: 10, starting: 10 },
  },
  attribute: { label: 'Attribute', secret: false, minimum: 1, maximum: 10, default: null },
}

/**
 * Mint an id for a new configuration: `<type>_<n>`, one past the highest existing suffix
 * for that type. The server accepts any unique id; the convention exists so the id never
 * depends on the label, which the GM is free to rename at any time.
 */
function nextComponentId(components, type) {
  const used = components
    .filter((component) => component.type === type)
    .map((component) => Number(String(component.id).replace(`${type}_`, '')))
    .filter((suffix) => Number.isInteger(suffix))
  const next = used.length ? Math.max(...used) + 1 : 1
  return `${type}_${next}`
}

/**
 * The working copy of the character config, held locally until the page is saved.
 *
 * Seeded from the draft if there is one, else the latest published version, else empty —
 * so re-opening the builder after a publish shows what was published rather than a blank
 * page the GM might save over the top of.
 */
export function useCharacterConfigDraft(state) {
  const [components, setComponents] = useState(null)

  const seed = useMemo(() => state?.draft ?? state?.latest ?? { version: 1, components: [] }, [state])

  useEffect(() => {
    if (state && components === null) setComponents(seed.components)
  }, [state, seed, components])

  const current = components ?? seed.components
  // Deliberately no dirty flag here: whether there is anything to save is the autosave
  // hook's pending timer, not a second opinion from this one.

  const addComponent = useCallback(
    (type) => {
      setComponents((existing) => {
        const list = existing ?? seed.components
        const defaults = DEFAULTS_BY_TYPE[type] || { label: type, secret: false }
        return [...list, { type, id: nextComponentId(list, type), ...structuredClone(defaults) }]
      })
    },
    [seed.components],
  )

  const updateComponent = useCallback(
    (id, next) => setComponents((existing) => (existing ?? seed.components).map((component) => (component.id === id ? next : component))),
    [seed.components],
  )

  const removeComponent = useCallback(
    (id) => setComponents((existing) => (existing ?? seed.components).filter((component) => component.id !== id)),
    [seed.components],
  )

  const moveComponent = useCallback(
    (fromIndex, toIndex) =>
      setComponents((existing) => {
        const list = [...(existing ?? seed.components)]
        const [moved] = list.splice(fromIndex, 1)
        list.splice(toIndex, 0, moved)
        return list
      }),
    [seed.components],
  )

  return {
    components: current,
    addComponent,
    updateComponent,
    removeComponent,
    moveComponent,
    // The version the server will force anyway; sent so the payload is a whole document.
    asConfig: () => ({ version: seed.version ?? 1, components: current }),
  }
}
