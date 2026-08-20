/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useQueryClient } from '@tanstack/react-query'
import { faNoteSticky } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

import ConfirmDialog from '@/app/shared/components/ConfirmDialog'
import EmptyState from '@/app/shared/components/EmptyState'
import Spinner from '@/app/shared/components/Spinner'

import NotePicker from './NotePicker'
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

// TipTap is DOM-based and throws at module evaluation under SSR, so `'use client'`
// alone is not enough — Next still evaluates client modules on the server for the
// initial HTML. This also keeps ~95KB off the initial route until the tab is opened.
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
 * The NOTES drawer panel.
 *
 * Private, campaign-scoped notes: players and DMs alike, one notebook per campaign
 * per user, carried between sessions. Nothing here is shared or broadcast.
 */
export default function NotesPanel({ campaignId }) {
  const queryClient = useQueryClient()
  const [activeNoteId, setActiveNoteId] = useState(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const notesList = useNotesList(campaignId)
  const notes = notesList.data || []

  const createNote = useCreateNote(campaignId)
  const renameNote = useRenameNote(campaignId)
  const deleteNote = useDeleteNote(campaignId)

  // Open the most recently edited note. Never create one — an empty notebook stays
  // empty until the user asks for a page.
  useEffect(() => {
    if (activeNoteId || notes.length === 0) return
    setActiveNoteId(notes[0].id)
  }, [notes, activeNoteId])

  // If the open note disappears (deleted here or elsewhere), fall back rather than
  // leaving the panel pointed at nothing.
  useEffect(() => {
    if (!activeNoteId || notesList.isLoading) return
    const stillExists = notes.some((note) => note.id === activeNoteId)
    if (!stillExists) setActiveNoteId(notes[0]?.id ?? null)
  }, [notes, activeNoteId, notesList.isLoading])

  const activeNoteQuery = useNote(activeNoteId)
  const activeNote = activeNoteQuery.data

  const [reloadToken, setReloadToken] = useState(0)
  const [conflictReloaded, setConflictReloaded] = useState(false)

  const handleSaved = useCallback(
    (saved) => {
      setConflictReloaded(false)
      patchNoteInCaches(queryClient, campaignId, saved)
    },
    [queryClient, campaignId]
  )

  // Self-heal on conflict. A 409 means this document is built on a revision the
  // server has moved past, so the only useful response is to take server truth:
  // refetch, then re-key the editor (content is read at creation, nothing else
  // would update it). The reset token also clears the hook's conflict flag, so
  // saving resumes by itself.
  //
  // This does replace whatever was typed into the stale copy — it could never be
  // saved, that is what the 409 said — so the notice below stays up to say so
  // rather than letting it vanish silently.
  const handleConflict = useCallback(() => {
    if (!activeNoteId) return
    refetchNote(queryClient, campaignId, activeNoteId).then(() => {
      setReloadToken((token) => token + 1)
      setConflictReloaded(true)
    })
  }, [queryClient, campaignId, activeNoteId])

  const { status, queueSave } = useNoteAutosave(
    activeNoteId,
    activeNote?.rev ?? 0,
    handleSaved,
    reloadToken,
    handleConflict
  )

  const handleCreate = async () => {
    const created = await createNote.mutateAsync()
    setActiveNoteId(created.id)
  }

  const handleDelete = async () => {
    await deleteNote.mutateAsync(activeNoteId)
    setConfirmingDelete(false)
    setActiveNoteId(null)
  }

  if (notesList.isLoading) return <Spinner />

  if (notesList.isError) {
    return (
      <p className="text-sm text-feedback-error">
        Could not load your notes. Close and reopen the tab to try again.
      </p>
    )
  }

  if (notes.length === 0) {
    return (
      <EmptyState
        icon={<FontAwesomeIcon icon={faNoteSticky} />}
        title="No notes yet"
        description="Notes are private to you and stay with this campaign between sessions."
        action={
          <button
            type="button"
            onClick={handleCreate}
            disabled={createNote.isPending}
            className="notes-btn-primary mt-4"
          >
            {createNote.isPending ? 'Creating…' : 'New note'}
          </button>
        }
      />
    )
  }

  return (
    <div className="flex flex-col">
      <NotePicker
        notes={notes}
        activeNote={activeNote}
        onSelect={setActiveNoteId}
        onCreate={handleCreate}
        onRename={(title) => renameNote.mutate({ noteId: activeNoteId, title })}
        onDelete={() => setConfirmingDelete(true)}
        isCreating={createNote.isPending}
      />

      {conflictReloaded && (
        <p className="mb-2 rounded-sm border border-feedback-warning px-2 py-1 text-xs text-feedback-warning">
          This note was updated somewhere else, so it has been reloaded to the newer
          version. Anything typed here that hadn&apos;t saved was replaced.
        </p>
      )}

      {/* The editor mounts only once its note has loaded, and is keyed by note id.
          Both matter: content handed in after creation lands on the undo stack,
          where one Ctrl+Z blanks the note and autosave persists the blank.

          Gated on isFetching, not isLoading: with a cached copy present isLoading
          is already false, so the editor would mount on the stale document while
          the mount refetch was still in flight — which is exactly how the drawer
          used to open on a stale revision and 409 on the first keystroke. The
          only refetches that can fire are mount and an explicit reload, so this
          never yanks a live editor away mid-edit. */}
      {activeNoteQuery.isFetching || !activeNote ? (
        <Spinner />
      ) : (
        <NoteEditor
          key={`${activeNote.id}:${reloadToken}`}
          initialContent={activeNote.content_delta}
          onChange={queueSave}
        />
      )}

      <p className="mt-2 text-xs text-content-secondary">{STATUS_LABEL[status] || ''}</p>

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
