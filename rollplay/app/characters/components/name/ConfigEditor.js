/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { NumberField, CheckboxField } from '../shared/Fields'

/** The GM's parameters for a Name component. */
export default function ConfigEditor({ configuration, onChange }) {
  return (
    <div className="grid grid-cols-[200px_140px] gap-4 items-end">
      <NumberField
        label="Maximum length"
        value={configuration.max_length}
        min={1}
        max={200}
        onChange={(max_length) => onChange({ ...configuration, max_length })}
      />
      <CheckboxField
        label="Required"
        checked={configuration.required}
        onChange={(required) => onChange({ ...configuration, required })}
      />
    </div>
  )
}
