/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * TanStack data hooks for campaign notes.
 *
 * Notes are private, campaign-scoped and served entirely by api-site — they never
 * touch the game service, MongoDB or the session ETL. See
 * .claude/plans/notes/01-in-game-notes.md §2.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { authFetch } from '@/app/shared/utils/authFetch'

export const MAX_NOTES_PER_CAMPAIGN = 100

const QK = {
  list: (campaignId) => ['notes', campaignId],
  note: (noteId) => ['note', noteId],
}

/** Thrown when the server rejects a save because the note moved on beneath us. */
export class NoteConflictError extends Error {
  constructor(message) {
    super(message)
    this.name = 'NoteConflictError'
  }
}

async function call(path, init = {}) {
  const response = await authFetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    ...init,
  })
  if (response.status === 204) return null

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = body?.detail || `Request to ${path} failed (${response.status})`
    if (response.status === 409) throw new NoteConflictError(message)
    const error = new Error(message)
    error.status = response.status
    throw error
  }
  return body
}

/**
 * Every note this user holds for a campaign, newest first.
 *
 * An empty campaign returns [] — nothing is auto-created. Creating a note is
 * always an explicit user action.
 */
export function useNotesList(campaignId) {
  return useQuery({
    queryKey: QK.list(campaignId),
    queryFn: () => call(`/api/notes?campaign_id=${campaignId}`),
    enabled: Boolean(campaignId),
  })
}

/**
 * One note in full, including its document body.
 *
 * The editor must not mount before this resolves — hydrating a live editor puts
 * the insertion on the undo stack, where one Ctrl+Z blanks the note and autosave
 * then persists the blank.
 */
export function useNote(noteId) {
  return useQuery({
    queryKey: QK.note(noteId),
    queryFn: () => call(`/api/notes/${noteId}`),
    enabled: Boolean(noteId),
    // Two rules that look contradictory and aren't.
    //
    // `staleTime: Infinity` + no focus refetch: once an editor is mounted it owns
    // the text, and a background refetch arriving mid-edit would hand the autosave
    // hook a newer revision while the editor still held older content — the one
    // path in this design that can silently overwrite newer work.
    //
    // `refetchOnMount: 'always'`: a *fresh mount* has no editor to disturb, so
    // serving it a cached copy buys nothing and costs correctness. Trusting the
    // cache here is what let the game drawer open on a stale revision after the
    // same note had been edited elsewhere, and then 409 on the first keystroke.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
  })
}

export function useCreateNote(campaignId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      call('/api/notes', {
        method: 'POST',
        body: JSON.stringify({ campaign_id: campaignId }),
      }),
    onSuccess: (note) => {
      queryClient.setQueryData(QK.note(note.id), note)
      queryClient.invalidateQueries({ queryKey: QK.list(campaignId) })
    },
  })
}

export function useRenameNote(campaignId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ noteId, title }) =>
      call(`/api/notes/${noteId}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
    onSuccess: (note) => {
      queryClient.setQueryData(QK.note(note.id), note)
      queryClient.invalidateQueries({ queryKey: QK.list(campaignId) })
    },
  })
}

export function useDeleteNote(campaignId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (noteId) => call(`/api/notes/${noteId}`, { method: 'DELETE' }),
    onSuccess: (_result, noteId) => {
      queryClient.removeQueries({ queryKey: QK.note(noteId) })
      queryClient.invalidateQueries({ queryKey: QK.list(campaignId) })
    },
  })
}

/**
 * Persist a whole document.
 *
 * Deliberately not a TanStack mutation: this fires on a debounce from the editor,
 * and the autosave hook needs to await it directly (including from a flush during
 * page unload, where hook state is no longer usable). Cache upkeep is the caller's.
 */
export async function saveNoteContent(noteId, { contentDelta, contentText, rev }) {
  return call(`/api/notes/${noteId}`, {
    method: 'PUT',
    body: JSON.stringify({ content_delta: contentDelta, content_text: contentText, rev }),
  })
}

/**
 * Last-gasp save during page unload.
 *
 * Deliberately plain `fetch`, not `authFetch` — this is a documented exception to
 * the project rule. authFetch's 401 → refresh → retry cannot complete during
 * unload (the page is already going), so wrapping it would just fail slower.
 * `keepalive` lets the request outlive the document; its 64KB body cap is fine
 * for a note and irrelevant anyway, since a normal save ran at most ten seconds
 * ago. Best-effort by design: if the access token has just expired, this one is
 * lost and the previous save stands.
 */
export function saveNoteContentBeacon(noteId, { contentDelta, contentText, rev }) {
  return fetch(`/api/notes/${noteId}`, {
    method: 'PUT',
    credentials: 'include',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content_delta: contentDelta, content_text: contentText, rev }),
  }).catch(() => {})
}

/**
 * Pull a note back from the server, discarding the cached copy.
 *
 * Needed when something *other than this editor* has moved the note on — the
 * in-game drawer writing during a live session, for instance. `useNote` holds
 * `staleTime: Infinity` deliberately (a background refetch could otherwise
 * overwrite our revision mid-edit and let a stale document clobber newer work),
 * so refreshing has to be an explicit act.
 *
 * Returns a promise: callers remount the editor only once the new content has
 * actually landed, or they would remount onto the copy they are replacing.
 */
export function refetchNote(queryClient, campaignId, noteId) {
  return Promise.all([
    queryClient.refetchQueries({ queryKey: QK.note(noteId) }),
    queryClient.invalidateQueries({ queryKey: QK.list(campaignId) }),
  ])
}

/**
 * Fold a saved note back into both caches, without provoking a refetch.
 *
 * The single-note entry matters as much as the list row: `useNote` holds
 * `staleTime: Infinity`, and the editor re-mounts from that cache every time you
 * switch notes. Leave it on the copy fetched at load and switching away and back
 * shows the *old* document — which reads exactly like the save never happened.
 */
export function patchNoteInCaches(queryClient, campaignId, note) {
  queryClient.setQueryData(QK.note(note.id), note)
  queryClient.setQueryData(QK.list(campaignId), (previous) => {
    if (!Array.isArray(previous)) return previous
    return previous.map((summary) =>
      summary.id === note.id
        ? { ...summary, title: note.title, rev: note.rev, updated_at: note.updated_at }
        : summary
    )
  })
}
