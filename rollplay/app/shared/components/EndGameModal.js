/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState } from 'react'
import dayjs from 'dayjs'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faFlagCheckered, faCalendarDays } from '@fortawesome/free-solid-svg-icons'

import Modal from './Modal'
import Spinner from './Spinner'
import TimeField from './TimeField'
import { THEME } from '@/app/styles/colorTheme'
import { Button } from '@/app/dashboard/components/shared/Button'

const DATE_FORMAT = 'YYYY-MM-DD'
const TIME_FORMAT = 'HH:mm'

/**
 * Wrapping up a game.
 *
 * Lives in shared/ because both surfaces that end a game use it: the campaign
 * drawer and the game runtime itself. They must offer the same wrap-up, since
 * it is the same act with the same consequences.
 *
 * Not a confirm prompt. Ending is not dangerous — the board, the log and the
 * screen are kept and the next game opens from them — so the dialog is not
 * shaped like a warning. It is the moment the GM has the evening in their head,
 * which makes it the only good moment to ask what it was and when the next one
 * is. A prompt gets dismissed; a page invites an answer.
 *
 * Three parts, in the order a GM thinks about them: what just happened, when
 * the next one is, and then the button.
 *
 * Everything here is optional. A GM who wants the game to simply stop presses
 * End Game and is done — nothing is required, nothing is validated, and no
 * field can block the end. That is the same "facilitate, don't enforce" rule
 * the schedule follows: this records intent, it does not police it.
 *
 * The next-game fields travel WITH the end rather than through the schedule
 * route, because ending clears the old date: a second call could fail and
 * leave the table with no date when the GM had just given them one.
 */
export default function EndGameModal({
  open,
  campaignTitle,
  game,
  gameNumber,
  error,
  onConfirm,
  onCancel,
  isEnding,
}) {
  // Prefilled from the game, so a night named in the schedule form before it
  // started arrives already filled in.
  const [name, setName] = useState(game?.name || '')
  const [summary, setSummary] = useState(game?.summary || '')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')

  // Date and time are one value: both, or neither. A name for the next game
  // with no date is fine — a GM can know what is next before knowing when.
  const hasWholeDate = Boolean(date) && Boolean(time)
  const hasHalfDate = Boolean(date) !== Boolean(time)

  const end = () => onConfirm({
    name: name.trim() || null,
    summary: summary.trim() || null,
    // `new Date` on a `YYYY-MM-DDTHH:mm` string reads it in the browser's own
    // zone, which is exactly the instant the GM means. Every other player's
    // browser renders it back in theirs.
    nextScheduledAt: hasWholeDate ? new Date(`${date}T${time}`).toISOString() : null,
  })

  const fieldStyle = {
    backgroundColor: THEME.bgPrimary,
    borderColor: THEME.borderSubtle,
    color: THEME.textPrimary,
  }

  return (
    <Modal open={open} onClose={isEnding ? () => {} : onCancel} size="lg">
      <div className="p-8">
        <header className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <FontAwesomeIcon icon={faFlagCheckered} style={{ color: THEME.textSecondary }} />
            <h3
              className="text-2xl font-[family-name:var(--font-metamorphous)]"
              style={{ color: THEME.textOnDark }}
            >
              That&rsquo;s a wrap
            </h3>
          </div>
          <p className="text-sm" style={{ color: THEME.textSecondary }}>
            {/* The runtime knows the room, not the campaign, so the title is
                optional and the sentence works without it. */}
            Ending {campaignTitle ? <strong>{campaignTitle}</strong> : 'this campaign'}&rsquo;s game
            sends everyone back to their dashboard. All game state is saved ready to continue next game.
          </p>
        </header>

        {/* What happened */}
        <section className="mb-6">
          <h4
            className="text-xs font-semibold tracking-widest mb-3 pb-2 border-b"
            style={{ color: THEME.textSecondary, borderColor: THEME.borderSubtle }}
          >
            TONIGHT&rsquo;S GAME
          </h4>

          <label
            htmlFor="wrapup-name"
            className="block text-xs font-medium mb-1"
            style={{ color: THEME.textSecondary }}
          >
            What was it called?
          </label>
          <input
            id="wrapup-name"
            type="text"
            maxLength={100}
            value={name}
            disabled={isEnding}
            placeholder={gameNumber ? `Game ${gameNumber}` : 'Name this game'}
            onChange={(event) => setName(event.target.value)}
            className="w-full mb-4 px-3 py-2 rounded-sm border text-sm focus:outline-none focus:ring-2 disabled:opacity-50"
            style={fieldStyle}
          />

          <label
            htmlFor="wrapup-summary"
            className="block text-xs font-medium mb-1"
            style={{ color: THEME.textSecondary }}
          >
            What happened?
          </label>
          <textarea
            id="wrapup-summary"
            rows={5}
            value={summary}
            disabled={isEnding}
            placeholder="Summarise what happened so the party remember where we left off."
            onChange={(event) => setSummary(event.target.value)}
            className="w-full px-3 py-2 rounded-sm border text-sm resize-none focus:outline-none focus:ring-2 disabled:opacity-50"
            style={fieldStyle}
          />
        </section>

        {/* When the next one is */}
        <section className="mb-8">
          <h4
            className="text-xs font-semibold tracking-widest mb-3 pb-2 border-b flex items-center gap-2"
            style={{ color: THEME.textSecondary, borderColor: THEME.borderSubtle }}
          >
            <FontAwesomeIcon icon={faCalendarDays} />
            THE NEXT GAME
          </h4>
          <p className="text-xs mb-3" style={{ color: THEME.textSecondary }}>
            Why not plan your next game session while everyone is here?
          </p>

          <div className="flex gap-3">
            <input
              type="date"
              value={date}
              min={dayjs().format(DATE_FORMAT)}
              disabled={isEnding}
              onChange={(event) => setDate(event.target.value)}
              aria-label="Date of the next game"
              className="flex-1 px-3 py-2 rounded-sm border text-sm focus:outline-none focus:ring-2 disabled:opacity-50"
              style={fieldStyle}
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
          {hasHalfDate && (
            <p className="text-xs mt-2" style={{ color: THEME.textSecondary }}>
              A date needs a time, and a time needs a date — fill both, or leave both empty.
            </p>
          )}
        </section>

        {/* A refused or failed end is shown here rather than swallowed: the
            GM pressed the button and is watching this dialog, so this is where
            they will look. */}
        {error && (
          <p className="text-sm mb-4 text-right text-feedback-error">{error}</p>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onCancel} disabled={isEnding}>
            Cancel
          </Button>
          <button
            onClick={end}
            disabled={isEnding || hasHalfDate}
            className="px-5 py-2 rounded-sm border transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed bg-interactive-hover text-content-primary border-border-active"
          >
            {isEnding ? (
              <span className="flex items-center gap-2">
                <Spinner size="sm" />
                Ending...
              </span>
            ) : (
              'End Game'
            )}
          </button>
        </div>
      </div>
    </Modal>
  )
}
