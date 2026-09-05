/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useCallback, useState } from 'react';

import { authFetch } from '@/app/shared/utils/authFetch';

/**
 * Finish the running session from inside the game.
 *
 * Calls the same api-site endpoint the dashboard's Finish Session uses, so
 * the whole end-of-session pipeline is the existing one: the hot state is
 * pulled out of MongoDB and written to PostgreSQL, the session is marked
 * FINISHED, and only then does a background task delete the game — which is
 * what closes every socket in the room and gives all connected players the
 * standard Session Ended modal and redirect. The host who pressed the button
 * receives that broadcast like everyone else, so success needs no local
 * navigation.
 *
 * The room id in the game's URL IS the session id (api-site starts the game
 * with room_id = session.id), so no extra lookup is needed.
 *
 * api-site refuses anyone but the session host, and the caller is expected to
 * only offer this to them; the refusal arrives as a 400 and is surfaced.
 */
export function useFinishSession() {
  const [isFinishing, setIsFinishing] = useState(false);
  const [error, setError] = useState(null);

  const clearError = useCallback(() => setError(null), []);

  const finishSession = useCallback(async (sessionId) => {
    if (!sessionId) return false;
    setIsFinishing(true);
    setError(null);
    try {
      const response = await authFetch(`/api/sessions/${sessionId}/finish`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || 'Failed to finish the session');
      }
      // Deliberately stays true: the session is ending and the socket is
      // about to close, so re-enabling the button would only invite a second
      // press against a session that is already gone.
      return true;
    } catch (caught) {
      console.error('FINISHSESSION: could not finish the session', caught);
      setError(caught.message || 'Failed to finish the session');
      setIsFinishing(false);
      return false;
    }
  }, []);

  return { finishSession, isFinishing, error, clearError };
}
