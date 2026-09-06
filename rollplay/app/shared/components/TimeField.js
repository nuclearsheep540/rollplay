/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faClock } from '@fortawesome/free-solid-svg-icons'
import { parseClockTime } from '@/app/shared/utils/formatTime'

/**
 * TimeField — a clock time you can type or pick, "HH:mm" in and out.
 *
 * Exists because the browser's own time picker lists all sixty minutes
 * whatever `step` says (that attribute only moves the arrow keys and decides
 * what counts as valid). Games are scheduled on the clock, so the minute
 * column here offers five-minute marks. Nothing is enforced by it: a typed
 * 20:03 is accepted as 20:03 — the picker is a convenience, not a rule.
 *
 * Mouse and typing only; the columns are not keyboard-navigable. Enter
 * commits what was typed, Escape closes the panel, and moving focus away
 * commits. Not a full ARIA combobox — say so before extending it.
 */

const MINUTE_STEP = 5
const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'))
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, index) => String(index * MINUTE_STEP).padStart(2, '0'))

function Column({ label, items, selected, onPick }) {
  return (
    <div role="listbox" aria-label={label} className="max-h-56 overflow-y-auto py-1">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          role="option"
          aria-selected={item === selected}
          onClick={() => onPick(item)}
          className={`block w-14 px-3 py-1.5 text-sm text-center text-content-on-dark hover:bg-interactive-hover ${
            item === selected ? 'bg-interactive-hover font-semibold' : ''
          }`}
        >
          {item}
        </button>
      ))}
    </div>
  )
}

export default function TimeField({ value, onChange, className = '', ...inputProps }) {
  const [draft, setDraft] = useState(value || '')
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)
  const panelRef = useRef(null)

  // A parent resetting the value (reopening the dialog) must show in the box.
  useEffect(() => {
    setDraft(value || '')
  }, [value])

  // Open on the chosen entries, the way a native picker does.
  useEffect(() => {
    if (!open) return
    for (const chosen of panelRef.current?.querySelectorAll('[aria-selected="true"]') || []) {
      chosen.scrollIntoView({ block: 'nearest' })
    }
  }, [open])

  const [selectedHour, selectedMinute] = (value || '').split(':')

  // What was typed becomes the value if it reads as a time; otherwise the box
  // snaps back to the last good value rather than holding something unsaveable.
  const commitDraft = () => {
    if (draft.trim() === '') {
      onChange('')
      return
    }
    const parsed = parseClockTime(draft)
    if (parsed) {
      onChange(parsed)
    } else {
      setDraft(value || '')
    }
  }

  const pick = (part, chosen) => {
    const hour = part === 'hour' ? chosen : selectedHour || '00'
    const minute = part === 'minute' ? chosen : selectedMinute || '00'
    onChange(`${hour}:${minute}`)
  }

  const onKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitDraft()
      setOpen(false)
    } else if (event.key === 'Escape' && open) {
      // Close the panel, not the dialog around it.
      event.stopPropagation()
      setOpen(false)
    }
  }

  return (
    <div className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        placeholder="HH:MM"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => { commitDraft(); setOpen(false) }}
        onKeyDown={onKeyDown}
        className="w-full pl-3 pr-9 py-2 rounded-sm border focus:outline-none focus:ring-2 bg-surface-primary border-border text-content-primary"
        {...inputProps}
      />
      {/* mousedown is swallowed on the button and the panel so a click in
          either never blurs the input — a blur would commit and close before
          the click landed. */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Pick a time"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (document.activeElement !== inputRef.current) {
            inputRef.current?.focus()  // focusing opens it
          } else {
            setOpen((wasOpen) => !wasOpen)
          }
        }}
        className="absolute inset-y-0 right-0 flex items-center pr-3 text-content-secondary hover:text-content-primary"
      >
        <FontAwesomeIcon icon={faClock} />
      </button>

      {open && (
        <div
          ref={panelRef}
          onMouseDown={(event) => event.preventDefault()}
          className="absolute left-0 z-50 mt-1 flex rounded-sm border border-border bg-surface-secondary shadow-lg"
        >
          <Column label="Hour" items={HOURS} selected={selectedHour} onPick={(hour) => pick('hour', hour)} />
          <Column label="Minute" items={MINUTES} selected={selectedMinute} onPick={(minute) => pick('minute', minute)} />
        </div>
      )}
    </div>
  )
}
