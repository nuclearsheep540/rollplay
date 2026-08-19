/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import {
  useCharacterDraft,
  useCreateDraft,
  useFinalizeDraft,
  useUpdateDraft,
} from '../hooks/useCharacterDraft'
import { useEditions, useEditionClasses } from '../hooks/useReferenceData'
import { useSetCharacterAvatar } from '../hooks/useSetCharacterAvatar'
import { useAuthenticated } from '@/app/shared/providers/AuthenticatedContext'
import FocalAreaModal from '@/app/shared/components/FocalAreaModal'
import { useFocalAreaFlow } from '@/app/shared/hooks/useFocalAreaFlow'
import { authFetch } from '@/app/shared/utils/authFetch'
import { titleize } from '@/app/shared/utils/titleize'
import { THEME, COLORS } from '@/app/styles/colorTheme'

import CharacterAvatarPickerModal from './CharacterAvatarPickerModal'
import WizardChrome from './wizard/WizardChrome'
import SpeciesStep from './wizard/SpeciesStep'
import ClassStep from './wizard/ClassStep'
import StartingLevelStep from './wizard/StartingLevelStep'
import AdvancementStep from './wizard/AdvancementStep'
import SpellsStep from './wizard/SpellsStep'
import BackgroundStep from './wizard/BackgroundStep'
import AbilityScoresStep from './wizard/AbilityScoresStep'
import ReviewStep from './wizard/ReviewStep'

// Edition was dropped as a user-facing step — only one edition exists today,
// and the wizard auto-creates a draft against it on mount. Name lives in the
// persistent header (rename step), so 'species' is now the first step in
// the strip.
const BASE_STEPS = [
  { id: 'species', label: 'Species' },
  { id: 'class', label: 'Class' },
  { id: 'background', label: 'Background' },
  { id: 'ability_scores', label: 'Ability Scores' },
  { id: 'review', label: 'Review' },
]

// Conditional steps, derived from the draft so the strip + navigation stay in sync:
//  - Starting level: always, right after Species.
//  - Advancement (per-level choices): only when the character's total class level > 1, after Class.
//  - Spells: only for casters, after Advancement (so subclass always-prepared is known) or Class.
function buildSteps(draft, classByCode) {
  const steps = [...BASE_STEPS]
  const speciesIdx = steps.findIndex((s) => s.id === 'species')
  steps.splice(speciesIdx + 1, 0, { id: 'starting_level', label: 'Level' })

  const totalLevel = (draft?.class_entries ?? []).reduce((sum, e) => sum + (e.level || 0), 0)
  if (totalLevel > 1) {
    const classIdx = steps.findIndex((s) => s.id === 'class')
    steps.splice(classIdx + 1, 0, { id: 'advancement', label: 'Advancement' })
  }

  const isCaster = (draft?.class_entries ?? []).some(
    (e) => classByCode.get(e.class_code)?.spellcasting,
  )
  if (isCaster) {
    const advIdx = steps.findIndex((s) => s.id === 'advancement')
    const anchorIdx = advIdx >= 0 ? advIdx : steps.findIndex((s) => s.id === 'class')
    steps.splice(anchorIdx + 1, 0, { id: 'spells', label: 'Spells' })
  }
  return steps
}

// The backend's creation_step uses the legacy 'identity' name for what the
// wizard now labels 'Species'. Map both ways so server-stored progress
// resolves to the new step ids.
function normaliseServerStep(serverStep) {
  if (serverStep === 'identity') return 'species'
  return serverStep
}

// Code → display label (e.g. ``ability_scores`` → ``Ability Scores``).
// Server-side codes are snake_case lowercase; the wizard's subtitle uses
// title-cased natural text. Kept local to avoid pulling another util in.

/**
 * Resume the wizard on whatever step the server thinks the draft is at,
 * falling back to the first incomplete step.
 */
function deriveInitialStep(draft, steps) {
  if (!draft) return 'species'
  if (!draft.is_draft) return 'review'
  const fromServer = normaliseServerStep(draft.creation_step)
  if (fromServer) {
    const after = steps.findIndex((s) => s.id === fromServer)
    if (after >= 0 && after < steps.length - 1) return steps[after + 1].id
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

  const { showToast } = useAuthenticated()

  const [currentStep, setCurrentStep] = useState('species')
  const [saveState, setSaveState] = useState('idle') // 'idle' | 'saving' | 'saved' | 'error'
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false)
  const [avatarError, setAvatarError] = useState(null)
  // Tracks the direct-PATCH avatar save below (which bypasses
  // setAvatarMutation), so the pane's "Saving..." badge actually shows
  const [avatarSaving, setAvatarSaving] = useState(false)
  // Set when the user clicks Finalize in this session — gates the
  // post-finalize blank-render so the wizard doesn't briefly show
  // finalised-character data before the route push lands. Edit-mode entries
  // (loading an already-finalised character via ?id=…) leave this false,
  // so the wizard renders normally for editing.
  const [justFinalised, setJustFinalised] = useState(false)
  // Local target for the starting-level step (E.1). Not persisted — the class step distributes
  // real levels; the wizard shows Advancement once the total class level exceeds 1.
  const [startingLevel, setStartingLevel] = useState(1)

  // Class defs power the conditional Spells step (which classes are casters).
  const { data: classDefs } = useEditionClasses(draft?.edition_code)
  const classByCode = useMemo(() => {
    const m = new Map()
    ;(classDefs ?? []).forEach((c) => m.set(c.code, c))
    return m
  }, [classDefs])
  const steps = useMemo(() => buildSteps(draft, classByCode), [draft, classByCode])
  // Navigation reads the freshest step list via a ref. ``persistStep`` refreshes it from the
  // server response so picking a caster class routes class → spells on the very next click —
  // ClassStep awaits onSave then calls onNext, before the draft-query re-render lands.
  const stepsRef = useRef(steps)
  useEffect(() => {
    stepsRef.current = steps
  }, [steps])

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
  // Re-derive when the draft loads AND when class defs arrive: a caster resuming at
  // creation_step='class' must land on 'spells', which only appears once classByCode knows
  // the class is a caster. Deps include classDefs so a late class-list load corrects the step.
  useEffect(() => {
    if (draftIdFromUrl && draft) {
      setCurrentStep(deriveInitialStep(draft, buildSteps(draft, classByCode)))
    } else if (!draftIdFromUrl) {
      setCurrentStep('species')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftIdFromUrl, draft?.id, classDefs])

  // Wrap PATCH-style mutations with the autosave state machine. ``persistStep``
  // returns the server's fresh response (so callers can read derived fields).
  const persistStep = async (step, payload) => {
    setSaveState('saving')
    try {
      const body = { step, [step === 'class' ? 'class' : step]: payload }
      const fresh = await updateDraft.mutateAsync(body)
      // Refresh the nav step list from the server's truth so the immediate onNext (called
      // right after this resolves) routes correctly even before the draft re-render lands.
      stepsRef.current = buildSteps(fresh, classByCode)
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

  /**
   * One-line character summary that builds up as the wizard fills in
   * species → class → background. Lives under the name header so the
   * player sees their build taking shape without bouncing between steps.
   * Reflects the *saved* draft (server state) so it only refreshes when a
   * step's Next button has actually committed.
   */
  const subtitle = useMemo(() => {
    if (!draft) return ''
    const speciesLabel = draft.species_code ? titleize(draft.species_code) : null
    const classEntries = draft.class_entries ?? []
    const hasClasses = classEntries.length > 0

    // Class chunk: just the names, joined with " / " for multi-class. Per-
    // class level is intentionally omitted — only the total ``Level X`` at
    // the front of the line reflects level state.
    let head = ''
    if (hasClasses) {
      const classChunk = classEntries
        .map((e) => titleize(e.class_code))
        .join(' / ')
      head = speciesLabel
        ? `Level ${draft.level} ${speciesLabel} ${classChunk}`
        : `Level ${draft.level} ${classChunk}`
    } else if (speciesLabel) {
      head = speciesLabel
    }

    const bg = draft.background_code ? titleize(draft.background_code) : null
    if (!head && !bg) return ''
    if (head && bg) return `${head} - ${bg}`
    return head || bg
  }, [draft?.species_code, draft?.class_entries, draft?.background_code, draft?.level])

  const linkAvatarAsset = async (assetId) => {
    // Read the current character id off either the cache-backed draft or the
    // URL — they converge within a tick of createDraft resolving.
    const characterId = draft?.id ?? draftIdFromUrl
    if (!characterId) {
      setAvatarError('Character not yet ready — try again in a moment')
      return
    }
    setAvatarSaving(true)
    try {
      // ``mutateAsync`` re-binds via the hook's closure; if we just auto-created
      // the draft this same event the hook is still bound to undefined. PATCH
      // through authFetch directly so we can target the fresh id reliably.
      const res = await authFetch(`/api/characters/${characterId}/avatar`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_id: assetId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.detail || 'Failed to set avatar')
      await draftQuery.refetch()
      // The avatar saves on its own, outside the step/finalize flow - say
      // so explicitly, or users assume they still owe a save/finalize.
      setSaveState('saved')
      showToast?.({
        type: 'success',
        message: 'Avatar saved - avatar changes apply instantly and don’t need finalizing',
      })
    } catch (err) {
      setAvatarError(err.message || 'Failed to set avatar')
    } finally {
      setAvatarSaving(false)
    }
  }

  /**
   * Crop-first chain (tokens v3, §3.2): picking an image always prompts the
   * focal-area select. Confirming saves the crop on the image asset, then —
   * for a fresh pick — links it as the avatar. Cancelling at the crop step
   * leaves the avatar unchanged. Adjust-crop re-runs the select on the
   * current avatar without re-linking.
   */
  const handleCropSaved = async ({ imageAssetId, context }) => {
    if (context?.linkAvatar) {
      await linkAvatarAsset(imageAssetId)
      return
    }
    showToast?.({
      type: 'success',
      message: 'Token crop saved - applies from your next game session',
    })
  }

  const cropFlow = useFocalAreaFlow({ onCropSaved: handleCropSaved })

  const handleAvatarAssetChosen = async (assetId) => {
    setAvatarError(null)
    const characterId = draft?.id ?? draftIdFromUrl
    if (!characterId) {
      setAvatarError('Character not yet ready — try again in a moment')
      return
    }
    const opened = await cropFlow.begin(assetId, { linkAvatar: true })
    if (!opened) setAvatarError('Could not load that image — try again')
  }

  const handleAdjustAvatarCrop = async () => {
    setAvatarError(null)
    if (!draft?.avatar_asset_id) return
    const opened = await cropFlow.begin(draft.avatar_asset_id, { linkAvatar: false })
    if (!opened) setAvatarError('Could not load the avatar image — try again')
  }

  const handleNext = () => {
    const s = stepsRef.current
    const idx = s.findIndex((x) => x.id === currentStep)
    if (idx >= 0 && idx < s.length - 1) setCurrentStep(s[idx + 1].id)
  }
  const handleBack = () => {
    const s = stepsRef.current
    const idx = s.findIndex((x) => x.id === currentStep)
    if (idx > 0) setCurrentStep(s[idx - 1].id)
  }

  const handleFinalize = async () => {
    try {
      const finalised = await finalizeDraft.mutateAsync()
      setJustFinalised(true)
      if (returnCampaignId) {
        try {
          sessionStorage.setItem('openCharacterModalForCampaign', returnCampaignId)
        } catch (e) {
          // sessionStorage blocked — modal won't auto-reopen, but the user lands on the right drawer.
        }
        router.push(`/dashboard?tab=campaigns&expand_campaign_id=${returnCampaignId}`)
        return
      }
      // Land on the dashboard Characters tab with the new character's drawer
      // auto-expanded — same convention CampaignManager uses for
      // ``expand_campaign_id``. Consolidates the "view a finalised character"
      // surface into one place (the drawer), so /character/{id} acts as a
      // deep link rather than the primary destination after creation.
      router.push(`/dashboard?tab=characters&expand_character_id=${finalised.id}`)
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
  // tick will replace this view with the dashboard drawer. Scoped to
  // ``justFinalised`` so edit-mode entries (?id=… targeting an already
  // finalised character) render the wizard for editing instead of bailing.
  if (draft && !draft.is_draft && justFinalised) {
    return null
  }

  return (
    <>
    <WizardChrome
      steps={steps}
      currentStep={currentStep}
      onJumpStep={(id) => draft && setCurrentStep(id)}
      saveState={saveState}
      draftId={draft?.id}
      characterName={draft?.character_name ?? ''}
      characterSubtitle={subtitle}
      onRename={handleRename}
      avatarUrl={draft?.avatar_url}
      avatarAssetId={draft?.avatar_asset_id}
      avatarFocalArea={draft?.avatar_focal_area}
      avatarIsBusy={createDraft.isPending || setAvatarMutation.isPending || avatarSaving}
      avatarError={avatarError}
      onOpenAvatarPicker={handleOpenAvatarPicker}
      onAdjustAvatarCrop={draft?.avatar_asset_id ? handleAdjustAvatarCrop : null}
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
          onNext={handleNext}
        />
      )}

      {currentStep === 'starting_level' && draft && (
        <StartingLevelStep
          startingLevel={startingLevel}
          setStartingLevel={setStartingLevel}
          onBack={handleBack}
          onNext={handleNext}
        />
      )}

      {currentStep === 'class' && draft && (
        <ClassStep
          draft={draft}
          startingLevel={startingLevel}
          onSave={(payload) => persistStep('class', payload)}
          onBack={handleBack}
          onNext={handleNext}
        />
      )}

      {currentStep === 'advancement' && draft && (
        <AdvancementStep
          draft={draft}
          classDefs={classDefs ?? []}
          onSave={(payload) => persistStep('advancement', payload)}
          onBack={handleBack}
          onNext={handleNext}
        />
      )}

      {currentStep === 'spells' && draft && (
        <SpellsStep
          draft={draft}
          classDefs={classDefs ?? []}
          onSave={(payload) => persistStep('spells', payload)}
          onBack={handleBack}
          onNext={handleNext}
        />
      )}

      {currentStep === 'background' && draft && (
        <BackgroundStep
          draft={draft}
          onSave={(payload) => persistStep('background', payload)}
          onBack={handleBack}
          onNext={handleNext}
        />
      )}

      {currentStep === 'ability_scores' && draft && (
        <AbilityScoresStep
          draft={draft}
          onSave={(payload) => persistStep('ability_scores', payload)}
          onSaveHpAc={(payload) => persistStep('hp_ac', payload)}
          onBack={handleBack}
          onNext={handleNext}
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

    {/* Focal square select — always prompted on selection (decision 32).
        Mounted only while open so the cropper starts clean per image. */}
    {cropFlow.isOpen && (
      <FocalAreaModal {...cropFlow.modalProps} title="Frame your token's face" />
    )}
    </>
  )
}
