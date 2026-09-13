/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import PlateButton from '@/app/dashboard/components/home/PlateButton'
import { useAuthenticated } from '@/app/shared/providers/AuthenticatedContext'
import { platePolygon, SKEW_BOX, SKEW_LABEL, TEXT_SHADOW_ON_ART } from '@/app/styles/plateGeometry'
import { useCharacterConfigState } from '@/app/campaign_builder/hooks/useCharacterConfig'
import { initialValueFor, pieceFor } from './registry'
import { useCreateCharacter, useSession } from '../hooks/useCharacterMutations'

const HERO_GRADIENT =
  'radial-gradient(120% 90% at 78% 8%, #6B4A2E 0%, rgba(107,74,46,0) 34%), ' +
  'radial-gradient(90% 70% at 85% 30%, #24344F 0%, rgba(36,52,79,0) 55%), ' +
  'linear-gradient(115deg,#0A0D16 20%,#131B2E 55%,#0C1020 100%)'

/**
 * The player's form, rendered from the config the GM published.
 *
 * Field order is the GM's, not the platform's — they arranged it, and the order carries
 * meaning they intended. Attributes are the one exception: they group into a grid, because
 * a column of identical number boxes is harder to read than a block of them.
 */
export default function CharacterCreateForm({ sessionId }) {
  const router = useRouter()
  const { showToast } = useAuthenticated()

  const session = useSession(sessionId)
  const campaignId = session.data?.campaign_id
  const configState = useCharacterConfigState(campaignId)
  const createCharacter = useCreateCharacter()

  const config = configState.data?.latest
  const [values, setValues] = useState({})

  useEffect(() => {
    if (!config) return
    setValues((existing) => {
      if (Object.keys(existing).length) return existing
      const seeded = {}
      for (const configuration of config.components) {
        seeded[configuration.id] = initialValueFor(configuration)
      }
      return seeded
    })
  }, [config])

  const groups = useMemo(() => {
    if (!config) return []
    const result = []
    for (const configuration of config.components) {
      const last = result[result.length - 1]
      if (configuration.type === 'attribute' && last?.type === 'attribute') {
        last.items.push(configuration)
      } else {
        result.push({ type: configuration.type, items: [configuration] })
      }
    }
    return result
  }, [config])

  if (session.isLoading || configState.isLoading) {
    return <div className="px-10 py-12 text-sm text-content-muted">Loading the table…</div>
  }

  if (!config) {
    return (
      <div className="max-w-[560px] mx-auto px-10 py-16 text-center">
        <h1 className="font-[family-name:var(--font-metamorphous)] text-[24px] text-content-primary">Nothing published yet</h1>
        <p className="mt-3 text-[13.5px] text-content-muted">
          This campaign&apos;s GM hasn&apos;t published a character config, so there is nothing to build against.
        </p>
        <div className="mt-6">
          <PlateButton variant="outline" onClick={() => router.push('/character/new')}>Pick another table</PlateButton>
        </div>
      </div>
    )
  }

  const submit = async () => {
    // A blank optional name is left out rather than sent empty — the config decides what is
    // required, and an empty string is not an answer.
    const payload = {}
    for (const configuration of config.components) {
      const value = values[configuration.id]
      if (!value) continue
      if (configuration.type === 'name' && !configuration.required && !value.text?.trim()) continue
      payload[configuration.id] = value
    }

    try {
      const character = await createCharacter.mutateAsync({ sessionId, values: payload })
      showToast(`Joined the party at ${session.data?.campaign_title || 'the table'}`, 'success')
      router.push(`/character/${character.id}`)
    } catch (error) {
      showToast(error.message, 'error')
    }
  }

  return (
    <div className="max-w-[760px] mx-auto px-10 py-10 flex flex-col gap-6">
      <div className="relative overflow-hidden rounded-md px-10 py-8 flex flex-col gap-2.5" style={{ background: HERO_GRADIENT, clipPath: platePolygon() }}>
        <div className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#D9A441]">Join the party</div>
        <div className="font-[family-name:var(--font-metamorphous)] text-[36px] leading-tight text-[#F7F4F3]" style={{ textShadow: TEXT_SHADOW_ON_ART }}>
          {session.data?.campaign_title || 'This campaign'}
        </div>
        <div className="flex items-center gap-2.5 text-[13.5px] text-[#CFC9C2]">
          <span>Built against</span>
          <span className="inline-flex px-2 py-[2.5px] rounded bg-[#D9A441] text-[#241C08] text-[9.5px] font-bold tracking-[0.1em]" style={{ transform: SKEW_BOX }}>
            <span className="inline-block" style={{ transform: SKEW_LABEL }}>v{config.version}</span>
          </span>
          <span>run by {session.data?.host_name || 'your GM'}</span>
        </div>
      </div>

      <div className="rounded-md border border-[#E5DECF] bg-white px-7 py-6 flex flex-col gap-[22px]">
        {groups.map((group, index) => {
          if (group.type === 'attribute' && group.items.length > 1) {
            return (
              <div key={`group-${index}`}>
                <div className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#9A7526] mb-3">
                  Attributes
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {group.items.map((configuration) => {
                    const CreateInput = pieceFor(configuration.type, 'CreateInput')
                    return (
                      <CreateInput
                        key={configuration.id}
                        configuration={configuration}
                        value={values[configuration.id]}
                        onChange={(next) => setValues((existing) => ({ ...existing, [configuration.id]: next }))}
                      />
                    )
                  })}
                </div>
              </div>
            )
          }
          return group.items.map((configuration) => {
            const CreateInput = pieceFor(configuration.type, 'CreateInput')
            return (
              <CreateInput
                key={configuration.id}
                configuration={configuration}
                value={values[configuration.id]}
                onChange={(next) => setValues((existing) => ({ ...existing, [configuration.id]: next }))}
              />
            )
          })
        })}

        <div className="flex items-center justify-between gap-4 pt-1.5">
          <div className="text-[12.5px] text-content-muted">
            Nothing here is checked against a rulebook. Your table decides what is fair.
          </div>
          <PlateButton variant="gold" onClick={submit} disabled={createCharacter.isPending}>
            {createCharacter.isPending ? 'Joining…' : 'Join the party'}
          </PlateButton>
        </div>
      </div>
    </div>
  )
}
