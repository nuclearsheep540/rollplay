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
import { useUploadCharacterAvatar } from '../hooks/useUploadCharacterAvatar'
import { THEME, COLORS } from '@/app/styles/colorTheme'

import WizardChrome from './wizard/WizardChrome'
import EditionStep from './wizard/EditionStep'
import IdentityStep from './wizard/IdentityStep'
import ClassStep from './wizard/ClassStep'
import BackgroundStep from './wizard/BackgroundStep'
import AbilityScoresStep from './wizard/AbilityScoresStep'
import ReviewStep from './wizard/ReviewStep'

const STEPS = [
  { id: 'edition', label: 'Edition' },
  { id: 'identity', label: 'Identity' },
  { id: 'class', label: 'Class' },
  { id: 'background', label: 'Background' },
  { id: 'ability_scores', label: 'Ability Scores' },
  { id: 'review', label: 'Review' },
]

/**
 * Resume the wizard on whatever step the server thinks the draft is at,
 * falling back to the first incomplete step. Closing the tab and coming back
 * should land the user where they left off.
 */
function deriveInitialStep(draft) {
  if (!draft) return 'edition'
  if (!draft.is_draft) return 'review'
  const fromServer = draft.creation_step
  if (fromServer) {
    // Map server-side step (after the LAST completed step) to the next-to-show.
    const after = STEPS.findIndex((s) => s.id === fromServer)
    if (after >= 0 && after < STEPS.length - 1) return STEPS[after + 1].id
  }
  // Server-side step may be null on a brand-new draft.
  if (!draft.species_code) return 'identity'
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
  const uploadAvatar = useUploadCharacterAvatar(draft?.id ?? draftIdFromUrl)

  const [currentStep, setCurrentStep] = useState('edition')
  const [saveState, setSaveState] = useState('idle') // 'idle' | 'saving' | 'saved' | 'error'
  const [avatarError, setAvatarError] = useState(null)

  // Sync wizard step with the server's view of the draft on load / reload.
  useEffect(() => {
    if (draftIdFromUrl && draft) {
      setCurrentStep(deriveInitialStep(draft))
    } else if (!draftIdFromUrl) {
      setCurrentStep('edition')
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

  const handleEditionPicked = async ({ editionCode, name }) => {
    // First "next" creates the draft on the server, putting an id in the URL.
    const created = await createDraft.mutateAsync({ editionCode, name })
    setSaveState('saved')
    const params = new URLSearchParams({ id: created.id })
    if (returnCampaignId) params.set('return_campaign', returnCampaignId)
    router.replace(`/character/create?${params.toString()}`)
    setCurrentStep('identity')
  }

  /**
   * Avatar can be uploaded at any time — even before the player has clicked
   * Start on the Edition step. If no draft exists yet we silently auto-create
   * one with placeholder defaults (the player can rename on Edition / Identity
   * later), then upload the file. From the user's POV: pick file → done.
   */
  const handleAvatarFileChosen = async (file) => {
    setAvatarError(null)
    try {
      // Lazily ensure a draft. ``draft`` (from the query cache) is the source
      // of truth — ``draftIdFromUrl`` may lag for a render cycle right after
      // create. Either way, once this resolves we have a real character id.
      let activeDraft = draft
      if (!activeDraft) {
        const editionCode = editions?.[0]?.code ?? 'srd_5_2_1'
        activeDraft = await createDraft.mutateAsync({
          editionCode,
          name: 'Unnamed character',
        })
        const params = new URLSearchParams({ id: activeDraft.id })
        if (returnCampaignId) params.set('return_campaign', returnCampaignId)
        router.replace(`/character/create?${params.toString()}`)
      }
      // Hook is bound to draft?.id at render time; if we just auto-created the
      // draft, the hook is still bound to undefined this render. Call the
      // mutation function directly with the fresh id by re-running through the
      // characterId-scoped path. Easiest is to do the same 3 HTTP calls inline.
      await uploadDirectly(activeDraft.id, file)
    } catch (err) {
      setAvatarError(err.message || 'Avatar upload failed')
    }
  }

  // Direct-call avatar upload that doesn't rely on the React-bound hook's
  // closure over characterId — used when the draft was created on this same
  // event so we have its id but the hook hasn't re-rendered yet.
  const uploadDirectly = async (characterId, file) => {
    // Reuses the same 3-step contract the hook follows. authFetch is on the
    // window via the shared util used everywhere; we go through fetch wrappers
    // for parity with the rest of the app.
    const { authFetch } = await import('@/app/shared/utils/authFetch')
    const qs = new URLSearchParams({
      filename: file.name,
      content_type: file.type || 'application/octet-stream',
    })
    const urlRes = await authFetch(
      `/api/characters/${characterId}/avatar/upload-url?${qs}`,
      { credentials: 'include' },
    )
    const urlBody = await urlRes.json().catch(() => ({}))
    if (!urlRes.ok) {
      throw new Error(urlBody?.detail || 'Could not get upload URL')
    }
    const { upload_url, key } = urlBody

    const putRes = await fetch(upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    })
    if (!putRes.ok) {
      throw new Error(`Upload to S3 failed (${putRes.status})`)
    }

    const confirmRes = await authFetch(
      `/api/characters/${characterId}/avatar/confirm`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      },
    )
    const confirmBody = await confirmRes.json().catch(() => ({}))
    if (!confirmRes.ok) {
      throw new Error(confirmBody?.detail || 'Confirm step failed')
    }
    // Force a re-fetch so derived response (incl. presigned avatar_url) lands.
    await draftQuery.refetch()
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

  // While the redirect-after-finalize effect runs, render nothing — the next
  // tick will replace this view with the read-only sheet.
  if (draft && !draft.is_draft) {
    return null
  }

  return (
    <WizardChrome
      steps={STEPS}
      currentStep={currentStep}
      onJumpStep={(id) => draft && setCurrentStep(id)}
      saveState={saveState}
      draftId={draft?.id}
      avatarUrl={draft?.avatar_url}
      avatarIsUploading={createDraft.isPending || uploadAvatar.isPending}
      avatarError={avatarError}
      onAvatarFileChosen={handleAvatarFileChosen}
    >
      {currentStep === 'edition' && (
        <EditionStep
          editions={editions ?? []}
          initialName={draft?.character_name ?? ''}
          initialEditionCode={draft?.edition_code}
          isCreating={createDraft.isPending}
          onSubmit={handleEditionPicked}
        />
      )}

      {currentStep === 'identity' && draft && (
        <IdentityStep
          draft={draft}
          onSave={(payload) => persistStep('identity', payload)}
          onBack={handleBack}
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
  )
}
