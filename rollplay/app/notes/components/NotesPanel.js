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
  [SaveStatus.CONFLICT]: 'Edited elsewhere',
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

  const handleSaved = useCallback(
    (saved) => patchNoteInCaches(queryClient, campaignId, saved),
    [queryClient, campaignId]
  )


  const { status, queueSave } = useNoteAutosave(activeNoteId, activeNote?.rev ?? 0, handleSaved)

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

      {status === SaveStatus.CONFLICT && (
        <p className="mb-2 rounded-sm border border-feedback-warning px-2 py-1 text-xs text-feedback-warning">
          This note was edited somewhere else, so saving has stopped to avoid
          overwriting it. Reopen the tab to load the newer version.
        </p>
      )}

      {/* The editor mounts only once its note has loaded, and is keyed by note id.
          Both matter: content handed in after creation lands on the undo stack,
          where one Ctrl+Z blanks the note and autosave persists the blank. */}
      {activeNoteQuery.isLoading || !activeNote ? (
        <Spinner />
      ) : (
        <NoteEditor
          key={activeNote.id}
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
