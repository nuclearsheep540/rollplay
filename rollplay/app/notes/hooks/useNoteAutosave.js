/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Debounced autosave for a single note.
 *
 * There is no save button — the game runtime is fluid and a button is a thing to
 * forget — so the status this hook reports IS the user's trust model.
 *
 * Two timers, not one. The idle debounce coalesces a burst of keystrokes; the
 * max-wait ceiling is the actual safety property, because a debounce alone means
 * someone who types for four minutes straight never saves once.
 *
 * The pair also *is* the rate limit: a higher request rate is unreachable by
 * construction rather than policed after the fact. Continuous typing tops out at
 * roughly six requests a minute.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { NoteConflictError, saveNoteContent, saveNoteContentBeacon } from './useNotes'

// Quiet period after the last keystroke before a save fires.
const IDLE_DEBOUNCE_MS = 1500
// Hard ceiling: sustained typing still commits at least this often.
const MAX_WAIT_MS = 10000
// Floor between two requests. A backstop against a bug, not a user-facing limit.
const MIN_REQUEST_GAP_MS = 2000

export const SaveStatus = {
  IDLE: 'idle',
  PENDING: 'pending',
  SAVING: 'saving',
  SAVED: 'saved',
  ERROR: 'error',
  CONFLICT: 'conflict',
}

/**
 * @param {string|null} noteId      note being edited (null disables the hook)
 * @param {number} initialRev       revision the note was loaded at
 * @param {Function} onSaved        called with the server's note after each save
 */
export function useNoteAutosave(noteId, initialRev, onSaved) {
  const [status, setStatus] = useState(SaveStatus.IDLE)

  const pendingRef = useRef(null)
  const idleTimerRef = useRef(null)
  const ceilingAtRef = useRef(null)
  const lastSentRef = useRef(null)
  const lastRequestAtRef = useRef(0)
  const inFlightRef = useRef(false)
  const revRef = useRef(initialRev)
  const conflictRef = useRef(false)
  const hasSavedRef = useRef(false)
  const onSavedRef = useRef(onSaved)

  // Refreshed every render so a flush never calls into a stale closure.
  onSavedRef.current = onSaved

  // Switching notes resets everything — a new note is a new document, a new
  // revision line and a clean slate for the conflict flag.
  //
  // Keyed on noteId ALONE, deliberately. Including initialRev here meant any
  // refresh of the cached note (a rename writes the server's copy back) wiped
  // pendingRef mid-edit, silently dropping whatever had been typed since the last
  // save.
  useEffect(() => {
    revRef.current = initialRev
    conflictRef.current = false
    hasSavedRef.current = false
    pendingRef.current = null
    lastSentRef.current = null
    setStatus(SaveStatus.IDLE)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId])

  // Adopt a revision from the server only until we have written one ourselves.
  // Before the note has loaded the caller passes 0, so this is how the real
  // starting revision arrives; afterwards our own saves are the authority and a
  // stale cached value must not overwrite them.
  useEffect(() => {
    if (!hasSavedRef.current) revRef.current = initialRev
  }, [initialRev])

  const clearIdleTimer = () => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
  }

  const send = useCallback(async () => {
    const payload = pendingRef.current
    if (!payload || !noteId || conflictRef.current) return
    if (inFlightRef.current) return

    pendingRef.current = null
    ceilingAtRef.current = null
    inFlightRef.current = true
    lastRequestAtRef.current = Date.now()
    setStatus(SaveStatus.SAVING)

    try {
      const saved = await saveNoteContent(noteId, { ...payload, rev: revRef.current })
      revRef.current = saved.rev
      hasSavedRef.current = true
      lastSentRef.current = payload.serialised
      setStatus(SaveStatus.SAVED)
      onSavedRef.current?.(saved)
    } catch (error) {
      if (error instanceof NoteConflictError) {
        // Another tab or device wrote first. Stop saving rather than fight it —
        // the panel prompts the user to reload.
        conflictRef.current = true
        setStatus(SaveStatus.CONFLICT)
      } else {
        // Put the work back so the next tick retries it.
        pendingRef.current = payload
        setStatus(SaveStatus.ERROR)
      }
    } finally {
      inFlightRef.current = false
    }
  }, [noteId])

  const sendRef = useRef(send)
  sendRef.current = send

  /** Save whatever is queued, now. Safe to call with nothing pending. */
  const flush = useCallback(() => {
    clearIdleTimer()
    sendRef.current()
  }, [])

  /**
   * Queue a document for saving. Called on every editor change, so the no-op
   * guard matters: formatting toggles that change nothing must not hit the wire.
   */
  const queueSave = useCallback((contentDelta, contentText) => {
    if (!noteId || conflictRef.current) return

    const serialised = JSON.stringify(contentDelta)
    if (serialised === lastSentRef.current) return

    pendingRef.current = { contentDelta, contentText, serialised }
    setStatus(SaveStatus.PENDING)

    const now = Date.now()
    if (!ceilingAtRef.current) ceilingAtRef.current = now + MAX_WAIT_MS

    // Never wait past the ceiling, and never fire faster than the request floor.
    const untilCeiling = Math.max(0, ceilingAtRef.current - now)
    const sinceLastRequest = now - lastRequestAtRef.current
    const throttleWait = Math.max(0, MIN_REQUEST_GAP_MS - sinceLastRequest)
    const wait = Math.max(Math.min(IDLE_DEBOUNCE_MS, untilCeiling), throttleWait)

    clearIdleTimer()
    idleTimerRef.current = setTimeout(() => sendRef.current(), wait)
  }, [noteId])

  // Flush on unmount. Without this the debounce reintroduces the very bug it
  // exists to prevent: close the drawer inside the quiet period and the last edit
  // is silently lost.
  useEffect(() => () => {
    clearIdleTimer()
    sendRef.current()
  }, [])

  // Leaving the tab or the page. `visibilitychange` still has a live document, so
  // it takes the ordinary path; `pagehide` does not, so it takes the keepalive one.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return
      clearIdleTimer()
      sendRef.current()
    }

    const onPageHide = () => {
      clearIdleTimer()
      const payload = pendingRef.current
      if (!payload || !noteId || conflictRef.current || inFlightRef.current) return
      pendingRef.current = null
      saveNoteContentBeacon(noteId, { ...payload, rev: revRef.current })
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [noteId])

  return { status, queueSave, flush, hasConflict: status === SaveStatus.CONFLICT }
}
