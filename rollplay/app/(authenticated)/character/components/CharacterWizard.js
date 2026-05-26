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

  const { data: editions, isLoading: editionsLoading } = useEditions()
  const draftQuery = useCharacterDraft(draftIdFromUrl)
  const draft = draftQuery.data

  const createDraft = useCreateDraft()
  const updateDraft = useUpdateDraft(draftIdFromUrl)
  const finalizeDraft = useFinalizeDraft(draftIdFromUrl)

  const [currentStep, setCurrentStep] = useState('edition')
  const [saveState, setSaveState] = useState('idle') // 'idle' | 'saving' | 'saved' | 'error'

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
  useEffect(() => {
    if (draft && !draft.is_draft) {
      router.replace(`/character/${draft.id}`)
    }
  }, [draft?.id, draft?.is_draft, router])

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
    router.replace(`/character/create?id=${created.id}`)
    setCurrentStep('identity')
  }

  const handleAdvance = (stepId) => () => setCurrentStep(stepId)
  const handleBack = () => {
    const idx = STEPS.findIndex((s) => s.id === currentStep)
    if (idx > 0) setCurrentStep(STEPS[idx - 1].id)
  }

  const handleFinalize = async () => {
    try {
      const finalised = await finalizeDraft.mutateAsync()
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
