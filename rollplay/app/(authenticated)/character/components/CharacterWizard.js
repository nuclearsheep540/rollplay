/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import {
  useCharacterDraft,
  useCreateDraft,
  useFinalizeDraft,
  useUpdateDraft,
} from '../hooks/useCharacterDraft'
import { useEditions } from '../hooks/useReferenceData'
import { useSetCharacterAvatar } from '../hooks/useSetCharacterAvatar'
import { THEME, COLORS } from '@/app/styles/colorTheme'

import CharacterAvatarPickerModal from './CharacterAvatarPickerModal'
import WizardChrome from './wizard/WizardChrome'
import SpeciesStep from './wizard/SpeciesStep'
import ClassStep from './wizard/ClassStep'
import BackgroundStep from './wizard/BackgroundStep'
import AbilityScoresStep from './wizard/AbilityScoresStep'
import ReviewStep from './wizard/ReviewStep'

// Edition was dropped as a user-facing step — only one edition exists today,
// and the wizard auto-creates a draft against it on mount. Name lives in the
// persistent header (rename step), so 'species' is now the first step in
// the strip.
const STEPS = [
  { id: 'species', label: 'Species' },
  { id: 'class', label: 'Class' },
  { id: 'background', label: 'Background' },
  { id: 'ability_scores', label: 'Ability Scores' },
  { id: 'review', label: 'Review' },
]

// The backend's creation_step uses the legacy 'identity' name for what the
// wizard now labels 'Species'. Map both ways so server-stored progress
// resolves to the new step ids.
function normaliseServerStep(serverStep) {
  if (serverStep === 'identity') return 'species'
  return serverStep
}

/**
 * Resume the wizard on whatever step the server thinks the draft is at,
 * falling back to the first incomplete step.
 */
function deriveInitialStep(draft) {
  if (!draft) return 'species'
  if (!draft.is_draft) return 'review'
  const fromServer = normaliseServerStep(draft.creation_step)
  if (fromServer) {
    const after = STEPS.findIndex((s) => s.id === fromServer)
    if (after >= 0 && after < STEPS.length - 1) return STEPS[after + 1].id
  }
  // Server may have a null creation_step on a brand-new auto-created draft.
  if (!draft.species_code) return 'species'
  if (!draft.class_entries?.length) return 'class'
  if (!draft.background_code) return 'background'
  return 'ability_scores'
}

export default function CharacterWizard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const draftIdFromUrl = searchParams.get('id')
  const returnCampaignId = searchParams.get('return_campaign')

  const { data: editions, isLoading: editionsLoading } = useEditions()
  const draftQuery = useCharacterDraft(draftIdFromUrl)
  const draft = draftQuery.data

  const createDraft = useCreateDraft()
  const updateDraft = useUpdateDraft(draftIdFromUrl)
  const finalizeDraft = useFinalizeDraft(draftIdFromUrl)
  // ``draft?.id`` (not ``draftIdFromUrl``) so the hook re-binds the moment the
  // server hands back a freshly-created draft, even before the URL search-param
  // sync settles.
  const setAvatarMutation = useSetCharacterAvatar(draft?.id ?? draftIdFromUrl)

  const [currentStep, setCurrentStep] = useState('species')
  const [saveState, setSaveState] = useState('idle') // 'idle' | 'saving' | 'saved' | 'error'
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false)
  const [avatarError, setAvatarError] = useState(null)

  // Auto-create a draft the first time the wizard mounts with no ?id. Only
  // one edition exists today so we pick it without asking; the user can
  // rename via the persistent header. Once created, the URL gains ?id=… and
  // future renders use the existing draft.
  useEffect(() => {
    if (draftIdFromUrl) return
    if (createDraft.isPending) return
    const editionCode = editions?.[0]?.code
    if (!editionCode) return
    createDraft.mutate(
      { editionCode, name: 'Unnamed character' },
      {
        onSuccess: (created) => {
          const params = new URLSearchParams({ id: created.id })
          if (returnCampaignId) params.set('return_campaign', returnCampaignId)
          router.replace(`/character/create?${params.toString()}`)
        },
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftIdFromUrl, editions?.[0]?.code])

  // Sync wizard step with the server's view of the draft on load / reload.
  useEffect(() => {
    if (draftIdFromUrl && draft) {
      setCurrentStep(deriveInitialStep(draft))
    } else if (!draftIdFromUrl) {
      setCurrentStep('species')
    }
  }, [draftIdFromUrl, draft?.id])

  // Once a draft is finalised, redirect to the read-only sheet. Done in an
  // effect rather than during render so we don't trigger a router setState
  // from within another component's render phase.
  // Skip when `return_campaign` is set — handleFinalize routes back to the
  // dashboard drawer instead, and we don't want this effect to race ahead.
  useEffect(() => {
    if (draft && !draft.is_draft && !returnCampaignId) {
      router.replace(`/character/${draft.id}`)
    }
  }, [draft?.id, draft?.is_draft, returnCampaignId, router])

  // Wrap PATCH-style mutations with the autosave state machine. ``persistStep``
  // returns the server's fresh response (so callers can read derived fields).
  const persistStep = async (step, payload) => {
    setSaveState('saving')
    try {
      const body = { step, [step === 'class' ? 'class' : step]: payload }
      const fresh = await updateDraft.mutateAsync(body)
      setSaveState('saved')
      return fresh
    } catch (err) {
      setSaveState('error')
      throw err
    }
  }

  /**
   * Open the avatar picker. The mount-time effect above auto-creates a draft
   * before the user can click anything, but if the draft still isn't ready
   * (e.g. editions list hasn't loaded yet) we hold the click harmlessly.
   */
  const handleOpenAvatarPicker = () => {
    if (!draft) return
    setAvatarError(null)
    setAvatarPickerOpen(true)
  }

  /**
   * Persistent name header writes through the ``rename`` draft step — server
   * doesn't bump creation_step for renames so the resume pointer stays
   * pointing at the user's last real wizard step.
   */
  const handleRename = async (newName) => {
    const trimmed = (newName || '').trim()
    if (!trimmed || trimmed === draft?.character_name) return
    await persistStep('rename', { name: trimmed })
  }

  const handleAvatarAssetChosen = async (assetId) => {
    setAvatarError(null)
    // Read the current character id off either the cache-backed draft or the
    // URL — they converge within a tick of createDraft resolving.
    const characterId = draft?.id ?? draftIdFromUrl
    if (!characterId) {
      setAvatarError('Character not yet ready — try again in a moment')
      return
    }
    try {
      // ``mutateAsync`` re-binds via the hook's closure; if we just auto-created
      // the draft this same event the hook is still bound to undefined. PATCH
      // through authFetch directly so we can target the fresh id reliably.
      const { authFetch } = await import('@/app/shared/utils/authFetch')
      const res = await authFetch(`/api/characters/${characterId}/avatar`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_id: assetId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.detail || 'Failed to set avatar')
      await draftQuery.refetch()
    } catch (err) {
      setAvatarError(err.message || 'Failed to set avatar')
    }
  }

  const handleAdvance = (stepId) => () => setCurrentStep(stepId)
  const handleBack = () => {
    const idx = STEPS.findIndex((s) => s.id === currentStep)
    if (idx > 0) setCurrentStep(STEPS[idx - 1].id)
  }

  const handleFinalize = async () => {
    try {
      const finalised = await finalizeDraft.mutateAsync()
      if (returnCampaignId) {
        try {
          sessionStorage.setItem('openCharacterModalForCampaign', returnCampaignId)
        } catch (e) {
          // sessionStorage blocked — modal won't auto-reopen, but the user lands on the right drawer.
        }
        router.push(`/dashboard?tab=campaigns&expand_campaign_id=${returnCampaignId}`)
        return
      }
      router.push(`/character/${finalised.id}`)
    } catch (err) {
      // Errors surface inside ReviewStep via the mutation hook.
    }
  }

  // Pre-flight: editions must be loaded before the wizard can offer them.
  if (editionsLoading) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        style={{ color: THEME.textSecondary }}
      >
        Loading rulesets…
      </div>
    )
  }

  // Draft-bound: if the URL carries an id but the fetch hasn't landed yet, show a stub.
  if (draftIdFromUrl && draftQuery.isLoading) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        style={{ color: THEME.textSecondary }}
      >
        Resuming character…
      </div>
    )
  }

  // First visit (no URL id): the auto-create effect is firing in the
  // background. Show a stub until the new draft id lands in the URL,
  // otherwise we'd render the wizard with ``draft === undefined`` and step
  // components would crash on missing fields.
  if (!draftIdFromUrl) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        style={{ color: THEME.textSecondary }}
      >
        Setting up your character…
      </div>
    )
  }

  // While the redirect-after-finalize effect runs, render nothing — the next
  // tick will replace this view with the read-only sheet.
  if (draft && !draft.is_draft) {
    return null
  }

  return (
    <>
    <WizardChrome
      steps={STEPS}
      currentStep={currentStep}
      onJumpStep={(id) => draft && setCurrentStep(id)}
      saveState={saveState}
      draftId={draft?.id}
      characterName={draft?.character_name ?? ''}
      onRename={handleRename}
      avatarUrl={draft?.avatar_url}
      avatarIsBusy={createDraft.isPending || setAvatarMutation.isPending}
      avatarError={avatarError}
      onOpenAvatarPicker={handleOpenAvatarPicker}
    >
      {currentStep === 'species' && draft && (
        <SpeciesStep
          draft={draft}
          // Wire contract is still step='identity' — the backend handler
          // is unchanged; only the wizard's label moved to 'Species'.
          onSave={(payload) => persistStep('identity', payload)}
          // First step in the new lineup — Back has nowhere to go, so
          // pass null and StepFooter skips rendering it.
          onBack={null}
          onNext={handleAdvance('class')}
        />
      )}

      {currentStep === 'class' && draft && (
        <ClassStep
          draft={draft}
          onSave={(payload) => persistStep('class', payload)}
          onBack={handleBack}
          onNext={handleAdvance('background')}
        />
      )}

      {currentStep === 'background' && draft && (
        <BackgroundStep
          draft={draft}
          onSave={(payload) => persistStep('background', payload)}
          onBack={handleBack}
          onNext={handleAdvance('ability_scores')}
        />
      )}

      {currentStep === 'ability_scores' && draft && (
        <AbilityScoresStep
          draft={draft}
          onSave={(payload) => persistStep('ability_scores', payload)}
          onSaveHpAc={(payload) => persistStep('hp_ac', payload)}
          onBack={handleBack}
          onNext={handleAdvance('review')}
        />
      )}

      {currentStep === 'review' && draft && (
        <ReviewStep
          draft={draft}
          onBack={handleBack}
          onFinalize={handleFinalize}
          isFinalizing={finalizeDraft.isPending}
          error={finalizeDraft.error}
        />
      )}
    </WizardChrome>

    <CharacterAvatarPickerModal
      open={avatarPickerOpen}
      onClose={() => setAvatarPickerOpen(false)}
      onSelect={handleAvatarAssetChosen}
    />
    </>
  )
}
