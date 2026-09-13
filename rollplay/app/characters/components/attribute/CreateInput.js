/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { FieldHeader, Stepper } from '../shared/Fields'

export default function CreateInput({ configuration, value, onChange, readOnly = false }) {
  // The range and nothing else. The default is already what the box starts at, and saying
  // so again only tells the player what they are looking at.
  const hint = `${configuration.minimum} to ${configuration.maximum}`

  return (
    <div className="rounded-xl border border-[#E5DECF] bg-[#FBF7EF] px-4 py-3.5">
      <FieldHeader label={configuration.label} hint={hint} description={configuration.description} />
      <Stepper
        ariaLabel={configuration.label}
        value={value?.score}
        min={configuration.minimum}
        max={configuration.maximum}
        disabled={readOnly}
        onChange={(score) => onChange({ ...value, score })}
      />
    </div>
  )
}
