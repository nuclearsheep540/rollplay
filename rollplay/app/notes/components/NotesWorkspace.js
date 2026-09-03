/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useQueryClient } from '@tanstack/react-query'
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import dayjs from 'dayjs'

import ConfirmDialog from '@/app/shared/components/ConfirmDialog'
import Spinner from '@/app/shared/components/Spinner'

import NoteTopBar from './NoteTopBar'

import { SaveStatus, useNoteAutosave } from '../hooks/useNoteAutosave'
import {
  patchNoteInCaches,
  refetchNote,
  useCreateNote,
  useDeleteNote,
  useNote,
  useNotesList,
  useRenameNote,
} from '../hooks/useNotes'

const NoteEditor = dynamic(() => import('./NoteEditor'), {
  ssr: false,
  loading: () => <Spinner />,
})

const STATUS_LABEL = {
  [SaveStatus.PENDING]: 'Unsaved changes',
  [SaveStatus.SAVING]: 'Saving…',
  [SaveStatus.SAVED]: 'Saved',
  [SaveStatus.ERROR]: 'Could not save — retrying',
  [SaveStatus.CONFLICT]: 'Reloading newer version…',
}

/**
 * Full-page notes workspace: campaigns and their notes on the left, editor on
 * the right.
 *
 * The same hooks and the same `NoteEditor` as the in-game drawer — only the
 * chrome differs. The drawer squeezes note switching into a Dropdown because it
 * has 280-560px to work with; here there is room for the list to simply be a
 * list, which is also what makes the multi-file model legible.
 *
 * The sidebar lists every campaign, not only the one arrived from, and expands
 * the open one to its notes. A notebook is created on demand, so a campaign
 * with none belongs in the list exactly as much as one with ten — otherwise the
 * only route to a first note is back out through the dashboard.
 *
 * Only the open campaign's notes are fetched: the collapsed rows need a title,
 * not a notebook, so switching costs one request rather than the list costing N.
 *
 * Selection lives in the URL (`?campaign_id=`, `?note=`) rather than in state,
 * matching the workshop tools: a refresh or a pasted link lands on the same
 * note.
 */
export default function NotesWorkspace({
  campaignId,
  campaigns = [],
  onSelectCampaign,
  activeNoteId,
  onSelectNote,
  onBack,
  lockedBySession = false,
  onOpenGame,
}) {
  const queryClient = useQueryClient()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const notesList = useNotesList(campaignId)
  // Memoised because `|| []` mints a new array identity on every render, and this
  // sits in two effect dependency arrays below — without it they re-run on every
  // render for nothing.
  const notes = useMemo(() => notesList.data || [], [notesList.data])

  const createNote = useCreateNote(campaignId)
  const renameNote = useRenameNote(campaignId)
  const deleteNote = useDeleteNote(campaignId)

  // Land on the most recently edited note when the URL names none. Never create
  // one — an empty notebook stays empty until asked.
  useEffect(() => {
    if (activeNoteId || notes.length === 0) return
    onSelectNote(notes[0].id)
  }, [notes, activeNoteId, onSelectNote])

  // A note named in the URL that no longer exists (deleted, or someone else's
  // link) should fall back rather than leave the pane pointed at nothing.
  useEffect(() => {
    if (!activeNoteId || notesList.isLoading) return
    if (!notes.some((note) => note.id === activeNoteId)) {
      onSelectNote(notes[0]?.id ?? null)
    }
  }, [notes, activeNoteId, notesList.isLoading, onSelectNote])

  const activeNoteQuery = useNote(activeNoteId)
  const activeNote = activeNoteQuery.data

  // Bumped when the document is replaced from the server rather than by typing.
  // It re-keys the editor (content is only read at creation, so nothing else
  // would update it) and resets the autosave hook's revision — without that, the
  // first save after a reload would carry the pre-reload rev and 409.
  const [reloadToken, setReloadToken] = useState(0)
  const [conflictReloaded, setConflictReloaded] = useState(false)

  const handleSaved = (saved) => {
    setConflictReloaded(false)
    patchNoteInCaches(queryClient, campaignId, saved)
  }

  // Self-heal on conflict. A 409 means this document is built on a revision the
  // server has moved past, so the only useful response is to take server truth.
  // The reset token also clears the hook's conflict flag, so saving resumes by
  // itself. Whatever was typed into the stale copy is replaced — it could never
  // have been saved, which is what the 409 said — so the notice says so rather
  // than letting it disappear silently.
  const handleConflict = useCallback(() => {
    if (!activeNoteId) return
    refetchNote(queryClient, campaignId, activeNoteId).then(() => {
      setReloadToken((token) => token + 1)
      setConflictReloaded(true)
    })
  }, [queryClient, campaignId, activeNoteId])

  const { status, queueSave, flush } = useNoteAutosave(
    activeNoteId,
    activeNote?.rev ?? 0,
    handleSaved,
    reloadToken,
    handleConflict
  )

  // Commit immediately when the lock engages, rather than leaving the last edit
  // sitting in the debounce for up to ten seconds while the editor is already
  // read-only. Locking never unmounts the editor, so pending work survives
  // either way — this just removes the limbo.
  useEffect(() => {
    if (lockedBySession) flush()
  }, [lockedBySession, flush])

  // When the session ends, whatever was written in-game is now the truth and our
  // cached copy is behind. Refetch first, THEN re-key: bumping the token before
  // the new content lands would remount onto the very copy we are replacing.
  //
  // Safe to remount here precisely because we were locked — the editor was
  // read-only and flushed on the way in, so there is no unsaved text to lose.
  const wasLockedRef = useRef(lockedBySession)
  useEffect(() => {
    const wasLocked = wasLockedRef.current
    wasLockedRef.current = lockedBySession
    if (!wasLocked || lockedBySession || !activeNoteId) return

    let cancelled = false
    refetchNote(queryClient, campaignId, activeNoteId).then(() => {
      if (!cancelled) setReloadToken((token) => token + 1)
    })
    return () => {
      cancelled = true
    }
  }, [lockedBySession, activeNoteId, campaignId, queryClient])

  const handleCreate = async () => {
    if (!campaignId) return
    const created = await createNote.mutateAsync()
    onSelectNote(created.id)
  }

  const handleDelete = async () => {
    await deleteNote.mutateAsync(activeNoteId)
    setConfirmingDelete(false)
    onSelectNote(null)
  }

  return (
    <div className="notes-workspace">
      <aside className="notes-workspace__sidebar">
        <div className="notes-workspace__sidebar-head">
          <button type="button" onClick={onBack} className="notes-workspace__back">
            <FontAwesomeIcon icon={faArrowLeft} className="w-3" />
            <span>Dashboard</span>
          </button>
          <h1 className="notes-workspace__campaign">Notes</h1>
        </div>

        <ul className="notes-workspace__list">
          {campaigns.length === 0 && (
            <li className="notes-workspace__empty">
              No campaigns yet. Notes live with a campaign, so join or create one
              first.
            </li>
          )}

          {campaigns.map((campaign) => {
            const isOpen = campaign.id === campaignId
            return (
              <li key={campaign.id} className="notes-workspace__campaign-group">
                <button
                  type="button"
                  onClick={() => onSelectCampaign?.(campaign.id)}
                  aria-expanded={isOpen}
                  className={`notes-workspace__campaign-row ${isOpen ? 'is-open' : ''}`}
                >
                  <span className="notes-workspace__row-title">{campaign.title}</span>
                  {/* A live session makes this campaign's notes read-only here.
                      Said on the row so it is known before the click, not only
                      once the editor has loaded locked. */}
                  {campaign.hasLiveSession && (
                    <span className="notes-workspace__campaign-live">Live</span>
                  )}
                </button>

                {isOpen && (
                  <ul className="notes-workspace__campaign-notes">
                    {notesList.isLoading && (
                      <li className="notes-workspace__empty">Loading…</li>
                    )}
                    {!notesList.isLoading && notes.length === 0 && (
                      <li className="notes-workspace__empty">
                        No notes yet. They are private to you and stay with this
                        campaign between sessions.
                      </li>
                    )}
                    {notes.map((note) => (
                      <li key={note.id}>
                        <button
                          type="button"
                          onClick={() => onSelectNote(note.id)}
                          className={`notes-workspace__row ${note.id === activeNoteId ? 'is-active' : ''}`}
                        >
                          <span className="notes-workspace__row-title">{note.title}</span>
                          <span className="notes-workspace__row-date">
                            {dayjs(note.updated_at).format('D MMM, HH:mm')}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </aside>

      <section className="notes-workspace__main">
        {/* The top bar renders even with no note open — otherwise an empty
            notebook has no way to create its first one. */}
        <NoteTopBar
          notes={notes}
          activeNote={activeNote}
          statusLabel={STATUS_LABEL[status] || ''}
          onSelect={onSelectNote}
          onCreate={handleCreate}
          onRename={(title) => renameNote.mutate({ noteId: activeNoteId, title })}
          onDelete={() => setConfirmingDelete(true)}
          isCreating={createNote.isPending || !campaignId}
        />

        {!activeNoteId ? (
          <div className="notes-workspace__placeholder">
            <p>
              {campaignId
                ? 'Select a note, or create one to get started.'
                : 'Pick a campaign to open its notes.'}
            </p>
          </div>
        ) : (
          <>
            {lockedBySession && (
              <div className="notes-workspace__locked">
                <span>
                  A session is live for this campaign. Notes are read-only here so
                  they can&apos;t be edited in two places at once. Continue editing them in the game.
                </span>
                {onOpenGame && (
                  <button type="button" onClick={onOpenGame} className="notes-btn-primary">
                    Open game
                  </button>
                )}
              </div>
            )}

            {conflictReloaded && (
              <p className="notes-workspace__conflict">
                This note was updated somewhere else, so it has been reloaded to the
                newer version. Anything typed here that hadn&apos;t saved was replaced.
              </p>
            )}

            {/* Same rule as the drawer: the editor mounts only once its note has
                loaded and is keyed by id, so content is never pushed into a live
                editor — that would put it on the undo stack, where one Ctrl+Z
                blanks the note and autosave persists the blank. */}
            {activeNoteQuery.isFetching || !activeNote ? (
              <Spinner />
            ) : (
              <NoteEditor
                measured
                key={`${activeNote.id}:${reloadToken}`}
                initialContent={activeNote.content_delta}
                onChange={queueSave}
                editable={!lockedBySession}
              />
            )}
          </>
        )}
      </section>

      <ConfirmDialog
        show={confirmingDelete}
        title="Delete this note?"
        message={activeNote?.title}
        description="This cannot be undone."
        confirmText="Delete"
        isLoading={deleteNote.isPending}
        loadingText="Deleting…"
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  )
}
