/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { useCampaigns } from '@/app/dashboard/hooks/useCampaigns'
import { useAuthenticated } from '@/app/shared/providers/AuthenticatedContext'
import NotesWorkspace from '@/app/notes/components/NotesWorkspace'

// Site chrome (header, auth gate, WebSocket subscription, Suspense for
// useSearchParams) comes from the (authenticated) route group's layout —
// this page is intentionally chrome-free, matching the workshop tools.
// Statuses are lowercase off the wire, and "live" spans the ETL either side of
// play; mirrors the predicate in CampaignManager.js:1385.
function findLiveSession(campaign) {
  return campaign?.sessions?.find((session) =>
    ['active', 'starting', 'stopping'].includes(session.status?.toLowerCase())
  )
}

export default function NotesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuthenticated()

  const campaignId = searchParams.get('campaign_id')
  const activeNoteId = searchParams.get('note')

  // Reuses the dashboard's campaigns query — same ['campaigns'] cache key, so
  // arriving from the campaign drawer costs no extra request. It feeds both the
  // sidebar's campaign list and the live-session check below, and the list is
  // small enough to filter client-side (same reasoning as
  // useMyCharacterForCampaign in the game runtime).
  const { data } = useCampaigns(user?.id, { enabled: Boolean(user?.id) })
  const campaign = data?.campaigns?.find((entry) => entry.id === campaignId)

  // Every campaign the user has joined, for the sidebar's switcher — notebooks
  // are created on demand, so a campaign with no notes yet belongs in the list
  // exactly as much as one with ten. Invited-but-not-joined campaigns are
  // excluded: useCampaigns already separates them, and the API refuses to start
  // a notebook for a campaign you have not accepted.
  const campaignChoices = useMemo(
    () =>
      (data?.campaigns || []).map((entry) => ({
        id: entry.id,
        title: entry.title,
        // Flagged here rather than in the workspace so the read-only rule is
        // derived one way for the whole page.
        hasLiveSession: Boolean(findLiveSession(entry)),
      })),
    [data?.campaigns]
  )

  // While a session is live, the game runtime is where notes get written — this
  // page goes read-only so the same note can't be edited from two surfaces at
  // once. Deriving it from the campaigns query rather than subscribing to events
  // directly is deliberate: session_started / _paused / _finished all already
  // call invalidateCampaigns (useAuthenticatedEvents.js:108-122), so this
  // recomputes the moment a DM starts or ends a session — no polling, no latch.
  //
  // Statuses are lowercase off the wire, and "live" spans the ETL either side of
  // play; mirrors the predicate in CampaignManager.js:1385.
  const liveSession = findLiveSession(campaign)

  const handleOpenGame = useCallback(() => {
    if (liveSession) router.push(`/game?room_id=${liveSession.id}`)
  }, [router, liveSession])

  // Selection rides the URL so a refresh or a pasted link lands on the same
  // note. `replace` keeps note-switching out of history — flicking through
  // notes is editor state, not navigation, and back should leave the workspace.
  const handleSelectNote = useCallback(
    (noteId) => {
      const query = noteId ? `?campaign_id=${campaignId}&note=${noteId}` : `?campaign_id=${campaignId}`
      router.replace(`/notes${query}`)
    },
    [router, campaignId]
  )

  // Switching campaigns drops the note id — it names a note in the campaign
  // being left, and carrying it over would only fail the workspace's
  // does-this-note-exist check on arrival.
  const handleSelectCampaign = useCallback(
    (nextCampaignId) => {
      if (!nextCampaignId || nextCampaignId === campaignId) return
      router.replace(`/notes?campaign_id=${nextCampaignId}`)
    },
    [router, campaignId]
  )

  // An explicit destination rather than router.back(): history depth varies with
  // how the user arrived, and back() leaves the app entirely on a pasted link.
  const handleBack = useCallback(() => {
    router.push('/dashboard?tab=campaigns')
  }, [router])

  return (
    <main className="flex-1 min-h-0">
      <NotesWorkspace
        campaignId={campaignId}
        campaigns={campaignChoices}
        onSelectCampaign={handleSelectCampaign}
        activeNoteId={activeNoteId}
        onSelectNote={handleSelectNote}
        onBack={handleBack}
        lockedBySession={Boolean(liveSession)}
        onOpenGame={handleOpenGame}
      />
    </main>
  )
}
