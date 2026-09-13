/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { NumberField } from '../shared/Fields'

export default function ConfigEditor({ configuration, onChange }) {
  return (
    <div className="grid grid-cols-[repeat(3,140px)] gap-4 items-end">
      <NumberField
        label="Minimum"
        value={configuration.minimum}
        onChange={(minimum) => onChange({ ...configuration, minimum })}
      />
      <NumberField
        label="Maximum"
        value={configuration.maximum}
        onChange={(maximum) => onChange({ ...configuration, maximum })}
      />
      <NumberField
        label="Default"
        value={configuration.default}
        allowEmpty
        onChange={(value) => onChange({ ...configuration, default: value })}
      />
    </div>
  )
}
