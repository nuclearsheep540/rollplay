/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useEffect, useRef, useState } from 'react'
import {
  faCheck,
  faChevronDown,
  faEllipsisVertical,
  faPen,
  faPlus,
  faTrash,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

import Dropdown from '@/app/shared/components/Dropdown'

import { MAX_NOTES_PER_CAMPAIGN } from '../hooks/useNotes'

/**
 * The identity row: which note you are in, and what you can do to it.
 *
 * Shared by the in-game drawer and the /notes workspace so the two surfaces
 * cannot drift. The title *is* the picker — a separate heading plus a dropdown
 * plus a New note button was three controls saying one thing.
 *
 * `compact` drops the New note button to an icon for the drawer, where the row
 * has 280-560px to fit into.
 */
export default function NoteTopBar({
  notes,
  activeNote,
  statusLabel,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  isCreating,
  compact = false,
}) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const renameInputRef = useRef(null)

  useEffect(() => {
    if (isRenaming) renameInputRef.current?.focus()
  }, [isRenaming])

  // Leaving a note mid-rename must not carry the draft to the next one.
  useEffect(() => {
    setIsRenaming(false)
  }, [activeNote?.id])

  const atLimit = notes.length >= MAX_NOTES_PER_CAMPAIGN

  const startRenaming = () => {
    setDraftTitle(activeNote?.title === 'Untitled note' ? '' : activeNote?.title || '')
    setIsRenaming(true)
  }

  const commitRename = () => {
    setIsRenaming(false)
    // An emptied field is how the user says "name it after its first line again";
    // the server treats a blank title as clearing it.
    onRename(draftTitle)
  }

  const noteItems = notes.map((note) => ({
    label: note.title,
    icon: note.id === activeNote?.id ? faCheck : undefined,
    onClick: () => onSelect(note.id),
  }))

  const limitTitle = atLimit
    ? `${MAX_NOTES_PER_CAMPAIGN} note limit reached — delete a note to make room.`
    : 'Start a new note'

  return (
    <div className="notes-topbar">
      {isRenaming ? (
        <input
          ref={renameInputRef}
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          onBlur={commitRename}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitRename()
            if (event.key === 'Escape') setIsRenaming(false)
          }}
          placeholder="Name this note"
          maxLength={200}
          className="notes-topbar__rename"
        />
      ) : (
        <Dropdown
          align="left"
          items={noteItems}
          trigger={
            <button type="button" className="notes-topbar__picker">
              <span className="notes-topbar__name">{activeNote?.title || 'Notes'}</span>
              <FontAwesomeIcon icon={faChevronDown} className="notes-topbar__caret" />
            </button>
          }
        />
      )}

      <span className="notes-topbar__spacer" />

      <span className="notes-topbar__status">
        {statusLabel}
        {!compact && (
          <>
            {statusLabel ? ' · ' : ''}
            {notes.length} / {MAX_NOTES_PER_CAMPAIGN} notes
          </>
        )}
      </span>

      {compact ? (
        <button
          type="button"
          onClick={onCreate}
          disabled={atLimit || isCreating}
          title={limitTitle}
          aria-label="New note"
          className="notes-topbar__icon"
        >
          <FontAwesomeIcon icon={faPlus} />
        </button>
      ) : (
        <button
          type="button"
          onClick={onCreate}
          disabled={atLimit || isCreating}
          title={limitTitle}
          className="notes-topbar__new"
        >
          <FontAwesomeIcon icon={faPlus} />
          New note
        </button>
      )}

      {activeNote && (
        <Dropdown
          items={[
            { label: 'Rename', icon: faPen, onClick: startRenaming },
            { label: 'Delete', icon: faTrash, variant: 'danger', onClick: onDelete },
          ]}
          trigger={
            <button type="button" className="notes-topbar__icon" title="Note actions" aria-label="Note actions">
              <FontAwesomeIcon icon={faEllipsisVertical} />
            </button>
          }
        />
      )}
    </div>
  )
}
