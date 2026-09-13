/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * One identity answer as a short string — the text, the choice, or the choices joined.
 * Mirrors api-game's render_value_for_log so the sheet and the log agree.
 */
export function answerText(value) {
  const answer = value?.answer
  if (!answer) return '—'
  if (answer.kind === 'text') return answer.text || '—'
  if (answer.kind === 'single_select') return answer.choice || '—'
  return answer.choices?.length ? answer.choices.join(', ') : '—'
}
