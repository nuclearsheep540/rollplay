/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import PlateButton from '@/app/dashboard/components/home/PlateButton'
import { useAuthenticated } from '@/app/shared/providers/AuthenticatedContext'
import { useCharacterConfigState } from '@/app/campaign_builder/hooks/useCharacterConfig'
import { flatComponents, initialValueFor, isIdentityPopulated } from './registry'
import { CharacterFormFields, CharacterFormFrame, CharacterFormHero } from './CharacterFormParts'
import { useCreateCharacter, useSession } from '../hooks/useCharacterMutations'
import { useAssets } from '@/app/asset_library/hooks/useAssets'
import AvatarPlate from './AvatarPlate'
import FocalAreaModal from '@/app/shared/components/FocalAreaModal'
import { useFocalAreaFlow } from '@/app/shared/hooks/useFocalAreaFlow'
import CharacterAvatarPickerModal from '@/app/(authenticated)/character/components/CharacterAvatarPickerModal'

/**
 * The player's form, rendered from the config the GM published.
 *
 * Field order is the GM's, not the platform's — they arranged it, and the order carries
 * meaning they intended. So are the sections: a group in the config is a named section
 * here, and a bare component stands on its own. The one thing the form adds is layout —
 * attributes that sit together tile into a grid, because a column of identical number
 * boxes is harder to read than a block of them.
 */
export default function CharacterCreateForm({ sessionId }) {
  const router = useRouter()
  const { showToast, user } = useAuthenticated()

  const session = useSession(sessionId)
  const campaignId = session.data?.campaign_id
  const configState = useCharacterConfigState(campaignId)
  const createCharacter = useCreateCharacter()

  const config = configState.data?.latest
  const [values, setValues] = useState({})
  // Per-component messages from the last submit — "<label> is required" — cleared for a
  // component the moment its value changes, so the red goes away as the player fixes it.
  const [errors, setErrors] = useState({})

  // The avatar, chosen before the character exists: held as an asset id and sent with the
  // create. The picker is the old wizard's — library or upload, one modal — and the pane
  // previews the pick, falling back to the placeholder portrait until there is one.
  const [avatarAssetId, setAvatarAssetId] = useState(null)
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false)
  const { data: libraryImages = [] } = useAssets({ assetType: 'image', enabled: !!user?.id })
  const avatarAsset = avatarAssetId ? libraryImages.find((asset) => asset.id === avatarAssetId) || null : null

  // The workshop's chain, unchanged: picking an image always prompts the token face select
  // (pre-filled when the image already has one), and the pick applies when the crop is
  // saved. The square lives on the image asset under the "token" purpose, so every token
  // built from this portrait shares it — which is why a cancel keeps the previous avatar.
  const cropFlow = useFocalAreaFlow({
    onCropSaved: ({ imageAssetId }) => setAvatarAssetId(imageAssetId),
  })

  useEffect(() => {
    if (!config) return
    setValues((existing) => {
      if (Object.keys(existing).length) return existing
      const seeded = {}
      for (const configuration of flatComponents(config.components)) {
        seeded[configuration.id] = initialValueFor(configuration)
      }
      return seeded
    })
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
          <PlateButton variant="light" onClick={() => router.push('/character/new')}>Pick another table</PlateButton>
        </div>
      </div>
    )
  }

  const setValue = (componentId, next) => {
    setValues((existing) => ({ ...existing, [componentId]: next }))
    setErrors((existing) => {
      if (!existing[componentId]) return existing
      const { [componentId]: _cleared, ...rest } = existing
      return rest
    })
  }

  const submit = async () => {
    // The same completeness rule the backend applies, checked here first so the answer is
    // on the field rather than in a toast after a round trip. Only what the config marks
    // required can be missing; an identity is populated by non-blank text or a choice.
    const missing = {}
    for (const configuration of flatComponents(config.components)) {
      if (!configuration.required) continue
      const value = values[configuration.id]
      const populated = configuration.type === 'identity' ? isIdentityPopulated(value) : value !== undefined
      if (!populated) missing[configuration.id] = `${configuration.label} is required`
    }
    if (Object.keys(missing).length > 0) {
      setErrors(missing)
      return
    }

    // An unanswered optional identity is left out rather than sent empty — the config
    // decides what is required, and a blank is not an answer.
    const payload = {}
    for (const configuration of flatComponents(config.components)) {
      const value = values[configuration.id]
      if (!value) continue
      if (configuration.type === 'identity' && !configuration.required && !isIdentityPopulated(value)) continue
      payload[configuration.id] = value
    }

    try {
      const character = await createCharacter.mutateAsync({ sessionId, values: payload, avatarAssetId })
      showToast(`Joined the party at ${session.data?.campaign_name || 'the table'}`, 'success')
      router.push(`/character/${character.id}`)
    } catch (error) {
      showToast(error.message, 'error')
    }
  }

  return (
    <CharacterFormFrame>
      <CharacterFormHero
        campaignName={session.data?.campaign_name}
        version={`v${config.version}`}
        hostName={session.data?.host_name}
      />

      {/* The portrait: a plate under the title, the placeholder until one is chosen. Click
          it to pick from the library or upload — the same modal the old wizard used. */}
      <AvatarPlate
        className="h-[220px] mx-4"
        avatarUrl={avatarAsset?.s3_url || null}
        avatarAssetId={avatarAssetId}
        focalArea={avatarAsset?.focal_areas?.token || null}
        onOpenPicker={() => setAvatarPickerOpen(true)}
        onAdjustCrop={() => cropFlow.begin(avatarAssetId)}
      />
      <CharacterAvatarPickerModal
        open={avatarPickerOpen}
        onClose={() => setAvatarPickerOpen(false)}
        onSelect={(assetId) => cropFlow.begin(assetId)}
      />
      {cropFlow.isOpen && <FocalAreaModal {...cropFlow.modalProps} title="Frame the token's face" />}

      <CharacterFormFields config={config} values={values} errors={errors} onChange={setValue}>
        <div className="flex items-center justify-between gap-4 pt-1.5">
          <div className="max-w-[68ch] text-[12.5px] text-content-muted">
            Nothing here is checked against a rulebook. Your table decides what is fair.
          </div>
          <PlateButton variant="gold" onClick={submit} disabled={createCharacter.isPending}>
            {createCharacter.isPending ? 'Joining…' : 'Join the party'}
          </PlateButton>
        </div>
      </CharacterFormFields>
    </CharacterFormFrame>
  )
}
