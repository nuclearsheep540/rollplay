/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import Modal from '@/app/shared/components/Modal'
import Spinner from '@/app/shared/components/Spinner'
import PauseSessionModal from './PauseSessionModal'
import FinishSessionModal from './FinishSessionModal'
import DeleteCampaignModal from './DeleteCampaignModal'
import DeleteSessionModal from './DeleteSessionModal'
import CampaignInviteModal from './CampaignInviteModal'
import CharacterSelectionModal from './CharacterSelectionModal'
import HeroBackground from './HeroBackground'
import S3Image from '@/app/shared/components/S3Image'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faGear,
  faTrash,
  faCheck,
  faXmark,
  faPlus,
  faPlay,
  faPause,
  faRightToBracket,
  faUserPlus,
  faUserMinus,
  faRightFromBracket,
  faUserShield,
  faFolderOpen,
} from '@fortawesome/free-solid-svg-icons'
import { COLORS, THEME } from '@/app/styles/colorTheme'
import { Button, Badge } from './shared/Button'
import { useQueryClient } from '@tanstack/react-query'
import { useCampaigns } from '../hooks/useCampaigns'
import { useInvitedCampaignMembers } from '../hooks/useInvitedCampaignMembers'
import { useCharacters } from '../hooks/useCharacters'
import { useCreateCampaign, useUpdateCampaign, useDeleteCampaign, useAcceptInvite, useDeclineInvite, useLeaveCampaign, useRemovePlayer } from '../hooks/mutations/useCampaignMutations'
import { useCreateSession, useStartSession, usePauseSession, useFinishSession, useDeleteSession } from '../hooks/mutations/useSessionMutations'
import { useReleaseCharacter } from '../hooks/mutations/useCharacterMutations'
import { useAssets } from '@/app/asset_library/hooks/useAssets'
import { useCampaignAssetsMetadata } from '@/app/asset_library/hooks/useCampaignAssetsMetadata'

/**
 * Format a byte count into a human-friendly string (B / KB / MB / GB).
 * Null/zero inputs render as "0 B" rather than "Unknown" because this
 * is used in a templated meta grid where empty values would feel like
 * missing data; "0 B" is an honest zero.
 */
function formatBytes(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/**
 * Player-card left-edge action slot. Renders one of two variants at a
 * fixed width so every card's left end shares the same visual shape:
 *
 *   • DM — non-interactive amber marker when the member is the host.
 *     "DM" text rotated -90° reads vertically up the left edge, keeping
 *     the slot narrow without losing the badge.
 *   • Remove — destructive red icon button when the viewer is the host
 *     and the member is not.
 *   • (nothing) — for non-host viewers, returns null so the card
 *     simply has no left sibling.
 *
 * Kept as a local component rather than a shared one since the colours
 * + border-right separator are tuned specifically to the campaign
 * player-list card.
 */
function PlayerCardAction({ isDm, canRemove, onRemove }) {
  const baseClass = 'relative z-10 flex-shrink-0 w-10 flex items-center justify-center'
  const borderRight = `1px solid ${THEME.borderSubtle}`

  if (isDm) {
    return (
      <div
        style={{
          color: '#fbbf24',
          backgroundColor: 'rgba(251, 191, 36, 0.1)',
          borderRight,
        }}
        className={baseClass}
      >
        <span
          className="text-xs font-semibold tracking-widest"
          style={{ transform: 'rotate(-90deg)' }}
        >
          DM
        </span>
      </div>
    )
  }

  if (canRemove) {
    return (
      <button
        onClick={onRemove}
        title="Remove player"
        aria-label="Remove player"
        style={{
          color: '#dc2626',
          backgroundColor: 'rgba(220, 38, 38, 0.1)',
          borderRight,
        }}
        className={`${baseClass} hover:opacity-80`}
      >
        <FontAwesomeIcon icon={faUserMinus} className="h-3.5 w-3.5" />
      </button>
    )
  }

  return null
}

export default function CampaignManager({ user, onExpandedChange, inviteCampaignId, clearInviteCampaignId, expandCampaignId, clearExpandCampaignId, showToast }) {
  const router = useRouter()
  const queryClient = useQueryClient()

  // ── TanStack Query: data fetching ──
  const {
    data: campaignData,
    isLoading: loading,
    error: queryError,
  } = useCampaigns(user?.id)

  const campaigns = campaignData?.campaigns ?? []
  const invitedCampaigns = campaignData?.invitedCampaigns ?? []

  // Image assets for hero image picker (all user images, not campaign-scoped)
  const { data: libraryImages = [] } = useAssets({ assetType: 'image', enabled: !!user?.id })

  // Derive allSessions from campaigns (sessions are embedded by useCampaigns)
  const allSessions = useMemo(
    () => campaigns.flatMap(c => c.sessions || []),
    [campaigns]
  )

  // ── Derived selected state (fixes copy-drift) ──
  const [selectedCampaignId, setSelectedCampaignId] = useState(null)
  const selectedCampaign = useMemo(
    () => campaigns.find(c => c.id === selectedCampaignId) ?? null,
    [campaigns, selectedCampaignId]
  )

  // Fetch aggregated asset metadata (count + total bytes) for the
  // currently expanded campaign. Disabled when nothing's selected so
  // we don't burn a request for the collapsed list. Collapsed cards
  // render a "—" placeholder; expanded shows real values.
  const { data: selectedCampaignAssetsMeta } = useCampaignAssetsMetadata(
    selectedCampaignId,
    { enabled: !!selectedCampaignId }
  )

  const [selectedInvitedCampaignId, setSelectedInvitedCampaignId] = useState(null)
  const selectedInvitedCampaign = useMemo(
    () => invitedCampaigns.find(c => c.id === selectedInvitedCampaignId) ?? null,
    [invitedCampaigns, selectedInvitedCampaignId]
  )

  // Invited campaign members query (only fetches when an invited campaign is expanded)
  const {
    data: invitedCampaignMembers = [],
    isLoading: loadingInvitedMembers,
  } = useInvitedCampaignMembers(selectedInvitedCampaignId)

  // Characters query
  const { data: characters = [] } = useCharacters()

  // ── Mutation hooks ──
  const createCampaignMutation = useCreateCampaign()
  const updateCampaignMutation = useUpdateCampaign()
  const deleteCampaignMutation = useDeleteCampaign()
  const acceptInviteMutation = useAcceptInvite()
  const declineInviteMutation = useDeclineInvite()
  const leaveCampaignMutation = useLeaveCampaign()
  const removePlayerMutation = useRemovePlayer()
  const createSessionMutation = useCreateSession()
  const startSessionMutation = useStartSession()
  const pauseSessionMutation = usePauseSession()
  const finishSessionMutation = useFinishSession()
  const deleteSessionMutation = useDeleteSession()
  const releaseCharacterMutation = useReleaseCharacter()

  // ── UI-only state ──
  const [error, setError] = useState(null)
  const [showCharacterModal, setShowCharacterModal] = useState(false)
  const [characterModalCampaign, setCharacterModalCampaign] = useState(null)

  const gameSessionsPanelRef = useRef(null)
  const campaignCardRef = useRef(null)
  const invitedCampaignCardRef = useRef(null)
  // Scope ref for useGSAP — every data-attribute-tagged animation
  // target lives inside this container.
  const rootRef = useRef(null)
  // Both drawers' min-height is now driven imperatively via gsap.set;
  // no React state needed for either drawer's dimensions.

  // ── Individual modal target states (non-null = open) ──
  const [deleteCampaignTarget, setDeleteCampaignTarget] = useState(null)
  const [leaveCampaignTarget, setLeaveCampaignTarget] = useState(null)
  const [removePlayerTarget, setRemovePlayerTarget] = useState(null)
  const [deleteSessionTarget, setDeleteSessionTarget] = useState(null)
  const [pauseSessionTarget, setPauseSessionTarget] = useState(null)
  const [finishSessionTarget, setFinishSessionTarget] = useState(null)

  // Invite modal — ID-only, campaign derived from query cache (no sync effect needed)
  const [inviteModalCampaignId, setInviteModalCampaignId] = useState(null)
  const inviteModalCampaign = useMemo(
    () => campaigns.find(c => c.id === inviteModalCampaignId) ?? null,
    [campaigns, inviteModalCampaignId]
  )

  // Campaign form modal
  const [campaignFormOpen, setCampaignFormOpen] = useState(false)
  const [campaignForm, setCampaignForm] = useState({
    title: '', description: '', heroImage: '/campaign-tile-bg.png', heroImageAssetId: null, sessionName: '', editingCampaign: null
  })
  const closeCampaignForm = () => {
    setCampaignFormOpen(false)
    setCampaignForm({ title: '', description: '', heroImage: '/campaign-tile-bg.png', heroImageAssetId: null, sessionName: '', editingCampaign: null })
  }

  // Session creation modal
  const [createSessionCampaignId, setCreateSessionCampaignId] = useState(null)
  const [sessionForm, setSessionForm] = useState({ name: 'Session 1', maxPlayers: 8 })
  const openCreateGameModal = (campaignId) => {
    setSessionForm({ name: 'Session 1', maxPlayers: 8 })
    setCreateSessionCampaignId(campaignId)
  }

  // Accept campaign invite
  const acceptCampaignInvite = async (campaignId) => {
    try {
      setSelectedInvitedCampaignId(null)
      await acceptInviteMutation.mutateAsync(campaignId)
    } catch (err) {
      setError(err.message)
    }
  }

  // Decline campaign invite
  const declineCampaignInvite = async (campaignId) => {
    try {
      setSelectedInvitedCampaignId(null)
      await declineInviteMutation.mutateAsync(campaignId)
    } catch (err) {
      setError(err.message)
    }
  }

  // Remove player from campaign (host only)
  const removePlayerFromCampaign = async () => {
    if (!removePlayerTarget) return

    try {
      await removePlayerMutation.mutateAsync({
        campaignId: removePlayerTarget.campaign.id,
        playerId: removePlayerTarget.member.user_id,
      })
      setRemovePlayerTarget(null)
    } catch (err) {
      setError(err.message)
    }
  }

  // Leave campaign (player only - not host)
  const leaveCampaign = async () => {
    if (!leaveCampaignTarget) return

    try {
      await leaveCampaignMutation.mutateAsync(leaveCampaignTarget.id)
      setSelectedCampaignId(null)
      setLeaveCampaignTarget(null)
    } catch (err) {
      setError(err.message)
    }
  }

  // Create game (without starting it)
  const createGame = async () => {
    if (!createSessionCampaignId) return

    setError(null)

    try {
      await createSessionMutation.mutateAsync({
        campaignId: createSessionCampaignId,
        name: sessionForm.name,
        maxPlayers: sessionForm.maxPlayers,
      })
      setCreateSessionCampaignId(null)
    } catch (err) {
      setError('Failed to create game: ' + err.message)
    }
  }

  // Start game session
  const startGame = async (gameId) => {
    setError(null)

    try {
      await startSessionMutation.mutateAsync(gameId)
    } catch (err) {
      setError(err.message)
    }
  }

  // Show pause session confirmation modal
  const promptPauseSession = (game) => {
    setPauseSessionTarget(game)
  }

  // Pause session (after confirmation)
  const confirmPauseSession = async () => {
    if (!pauseSessionTarget) return

    setError(null)

    try {
      await pauseSessionMutation.mutateAsync(pauseSessionTarget.id)
      setPauseSessionTarget(null)
    } catch (err) {
      setError(err.message)
    }
  }

  // Cancel pause session
  const cancelPauseSession = () => {
    setPauseSessionTarget(null)
  }

  // Show finish session confirmation modal
  const promptFinishSession = (game) => {
    setFinishSessionTarget(game)
  }

  // Finish session permanently (after confirmation)
  const confirmFinishSession = async () => {
    if (!finishSessionTarget) return

    setError(null)

    try {
      await finishSessionMutation.mutateAsync(finishSessionTarget.id)
      setFinishSessionTarget(null)
    } catch (err) {
      setError(err.message)
    }
  }

  // Cancel finish session
  const cancelFinishSession = () => {
    setFinishSessionTarget(null)
  }

  // Handle successful campaign invite/cancel — invalidate cache so campaign prop refreshes
  const handleCampaignInviteSuccess = async () => {
    queryClient.invalidateQueries({ queryKey: ['campaigns'] })
  }

  // Open delete session modal
  const openDeleteSessionModal = (game) => {
    setDeleteSessionTarget(game)
  }

  // Close delete session modal
  const closeDeleteSessionModal = () => {
    setDeleteSessionTarget(null)
  }

  // Delete game (called from modal)
  const deleteGame = async () => {
    if (!deleteSessionTarget) return

    setError(null)

    try {
      await deleteSessionMutation.mutateAsync(deleteSessionTarget.id)
      setDeleteSessionTarget(null)
    } catch (err) {
      setError(err.message)
    }
  }

  // Enter game
  const enterGame = (game) => {
    router.push(`/game?room_id=${game.session_id || game.id}`)
  }

  // Create a new campaign
  const createCampaign = async () => {
    if (!user || !campaignForm.title.trim()) return

    setError(null)

    try {
      await createCampaignMutation.mutateAsync({
        title: campaignForm.title,
        description: campaignForm.description,
        heroImage: campaignForm.heroImage,
        heroImageAssetId: campaignForm.heroImageAssetId,
        sessionName: campaignForm.sessionName,
      })

      closeCampaignForm()
    } catch (err) {
      setError('Failed to create campaign: ' + err.message)
    }
  }

  // Update an existing campaign
  const updateCampaign = async () => {
    if (!user || !campaignForm.editingCampaign || !campaignForm.title.trim()) return

    setError(null)

    try {
      await updateCampaignMutation.mutateAsync({
        campaignId: campaignForm.editingCampaign.id,
        title: campaignForm.title,
        description: campaignForm.description,
        heroImage: campaignForm.heroImage,
        heroImageAssetId: campaignForm.heroImageAssetId,
        sessionName: campaignForm.sessionName,
      })

      closeCampaignForm()
    } catch (err) {
      setError('Failed to update campaign: ' + err.message)
    }
  }

  // Show delete campaign confirmation modal
  const promptDeleteCampaign = (campaign) => {
    setDeleteCampaignTarget(campaign)
  }

  // Cancel delete campaign
  const cancelDeleteCampaign = () => {
    setDeleteCampaignTarget(null)
  }

  // Delete a campaign (after confirmation)
  const confirmDeleteCampaign = async () => {
    if (!deleteCampaignTarget) return

    setError(null)

    try {
      await deleteCampaignMutation.mutateAsync(deleteCampaignTarget.id)
      if (selectedCampaignId === deleteCampaignTarget.id) {
        setSelectedCampaignId(null)
      }
      setDeleteCampaignTarget(null)
    } catch (err) {
      setError(err.message)
      setDeleteCampaignTarget(null)
    }
  }

  // Toggle campaign details
  const toggleCampaignDetails = (campaign) => {
    if (selectedCampaignId === campaign.id) {
      setSelectedCampaignId(null)
    } else {
      // Close any open invited campaign drawer first
      setSelectedInvitedCampaignId(null)
      // Scroll to top before expanding (while overflow-y-auto is still active)
      const mainEl = document.getElementById('dashboard-main')
      if (mainEl) {
        mainEl.scrollTo({ top: 0, behavior: 'smooth' })
      }
      setSelectedCampaignId(campaign.id)
    }
  }

  // Toggle invited campaign details
  const toggleInvitedCampaignDetails = (campaign) => {
    if (selectedInvitedCampaignId === campaign.id) {
      setSelectedInvitedCampaignId(null)
    } else {
      // Close any open regular campaign drawer first
      setSelectedCampaignId(null)
      // Scroll to top before expanding (while overflow-y-auto is still active)
      const mainEl = document.getElementById('dashboard-main')
      if (mainEl) {
        mainEl.scrollTo({ top: 0, behavior: 'smooth' })
      }
      setSelectedInvitedCampaignId(campaign.id)
    }
  }

  // Handle character selection for a campaign
  const handleSelectCharacter = (campaign) => {
    setCharacterModalCampaign(campaign)
    setShowCharacterModal(true)
  }

  // Handle character selection success — mutation in CharacterSelectionModal invalidates ['campaigns'] and ['characters']
  const handleCharacterSelected = () => {
    setShowCharacterModal(false)
    setCharacterModalCampaign(null)
  }

  // Handle releasing character from campaign
  const handleReleaseCharacter = async (campaign) => {
    try {
      await releaseCharacterMutation.mutateAsync(campaign.id)
    } catch (err) {
      setError(err.message)
    }
  }

  // Check if campaign has an active session (used to disable release button)
  const hasActiveSession = (campaignId) => {
    return allSessions.some(s => s.campaign_id === campaignId && (s.status === 'active' || s.status === 'starting' || s.status === 'paused'))
  }

  // Handle invite_campaign_id from URL (notification click)
  useEffect(() => {
    if (inviteCampaignId && !loading) {
      const invitedCampaign = invitedCampaigns.find(c => c.id === inviteCampaignId)

      if (invitedCampaign) {
        toggleInvitedCampaignDetails(invitedCampaign)
      } else {
        showToast?.({
          type: 'warning',
          message: 'This invite is no longer available'
        })
      }
      clearInviteCampaignId?.()
    }
  }, [inviteCampaignId, invitedCampaigns, loading])

  // Auto-expand campaign from URL param (e.g., from notification click)
  useEffect(() => {
    if (expandCampaignId && !loading) {
      const campaign = campaigns.find(c => c.id === expandCampaignId)

      if (campaign && selectedCampaignId !== campaign.id) {
        setSelectedInvitedCampaignId(null)
        const mainEl = document.getElementById('dashboard-main')
        if (mainEl) {
          mainEl.scrollTo({ top: 0, behavior: 'smooth' })
        }
        setSelectedCampaignId(campaign.id)
      }
      clearExpandCampaignId?.()
    }
  }, [expandCampaignId, campaigns, loading])

  // Auto-open character modal from sessionStorage (after returning from character creation)
  useEffect(() => {
    if (selectedCampaign && !loading) {
      try {
        const storedCampaignId = sessionStorage.getItem('openCharacterModalForCampaign')
        if (storedCampaignId && storedCampaignId === selectedCampaign.id) {
          sessionStorage.removeItem('openCharacterModalForCampaign')
          // Force fresh character data — user just created a character on /character/create
          queryClient.invalidateQueries({ queryKey: ['characters'] })
          setCharacterModalCampaign(selectedCampaign)
          setShowCharacterModal(true)
        }
      } catch (e) {
        // sessionStorage blocked - gracefully degrade
      }
    }
  }, [selectedCampaign, loading])

  // Notify parent when expanded state changes (either drawer)
  useEffect(() => {
    onExpandedChange?.(!!selectedCampaign || !!selectedInvitedCampaign)
  }, [selectedCampaign, selectedInvitedCampaign, onExpandedChange])

  // Live-sync the `bleedUp`-dependent values that CSS calc() can't
  // express on its own. The card's width / left / height are handled
  // by the calc() strings written in the expand tween's `onComplete`
  // (see useGSAP below) — those auto-track `100vw` / `100vh` without
  // JS. But `bleedUp` (the dashboard's responsive padding-top) does
  // change at breakpoints, so we re-read it on resize and re-apply
  // the two places it lands: the card's `marginTop` and the content
  // div's `top`.
  useEffect(() => {
    if (!selectedCampaign) return

    const syncBleedUp = () => {
      if (!rootRef.current || !campaignCardRef.current) return
      const card = campaignCardRef.current

      const mainEl = document.getElementById('dashboard-main')
      const bleedUp = mainEl
        ? parseFloat(window.getComputedStyle(mainEl).paddingTop) || 0
        : 0

      card.style.marginTop = `${-bleedUp}px`

      const content = rootRef.current.querySelector(
        `[data-campaign-content="${selectedCampaign.id}"]`
      )
      if (content) {
        content.style.top = `${bleedUp}px`
      }
    }

    window.addEventListener('resize', syncBleedUp)
    return () => {
      window.removeEventListener('resize', syncBleedUp)
    }
  }, [selectedCampaign])

  // Live min-height update for the invited drawer — same imperative
  // gsap.set approach as the main drawer above.
  useEffect(() => {
    if (!selectedInvitedCampaign) return

    const updateInvitedDrawerMinHeight = () => {
      if (!rootRef.current || !invitedCampaignCardRef.current) return
      const drawer = rootRef.current.querySelector(
        `[data-invited-drawer="${selectedInvitedCampaign.id}"]`
      )
      if (!drawer) return
      if (gsap.isTweening(drawer)) return
      const cardRect = invitedCampaignCardRef.current.getBoundingClientRect()
      const minHeight = Math.max(0, window.innerHeight - cardRect.bottom)
      gsap.set(drawer, { minHeight })
    }

    const timeouts = [50, 150, 300, 500].map((delay) =>
      setTimeout(updateInvitedDrawerMinHeight, delay)
    )

    window.addEventListener('resize', updateInvitedDrawerMinHeight)
    const mainContainer = document.getElementById('dashboard-main')
    mainContainer?.addEventListener('scroll', updateInvitedDrawerMinHeight)

    return () => {
      window.removeEventListener('resize', updateInvitedDrawerMinHeight)
      mainContainer?.removeEventListener('scroll', updateInvitedDrawerMinHeight)
      timeouts.forEach(clearTimeout)
    }
  }, [selectedInvitedCampaign])

  // Reset expanded state on unmount
  useEffect(() => {
    return () => {
      onExpandedChange?.(false)
    }
  }, [])

  // ── GSAP: main campaign tile expand/collapse ──────────────────────────
  // The card is the single animated element: it grows from 350 px
  // collapsed to 600 px expanded, and bleeds horizontally from its
  // 1410 px wrapper out to the full viewport. The sessions drawer
  // below tweens in lock-step (left / width / min-height / max-height /
  // border-width). Card border colour flips to "active" on select.
  //
  // Data attributes are used instead of refs because each element
  // lives inside `campaigns.map()` — collecting one ref per iteration
  // would take extra plumbing.
  useGSAP(() => {
    const scope = rootRef.current
    if (!scope) return

    const duration = 0.32
    const ease = 'power2.inOut'
    const id = selectedCampaign?.id

    // Upward-bleed amount — matches the dashboard's padding-top so
    // the expanded hero reaches right up to the tab nav. Measured
    // dynamically from the current computed style so responsive
    // breakpoints (pt-4 / sm:pt-8 / md:pt-10) are honoured.
    const mainEl = document.getElementById('dashboard-main')
    const bleedUp = mainEl
      ? parseFloat(window.getComputedStyle(mainEl).paddingTop) || 0
      : 0

    // Collapse every card / drawer / content back to their collapsed
    // defaults first. (No-op for ones already collapsed.) `onComplete`
    // flips the drawer's visibility / pointer-events *after* the tween
    // so the element stays rendered throughout the collapse animation —
    // previously these were flipped synchronously by React on state
    // change, which made the collapse appear instant because the DOM
    // hid itself before GSAP could animate it.
    gsap.to(scope.querySelectorAll('[data-campaign-card]'), {
      left: 0,
      width: '100%',
      height: 350,
      marginTop: 0,
      outlineColor: THEME.borderDefault,
      duration,
      ease,
    })
    // Content returns to filling the card (top: 0) on collapse. When
    // expanded it gets offset by `bleedUp` so the card's upward-bleed
    // zone shows hero only, not repositioned text.
    gsap.to(scope.querySelectorAll('[data-campaign-content]'), {
      top: 0,
      duration,
      ease,
    })
    gsap.to(scope.querySelectorAll('[data-campaign-sessions-drawer]'), {
      left: '0%',
      width: '100%',
      minHeight: 0,
      maxHeight: 0,
      // Explicit per-side widths instead of the `borderWidth`
      // shorthand — GSAP can clobber individual side overrides when
      // both shorthand + per-side are tweened together (the `2`
      // shorthand was leaking onto the top, leaving a thin lighter
      // border line at the hero/drawer seam).
      borderTopWidth: 0,
      borderRightWidth: 0,
      borderBottomWidth: 0,
      borderLeftWidth: 0,
      duration,
      ease,
      onComplete() { gsap.set(this.targets(), { visibility: 'hidden', pointerEvents: 'none' }) },
    })

    if (id) {
      const card = scope.querySelector(`[data-campaign-card="${id}"]`)
      const content = scope.querySelector(`[data-campaign-content="${id}"]`)
      const drawer = scope.querySelector(`[data-campaign-sessions-drawer="${id}"]`)

      gsap.set(drawer, { visibility: 'visible', pointerEvents: 'auto' })

      // Pixel targets for the horizontal card bleed. The wrapper is
      // capped at 1410 px and centred; the card slides left by the
      // wrapper's viewport offset and widens to fill the viewport.
      // The 2 px overrun on each side compensates for a sub-pixel
      // rounding quirk where `window.innerWidth` can return 1 px less
      // than the actual viewport width on some displays — without it,
      // there's a 1 px cream gap on the right edge of the hero.
      const wrapper = card?.parentElement
      const wrapperRect = wrapper?.getBoundingClientRect()
      const viewportWidth = window.innerWidth + 4
      const leftOffset = wrapperRect ? -wrapperRect.left - 2 : 0

      // Hero card fills the viewport on expand. `visibleHeight` is the
      // height the user actually sees (from the card's natural top
      // down to the viewport bottom, floored at 600 px as the
      // minimum). The rendered card height is `visibleHeight +
      // bleedUp` because the card also bleeds up by `bleedUp` via
      // negative margin-top; GSAP tweens both properties together so
      // the bottom edge lands exactly at the viewport bottom.
      const cardRect = card?.getBoundingClientRect()
      const naturalCardTop = cardRect ? cardRect.top : 0
      const visibleHeight = Math.max(600, window.innerHeight - naturalCardTop)
      // Drawer sits *below* the hero now — the user scrolls down to
      // reach it rather than having it fill the space between hero's
      // bottom and viewport bottom. Its height is fixed to what a
      // single CTA row needs (a touch more on small viewports where
      // the buttons may wrap).
      const drawerHeightTarget = 120

      // `overwrite: 'auto'` — tells GSAP to kill any in-flight tween
      // affecting the same properties on these targets. Necessary
      // because the collapse-all tweens above run simultaneously on
      // this same element; without overwrite they'd fight the expand
      // tween and the element would never visibly grow.
      //
      // Hand-off pattern for viewport-reactive dimensions: GSAP tweens
      // pixel-to-pixel for a smooth expand, then `onComplete` swaps
      // the captured pixel values for CSS `calc()` + viewport units
      // so the browser takes over resize tracking. Without this,
      // resizing the window after expand leaves the card stuck at
      // whatever pixel values GSAP captured at expand time — the
      // pre-GSAP implementation avoided this by expressing these
      // values as `calc(100vw - ...)` / `calc(100vh - ...)` directly.
      gsap.to(card, {
        left: leftOffset,
        width: viewportWidth,
        // Grow height by the bleed amount so the card's bottom stays
        // put while the top extends upward.
        height: visibleHeight + bleedUp,
        marginTop: -bleedUp,
        outlineColor: THEME.borderActive,
        duration,
        ease,
        overwrite: 'auto',
        onComplete: () => {
          card.style.left = 'calc(50% - 50vw - 2px)'
          card.style.width = 'calc(100vw + 4px)'
          // `naturalTop` (the wrapper's page-relative top) is measured
          // once; the browser reruns the calc on viewport height
          // change so the card always fills down to the viewport
          // bottom, floored at 600 px.
          card.style.height = `max(${600 + bleedUp}px, calc(100vh - ${naturalCardTop}px + ${bleedUp}px))`
        },
      })
      // Shift the content downward by `bleedUp` so only the upper
      // bleed zone shows hero image; the text block's y-position
      // stays where it was before expansion.
      gsap.to(content, {
        top: bleedUp,
        duration,
        ease,
        overwrite: 'auto',
      })
      gsap.to(drawer, {
        left: 'calc(50% - 50vw)',
        width: '100vw',
        minHeight: drawerHeightTarget,
        maxHeight: drawerHeightTarget * 3,
        // Explicit per-side widths — using the `borderWidth: 2`
        // shorthand alongside `borderTopWidth: 0` caused GSAP to
        // write the shorthand AFTER the per-side override, leaving a
        // 2 px top border in `borderSubtle` colour visible at the
        // seam. Per-side properties only ⇒ no shorthand conflict.
        borderTopWidth: 0,
        borderRightWidth: 2,
        borderBottomWidth: 2,
        borderLeftWidth: 2,
        duration,
        ease,
        overwrite: 'auto',
      })
    }
  }, { dependencies: [selectedCampaign?.id], scope: rootRef })

  // ── GSAP: invited campaign tile expand/collapse ──────────────────────
  // Mirror of the main tile animation above — only the border-colour
  // default differs (invited tiles use a green accent, main tiles use
  // the standard neutral). Two useGSAP blocks rather than one so each
  // has its own dependency and won't re-tween the other set on state
  // changes that don't affect it.
  useGSAP(() => {
    const scope = rootRef.current
    if (!scope) return

    const duration = 0.32
    const ease = 'power2.inOut'
    const id = selectedInvitedCampaign?.id
    const INVITED_BORDER_DEFAULT = '#16a34a'

    // Upward-bleed amount — same rationale as main tile above.
    const mainEl = document.getElementById('dashboard-main')
    const bleedUp = mainEl
      ? parseFloat(window.getComputedStyle(mainEl).paddingTop) || 0
      : 0

    gsap.to(scope.querySelectorAll('[data-invited-card]'), {
      left: 0,
      width: '100%',
      height: 350,
      marginTop: 0,
      outlineColor: INVITED_BORDER_DEFAULT,
      duration,
      ease,
    })
    gsap.to(scope.querySelectorAll('[data-invited-content]'), {
      top: 0,
      duration,
      ease,
    })
    gsap.to(scope.querySelectorAll('[data-invited-drawer]'), {
      left: '0%',
      width: '100%',
      minHeight: 0,
      maxHeight: 0,
      borderWidth: 0,
      duration,
      ease,
      onComplete() { gsap.set(this.targets(), { visibility: 'hidden', pointerEvents: 'none' }) },
    })

    if (id) {
      const card = scope.querySelector(`[data-invited-card="${id}"]`)
      const content = scope.querySelector(`[data-invited-content="${id}"]`)
      const drawer = scope.querySelector(`[data-invited-drawer="${id}"]`)

      gsap.set(drawer, { visibility: 'visible', pointerEvents: 'auto' })

      // See main-tile block above for the +4 / −2 overrun rationale
      // (covers a sub-pixel rounding quirk that otherwise leaves a
      // 1 px cream gap on the hero's right edge).
      const wrapper = card?.parentElement
      const wrapperRect = wrapper?.getBoundingClientRect()
      const viewportWidth = window.innerWidth + 4
      const leftOffset = wrapperRect ? -wrapperRect.left - 2 : 0

      const cardRect = card?.getBoundingClientRect()
      const expandedBottom = cardRect ? cardRect.top + 600 : 0
      const drawerMinHeight = cardRect ? Math.max(0, window.innerHeight - expandedBottom) : 0

      // overwrite: 'auto' — see main-tile block above for rationale.
      gsap.to(card, {
        left: leftOffset,
        width: viewportWidth,
        height: 600 + bleedUp,
        marginTop: -bleedUp,
        outlineColor: THEME.borderActive,
        duration,
        ease,
        overwrite: 'auto',
      })
      gsap.to(content, {
        top: bleedUp,
        duration,
        ease,
        overwrite: 'auto',
      })
      gsap.to(drawer, {
        left: 'calc(50% - 50vw)',
        width: '100vw',
        minHeight: drawerMinHeight,
        maxHeight: Math.max(drawerMinHeight * 10, 10000),
        borderWidth: 2,
        duration,
        ease,
        overwrite: 'auto',
      })
    }
  }, { dependencies: [selectedInvitedCampaign?.id], scope: rootRef })

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{borderColor: THEME.borderActive}}></div>
        <span className="ml-2" style={{color: THEME.textSecondary}}>Loading campaigns...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6" ref={rootRef}>
      {/* CSS for animations */}
      <style jsx>{`
        @keyframes gradient-x {
          0%{
            background-position: 100% 100%;
          }
          100%{
            background-position: 0% 0%;
          }
        }
        .animate-gradient-x {
          background: linear-gradient(
            -45deg,
            #22c55e 0%,
            #16a34a 12.5%,
            #22c55e 25%,
            #16a34a 37.5%,
            #22c55e 50%,
            #16a34a 62.5%,
            #22c55e 75%,
            #16a34a 87.5%,
            #22c55e 100%
          );

          background-size: 400% 400%;
          animation: gradient-x 3s linear infinite;
        }

        @keyframes scaleIn {
          0% {
            transform: translateX(-50%) scale(0.96);
          }
          100% {
            transform: translateX(-50%) scale(1);
          }
        }

        @keyframes stripe-slide {
          0% { background-position: 100% 0%; }
          100% { background-position: 0% 0%; }
        }

      `}</style>

      {/* Error Message */}
      {(error || queryError) && (
        <div className="px-4 py-3 rounded-sm border" style={{backgroundColor: '#991b1b', borderColor: '#dc2626', color: '#fca5a5'}}>
          {error || queryError?.message || 'An error occurred'}
        </div>
      )}

      {/* Invited Campaigns Section - Only render if there are invites */}
      {invitedCampaigns.length > 0 && (
        <div
          className="space-y-4"
          style={{
            // Constant padding — same rationale as the main section.
            paddingLeft: 'clamp(0.5rem, 2.5vw, 3.5rem)',
            paddingRight: 'clamp(0.5rem, 2.5vw, 3.5rem)',
          }}
        >
          {/* Only show header when no invited campaign is selected */}
          {!selectedInvitedCampaign && (
            <h3 className="text-lg font-[family-name:var(--font-metamorphous)] font-bold" style={{color: THEME.textBold}}>Invited Campaigns</h3>
          )}
          <div className="space-y-4">
            {invitedCampaigns
              .filter((campaign) => !selectedInvitedCampaign || selectedInvitedCampaign.id === campaign.id)
              .map((campaign) => {
                const isSelected = selectedInvitedCampaign?.id === campaign.id

                return (
                  <div
                    key={campaign.id}
                    className="w-full relative"
                    style={{
                      marginBottom: isSelected ? '0' : '3rem',
                      // Wrapper stays capped at 1410 px in both states —
                      // the card itself bleeds horizontally when expanded.
                      maxWidth: '1410px',
                      marginLeft: 'auto',
                      marginRight: 'auto',
                    }}
                  >
                    {/* Invited Campaign Card — the single animated
                        element (mirror of main-tile pattern). */}
                    <HeroBackground
                      ref={invitedCampaignCardRef}
                      campaign={campaign}
                      className="rounded-sm overflow-visible cursor-pointer"
                      data-invited-card={campaign.id}
                      style={{
                        position: 'relative',
                        left: 0,
                        width: '100%',
                        height: '350px',
                        backgroundColor: COLORS.carbon,
                        // Outline not border — see main-tile comment
                        // for why (prevents 2 px content shift).
                        outline: '2px solid',
                        outlineColor: '#16a34a',
                      }}
                      onClick={() => toggleInvitedCampaignDetails(campaign)}
                    >
                      {/* Darkening overlay for text readability */}
                      <div
                        className="absolute inset-0 rounded-sm"
                        style={{ backgroundColor: `${COLORS.onyx}B3` }}
                      />

                      {/* Content container — absolute, filling the
                          card by default. See main-tile content for
                          the upward-bleed rationale: on expand `top`
                          is tweened to the dashboard's padding-top
                          value so the hero fills the bleed zone
                          while text stays in its original position. */}
                      <div
                        data-invited-content={campaign.id}
                        className="flex flex-col justify-between p-6 absolute"
                        style={{
                          top: 0,
                          right: 0,
                          bottom: 0,
                          left: 0,
                          maxWidth: '1410px',
                          marginLeft: 'auto',
                          marginRight: 'auto',
                          zIndex: 1
                        }}
                      >
                        {/* Top Row - Title and Status Badge */}
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <h4 className="text-3xl font-[family-name:var(--font-metamorphous)] mb-1 drop-shadow-lg" style={{color: THEME.textOnDark}}>
                              {campaign.title || 'Unnamed Campaign'}
                            </h4>
                          </div>

                          {/* Action Buttons - Top Right */}
                          <div className="flex gap-2 flex-shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
                            <Badge size="md" className="mr-4">Pending Invite</Badge>
                            <Button
                              variant="success"
                              onClick={() => acceptCampaignInvite(campaign.id)}
                              title="Accept Invite"
                            >
                              <FontAwesomeIcon icon={faCheck} className="mr-2" />
                              Accept
                            </Button>
                            <Button
                              variant="danger"
                              onClick={() => declineCampaignInvite(campaign.id)}
                              title="Decline Invite"
                            >
                              <FontAwesomeIcon icon={faXmark} className="mr-2" />
                              Decline
                            </Button>
                          </div>
                        </div>

                        {/* Description - full width, below title row */}
                        {campaign.description && (
                          <div className="text-base drop-shadow-md mt-2 max-w-full sm:max-w-[70%]">
                            <p
                              style={{
                                color: THEME.textAccent,
                                whiteSpace: 'pre-line',
                                display: isSelected ? 'block' : '-webkit-box',
                                WebkitLineClamp: isSelected ? 'unset' : 3,
                                WebkitBoxOrient: isSelected ? 'unset' : 'vertical',
                                overflow: 'hidden'
                              }}
                            >
                              {campaign.description}
                            </p>
                          </div>
                        )}

                        {/* Middle - Spacer */}
                        <div className="flex-1" style={{ minHeight: 'max(1rem, 2vh)' }}></div>

                        {/* Bottom Row - Campaign Metadata */}
                        <div className="flex items-center justify-between">
                          <div className="text-sm drop-shadow" style={{color: THEME.textOnDark}}>
                            <span>{campaign.host_screen_name ? `Invited by ${campaign.host_screen_name}` : 'Invited by campaign host'}</span>
                          </div>
                        </div>
                      </div>
                    </HeroBackground>

                    {/* Invited Campaign Detail Panel — GSAP-animated
                        (mirror of main drawer). Collapsed defaults here;
                        useGSAP block tweens on selection change. */}
                    <div
                      className="relative"
                      data-invited-drawer={campaign.id}
                      style={{
                        left: '0',
                        backgroundColor: THEME.bgPanel,
                        borderColor: THEME.borderSubtle,
                        borderWidth: '0px',
                        borderStyle: 'solid',
                        width: '100%',
                        minHeight: '0px',
                        maxHeight: '0px',
                        overflow: 'hidden',
                        borderRadius: '0.125rem',
                        borderTopLeftRadius: '0',
                        borderTopRightRadius: '0',
                        // visibility + pointer-events owned by GSAP:
                        // flipped visible/auto before expand, back to
                        // hidden/none after collapse.
                        pointerEvents: 'none',
                        visibility: 'hidden',
                      }}
                    >
                      {/* Content wrapper */}
                      <div
                        className="pt-[calc(1rem+16px)] sm:pt-[calc(2rem+16px)] md:pt-[calc(2.5rem+16px)] pb-[calc(1rem+16px)] sm:pb-[calc(2rem+16px)] md:pb-[calc(2.5rem+16px)] px-[calc(1rem+12px)] sm:px-[calc(2rem+12px)] md:px-[calc(2.5rem+12px)]"
                      >
                        {/* Inner content constrained to the same 1410 px
                            centred frame as the rest of the campaigns UI. */}
                        <div style={{ maxWidth: '1410px', marginLeft: 'auto', marginRight: 'auto' }}>
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-semibold font-[family-name:var(--font-metamorphous)]" style={{color: THEME.textOnDark}}>
                              Campaign Details
                            </h3>
                            <button
                              onClick={() => setSelectedInvitedCampaignId(null)}
                              className="transition-colors text-sm"
                              style={{color: THEME.textSecondary}}
                            >
                              <FontAwesomeIcon icon={faXmark} className="mr-1" />
                              Close
                            </button>
                          </div>

                          {/* Invitation Details & Members */}
                          <div className="space-y-4">
                            <div className="p-4 rounded-sm border" style={{backgroundColor: THEME.bgSecondary, borderColor: THEME.borderSubtle}}>
                              <h4 className="font-medium mb-3" style={{color: THEME.textOnDark}}>Invitation Details</h4>
                              <p className="mb-4" style={{color: THEME.textSecondary}}>
                                {campaign.host_screen_name ? `You've been invited by ${campaign.host_screen_name} to join this campaign.` : 'You\'ve been invited to join this campaign.'}
                              </p>

                              {/* Current Members */}
                              <h4 className="font-medium mb-3 mt-6" style={{color: THEME.textOnDark}}>Current Members</h4>
                              {loadingInvitedMembers ? (
                                <div className="flex items-center py-2">
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2" style={{borderColor: THEME.borderActive}}></div>
                                  <span className="ml-2 text-sm" style={{color: THEME.textSecondary}}>Loading members...</span>
                                </div>
                              ) : invitedCampaignMembers.length === 0 ? (
                                <p className="text-sm" style={{color: THEME.textSecondary}}>No members yet.</p>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                  {invitedCampaignMembers.map((member) => (
                                    <div
                                      key={member.user_id}
                                      className="flex flex-col p-3 rounded-sm border"
                                      style={{
                                        backgroundColor: THEME.bgPanel,
                                        borderColor: THEME.borderSubtle
                                      }}
                                    >
                                      <div className="flex items-center gap-2 mb-1">
                                        <p className="font-medium" style={{color: THEME.textOnDark}}>
                                          {member.username}
                                        </p>
                                        {member.is_host && (
                                          <span
                                            className="text-xs px-2 py-0.5 rounded-sm font-semibold"
                                            style={{
                                              backgroundColor: '#854d0e',
                                              color: '#fef3c7',
                                              borderColor: '#fbbf24',
                                              border: '1px solid'
                                            }}
                                          >
                                            DM
                                          </span>
                                        )}
                                      </div>
                                      {member.character_id ? (
                                        <p className="text-sm" style={{color: THEME.textAccent}}>
                                          {member.character_name} - Level {member.character_level} {member.character_race} {member.character_class}
                                        </p>
                                      ) : (
                                        <p className="text-sm italic" style={{color: THEME.textSecondary}}>
                                          No character selected
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Action Buttons at bottom of drawer */}
                            <div className="flex gap-3 pt-4">
                              <Button
                                variant="success"
                                size="lg"
                                onClick={() => acceptCampaignInvite(campaign.id)}
                                title="Accept Invite"
                              >
                                <FontAwesomeIcon icon={faCheck} className="mr-2" />
                                Accept Invitation
                              </Button>
                              <Button
                                variant="danger"
                                size="lg"
                                onClick={() => declineCampaignInvite(campaign.id)}
                                title="Decline Invite"
                              >
                                <FontAwesomeIcon icon={faXmark} className="mr-2" />
                                Decline Invitation
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* Campaigns List - Full Width Hero Cards - Hide when invited campaign is expanded */}
      {!selectedInvitedCampaign && (
      <div
        className="space-y-4"
        style={{
          // Constant padding in both states. The card itself bleeds
          // full-viewport via GSAP on expand, so we don't need to
          // transition the outer padding to zero — and doing so caused
          // a subtle bleed miscalc because GSAP read `wrapperRect.left`
          // while the CSS padding transition was still in flight.
          paddingLeft: 'clamp(0.5rem, 2.5vw, 3.5rem)',
          paddingRight: 'clamp(0.5rem, 2.5vw, 3.5rem)',
        }}
      >
        <div className="space-y-4">
          {campaigns
            .filter((campaign) => !selectedCampaign || selectedCampaign.id === campaign.id)
            .map((campaign) => {
              const campaignSessions = allSessions.filter(session => session.campaign_id === campaign.id)
              // Active sessions are STARTING, ACTIVE, or STOPPING (excludes INACTIVE and FINISHED)
              const activeSessions = campaignSessions.filter(session =>
                session.status === 'active' || session.status === 'starting' || session.status === 'stopping'
              )
              // Domain enforces at most one non-finished session per campaign —
              // display this single "current" session in the hero's right column
              // with inline controls. If none exists, show a Create Session CTA
              // (host only) instead.
              const currentSession = campaignSessions.find(session =>
                ['inactive', 'active', 'starting', 'stopping', 'paused'].includes(session.status?.toLowerCase())
              )

              const isSelected = selectedCampaign?.id === campaign.id

              return (
                <div
                  key={campaign.id}
                  className="w-full relative"
                  style={{
                    marginBottom: isSelected ? '0' : '3rem',
                    // Wrapper stays capped at 1410 px in both states —
                    // the card itself bleeds horizontally when expanded
                    // (GSAP-animated), so the wrapper's layout footprint
                    // never changes.
                    maxWidth: '1410px',
                    marginLeft: 'auto',
                    marginRight: 'auto',
                  }}
                >
                  {/* Campaign Card — the single animated element.
                      Border colour + card dimensions (height / left /
                      width) are tweened by the `useGSAP` block above.
                      Defaults here are the collapsed state; GSAP
                      tweens them on selection change. */}
                  <HeroBackground
                    ref={campaignCardRef}
                    campaign={campaign}
                    fallback="/campaign-tile-bg.png"
                    className="rounded-sm overflow-visible cursor-pointer"
                    data-campaign-card={campaign.id}
                    style={{
                      position: 'relative',
                      left: 0,
                      width: '100%',
                      height: '350px',
                      // Outline sits outside the content-box, so the
                      // card's inner dimensions stay exactly equal to
                      // its width/height. Using a border (which is
                      // inside the content-box under box-sizing:
                      // border-box) created a 2 px content shift
                      // between the 1410 px collapsed width and the
                      // 100 vw expanded width.
                      outline: '2px solid',
                      outlineColor: THEME.borderDefault,
                    }}
                    onClick={() => toggleCampaignDetails(campaign)}
                  >
                    {/* Darkening overlay for text readability */}
                    <div
                      className="absolute inset-0 rounded-sm"
                      style={{ backgroundColor: `${COLORS.onyx}B3` }}
                    />

                    {/* Bottom gradient fade — only visible when the
                        card is expanded. Fades the hero's lower edge
                        into the drawer's panel colour (`bgPanel` =
                        `#1F1F1F`) so the seam reads as one continuous
                        surface and subtly hints there's content below
                        the fold (the CTA drawer).
                        Using `rgba(31, 31, 31, 0)` rather than
                        `transparent` for the start stop — the
                        `transparent` keyword resolves to transparent
                        *black*, which makes the interpolation walk
                        through pure black in the middle of the fade
                        and reads as a darker hump rather than a clean
                        fade. Keeping the same hue throughout keeps
                        the alpha curve clean. */}
                    {isSelected && (
                      <div
                        aria-hidden="true"
                        className="absolute left-0 right-0 bottom-0 pointer-events-none rounded-b-sm"
                        style={{
                          height: '120px',
                          background: 'linear-gradient(to bottom, rgba(31, 31, 31, 0) 0%, #1F1F1F 100%)',
                          zIndex: 0,
                        }}
                      />
                    )}

                    {/* Content container — absolute, filling the card
                        by default (top/right/bottom/left = 0). Same
                        1410 px centred cap in both states so text
                        position and line length stay consistent
                        across the state transition. When the card
                        bleeds upward on expand, the `top` is tweened
                        to the bleed amount so content stays anchored
                        at the card's lower portion — the upper bleed
                        zone shows hero only. */}
                    <div
                      data-campaign-content={campaign.id}
                      className="flex flex-col p-6 absolute"
                      style={{
                        top: 0,
                        right: 0,
                        bottom: 0,
                        left: 0,
                        maxWidth: '1410px',
                        marginLeft: 'auto',
                        marginRight: 'auto',
                        zIndex: 1
                      }}
                    >
                      {/* Title row — title stays centred (stable
                          position across collapsed + expanded), "Game
                          In Session" badge sits flush-right. The
                          left-side spacer balances the badge's width
                          so the title remains optically centred. */}
                      <div className="flex items-center gap-3 mb-4 flex-shrink-0">
                        <div className="flex-1" />
                        <h4 className="text-3xl font-[family-name:var(--font-metamorphous)] drop-shadow-lg text-center" style={{color: THEME.textOnDark}}>
                          {campaign.title || 'Unnamed Campaign'}
                        </h4>
                        <div className="flex-1 flex justify-end" style={{ visibility: activeSessions.length > 0 ? 'visible' : 'hidden' }}>
                          <Badge variant="success" size="md" pulse={activeSessions.length > 0}>
                            Game In Session
                          </Badge>
                        </div>
                      </div>

                      {/* Two-column body: description + meta on the
                          left, current session + players on the right.
                          `min-h-0` on both columns enables their
                          interior scrollable areas (description on
                          left, players list on right) to take up the
                          slack instead of overflowing the card. */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 min-h-0">
                        {/* LEFT — description (expanded only) and meta */}
                        <div className="flex flex-col gap-4 min-h-0">
                          {isSelected && campaign.description && (
                            <div
                              className="text-base drop-shadow-md overflow-y-auto"
                              style={{
                                color: THEME.textAccent,
                                whiteSpace: 'pre-line',
                              }}
                            >
                              {campaign.description}
                            </div>
                          )}
                          <div className="text-sm drop-shadow space-y-1 mt-auto" style={{color: THEME.textOnDark}}>
                            <div>
                              <span style={{color: THEME.textSecondary}}>Created: </span>
                              {campaign.created_at ? new Date(campaign.created_at).toLocaleDateString() : 'Unknown'}
                            </div>
                            <div>
                              <span style={{color: THEME.textSecondary}}>Last played: </span>
                              {campaign.last_played_at ? new Date(campaign.last_played_at).toLocaleDateString() : 'Never'}
                            </div>
                            <div>
                              <span style={{color: THEME.textSecondary}}>Assets: </span>
                              {isSelected && selectedCampaignAssetsMeta
                                ? `${selectedCampaignAssetsMeta.asset_count} · ${formatBytes(selectedCampaignAssetsMeta.total_file_size)}`
                                : '—'}
                            </div>
                          </div>
                        </div>

                        {/* RIGHT — current session + players. Inline
                            controls for the single "current" session
                            sit next to its name; players list sits
                            below with the Invite button right-aligned
                            in the section header.
                            Whole column's interior hides in the
                            collapsed preview — the grid slot stays
                            reserved so the transition doesn't reflow
                            the layout, but the content only paints
                            once the card is expanded. */}
                        <div className="flex flex-col gap-4 min-h-0">
                          {isSelected && (<>
                          {/* Current Session */}
                          <div className="flex-shrink-0">
                            <h3 className="text-lg font-semibold font-[family-name:var(--font-metamorphous)] mb-2 drop-shadow" style={{color: THEME.textOnDark}}>
                              Current Session
                            </h3>
                            {currentSession ? (
                              <div
                                className="flex items-center justify-between gap-2 p-3 rounded-sm border relative overflow-hidden"
                                style={{backgroundColor: THEME.bgSecondary, borderColor: THEME.borderSubtle}}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {/* Starting-state overlay — diagonal blue
                                    stripes sliding across the card while
                                    the session is transitioning from
                                    inactive → active. Pointer-transparent
                                    and horizontally masked so the stripes
                                    fade toward the right edge, leaving the
                                    action buttons unobscured. */}
                                {(currentSession.status === 'starting' || (startSessionMutation.isPending && startSessionMutation.variables === currentSession.id)) && (
                                  <div
                                    className="absolute inset-0 pointer-events-none"
                                    style={{
                                      background: `linear-gradient(
                                        -45deg,
                                        transparent 0%,
                                        transparent 15%,
                                        rgba(59, 130, 246, 0.45) 15%,
                                        rgba(59, 130, 246, 0.45) 20%,
                                        transparent 20%,
                                        transparent 35%,
                                        rgba(59, 130, 246, 0.45) 35%,
                                        rgba(59, 130, 246, 0.45) 40%,
                                        transparent 40%,
                                        transparent 55%,
                                        rgba(59, 130, 246, 0.45) 55%,
                                        rgba(59, 130, 246, 0.45) 60%,
                                        transparent 60%,
                                        transparent 75%,
                                        rgba(59, 130, 246, 0.45) 75%,
                                        rgba(59, 130, 246, 0.45) 80%,
                                        transparent 80%,
                                        transparent 100%
                                      )`,
                                      backgroundSize: '300% 300%',
                                      animation: 'stripe-slide 1.5s linear infinite',
                                      maskImage: 'linear-gradient(to right, black 0%, rgba(0,0,0,0.8) 15%, rgba(0,0,0,0.5) 30%, rgba(0,0,0,0.2) 45%, transparent 65%)',
                                      WebkitMaskImage: 'linear-gradient(to right, black 0%, rgba(0,0,0,0.8) 15%, rgba(0,0,0,0.5) 30%, rgba(0,0,0,0.2) 45%, transparent 65%)',
                                    }}
                                  />
                                )}
                                <div className="min-w-0 flex-1 relative">
                                  <p className="font-medium truncate" style={{color: THEME.textOnDark}}>
                                    {currentSession.name || 'Game Session'}
                                  </p>
                                  <p className="text-sm" style={{color: THEME.textSecondary}}>
                                    Status: <span className="font-medium" style={{
                                      color: currentSession.status === 'active' ? '#16a34a' :
                                             (currentSession.status === 'starting' || (startSessionMutation.isPending && startSessionMutation.variables === currentSession.id)) ? '#3b82f6' :
                                             currentSession.status === 'inactive' ? THEME.textSecondary :
                                             '#fbbf24'
                                    }}>
                                      {(currentSession.status === 'starting' || (startSessionMutation.isPending && startSessionMutation.variables === currentSession.id))
                                        ? 'Starting'
                                        : currentSession.status.charAt(0).toUpperCase() + currentSession.status.slice(1)}
                                    </span>
                                  </p>
                                </div>
                                <div className="flex gap-2 flex-shrink-0">
                                  {currentSession.status === 'active' ? (
                                    <>
                                      <Button variant="success" size="sm" onClick={() => enterGame(currentSession)}>
                                        <FontAwesomeIcon icon={faRightToBracket} className="mr-2" />Enter
                                      </Button>
                                      {campaign.host_id === user.id && (
                                        <button
                                          onClick={() => promptPauseSession(currentSession)}
                                          disabled={pauseSessionMutation.isPending && pauseSessionMutation.variables === currentSession.id}
                                          className="px-3 py-1.5 rounded-sm border transition-all text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                          style={{backgroundColor: COLORS.silver, color: THEME.textPrimary, borderColor: COLORS.smoke}}
                                          title="Pause Session"
                                          aria-label="Pause Session"
                                        >
                                          <FontAwesomeIcon icon={faPause} />
                                        </button>
                                      )}
                                    </>
                                  ) : (currentSession.status === 'starting' || currentSession.status === 'inactive') && campaign.host_id === user.id ? (
                                    <>
                                      <Button
                                        variant="success"
                                        size="sm"
                                        onClick={() => startGame(currentSession.id)}
                                        disabled={(startSessionMutation.isPending && startSessionMutation.variables === currentSession.id) || activeSessions.length > 0 || currentSession.status === 'starting'}
                                      >
                                        <FontAwesomeIcon icon={faPlay} className="mr-2" />Start
                                      </Button>
                                      <button
                                        onClick={() => promptFinishSession(currentSession)}
                                        disabled={(finishSessionMutation.isPending && finishSessionMutation.variables === currentSession.id) || currentSession.status === 'starting'}
                                        className="px-3 py-1.5 rounded-sm border transition-all text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                        style={{backgroundColor: '#991b1b', color: COLORS.smoke, borderColor: '#dc2626'}}
                                        title="Finish Session"
                                        aria-label="Finish Session"
                                      >
                                        <FontAwesomeIcon icon={faXmark} />
                                      </button>
                                    </>
                                  ) : null}
                                </div>
                              </div>
                            ) : campaign.host_id === user.id ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); openCreateGameModal(campaign.id) }}
                                className="w-full flex items-center gap-3 p-3 rounded-sm border-2 border-dashed transition-all hover:border-opacity-100"
                                style={{backgroundColor: `${THEME.bgSecondary}80`, borderColor: `${THEME.borderActive}60`}}
                              >
                                <FontAwesomeIcon icon={faPlus} className="text-xl" style={{color: THEME.textAccent}} />
                                <span className="font-medium text-sm" style={{color: THEME.textOnDark}}>Create new session</span>
                              </button>
                            ) : (
                              <p className="text-sm italic p-3" style={{color: THEME.textSecondary}}>
                                No active session
                              </p>
                            )}
                          </div>

                          {/* Players + Invite — fixed 2×5 grid of
                              "seats". Always renders 10 slots;
                              occupied seats show the member, vacant
                              seats render as muted "Empty" tiles.
                              Keeps the visual footprint consistent
                              regardless of campaign size and gives
                              the invite action a clearer context
                              (you're filling remaining seats). */}
                          <div className="flex flex-col flex-1 min-h-0">
                            <div className="flex items-center justify-between mb-2 flex-shrink-0">
                              <h3 className="text-lg font-semibold font-[family-name:var(--font-metamorphous)] drop-shadow" style={{color: THEME.textOnDark}}>
                                Players
                              </h3>
                              <button
                                onClick={(e) => { e.stopPropagation(); setInviteModalCampaignId(campaign.id) }}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm border text-xs transition-all hover:opacity-80"
                                style={{backgroundColor: 'transparent', color: COLORS.smoke, borderColor: THEME.borderSubtle}}
                              >
                                <FontAwesomeIcon icon={faUserPlus} className="h-3 w-3" />
                                <span>Invite</span>
                              </button>
                            </div>

                            <div
                              className="grid grid-cols-2 gap-1.5 overflow-y-auto pr-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {Array.from({ length: 10 }, (_, slotIdx) => {
                                const member = campaign.members?.[slotIdx]
                                if (!member) {
                                  return (
                                    <div
                                      key={`empty-${slotIdx}`}
                                      className="flex items-center justify-center px-3 py-4 rounded-sm border border-dashed"
                                      style={{
                                        backgroundColor: `${THEME.bgSecondary}40`,
                                        borderColor: THEME.borderSubtle,
                                      }}
                                    >
                                      <span className="text-sm italic" style={{color: THEME.textSecondary}}>{slotIdx + 1}</span>
                                    </div>
                                  )
                                }
                                // Second line: role-specific descriptor for
                                // DM/mod/spectator (who don't hold a
                                // character), or the player's character
                                // summary if they've selected one.
                                const characterLine = member.is_host
                                  ? 'Dungeon Master'
                                  : member.campaign_role === 'mod'
                                    ? 'Moderator'
                                    : member.character_id
                                      ? `${member.character_name} · Lv ${member.character_level} ${member.character_class}`
                                      : 'No character selected'
                                return (
                                  <div
                                    key={member.user_id}
                                    className="flex items-stretch justify-between rounded-sm border overflow-hidden relative"
                                    style={{backgroundColor: THEME.bgSecondary, borderColor: THEME.borderSubtle}}
                                  >
                                    {/* Hero-image wedge — angled reveal of
                                        the default character portrait on
                                        the card's right side, with a dark
                                        gradient perpendicular to the
                                        slope so the text on the left
                                        stays readable. Same pattern as
                                        the workshop tool cards. Swap
                                        `/heroes.png` for a per-character
                                        portrait once character image
                                        uploads exist. */}
                                    <div
                                      aria-hidden="true"
                                      className="absolute top-0 bottom-0 right-0 pointer-events-none bg-cover bg-center"
                                      style={{
                                        // Div now wraps just the wedge's
                                        // bounding box (right 42 % of the
                                        // card) so `bg-cover` fits the
                                        // character image to the wedge
                                        // region instead of the whole
                                        // card. Clip-path coords + gradient
                                        // stops re-expressed in this
                                        // local frame.
                                        width: '42%',
                                        clipPath: 'polygon(33% 0, 100% 0, 100% 100%, 0 100%)',
                                        backgroundImage: `linear-gradient(105deg, rgba(0, 0, 0, 0.55) 15%, transparent 45%), url('/heroes.png')`,
                                      }}
                                    />
                                    <PlayerCardAction
                                      isDm={member.is_host}
                                      canRemove={!member.is_host && campaign.host_id === user.id}
                                      onRemove={() => setRemovePlayerTarget({ campaign, member })}
                                    />
                                    <div className="relative z-10 flex flex-col gap-0.5 min-w-0 flex-1 justify-center px-3 py-2">
                                      {/* Top line: username + role badges
                                          (DM badge lives in the left-edge
                                          sibling instead; only MOD shows
                                          inline for now). */}
                                      <div className="flex items-center gap-2 min-w-0">
                                        <p className="font-medium text-sm truncate drop-shadow" style={{color: THEME.textOnDark}}>
                                          {member.username}
                                        </p>
                                        {member.campaign_role === 'mod' && (
                                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-sm flex-shrink-0" style={{backgroundColor: '#1e3a5f', color: '#93c5fd'}}>MOD</span>
                                        )}
                                      </div>
                                      {/* Bottom line: character meta or
                                          role descriptor (italic + muted
                                          when no character is selected). */}
                                      <p
                                        className={`text-xs truncate drop-shadow${!member.character_id && !member.is_host && member.campaign_role !== 'mod' ? ' italic' : ''}`}
                                        style={{
                                          color: member.character_id ? THEME.textAccent : THEME.textSecondary,
                                        }}
                                      >
                                        {characterLine}
                                      </p>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                          </>)}
                        </div>
                      </div>
                    </div>
                  </HeroBackground>

                  {/* Game Sessions Detail Panel — GSAP (see useGSAP
                      block above) animates left, width, min-height,
                      max-height, and border-width between the collapsed
                      defaults below and the expanded values on selection. */}
                  <div
                    ref={gameSessionsPanelRef}
                    className="relative"
                    data-campaign-sessions-drawer={campaign.id}
                    style={{
                      left: '0',
                      backgroundColor: THEME.bgPanel,
                      borderColor: THEME.borderSubtle,
                      borderWidth: '0px',
                      borderStyle: 'solid',
                      width: '100%',
                      minHeight: '0px',
                      maxHeight: '0px',
                      overflow: 'hidden',
                      borderRadius: '0.125rem',
                      borderTopLeftRadius: '0',
                      borderTopRightRadius: '0',
                      // The dashboard's page background is `smoke`
                      // (light cream) — the dark hero + drawer are
                      // surfaces sitting on top. A 1 px sub-pixel gap
                      // between them shows the cream page bg through
                      // and reads as a lighter hairline at the seam.
                      // Pull the drawer up slightly so its bg overlaps
                      // the card's bottom and absorbs any rounding
                      // gap.
                      marginTop: '-2px',
                      // flipped visible/auto before expand, back to
                      // hidden/none after collapse.
                      pointerEvents: 'none',
                      visibility: 'hidden',
                    }}
                  >
                    {/* Drawer content — trimmed to a footer-strip of
                        campaign-level CTAs. All per-session and
                        per-member surfaces moved into the hero card
                        above. */}
                    <div className="py-6 px-[calc(1rem+12px)] sm:px-[calc(2rem+12px)] md:px-[calc(2.5rem+12px)]">
                      <div style={{ maxWidth: '1410px', marginLeft: 'auto', marginRight: 'auto' }}>
                        {campaign.host_id === user.id ? (
                          <div className="flex flex-wrap items-center gap-3 justify-between">
                            <div className="flex flex-wrap items-center gap-3">
                              {/* Configure */}
                              <button
                                onClick={() => {
                                  const campaignSessionsLocal = allSessions.filter(s => s.campaign_id === selectedCampaign.id)
                                  const curr = campaignSessionsLocal.find(s => s.status !== 'finished')
                                  setCampaignForm({
                                    editingCampaign: selectedCampaign,
                                    title: selectedCampaign.title,
                                    description: selectedCampaign.description || '',
                                    heroImage: selectedCampaign.hero_image_asset ? null : (selectedCampaign.hero_image || '/campaign-tile-bg.png'),
                                    heroImageAssetId: selectedCampaign.hero_image_asset?.asset_id || null,
                                    sessionName: curr?.name || ''
                                  })
                                  setCampaignFormOpen(true)
                                }}
                                className="flex items-center gap-2 px-3 h-10 rounded-sm transition-all border"
                                style={{backgroundColor: THEME.bgSecondary, color: COLORS.smoke, borderColor: THEME.borderActive}}
                              >
                                <FontAwesomeIcon icon={faGear} className="h-4 w-4" />
                                <span className="text-sm font-medium">Configure</span>
                              </button>

                              {/* Set Moderator (templated) */}
                              <button
                                onClick={() => { /* TODO: wire to moderator picker modal */ }}
                                className="flex items-center gap-2 px-3 h-10 rounded-sm transition-all border"
                                style={{backgroundColor: THEME.bgSecondary, color: COLORS.smoke, borderColor: THEME.borderActive}}
                              >
                                <FontAwesomeIcon icon={faUserShield} className="h-4 w-4" />
                                <span className="text-sm font-medium">Set Moderator</span>
                              </button>

                              {/* View Assets — routes to library tab with
                                  a campaign query param. The library view's
                                  filter-by-campaign surface hasn't been
                                  built yet; the param is in place so
                                  that change is a read-side-only update. */}
                              <button
                                onClick={() => router.push(`/dashboard?tab=library&campaign=${campaign.id}`)}
                                className="flex items-center gap-2 px-3 h-10 rounded-sm transition-all border"
                                style={{backgroundColor: THEME.bgSecondary, color: COLORS.smoke, borderColor: THEME.borderActive}}
                              >
                                <FontAwesomeIcon icon={faFolderOpen} className="h-4 w-4" />
                                <span className="text-sm font-medium">View Assets</span>
                              </button>

                              {/* Delete */}
                              <button
                                onClick={() => promptDeleteCampaign(selectedCampaign)}
                                disabled={deleteCampaignMutation.isPending}
                                className="flex items-center gap-2 px-3 h-10 rounded-sm transition-all border disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{backgroundColor: '#991b1b', color: COLORS.smoke, borderColor: '#dc2626'}}
                              >
                                <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                                <span className="text-sm font-medium">Delete Campaign</span>
                              </button>
                            </div>

                            <button
                              onClick={() => setSelectedCampaignId(null)}
                              className="transition-colors text-sm flex items-center"
                              style={{color: THEME.textSecondary}}
                            >
                              <FontAwesomeIcon icon={faXmark} className="mr-1" />
                              Close
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-3">
                            <button
                              onClick={() => setLeaveCampaignTarget(campaign)}
                              className="px-4 py-2 rounded-sm border transition-all text-sm font-medium flex items-center gap-2 hover:bg-red-900/50"
                              style={{
                                backgroundColor: 'transparent',
                                color: '#dc2626',
                                borderColor: '#dc2626'
                              }}
                            >
                              <FontAwesomeIcon icon={faRightFromBracket} />
                              Leave Campaign
                            </button>
                            <button
                              onClick={() => setSelectedCampaignId(null)}
                              className="transition-colors text-sm flex items-center"
                              style={{color: THEME.textSecondary}}
                            >
                              <FontAwesomeIcon icon={faXmark} className="mr-1" />
                              Close
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                </div>
              )
            })}

            {/* Create Campaign Template Tile - Only render when no campaign is selected */}
            {!selectedCampaign && (
              <div
                className="w-full"
                style={{ maxWidth: '1410px', marginLeft: 'auto', marginRight: 'auto' }}
              >
                <button
                  onClick={() => { setCampaignForm({ title: '', description: '', heroImage: '/campaign-tile-bg.png', heroImageAssetId: null, sessionName: '', editingCampaign: null }); setCampaignFormOpen(true) }}
                  className="aspect-[16/4] w-full relative rounded-sm overflow-hidden"
                  style={{
                    backgroundColor: 'transparent'
                  }}
                >
                    {/* Knocked-out overlay */}
                    <div
                      className="absolute inset-0 flex flex-col items-center justify-center p-6"
                      style={{
                        backgroundColor: `${THEME.bgPanel}40` // 25% opacity for knocked-out effect
                      }}
                    >
                      <FontAwesomeIcon
                        icon={faPlus}
                        className="text-6xl mb-4 opacity-50"
                        style={{color: COLORS.smoke}}
                      />
                      <h4 className="text-2xl font-[family-name:var(--font-metamorphous)] mb-2 opacity-50" style={{color: THEME.textPrimary}}>
                        Create New Campaign
                      </h4>
                    </div>
                  </button>
              </div>
            )}
          </div>
      </div>
      )}

      {/* Game Creation Modal */}
      <Modal open={!!createSessionCampaignId} onClose={() => setCreateSessionCampaignId(null)} size="md">
        <div className="p-6">
          <h3 className="text-lg font-semibold font-[family-name:var(--font-metamorphous)] mb-4 text-content-on-dark">Create New Game</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-content-on-dark">
                Game Name
              </label>
              <input
                type="text"
                value={sessionForm.name}
                onChange={(e) => setSessionForm(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 rounded-sm border focus:outline-none focus:ring-2 bg-surface-primary border-border text-content-primary"
                placeholder="Enter game name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-content-on-dark">
                Number of Seats (1-8)
              </label>
              <select
                value={sessionForm.maxPlayers}
                onChange={(e) => setSessionForm(prev => ({ ...prev, maxPlayers: parseInt(e.target.value) }))}
                className="w-full px-3 py-2 rounded-sm border focus:outline-none focus:ring-2 bg-surface-primary border-border text-content-primary"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map(num => (
                  <option key={num} value={num}>{num} seats</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button
              variant="ghost"
              onClick={() => setCreateSessionCampaignId(null)}
            >
              Cancel
            </Button>
            <Button
              variant="success"
              onClick={createGame}
              disabled={!sessionForm.name.trim() || createSessionMutation.isPending}
            >
              {createSessionMutation.isPending ? (
                <>
                  <Spinner size="sm" className="border-white mr-2" />
                  Creating...
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faPlus} className="mr-2" />
                  Create Game
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Create/Edit Campaign Modal */}
      <Modal open={campaignFormOpen} onClose={closeCampaignForm} size="2xl">
        {/* Header */}
        <div className="p-6 border-b border-border-subtle">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold font-[family-name:var(--font-metamorphous)] text-content-on-dark">
              {campaignForm.editingCampaign ? 'Edit Campaign' : 'Create New Campaign'}
            </h2>
            <button
              onClick={closeCampaignForm}
              className="text-2xl font-bold hover:opacity-80 transition-opacity text-content-secondary"
            >
              ×
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2 text-content-on-dark">
              Campaign Title
            </label>
            <input
              type="text"
              value={campaignForm.title}
              onChange={(e) => setCampaignForm(prev => ({ ...prev, title: e.target.value }))}
              className="w-full px-3 py-2 rounded-sm border focus:outline-none focus:ring-2 bg-surface-primary border-border text-content-primary"
              placeholder="Enter campaign title"
              maxLength={100}
            />
            <div className="text-right text-sm mt-1 text-content-secondary">
              {(campaignForm.title || '').length}/100 characters
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 text-content-on-dark">
              Description (Optional)
            </label>
            <textarea
              value={campaignForm.description}
              onChange={(e) => setCampaignForm(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-3 py-2 rounded-sm border focus:outline-none focus:ring-2 bg-surface-primary border-border text-content-primary"
              rows="5"
              placeholder="Enter campaign description"
              maxLength={1000}
            />
            <div className="text-right text-sm mt-1 text-content-secondary">
              {(campaignForm.description || '').length}/1000 characters
            </div>
          </div>
          {/* Session Name - shown in both create and edit modes */}
          <div>
            <label className="block text-sm font-medium mb-2 text-content-on-dark">
              Session Name (Optional)
            </label>
            <input
              type="text"
              value={campaignForm.sessionName}
              onChange={(e) => setCampaignForm(prev => ({ ...prev, sessionName: e.target.value }))}
              className="w-full px-3 py-2 rounded-sm border focus:outline-none focus:ring-2 bg-surface-primary border-border text-content-primary"
              placeholder="e.g. Session 1"
              maxLength={100}
            />
            <div className="text-right text-sm mt-1 text-content-secondary">
              {(campaignForm.sessionName || '').length}/100 characters
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 text-content-on-dark">
              Tile Background
            </label>
            <div className="flex flex-wrap gap-3">
              {[
                { value: '/campaign-tile-bg.png', label: 'Mountains' },
                { value: '/floating-city.png', label: 'Floating City' },
                { value: '/barren-land.png', label: 'Barren' },
                { value: '/underworld.png', label: 'Underworld' },
                { value: null, label: 'None' }
              ].map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => setCampaignForm(prev => ({ ...prev, heroImage: option.value, heroImageAssetId: null }))}
                  className={`aspect-[16/9] rounded-sm border-2 overflow-hidden relative ${
                    !campaignForm.heroImageAssetId && campaignForm.heroImage === option.value ? 'border-border-active' : 'border-border'
                  }`}
                  style={{
                    width: 'calc(33.333% - 0.5rem)',
                    backgroundColor: option.value ? 'transparent' : COLORS.carbon
                  }}
                >
                  {option.value && (
                    <img
                      src={option.value}
                      alt={option.label}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  )}
                  <span
                    className="absolute bottom-1 left-1 right-1 text-xs px-1 py-0.5 rounded-sm text-center text-content-accent"
                    style={{ backgroundColor: `${COLORS.onyx}CC` }}
                  >
                    {option.label}
                  </span>
                </button>
              ))}
            </div>

            {/* Library Images */}
            {libraryImages.length > 0 && (
              <>
                <p className="text-xs font-medium mt-4 mb-2 text-content-secondary">From Library</p>
                <div className="flex flex-wrap gap-3">
                  {libraryImages.map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => setCampaignForm(prev => ({ ...prev, heroImage: null, heroImageAssetId: asset.id }))}
                      className={`aspect-[16/9] rounded-sm border-2 overflow-hidden relative ${
                        campaignForm.heroImageAssetId === asset.id ? 'border-border-active' : 'border-border'
                      }`}
                      style={{ width: 'calc(33.333% - 0.5rem)' }}
                    >
                      <S3Image
                        src={asset.s3_url}
                        fileSize={asset.file_size}
                        assetId={asset.id}
                        alt={asset.filename}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      <span
                        className="absolute bottom-1 left-1 right-1 text-xs px-1 py-0.5 rounded-sm text-center text-content-accent truncate"
                        style={{ backgroundColor: `${COLORS.onyx}CC` }}
                      >
                        {asset.filename}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border-subtle flex justify-end gap-3">
          <Button
            variant="ghost"
            onClick={closeCampaignForm}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={campaignForm.editingCampaign ? updateCampaign : createCampaign}
            disabled={!campaignForm.title.trim() || (createCampaignMutation.isPending || updateCampaignMutation.isPending)}
          >
            {(createCampaignMutation.isPending || updateCampaignMutation.isPending) ? (
              <>
                <Spinner size="sm" className="border-white mr-2" />
                {campaignForm.editingCampaign ? 'Saving...' : 'Creating...'}
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={campaignForm.editingCampaign ? faGear : faPlus} className="mr-2" />
                {campaignForm.editingCampaign ? 'Save Changes' : 'Create Campaign'}
              </>
            )}
          </Button>
        </div>
      </Modal>

      {/* Pause Session Confirmation Modal */}
      {pauseSessionTarget && (
        <PauseSessionModal
          game={pauseSessionTarget}
          onConfirm={confirmPauseSession}
          onCancel={cancelPauseSession}
          isPausing={pauseSessionMutation.isPending}
        />
      )}

      {/* Finish Session Confirmation Modal */}
      {finishSessionTarget && (
        <FinishSessionModal
          game={finishSessionTarget}
          onConfirm={confirmFinishSession}
          onCancel={cancelFinishSession}
          isFinishing={finishSessionMutation.isPending}
        />
      )}

      {/* Delete Campaign Confirmation Modal */}
      {deleteCampaignTarget && (
        <DeleteCampaignModal
          campaign={deleteCampaignTarget}
          onConfirm={confirmDeleteCampaign}
          onCancel={cancelDeleteCampaign}
          isDeleting={deleteCampaignMutation.isPending}
        />
      )}

      {/* Delete Session Confirmation Modal */}
      {deleteSessionTarget && (
        <DeleteSessionModal
          session={deleteSessionTarget}
          onConfirm={deleteGame}
          onCancel={closeDeleteSessionModal}
          isDeleting={deleteSessionMutation.isPending}
        />
      )}

      {/* Campaign Invite Modal */}
      {inviteModalCampaign && (
        <CampaignInviteModal
          campaign={inviteModalCampaign}
          onClose={() => setInviteModalCampaignId(null)}
          onInviteSuccess={handleCampaignInviteSuccess}
        />
      )}

      {/* Character Selection Modal */}
      {showCharacterModal && characterModalCampaign && (
        <CharacterSelectionModal
          campaign={characterModalCampaign}
          characters={characters}
          onClose={() => {
            setShowCharacterModal(false)
            setCharacterModalCampaign(null)
          }}
          onCharacterSelected={handleCharacterSelected}
          onCreateCharacter={() => {
            const campaignId = characterModalCampaign.id
            setShowCharacterModal(false)
            setCharacterModalCampaign(null)
            router.push(`/character/create?return_campaign=${campaignId}`)
          }}
        />
      )}

      {/* Remove Player Confirmation Modal */}
      <Modal open={!!removePlayerTarget} onClose={removePlayerMutation.isPending ? () => {} : () => setRemovePlayerTarget(null)} size="md">
        <div className="p-6">
          <h3 className="text-lg font-semibold font-[family-name:var(--font-metamorphous)] mb-4 text-content-on-dark">
            Remove Player
          </h3>
          <p className="mb-6 text-content-secondary">
            Are you sure you want to remove <span className="font-semibold text-content-on-dark">{removePlayerTarget?.member?.username}</span> from <span className="font-semibold text-content-on-dark">{removePlayerTarget?.campaign?.title}</span>?
          </p>
          <p className="text-sm mb-6 text-feedback-warning">
            This player will need to be re-invited to rejoin the campaign.
          </p>
          <div className="flex justify-end gap-3">
            <Button
              variant="ghost"
              onClick={() => setRemovePlayerTarget(null)}
              disabled={removePlayerMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={removePlayerFromCampaign}
              disabled={removePlayerMutation.isPending}
            >
              {removePlayerMutation.isPending ? (
                <>
                  <Spinner size="sm" className="border-white mr-2" />
                  Removing...
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faUserMinus} className="mr-2" />
                  Remove Player
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Leave Campaign Confirmation Modal */}
      <Modal open={!!leaveCampaignTarget} onClose={leaveCampaignMutation.isPending ? () => {} : () => setLeaveCampaignTarget(null)} size="md">
        <div className="p-6">
          <h3 className="text-lg font-semibold font-[family-name:var(--font-metamorphous)] mb-4 text-content-on-dark">
            Leave Campaign
          </h3>
          <p className="mb-6 text-content-secondary">
            Are you sure you want to leave <span className="font-semibold text-content-on-dark">{leaveCampaignTarget?.title}</span>?
          </p>
          <p className="text-sm mb-6 text-feedback-warning">
            You will need to be re-invited by the host to rejoin this campaign.
          </p>
          <div className="flex justify-end gap-3">
            <Button
              variant="ghost"
              onClick={() => setLeaveCampaignTarget(null)}
              disabled={leaveCampaignMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={leaveCampaign}
              disabled={leaveCampaignMutation.isPending}
            >
              {leaveCampaignMutation.isPending ? (
                <>
                  <Spinner size="sm" className="border-white mr-2" />
                  Leaving...
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faRightFromBracket} className="mr-2" />
                  Leave Campaign
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  )
}