/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useCallback, useState } from 'react';

import { authFetch } from '@/app/shared/utils/authFetch';

/**
 * End the running game from inside it.
 *
 * Calls the same api-site endpoint the dashboard's End Game uses, so the whole
 * pipeline is the existing one: the hot state is pulled out of MongoDB and
 * written to PostgreSQL, the session goes back to INACTIVE, and only then does
 * a background task delete the game — which is what closes every socket in the
 * room and gives all connected players the standard end-of-game modal and
 * redirect. The host who pressed the button receives that broadcast like
 * everyone else, so success needs no local navigation.
 *
 * The session SURVIVES: token positions and the adventure log are written cold
 * and come back on the next start. Nothing here is destructive — only Reset
 * game throws state away.
 *
 * The room id in the game's URL IS the session id (api-site starts the game
 * with room_id = session.id), so no extra lookup is needed.
 *
 * api-site refuses anyone but the session host, and the caller is expected to
 * only offer this to them; the refusal arrives as a 400 and is surfaced.
 */
export function useEndGame() {
  const [isEnding, setIsEnding] = useState(false);
  const [error, setError] = useState(null);

  const clearError = useCallback(() => setError(null), []);

  const endGame = useCallback(async (sessionId) => {
    if (!sessionId) return false;
    setIsEnding(true);
    setError(null);
    try {
      const response = await authFetch(`/api/sessions/${sessionId}/end`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || 'Failed to end the game');
      }
      // Deliberately stays true: the game is ending and the socket is about to
      // close, so re-enabling the button would only invite a second press
      // against a game that is already gone.
      return true;
    } catch (caught) {
      console.error('ENDGAME: could not end the game', caught);
      setError(caught.message || 'Failed to end the game');
      setIsEnding(false);
      return false;
    }
  }, []);

  return { endGame, isEnding, error, clearError };
}
