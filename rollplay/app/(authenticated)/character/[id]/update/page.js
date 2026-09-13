/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

import Spinner from '@/app/shared/components/Spinner'
import PlateButton from '@/app/dashboard/components/home/PlateButton'
import { CharacterFormFields, CharacterFormFrame } from '@/app/characters/components/CharacterFormParts'
import { flatComponents, isIdentityPopulated } from '@/app/characters/components/registry'
import { useAdoptVersion, useCharacter, useUpgradePreview } from '@/app/characters/hooks/useCharacterMutations'
import { useAuthenticated } from '@/app/shared/providers/AuthenticatedContext'
import { SKEW_BOX, SKEW_LABEL } from '@/app/styles/plateGeometry'

/**
 * Updating a character to the campaign's latest config version: A on the left as it is,
 * B on the right as it would be — only the components the move touches, because a
 * character can be long and what did not change is not a decision. Everything the
 * server carried over unchanged is still sent on confirm; it is just not shown.
 * Nothing changes until the player confirms.
 */

/**
 * The config's entries reduced to the given component ids, groups kept around the
 * members that survive and dropped when none do.
 */
function onlyEntries(entries, ids) {
  const kept = []
  for (const entry of entries) {
    if (entry.type === 'group') {
      const members = entry.components.filter((component) => ids.has(component.id))
      if (members.length > 0) kept.push({ ...entry, components: members })
    } else if (ids.has(entry.id)) {
      kept.push(entry)
    }
  }
  return kept
}

/** A change that only moved the component is not a difference in the value. */
const touchesValue = (change) => change.kind !== 'changed' || change.fields.some((field) => field !== 'position')
export default function CharacterUpdatePage() {
  const router = useRouter()
  const { id } = useParams()
  const { showToast, user } = useAuthenticated()

  const { data: character, isLoading: characterLoading } = useCharacter(id)
  const preview = useUpgradePreview(id)
  const adopt = useAdoptVersion(id)

  const [values, setValues] = useState(null)
  const [errors, setErrors] = useState({})
  const [confirmed, setConfirmed] = useState(false)

  // The reviewed values start as the server's proposal, then are the player's.
  useEffect(() => {
    if (preview.data && values === null) setValues(preview.data.values)
  }, [preview.data, values])

  if (characterLoading || preview.isLoading || values === null) {
    if (preview.isError) {
      return (
        <div className="max-w-[560px] mx-auto px-10 py-16 text-center">
          <h1 className="font-[family-name:var(--font-metamorphous)] text-[24px] text-content-primary">Nothing to update</h1>
          <p className="mt-3 text-[13.5px] text-content-muted">{preview.error?.message}</p>
          <div className="mt-6">
            <PlateButton variant="light" onClick={() => router.push(`/character/${id}`)}>Back to the character</PlateButton>
          </div>
        </div>
      )
    }
    return <div className="flex items-center justify-center py-24"><Spinner /></div>
  }

  if (!character || character.user_id !== user?.id) {
    return (
      <div className="max-w-[560px] mx-auto px-10 py-16 text-center">
        <h1 className="font-[family-name:var(--font-metamorphous)] text-[24px] text-content-primary">Not your character</h1>
      </div>
    )
  }

  const target = preview.data
  const labelFor = (componentId) =>
    flatComponents(target.config.components).find((component) => component.id === componentId)?.label ||
    flatComponents(character.config_snapshot.components).find((component) => component.id === componentId)?.label ||
    componentId

  const setValue = (componentId, next) => {
    setValues((existing) => ({ ...existing, [componentId]: next }))
    setErrors((existing) => {
      if (!existing[componentId]) return existing
      const { [componentId]: _cleared, ...rest } = existing
      return rest
    })
  }

  const confirm = async () => {
    // The create form's completeness rule, on the new config.
    const missing = {}
    for (const configuration of flatComponents(target.config.components)) {
      if (!configuration.required) continue
      const value = values[configuration.id]
      const populated = configuration.type === 'identity' ? isIdentityPopulated(value) : value !== undefined
      if (!populated) missing[configuration.id] = `${configuration.label} is required`
    }
    if (Object.keys(missing).length > 0) {
      setErrors(missing)
      return
    }
    const payload = {}
    for (const configuration of flatComponents(target.config.components)) {
      const value = values[configuration.id]
      if (!value) continue
      if (configuration.type === 'identity' && !configuration.required && !isIdentityPopulated(value)) continue
      payload[configuration.id] = value
    }
    try {
      setConfirmed(true)
      await adopt.mutateAsync(payload)
      showToast(`Updated to v${target.latest_version}`, 'success')
      router.push(`/character/${id}`)
    } catch (failure) {
      setConfirmed(false)
      showToast(failure.message, 'error')
    }
  }

  const busy = adopt.isPending || confirmed

  // What the comparison shows: on the old side, components that are gone or changed; on
  // the new side, components that are new, changed or reset. Renames and moves are in the
  // summary, not the comparison — the value is the same.
  const touched = new Set(target.changes.filter(touchesValue).map((change) => change.component_id))
  for (const componentId of [...target.reset, ...target.added, ...target.dropped]) touched.add(componentId)
  const before = { ...character.config_snapshot, components: onlyEntries(character.config_snapshot.components, touched) }
  const after = { ...target.config, components: onlyEntries(target.config.components, touched) }
  const beforeCount = flatComponents(before.components).length
  const afterCount = flatComponents(after.components).length

  return (
    <CharacterFormFrame>
      <div>
        <div className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#9A7526]">Update character</div>
        <h1 className="mt-1 font-[family-name:var(--font-metamorphous)] text-[30px] text-content-primary">
          {character.display_name}
        </h1>
        <div className="mt-1.5 max-w-[68ch] text-[13px] text-content-muted">
          Built on v{character.config_snapshot.version}; the campaign is on v{target.latest_version}. Nothing changes until you confirm. If you have any concerns, contact your GM.
        </div>
      </div>

      <ChangeSummary preview={target} labelFor={labelFor} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <section>
          <ColumnHeading version={character.config_snapshot.version} caption="As it is now" />
          {beforeCount > 0 ? (
            <CharacterFormFields config={before} values={character.values} errors={{}} onChange={() => {}} readOnly />
          ) : (
            <div className="rounded-md border border-[#E5DECF] bg-white px-7 py-6 text-[12.5px] text-content-muted">
              Nothing here changes.
            </div>
          )}
        </section>
        <section>
          <ColumnHeading version={target.latest_version} caption="As it will be" gold />
          {afterCount === 0 && (
            <div className="mb-4 text-[12.5px] text-content-muted">Nothing to fill in — confirm to move to v{target.latest_version}.</div>
          )}
          <CharacterFormFields config={after} values={values} errors={errors} onChange={setValue} />
        </section>
      </div>

      {/* The decision, on its own: neither column owns it. */}
      <div className="rounded-md border border-[#E5DECF] bg-white px-7 py-5 flex items-center justify-between gap-4">
        <div className="max-w-[68ch] text-[12.5px] text-content-muted">
          Confirming moves this character to v{target.latest_version}. Anything dropped above is gone for good.
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <PlateButton variant="light" onClick={() => router.push(`/character/${id}`)} disabled={busy}>
            Cancel
          </PlateButton>
          <PlateButton variant="gold" onClick={confirm} disabled={busy}>
            {busy ? 'Updating…' : `Confirm update to v${target.latest_version}`}
          </PlateButton>
        </div>
      </div>
    </CharacterFormFrame>
  )
}

function ColumnHeading({ version, caption, gold = false }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span
        className={`inline-flex px-2 py-[2.5px] rounded text-[9.5px] font-bold tracking-[0.1em] ${
          gold ? 'bg-[#D9A441] text-[#241C08]' : 'bg-[#1F1F1F] text-[#F7F4F3]'
        }`}
        style={{ transform: SKEW_BOX }}
      >
        <span className="inline-block" style={{ transform: SKEW_LABEL }}>v{version}</span>
      </span>
      <span className="text-[12.5px] text-content-muted">{caption}</span>
    </div>
  )
}

/**
 * What the move does to the values, in the reconciliation's own terms — the lossy step
 * (dropped) first, so it cannot be missed.
 */
function ChangeSummary({ preview, labelFor }) {
  const lines = [
    preview.dropped.length > 0 && {
      key: 'dropped',
      tone: 'text-feedback-error',
      text: `Dropped — no longer in the config: ${preview.dropped.map(labelFor).join(', ')}`,
    },
    preview.reset.length > 0 && {
      key: 'reset',
      tone: 'text-[#9A7526]',
      text: `Reset — the field changed shape, so it starts over: ${preview.reset.map(labelFor).join(', ')}`,
    },
    preview.added.length > 0 && {
      key: 'added',
      tone: 'text-[#37322F]',
      text: `New — fill these in: ${preview.added.map(labelFor).join(', ')}`,
    },
  ].filter(Boolean)

  return (
    <div className="rounded-md border border-[#E5DECF] bg-[#FBF7EF] px-5 py-4">
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#9A7526]">
        What v{preview.latest_version} changes
      </div>
      <ul className="mt-2 flex flex-col gap-1">
        {preview.changes.map((change) => (
          <li key={`${change.component_id}-${change.kind}`} className="text-[12.5px] text-[#37322F]">
            <span className="font-semibold">{change.label}</span> — {change.kind}
            {change.fields?.length ? ` (${change.fields.join(', ')})` : ''}
          </li>
        ))}
      </ul>
      {lines.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 border-t border-[#E5DECF] pt-3">
          {lines.map((line) => (
            <li key={line.key} className={`text-[12.5px] ${line.tone}`}>{line.text}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
