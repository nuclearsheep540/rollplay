/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

// Mirrors MAX_PULSE_EVENTS on UserAggregate. The server is the authority — it
// trims before storing — but live socket events arrive after that trim, so the
// client applies the same bound to what it holds between fetches.
export const MAX_PULSE_EVENTS = 5

// How often the client re-checks for entries that have aged out. Entries carry
// their own expires_at, so this only decides how promptly a lapsed pill
// disappears from a page nobody is touching.
const EXPIRY_SWEEP_MS = 60000

/**
 * Whether two entries describe the same happening.
 *
 * Mirrors UserAggregate.record_pulse_event, which treats a repeat as the same
 * event type carrying the same payload — the same friend logging in twice is
 * one thing, a different friend is not. Used by BOTH the live path and the
 * hydration merge so they cannot disagree about what counts as a repeat.
 */
function isSameHappening(one, other) {
  return (
    one.event_type === other.event_type &&
    JSON.stringify(one.data) === JSON.stringify(other.data)
  )
}

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
      // arriving live replaces the copy of the same thing rather than
      // doubling it.
      const withoutRepeat = current.filter((existing) => !isSameHappening(existing, entry))
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

    // Matched on type AND payload, not on id. The server mints a fresh id
    // every time it records an event, so a repeat arriving live is a DIFFERENT
    // id for the same thing — an id check would keep the hydrated copy and
    // show "Ana came online" twice until the older one expired.
    for (const entry of hydratedEvents || []) {
      const alreadyShown = merged.some((live) => isSameHappening(live, entry))
      if (!alreadyShown) {
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
