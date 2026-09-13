/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * Must read identically to api-game's component_changed template, including how a weighted
 * step is named — a dict lookup on the config, never an interpretation.
 */
function render(configuration, value) {
  if (!value) return '—'
  if (configuration.rules.representation === 'int') return String(value.state?.current ?? '—')
  const weight = value.state?.current_weight
  const step = configuration.rules.scale.find((entry) => entry.weight === weight)
  return step ? step.label : String(weight)
}

export default function describeChange(configuration, before, after) {
  return `${configuration.label}: ${render(configuration, before)} → ${render(configuration, after)}`
}
