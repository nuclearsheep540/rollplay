/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState } from 'react'
import dayjs from 'dayjs'
import Modal from '@/app/shared/components/Modal'
import Spinner from '@/app/shared/components/Spinner'
import TimeField from '@/app/shared/components/TimeField'
import { Button } from './shared/Button'

const DATE_FORMAT = 'YYYY-MM-DD'
const TIME_FORMAT = 'HH:mm'

/**
 * Say when the next game is.
 *
 * Purely communicative — nothing starts on this date and nobody is reminded by
 * it. It tells the table what the GM intends, which is usually confirming
 * something already agreed out loud.
 *
 * Timezones: both fields are read in the browser's own zone, and `new Date()`
 * on a `YYYY-MM-DDTHH:mm` string interprets it that way, so `toISOString()`
 * gives the instant the GM meant. Every other player's browser renders that
 * instant in their own zone. No server timezone is involved anywhere.
 */
export default function ScheduleGameModal({ campaign, currentValue, currentName, onSave, onCancel, isSaving }) {
  const existing = currentValue ? dayjs(currentValue) : null
  const [date, setDate] = useState(existing ? existing.format(DATE_FORMAT) : '')
  const [time, setTime] = useState(existing ? existing.format(TIME_FORMAT) : '')
  const [name, setName] = useState(currentName || '')

  // Date and time are one value, so they travel together: both set, or neither.
  // A name on its own is fine — a GM can know what the next game is before they
  // know when it is.
  const hasWholeDate = Boolean(date) && Boolean(time)
  const hasHalfDate = Boolean(date) !== Boolean(time)

  // `toISOString()` throws a RangeError on an unparseable date, and neither
  // field can hand us one: a native date input sanitises anything typed into
  // it to `YYYY-MM-DD` or to empty, TimeField only ever reports `HH:mm` or
  // empty, and Save is disabled while exactly one is filled.
  const save = () => onSave({
    scheduledAt: hasWholeDate ? new Date(`${date}T${time}`).toISOString() : null,
    nextGameName: name.trim() || null,
  })

  return (
    <Modal open={!!campaign} onClose={isSaving ? () => {} : onCancel} size="sm">
      <div className="p-6">
        <h3 className="text-lg font-semibold font-[family-name:var(--font-metamorphous)] mb-4 text-content-on-dark">
          Next Game
        </h3>
        <p className="text-sm mb-4 text-content-on-dark">
          When is the next <strong>{campaign?.title}</strong> game, and what is it?
          Everyone sees the time in their own timezone. Nothing starts automatically.
        </p>

        <input
          type="text"
          value={name}
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name (optional) — e.g. The Siege of Kraghammer"
          aria-label="Name of the next game"
          className="w-full mb-3 px-3 py-2 rounded-sm border focus:outline-none focus:ring-2 bg-surface-primary border-border text-content-primary"
        />

        <div className="flex gap-3">
          <input
            type="date"
            value={date}
            min={dayjs().format(DATE_FORMAT)}
            onChange={(event) => setDate(event.target.value)}
            aria-label="Date of the next game"
            className="flex-1 px-3 py-2 rounded-sm border focus:outline-none focus:ring-2 bg-surface-primary border-border text-content-primary"
          />
          {/* Our own picker, not a native time input: browsers draw every
              minute in their dropdown whatever `step` says, and games get
              scheduled on the clock, not at 20:07. Typing 20:03 still works. */}
          <TimeField
            value={time}
            onChange={setTime}
            aria-label="Time of the next game"
            className="w-[8.5rem]"
          />
        </div>

        <div className="flex justify-between gap-3 mt-6">
          <Button
            variant="ghost"
            onClick={() => onSave({ scheduledAt: null, nextGameName: null })}
            disabled={isSaving || (!currentValue && !currentName)}
          >
            Clear
          </Button>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={onCancel} disabled={isSaving}>
              Cancel
            </Button>
            <Button variant="success" onClick={save} disabled={isSaving || hasHalfDate || (!hasWholeDate && !name.trim())}>
              {isSaving ? (
                <span className="flex items-center gap-2">
                  <Spinner size="sm" />
                  Saving...
                </span>
              ) : (
                'Save'
              )}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
