/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

// Mirrors MAX_PULSE_EVENTS on UserAggregate. The server is the authority — it
// trims before storing — but live socket events arrive after that trim, so the
// client applies the same bound to what it holds between fetches.
const MAX_PULSE_EVENTS = 5

// How often the client re-checks for entries that have aged out. Entries carry
// their own expires_at, so this only decides how promptly a lapsed pill
// disappears from a page nobody is touching.
const EXPIRY_SWEEP_MS = 60000

/**
 * The pulse's event store.
 *
 * Two sources, one shape: entries hydrate from the user payload (so a refresh
 * keeps the line) and arrive live over the socket (so it moves while you
 * watch). Both are the same server-authored entry, which is why the socket can
 * simply prepend.
 *
 * Expiry is enforced here as well as on the server: an entry lapses at a known
 * time, and a page left open must not keep asserting it. That is what makes a
 * scheduled server-side cleanup unnecessary — nothing has to be deleted for it
 * to stop being shown.
 */
export const usePulse = (hydratedEvents) => {
  const [liveEvents, setLiveEvents] = useState([])
  const [now, setNow] = useState(() => Date.now())

  const addPulseEvent = useCallback((entry) => {
    setLiveEvents((current) => {
      // The server dedupes by type and payload; match that so an event
      // arriving live replaces the hydrated copy of the same thing rather
      // than doubling it.
      const withoutRepeat = current.filter(
        (existing) =>
          existing.event_type !== entry.event_type ||
          JSON.stringify(existing.data) !== JSON.stringify(entry.data)
      )
      return [entry, ...withoutRepeat].slice(0, MAX_PULSE_EVENTS)
    })
  }, [])

  // A ticking clock rather than a timer per entry: one interval regardless of
  // how many pills are showing, and nothing to clean up when they change.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), EXPIRY_SWEEP_MS)
    return () => clearInterval(timer)
  }, [])

  const pulseEvents = useMemo(() => {
    const merged = [...liveEvents]

    for (const entry of hydratedEvents || []) {
      const alreadyLive = merged.some((live) => live.id === entry.id)
      if (!alreadyLive) {
        merged.push(entry)
      }
    }

    return merged
      .filter((entry) => new Date(entry.expires_at).getTime() > now)
      .slice(0, MAX_PULSE_EVENTS)
  }, [liveEvents, hydratedEvents, now])

  return {
    pulseEvents,
    addPulseEvent
  }
}
