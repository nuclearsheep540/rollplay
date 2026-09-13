/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'

import { authFetch } from '@/app/shared/utils/authFetch'
import { useAuthenticated } from '@/app/shared/providers/AuthenticatedContext'
import { useCreateCampaign, useUpdateCampaign } from '@/app/dashboard/hooks/mutations/useCampaignMutations'
import BuilderRail from './BuilderRail'
import BuilderSubTabs from './BuilderSubTabs'
import CampaignBand from './CampaignBand'
import CharacterSection from './CharacterSection'
import OverviewSection from './OverviewSection'
import WorldSection from './WorldSection'
import { useAutoSave } from '../hooks/useAutoSave'
import { useBuilderNav } from '../hooks/useBuilderNav'
import {
  useCharacterConfigDraft,
  useCharacterConfigState,
  useComponentCatalogue,
  usePublishCharacterConfig,
  useSaveCharacterConfigDraft,
} from '../hooks/useCharacterConfig'

/** Every field here is persisted; nothing on this page is decorative. */
const EMPTY_FIELDS = {
  title: '',
  description: '',
  heroImage: '/campaign-tile-bg.png',
  heroImageAssetId: null,
  maxPlayers: 8,
}

/**
 * Create and edit are one page.
 *
 * A campaign is the same thing on its first day as on its hundredth, so it gets one
 * surface; `campaignId === null` simply means nothing has been saved yet. That is what
 * retired the create modal and the separate edit modal.
 */
export default function CampaignBuilder({ campaignId: initialCampaignId }) {
  const router = useRouter()
  const { showToast, user } = useAuthenticated()
  const nav = useBuilderNav()

  const [campaignId, setCampaignId] = useState(initialCampaignId)
  const [fields, setFields] = useState(EMPTY_FIELDS)
  const [saving, setSaving] = useState(false)

  const campaignQuery = useQuery({
    queryKey: ['campaigns', campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const response = await authFetch(`/api/campaigns/${campaignId}`, { credentials: 'include' })
      if (!response.ok) throw new Error('Could not load the campaign')
      return response.json()
    },
  })

  const configState = useCharacterConfigState(campaignId)
  const catalogue = useComponentCatalogue()
  const draft = useCharacterConfigDraft(configState.data)
  const saveDraft = useSaveCharacterConfigDraft(campaignId)
  const publish = usePublishCharacterConfig(campaignId)
  const createCampaign = useCreateCampaign()
  const updateCampaign = useUpdateCampaign()

  // Seed the form exactly once per campaign, tracked by id.
  //
  // NOT guarded on a dirty flag: a save clears that flag and then invalidates the query,
  // so the refetch lands with the guard already down and writes the server's copy over
  // whatever has been typed since. Because both this hook and the backend trim the title,
  // that showed up as trailing spaces vanishing mid-word — you could not type a two-word
  // campaign name. While the page is open the form is the authority; the server's echo of
  // what it just stored is not news.
  const seededCampaignRef = useRef(null)
  useEffect(() => {
    const campaign = campaignQuery.data
    if (!campaign || seededCampaignRef.current === campaign.id) return
    seededCampaignRef.current = campaign.id
    setFields((existing) => ({
      ...existing,
      title: campaign.title || '',
      description: campaign.description || '',
      heroImage: campaign.hero_image ?? null,
      heroImageAssetId: campaign.hero_image_asset?.asset_id ?? null,
      maxPlayers: campaign.max_players ?? 8,
    }))
  }, [campaignQuery.data])

  // A campaign not saved yet has no host row to compare against, and the person creating
  // it is its host by definition.
  const isHost = !campaignId || !campaignQuery.data || campaignQuery.data.host_id === user?.id

  const latestVersion = configState.data?.versions?.length
    ? configState.data.versions[configState.data.versions.length - 1].version
    : null

  // The live values a save reads. Kept in refs because the debounce timer outlives the
  // render that scheduled it, so a closure over state would write what was true when the
  // timer was set rather than what is true when it fires.
  const fieldsRef = useRef(fields)
  const draftRef = useRef(draft)
  const campaignIdRef = useRef(campaignId)
  // What the config endpoint last received, so an unchanged config is not re-sent.
  const sentComponentsRef = useRef(null)
  useEffect(() => {
    fieldsRef.current = fields
    draftRef.current = draft
    campaignIdRef.current = campaignId
  })

  const persist = useCallback(async () => {
    const currentFields = fieldsRef.current
    const currentDraft = draftRef.current
    // A campaign needs a name before it can exist. Until there is one, work stays local
    // and the band says so rather than inventing an "Untitled campaign" nobody asked for.
    // Reported as `false` so the hook knows this is still unsaved, not saved.
    if (!currentFields.title.trim()) return false

    let id = campaignIdRef.current
    if (!id) {
      const created = await createCampaign.mutateAsync({
        title: currentFields.title,
        description: currentFields.description,
        heroImage: currentFields.heroImage,
        heroImageAssetId: currentFields.heroImageAssetId,
        maxPlayers: currentFields.maxPlayers,
      })
      id = created.id
      campaignIdRef.current = id
      setCampaignId(id)
      router.replace(`/campaign/${id}?section=${nav.sectionKey}`, { scroll: false })
    } else {
      await updateCampaign.mutateAsync({
        campaignId: id,
        title: currentFields.title,
        description: currentFields.description,
        heroImage: currentFields.heroImage,
        heroImageAssetId: currentFields.heroImageAssetId,
        maxPlayers: currentFields.maxPlayers,
      })
    }

    // Only when the components actually changed: editing the title alone must not mint a
    // draft identical to the published version, which would then read as a pending change
    // that is no change.
    const componentSignature = JSON.stringify(currentDraft.components)
    if (componentSignature !== sentComponentsRef.current) {
      await saveDraft.mutateAsync({ ...currentDraft.asConfig(), version: 1 })
      sentComponentsRef.current = componentSignature
    }

  }, [createCampaign, updateCampaign, saveDraft, router, nav.sectionKey])

  const autoSave = useAutoSave(persist)
  // The stable callbacks, pulled out once so nothing below depends on the object itself.
  const { flush: flushAutoSave, schedule: scheduleAutoSave } = autoSave

  const onFieldChange = (patch) => {
    setFields((existing) => ({ ...existing, ...patch }))
    scheduleAutoSave()
  }

  // Editing a component is a user action like typing in a field, so it schedules a save
  // the same way. Wrapped here rather than inside the draft hook, to keep that hook about
  // the config and this component about saving.
  const draftWithSave = useMemo(() => {
    const scheduling = (mutate) => (...args) => {
      mutate(...args)
      scheduleAutoSave()
    }
    return {
      ...draft,
      addComponent: scheduling(draft.addComponent),
      updateComponent: scheduling(draft.updateComponent),
      duplicateComponent: scheduling(draft.duplicateComponent),
      removeComponent: scheduling(draft.removeComponent),
      moveEntry: scheduling(draft.moveEntry),
      addGroup: scheduling(draft.addGroup),
      updateGroup: scheduling(draft.updateGroup),
      removeGroup: scheduling(draft.removeGroup),
    }
  }, [draft, scheduleAutoSave])

  // Leaving the page is the one moment there is no second chance, so flush rather than
  // let a pending debounce die with the component. Depends on the stable callback, not the
  // hook's object: the object changes with status, and a cleanup keyed on it would run —
  // and flush — on every keystroke.
  useEffect(() => () => flushAutoSave(), [flushAutoSave])

  // Moving between tabs is a natural save point: the GM has finished with that panel, and
  // waiting out the debounce after a navigation is how work goes missing.
  const onSelectSection = (key) => {
    autoSave.flush()
    nav.setSection(key)
  }

  const onSelectTab = (key) => {
    autoSave.flush()
    nav.setTab(key)
  }

  const onSave = async () => {
    if (!fields.title.trim()) {
      showToast('Give the campaign a name first', 'error')
      return
    }
    setSaving(true)
    try {
      await autoSave.saveNow()
      showToast('Campaign saved', 'success')
    } catch (error) {
      showToast(error.message || 'Could not save the campaign', 'error')
    } finally {
      setSaving(false)
    }
  }

  const onPublish = async () => {
    try {
      await publish.mutateAsync()
      showToast(`Published v${(latestVersion || 0) + 1}`, 'success')
    } catch (error) {
      showToast(error.message || 'Could not publish', 'error')
    }
  }

  return (
    // A fixed height, not a minimum: the band and the sub-tab strip are chrome, and only the
    // content pane below them scrolls. With min-h the pane had no ceiling, so it never
    // scrolled — the page did, taking the band with it — and the flex column was free to
    // shrink the band to make room, which is what made the header look different per tab.
    <div className="flex h-[calc(100vh-var(--site-header-height,64px))] overflow-hidden bg-surface-primary">
      <BuilderRail sections={nav.sections} activeKey={nav.sectionKey} onSelect={onSelectSection} />
      <div className="grow flex flex-col min-w-0">
        <CampaignBand
          title={fields.title}
          isNew={!campaignId}
          latestVersion={latestVersion}
          needsTitle={autoSave.status === 'dirty' && !fields.title.trim()}
          autoSaveStatus={autoSave.status}
          onSave={onSave}
          saving={saving}
        />
        <BuilderSubTabs subTabs={nav.section.subTabs} activeKey={nav.tabKey} onSelect={onSelectTab} />
        <div className="grow min-h-0 px-10 pt-9 pb-14 overflow-y-auto">
          {nav.sectionKey === 'overview' && (
            <OverviewSection tabKey={nav.tabKey} fields={fields} onFieldChange={onFieldChange} />
          )}
          {nav.sectionKey === 'world' && <WorldSection />}
          {nav.sectionKey === 'character' && (
            <CharacterSection
              tabKey={nav.tabKey}
              draft={draftWithSave}
              catalogue={catalogue.data}
              state={configState.data}
              onPublish={onPublish}
              publishing={publish.isPending}
              canEdit={isHost}
              campaignSaved={!!campaignId}
              campaignName={fields.title}
              hostName={user?.screen_name || user?.account_name}
            />
          )}
        </div>
      </div>
    </div>
  )
}
