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
 * Header for the notes panel: which note you are in, how to switch, and how many
 * you have left.
 *
 * The count is shown from the very first note rather than only near the ceiling.
 * Discovering a cap at 99 reads as a trap; showing it all along is just honest.
 */
export default function NotePicker({
  notes,
  activeNote,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  isCreating,
}) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const renameInputRef = useRef(null)

  useEffect(() => {
    if (isRenaming) renameInputRef.current?.focus()
  }, [isRenaming])

  // Leaving a note mid-rename should not carry the draft to the next one.
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
    // An emptied field is how the user says "go back to naming it after its first
    // line" — the server treats a blank title as clearing it.
    onRename(draftTitle)
  }

  // Each note is a menu item that selects it; the tick marks where you are, since
  // the shared Dropdown is an action menu with no notion of a current value.
  const noteItems = notes.map((note) => ({
    label: note.title,
    icon: note.id === activeNote?.id ? faCheck : undefined,
    onClick: () => onSelect(note.id),
  }))

  return (
    <div className="mb-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
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
            className="notes-control min-w-0 flex-1"
          />
        ) : (
          <Dropdown
            align="left"
            items={noteItems}
            trigger={
              <button
                type="button"
                className="notes-control min-w-0 flex-1 text-left"
              >
                <span className="truncate">{activeNote?.title || 'Notes'}</span>
                <FontAwesomeIcon icon={faChevronDown} className="w-3 shrink-0 opacity-60" />
              </button>
            }
          />
        )}

        {activeNote && !isRenaming && (
          <Dropdown
            items={[
              { label: 'Rename', icon: faPen, onClick: startRenaming },
              { label: 'Delete', icon: faTrash, variant: 'danger', onClick: onDelete },
            ]}
            trigger={
              <button
                type="button"
                title="Note actions"
                className="notes-control"
              >
                <FontAwesomeIcon icon={faEllipsisVertical} className="w-3" />
              </button>
            }
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-content-secondary">
          {notes.length} / {MAX_NOTES_PER_CAMPAIGN} notes
        </span>
        <button
          type="button"
          onClick={onCreate}
          disabled={atLimit || isCreating}
          title={
            atLimit
              ? `${MAX_NOTES_PER_CAMPAIGN} note limit reached — delete a note to make room.`
              : 'Start a new note'
          }
          className="notes-control text-xs"
        >
          <FontAwesomeIcon icon={faPlus} className="w-3" />
          New note
        </button>
      </div>

      {atLimit && (
        <p className="text-xs text-feedback-warning">
          {MAX_NOTES_PER_CAMPAIGN} note limit reached — delete a note to make room.
        </p>
      )}
    </div>
  )
}
