/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useCallback, useState } from 'react'

import { authFetch } from '@/app/shared/utils/authFetch'

/**
 * The one way a component value changes during a game: HTTP to api-game, which writes
 * the room and broadcasts. No optimistic update — the room is authoritative and the
 * broadcast updates state — only a per-component pending set so the sheet can show it.
 *
 * `onError(message)` is the caller's: the game route sits outside the authenticated
 * group, so there is no toast provider to reach for here.
 */
export function useUpdateGameComponent(roomId, actorUserId, onError = () => {}) {
  const [pendingComponentIds, setPendingComponentIds] = useState(() => new Set())

  const update = useCallback(
    async (userId, value) => {
      const componentId = value.component_id
      setPendingComponentIds((existing) => new Set([...existing, componentId]))
      try {
        const response = await authFetch(
          `/api/game/${roomId}/players/${userId}/components/${componentId}?actor_user_id=${actorUserId}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ value }),
          },
        )
        if (!response.ok) {
          const error = await response.json().catch(() => ({}))
          onError(
            response.status === 403 ? 'Only the player or the GM can change that' : error.detail || 'Could not save that change',
          )
        }
      } catch (failure) {
        onError(failure.message || 'Could not save that change')
      } finally {
        setPendingComponentIds((existing) => {
          const next = new Set(existing)
          next.delete(componentId)
          return next
        })
      }
    },
    [roomId, actorUserId, onError],
  )

  return { update, pendingComponentIds }
}
