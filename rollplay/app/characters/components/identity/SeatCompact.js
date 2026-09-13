/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { answerText } from './answerText'

/**
 * A text identity is already the seat card's title, so it adds nothing a second time.
 * A chosen class or set of roles is worth the one line.
 */
export default function SeatCompact({ configuration, value }) {
  if (configuration.input.kind === 'text') return null
  return <div className="text-[11px] text-content-muted truncate">{answerText(value)}</div>
}
