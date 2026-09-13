/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export const AUTOSAVE_DELAY_MS = 3000

/**
 * Debounced autosave, and the honest state of it.
 *
 * The pending timer IS the unsaved-changes state: a timer exists exactly when something
 * has changed and not yet been written. The request's outcome is the saved state. Between
 * them they answer the whole question, so there is no separate dirty flag and nothing to
 * diff — a change schedules, a 200 clears, and anything typed during a request leaves a
 * fresh timer behind that keeps the answer honest.
 *
 * Saves are serialised: the first save of a new campaign is a POST that mints the row, so
 * two overlapping saves would create two campaigns.
 *
 * `status`: idle | dirty | saving | saved | error.
 */
export function useAutoSave(save, { delay = AUTOSAVE_DELAY_MS } = {}) {
  const timerRef = useRef(null)
  const inFlightRef = useRef(null)
  const runAgainRef = useRef(false)
  const saveRef = useRef(save)
  const [status, setStatus] = useState('idle')

  // Kept in a ref so a re-render mid-debounce never fires a stale closure over old form
  // state — the timer outlives the render that scheduled it.
  useEffect(() => {
    saveRef.current = save
  }, [save])

  const run = useCallback(async () => {
    if (inFlightRef.current) {
      runAgainRef.current = true
      return inFlightRef.current
    }

    setStatus('saving')
    const attempt = (async () => {
      // `false` means the caller could not save yet (a campaign with no name); that is
      // still unsaved, not saved.
      const didSave = await saveRef.current()
      // Still dirty if a change arrived while this was in flight — the timer it left
      // behind is the proof, and claiming "saved" over it is the lie this replaces.
      const stillDirty = didSave === false || !!timerRef.current || runAgainRef.current
      setStatus(stillDirty ? 'dirty' : 'saved')
    })()

    inFlightRef.current = attempt
    try {
      await attempt
    } catch {
      setStatus('error')
    } finally {
      inFlightRef.current = null
      if (runAgainRef.current) {
        runAgainRef.current = false
        run()
      }
    }
    return attempt
  }, [])

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  /** Something changed: save shortly, unless something else changes first. */
  const schedule = useCallback(() => {
    cancel()
    setStatus('dirty')
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      run()
    }, delay)
  }, [cancel, delay, run])

  /**
   * Save a pending change now — a tab change, or leaving the page.
   *
   * A no-op when nothing is waiting: a tab click with no edits behind it must not write to
   * the server, or reading the builder would PUT the campaign on every click.
   */
  const flush = useCallback(() => {
    if (!timerRef.current) return Promise.resolve()
    cancel()
    return run()
  }, [cancel, run])

  /** Save regardless — the Save button, which never debounces. */
  const saveNow = useCallback(() => {
    cancel()
    return run()
  }, [cancel, run])

  useEffect(() => cancel, [cancel])

  // The callbacks are stable for the life of the component; the object is not, because
  // `status` changes and has to. Effects and memos must therefore depend on the callback
  // they use — `autoSave.flush`, `autoSave.schedule` — never on `autoSave` itself. A
  // memo over the whole object once included `status` in its deps, which handed every
  // effect a new identity on every status change: the unmount-flush cleanup then ran on
  // each keystroke and saved instantly, which is the debounce not existing.
  return { schedule, flush, saveNow, cancel, status }
}
