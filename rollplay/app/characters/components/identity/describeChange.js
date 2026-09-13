/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { answerText } from './answerText'

export default function describeChange(configuration, before, after) {
  return `${configuration.label}: ${answerText(before)} → ${answerText(after)}`
}
