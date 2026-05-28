/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * Reference-data hooks — read SRD content from the api-site registry.
 *
 * These endpoints are unauthenticated but we still use authFetch for
 * consistency (and so any future auth flip doesn't need rewiring).
 *
 * Reference data is effectively immutable for the life of a deploy, so we
 * crank stale time up to 1h to keep the wizard snappy across step changes.
 */

import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/app/shared/utils/authFetch'

const ONE_HOUR = 60 * 60 * 1000

async function getJson(path) {
  const response = await authFetch(path, { credentials: 'include' })
  if (!response.ok) {
    throw new Error(`GET ${path} failed (${response.status})`)
  }
  return response.json()
}

export function useEditions() {
  return useQuery({
    queryKey: ['editions'],
    queryFn: () => getJson('/api/editions'),
    staleTime: ONE_HOUR,
  })
}

export function useEditionClasses(editionCode) {
  return useQuery({
    queryKey: ['editions', editionCode, 'classes'],
    queryFn: () => getJson(`/api/editions/${editionCode}/classes`),
    staleTime: ONE_HOUR,
    enabled: Boolean(editionCode),
  })
}

export function useEditionSpecies(editionCode) {
  return useQuery({
    queryKey: ['editions', editionCode, 'species'],
    queryFn: () => getJson(`/api/editions/${editionCode}/species`),
    staleTime: ONE_HOUR,
    enabled: Boolean(editionCode),
  })
}

export function useEditionBackgrounds(editionCode) {
  return useQuery({
    queryKey: ['editions', editionCode, 'backgrounds'],
    queryFn: () => getJson(`/api/editions/${editionCode}/backgrounds`),
    staleTime: ONE_HOUR,
    enabled: Boolean(editionCode),
  })
}

export function useEditionFeats(editionCode, category) {
  return useQuery({
    queryKey: ['editions', editionCode, 'feats', category ?? 'all'],
    queryFn: () => {
      const qs = category ? `?category=${encodeURIComponent(category)}` : ''
      return getJson(`/api/editions/${editionCode}/feats${qs}`)
    },
    staleTime: ONE_HOUR,
    enabled: Boolean(editionCode),
  })
}

export function useEditionSkills(editionCode) {
  return useQuery({
    queryKey: ['editions', editionCode, 'skills'],
    queryFn: () => getJson(`/api/editions/${editionCode}/skills`),
    staleTime: ONE_HOUR,
    enabled: Boolean(editionCode),
  })
}
