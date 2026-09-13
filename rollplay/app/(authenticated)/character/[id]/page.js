/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

import Spinner from '@/app/shared/components/Spinner'
import PlateButton from '@/app/dashboard/components/home/PlateButton'
import CharacterValueList from '@/app/characters/components/CharacterValueList'
import {
  useCharacter,
  useDeleteCharacter,
  useEjectCharacter,
  useSetCharacterAlive,
  useUpdateCharacterComponent,
} from '@/app/characters/hooks/useCharacterMutations'
import { useAuthenticated } from '@/app/shared/providers/AuthenticatedContext'
import { SKEW_BOX, SKEW_LABEL } from '@/app/styles/plateGeometry'

import CharacterAvatarPane from '../components/CharacterAvatarPane'
import CharacterAvatarPickerModal from '../components/CharacterAvatarPickerModal'
import { useSetCharacterAvatar } from '../hooks/useSetCharacterAvatar'
import FocalAreaModal from '@/app/shared/components/FocalAreaModal'
import { useFocalAreaFlow } from '@/app/shared/hooks/useFocalAreaFlow'
import { useQueryClient } from '@tanstack/react-query'

/**
 * THE character view — every entry point lands here, and it renders whatever the
 * character's own config snapshot says it is. That snapshot is embedded, so a keepsake
 * whose campaign is gone renders exactly as it did the day it left the table.
 */
export default function CharacterDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id
  const { showToast, user } = useAuthenticated()

  const { data: character, isLoading, isError, error } = useCharacter(id)
  const updateComponent = useUpdateCharacterComponent(id)
  const setAlive = useSetCharacterAlive(id)
  const ejectCharacter = useEjectCharacter()
  const deleteCharacter = useDeleteCharacter()
  const setAvatar = useSetCharacterAvatar(id)
  const queryClient = useQueryClient()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false)

  // Pick -> frame the token face -> apply, the workshop's chain. Saving the crop lands on
  // the image asset; the character then re-reads its avatar_focal_area from it, so the
  // character queries are invalidated too. Adjusting the crop on the current portrait
  // takes the same door without changing which image it is.
  const cropFlow = useFocalAreaFlow({
    onCropSaved: async ({ imageAssetId }) => {
      if (imageAssetId !== character?.avatar_asset_id) {
        await setAvatar.mutateAsync(imageAssetId)
      }
      queryClient.invalidateQueries({ queryKey: ['character', id] })
      queryClient.invalidateQueries({ queryKey: ['characters'] })
    },
  })

  if (isLoading) {
    return <div className="flex items-center justify-center py-24"><Spinner /></div>
  }
  if (isError || !character) {
    return (
      <div className="max-w-[560px] mx-auto px-10 py-16 text-center">
        <h1 className="font-[family-name:var(--font-metamorphous)] text-[24px] text-content-primary">Character not found</h1>
        <p className="mt-3 text-[13.5px] text-content-muted">{error?.message || 'It may have been deleted.'}</p>
      </div>
    )
  }

  const isOwner = character.user_id === user?.id
  const atATable = !!character.session_id

  const onValueChange = async (value) => {
    try {
      await updateComponent.mutateAsync(value)
    } catch (failure) {
      showToast(failure.message, 'error')
    }
  }

  const onEject = async () => {
    try {
      await ejectCharacter.mutateAsync(id)
      showToast('Left the table. This character is yours to keep.', 'success')
    } catch (failure) {
      showToast(failure.message, 'error')
    }
  }

  // The two-column shell the character view has always had: the portrait as a full-height
  // wedge on the left at a third of the viewport, the sheet scrolling on the right — on the
  // site's light page, like every other authenticated surface.
  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      <div className="shrink-0" style={{ width: '33vw' }}>
        <CharacterAvatarPane
          avatarUrl={character.avatar_url}
          avatarAssetId={character.avatar_asset_id}
          focalArea={character.avatar_focal_area}
          isBusy={setAvatar.isPending}
          readOnly={!isOwner}
          onOpenPicker={() => setAvatarPickerOpen(true)}
          onAdjustCrop={character.avatar_asset_id ? () => cropFlow.begin(character.avatar_asset_id) : null}
        />
      </div>
      <CharacterAvatarPickerModal
        open={avatarPickerOpen}
        onClose={() => setAvatarPickerOpen(false)}
        onSelect={(assetId) => cropFlow.begin(assetId)}
      />
      {cropFlow.isOpen && <FocalAreaModal {...cropFlow.modalProps} title="Frame the token's face" />}

      <div className="flex-1 overflow-y-auto min-w-0">
        <div className="max-w-3xl pl-8 pr-6 py-8 flex flex-col gap-6">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-[family-name:var(--font-metamorphous)] text-[30px] text-content-primary">{character.display_name}</h1>
              {character.config_version_id && (
                <span className="inline-flex px-2 py-[2.5px] rounded bg-[#D9A441] text-[#241C08] text-[9.5px] font-bold tracking-[0.1em]" style={{ transform: SKEW_BOX }}>
                  <span className="inline-block" style={{ transform: SKEW_LABEL }}>v{character.config_snapshot?.version}</span>
                </span>
              )}
              {character.is_keepsake && (
                <span className="px-2 py-0.5 rounded-sm border border-[#B5ADA6] text-[10px] font-semibold uppercase tracking-[0.1em] text-content-muted">
                  Keepsake
                </span>
              )}
              {!character.is_alive && (
                <span className="px-2 py-0.5 rounded-sm border border-feedback-error text-[10px] font-semibold uppercase tracking-[0.1em] text-feedback-error">
                  Dead
                </span>
              )}
            </div>
            <div className="mt-1.5 text-[13px] text-content-muted">
              {character.is_keepsake
                ? "This character isn't at a table. It's yours to keep; it can't join a party."
                : character.campaign_title || 'At a table'}
            </div>
          </div>

          {character.latest_version && (
            <VersionDriftPanel
              builtOn={character.config_snapshot?.version}
              latest={character.latest_version}
              changes={character.version_changes}
            />
          )}

          <div className="rounded-md border border-border bg-surface-primary px-6 py-5">
            <CharacterValueList
              config={character.config_snapshot}
              values={character.values}
              editable={isOwner && !updateComponent.isPending}
              pendingIds={new Set(updateComponent.isPending ? [updateComponent.variables?.component_id] : [])}
              onChange={onValueChange}
            />
          </div>

          {isOwner && (
            <div className="flex items-center gap-3 flex-wrap">
              <PlateButton
                variant="light"
                size="sm"
                onClick={() => setAlive.mutate(!character.is_alive)}
                disabled={setAlive.isPending}
              >
                {character.is_alive ? 'Mark dead' : 'Mark alive'}
              </PlateButton>
              {atATable && (
                <PlateButton variant="light" size="sm" onClick={onEject} disabled={ejectCharacter.isPending}>
                  {ejectCharacter.isPending ? 'Leaving…' : 'Leave the table'}
                </PlateButton>
              )}
              {confirmingDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-[12.5px] text-content-muted">Delete for good?</span>
                  <PlateButton
                    variant="danger"
                    size="sm"
                    onClick={async () => {
                      try {
                        await deleteCharacter.mutateAsync(id)
                        router.push('/dashboard?tab=characters')
                      } catch (failure) {
                        showToast(failure.message, 'error')
                        setConfirmingDelete(false)
                      }
                    }}
                  >
                    Delete
                  </PlateButton>
                  <PlateButton variant="light" size="sm" onClick={() => setConfirmingDelete(false)}>Cancel</PlateButton>
                </div>
              ) : (
                <PlateButton variant="light" size="sm" onClick={() => setConfirmingDelete(true)}>Delete</PlateButton>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * What the campaign changed since this character was built. Information, never a
 * verdict: the character keeps playing on the version it was built against, and
 * nothing here asks anyone to do anything about it.
 */
function VersionDriftPanel({ builtOn, latest, changes }) {
  return (
    <div className="rounded-md border border-[#E5DECF] bg-[#FBF7EF] px-5 py-4">
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#9A7526]">
        Built on v{builtOn} · v{latest} is now published
      </div>
      <ul className="mt-2 flex flex-col gap-1">
        {changes.map((change) => (
          <li key={`${change.component_id}-${change.kind}`} className="text-[12.5px] text-[#37322F]">
            <span className="font-semibold">{change.label}</span> — {change.kind}
            {change.fields?.length ? ` (${change.fields.join(', ')})` : ''}
          </li>
        ))}
      </ul>
      <div className="mt-2 text-[12px] text-content-muted">
        This character still plays on v{builtOn}. Differences do not block you from playing but your character might not be compatible to save data.
      </div>
    </div>
  )
}
