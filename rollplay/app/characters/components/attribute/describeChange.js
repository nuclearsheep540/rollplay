/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/** Must read identically to api-game's component_changed template. */
export default function describeChange(configuration, before, after) {
  return `${configuration.label}: ${before?.score ?? '—'} → ${after?.score ?? '—'}`
}
