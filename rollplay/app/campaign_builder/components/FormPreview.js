/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useEffect, useState } from 'react'

import PlateButton from '@/app/dashboard/components/home/PlateButton'
import AvatarPlate from '@/app/characters/components/AvatarPlate'
import { CharacterFormFields, CharacterFormFrame, CharacterFormHero } from '@/app/characters/components/CharacterFormParts'
import { flatComponents, initialValueFor } from '@/app/characters/components/registry'

/**
 * The player's form, as the working draft would render it.
 *
 * The same parts the real form is built from, fed the draft instead of a published
 * version — so what the GM sees here is what a player gets, not a sketch of it. The
 * inputs work, so the GM can feel the form, but nothing is submitted and nothing is
 * saved; values reset whenever the draft changes shape.
 */
export default function FormPreview({ config, campaignName, hostName }) {
  const [values, setValues] = useState({})

  // A fresh answer for every component each time the draft changes: a preview has no
  // character to keep answers for, and a value from a component that has since changed
  // kind would be the wrong shape.
  const shape = JSON.stringify(config.components)
  useEffect(() => {
    const seeded = {}
    for (const configuration of flatComponents(config.components)) {
      seeded[configuration.id] = initialValueFor(configuration)
    }
    setValues(seeded)
  }, [shape]) // eslint-disable-line react-hooks/exhaustive-deps

  const setValue = (componentId, next) => setValues((existing) => ({ ...existing, [componentId]: next }))

  if (flatComponents(config.components).length === 0) {
    return (
      <div className="max-w-[560px] mx-auto py-16 text-center">
        <div className="font-[family-name:var(--font-metamorphous)] text-[24px] text-content-primary">Nothing to preview yet</div>
        <p className="mt-3 text-[13.5px] text-content-muted">Add a component on the Components tab and it appears here as a player would see it.</p>
      </div>
    )
  }

  return (
    <CharacterFormFrame>
      <CharacterFormHero campaignName={campaignName} version="draft" hostName={hostName} />
      <AvatarPlate className="h-[220px] mx-4" avatarUrl={null} avatarAssetId={null} focalArea={null} readOnly />
      <CharacterFormFields config={config} values={values} errors={{}} onChange={setValue}>
        <div className="flex items-center justify-between gap-4 pt-1.5">
          <div className="text-[12.5px] text-content-muted">
            Nothing here is checked against a rulebook. Your table decides what is fair.
          </div>
          <PlateButton variant="gold" disabled title="Players join from their own table">
            Join the party
          </PlateButton>
        </div>
      </CharacterFormFields>
    </CharacterFormFrame>
  )
}
