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
  identity: { label: 'Name', secret: false, description: null, input: { kind: 'text', max_length: 60 }, required: true, is_title: false },
  hit_points: {
    label: 'Hit points',
    secret: false,
    description: null,
    rules: { representation: 'int', minimum: 1, maximum: 10 },
  },
  attribute: { label: 'Attribute', secret: false, description: null, minimum: 1, maximum: 10, default: null },
}

const DEFAULT_GROUP_LABEL = 'New group'

/** Every entry and every member, one flat list — for id minting, where groups count too. */
function flatEntries(entries) {
  return entries.flatMap((entry) => (entry.type === 'group' ? [entry, ...entry.components] : [entry]))
}

/**
 * Mint an id for a new entry: `<type>_<n>`, one past the highest existing suffix for that
 * type, groups included. The server accepts any unique id; the convention exists so the id
 * never depends on the label, which the GM is free to rename at any time.
 */
function nextEntryId(entries, type) {
  const used = flatEntries(entries)
    .filter((entry) => entry.type === type)
    .map((entry) => Number(String(entry.id).replace(`${type}_`, '')))
    .filter((suffix) => Number.isInteger(suffix))
  const next = used.length ? Math.max(...used) + 1 : 1
  return `${type}_${next}`
}

/**
 * Where an id lives: the container holding it (`null` for the top level, else the group's
 * id), its index there, the entry itself, and whether it is a group or a component.
 * Null when nothing carries the id.
 */
export function locateEntry(entries, id) {
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    if (entry.id === id) {
      return { containerId: null, index, entry, kind: entry.type === 'group' ? 'group' : 'component' }
    }
    if (entry.type === 'group') {
      const memberIndex = entry.components.findIndex((component) => component.id === id)
      if (memberIndex !== -1) {
        return { containerId: entry.id, index: memberIndex, entry: entry.components[memberIndex], kind: 'component' }
      }
    }
  }
  return null
}

/** The entries with one container's list transformed: the top level, or one group's members. */
function withContainer(entries, containerId, transform) {
  if (containerId === null) return transform(entries)
  return entries.map((entry) =>
    entry.id === containerId && entry.type === 'group' ? { ...entry, components: transform(entry.components) } : entry,
  )
}

/** The entries with every component, wherever it sits, passed through `transform`. */
function mapComponents(entries, transform) {
  return entries.map((entry) =>
    entry.type === 'group' ? { ...entry, components: entry.components.map(transform) } : transform(entry),
  )
}

/**
 * The working copy of the character config, held locally until the page is saved.
 *
 * The list is the contract's entries: a bare component, or a group holding an ordered run
 * of them, one level deep. Every mutator here addresses a component by id wherever it
 * sits; only `moveEntry` cares about containers, because a move is the one thing that
 * changes which one a component is in.
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

  // Every mutator reads the list the same way, so the seed fallback is written once.
  const update = useCallback(
    (transform) => setComponents((existing) => transform(existing ?? seed.components)),
    [seed.components],
  )

  /**
   * A new component of `type`, at the end of the top level — the GM drags it into a group.
   * The first identity is the title unless the GM says otherwise: a config with a name
   * that nobody marked would leave every character "Unnamed".
   */
  const addComponent = useCallback(
    (type) =>
      update((list) => {
        const defaults = DEFAULTS_BY_TYPE[type] || { label: type, secret: false }
        const component = { type, id: nextEntryId(list, type), ...structuredClone(defaults) }
        if (type === 'identity') {
          component.is_title = !flatEntries(list).some((entry) => entry.type === 'identity' && entry.is_title)
        }
        return [...list, component]
      }),
    [update],
  )

  const updateComponent = useCallback(
    (id, next) => update((list) => mapComponents(list, (component) => (component.id === id ? next : component))),
    [update],
  )

  /**
   * A copy of one configuration, every parameter included, inserted directly after its
   * original so it lands in the same group. Fresh id; the label gets " copy" so a GM
   * never publishes two identical fields by accident — they rename it, which they would
   * have had to do anyway.
   */
  const duplicateComponent = useCallback(
    (id) =>
      update((list) => {
        const location = locateEntry(list, id)
        if (!location || location.kind !== 'component') return list
        const copy = {
          ...structuredClone(location.entry),
          id: nextEntryId(list, location.entry.type),
          label: `${location.entry.label} copy`.slice(0, 60),
        }
        return withContainer(list, location.containerId, (items) => [
          ...items.slice(0, location.index + 1),
          copy,
          ...items.slice(location.index + 1),
        ])
      }),
    [update],
  )

  const removeComponent = useCallback(
    (id) =>
      update((list) => {
        const location = locateEntry(list, id)
        if (!location || location.kind !== 'component') return list
        return withContainer(list, location.containerId, (items) => items.filter((item) => item.id !== id))
      }),
    [update],
  )

  /**
   * Put the entry with `id` at `slot` in `containerId`'s list — the insert index as the
   * list stands before the entry is lifted out, so a card's "before me" is its own index
   * and "after me" is one more, whichever container it came from. A group can only be put
   * on the top level: one level deep is the contract's rule, and this is where it holds.
   */
  const moveEntry = useCallback(
    (id, { containerId, slot }) =>
      update((list) => {
        const location = locateEntry(list, id)
        if (!location) return list
        if (containerId !== null) {
          const container = list.find((entry) => entry.id === containerId && entry.type === 'group')
          if (!container || location.kind === 'group') return list
        }
        const insertAt = location.containerId === containerId && location.index < slot ? slot - 1 : slot
        const lifted = withContainer(list, location.containerId, (items) =>
          items.filter((_, index) => index !== location.index),
        )
        return withContainer(lifted, containerId, (items) => [
          ...items.slice(0, insertAt),
          location.entry,
          ...items.slice(insertAt),
        ])
      }),
    [update],
  )

  /** An empty, named section at the end of the top level, for the GM to fill by dragging. */
  const addGroup = useCallback(
    () =>
      update((list) => [
        ...list,
        { type: 'group', id: nextEntryId(list, 'group'), label: DEFAULT_GROUP_LABEL, components: [] },
      ]),
    [update],
  )

  const updateGroup = useCallback(
    (id, patch) =>
      update((list) => list.map((entry) => (entry.id === id && entry.type === 'group' ? { ...entry, ...patch } : entry))),
    [update],
  )

  /**
   * Dissolve a group: its members step out onto the top level where it stood, in their
   * order. Never deletes a component — a section is a way of arranging them, and taking
   * the arrangement away must not take the work away with it.
   */
  const removeGroup = useCallback(
    (id) => update((list) => list.flatMap((entry) => (entry.id === id && entry.type === 'group' ? entry.components : [entry]))),
    [update],
  )

  const locate = useCallback((id) => locateEntry(current, id), [current])

  return {
    components: current,
    locate,
    addComponent,
    updateComponent,
    duplicateComponent,
    removeComponent,
    moveEntry,
    addGroup,
    updateGroup,
    removeGroup,
    // The version the server will force anyway; sent so the payload is a whole document.
    asConfig: () => ({ version: seed.version ?? 1, components: current }),
  }
}
