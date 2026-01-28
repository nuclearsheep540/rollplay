/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import PauseSessionModal from './PauseSessionModal'
import FinishSessionModal from './FinishSessionModal'
import DeleteCampaignModal from './DeleteCampaignModal'
import DeleteSessionModal from './DeleteSessionModal'
import CampaignInviteModal from './CampaignInviteModal'
import InviteButton from '../../shared/components/InviteButton'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faGear,
  faGamepad,
  faTrash,
  faCheck,
  faXmark,
  faPlus,
  faPlay,
  faPause,
  faRightToBracket,
  faUserPlus,
  faUserMinus,
  faRightFromBracket
} from '@fortawesome/free-solid-svg-icons'
import { COLORS, THEME } from '@/app/styles/colorTheme'
import { Button, Badge } from './shared/Button'

export default function CampaignManager({ user, refreshTrigger, onCampaignUpdate, onExpandedChange, inviteCampaignId, clearInviteCampaignId, expandCampaignId, clearExpandCampaignId, showToast }) {
  const router = useRouter()
  const [campaigns, setCampaigns] = useState([])
  const [invitedCampaigns, setInvitedCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedCampaign, setSelectedCampaign] = useState(null)
  const [selectedInvitedCampaign, setSelectedInvitedCampaign] = useState(null) // Track expanded invited campaign
  const [invitedCampaignMembers, setInvitedCampaignMembers] = useState([]) // Members for selected invited campaign
  const [loadingInvitedMembers, setLoadingInvitedMembers] = useState(false)
  const [allSessions, setAllSessions] = useState([]) // Store all sessions from all campaigns
  const [isResizing, setIsResizing] = useState(false) // Track window resize state

  // Action state tracking (not modals, but ongoing operations)
  const [startingGame, setStartingGame] = useState(null) // Track game currently being started
  const [pausingGame, setPausingGame] = useState(null) // Track game being paused
  const [finishingGame, setFinishingGame] = useState(null) // Track game being finished
  const [deletingGame, setDeletingGame] = useState(null) // Track game being deleted

  const gameSessionsPanelRef = useRef(null)
  const campaignCardRef = useRef(null)
  const invitedCampaignCardRef = useRef(null) // Ref for invited campaign card
  const [drawerTop, setDrawerTop] = useState(null) // Distance from viewport top to drawer start
  const [invitedDrawerTop, setInvitedDrawerTop] = useState(null) // Distance for invited campaign drawer

  // Consolidated modal state
  const [modals, setModals] = useState({
    campaignCreate: { open: false, title: '', description: '', heroImage: '/campaign-tile-bg.png', sessionName: '', isCreating: false, editingCampaign: null },
    campaignDelete: { open: false, campaign: null, isDeleting: false },
    campaignInvite: { open: false, campaign: null },
    campaignLeave: { open: false, campaign: null, isLeaving: false },
    gameCreate: { open: false, campaign: null, name: 'Session 1', maxPlayers: 8, isCreating: false },
    gameDelete: { open: false, game: null, isDeleting: false },
    gamePause: { open: false, game: null, isPausing: false },
    gameFinish: { open: false, game: null, isFinishing: false },
    playerRemove: { open: false, campaign: null, member: null, isRemoving: false }
  })

  // Modal helper functions
  const openModal = (modalName, data = {}) => {
    setModals(prev => ({
      ...prev,
      [modalName]: { ...prev[modalName], open: true, ...data }
    }))
  }

  const closeModal = (modalName) => {
    setModals(prev => ({
      ...prev,
      [modalName]: { ...prev[modalName], open: false }
    }))
  }

  const updateModalData = (modalName, data) => {
    setModals(prev => ({
      ...prev,
      [modalName]: { ...prev[modalName], ...data }
    }))
  }

  // Fetch campaigns from API
  const fetchCampaigns = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true)
      const response = await fetch('/api/campaigns/', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      })

      if (response.ok) {
        const campaignsData = await response.json()

        // Separate campaigns into joined vs invited
        const joined = []
        const invited = []

        console.log('📋 All campaigns data:', campaignsData)
        console.log('👤 Current user ID:', user.id)

        campaignsData.forEach(campaign => {
          console.log(`📁 Campaign "${campaign.title}":`, {
            invited_player_ids: campaign.invited_player_ids,
            player_ids: campaign.player_ids,
            host_id: campaign.host_id
          })

          // Check if user is in invited_player_ids (pending invite)
          if (campaign.invited_player_ids && campaign.invited_player_ids.includes(user.id)) {
            console.log(`✅ User is INVITED to "${campaign.title}"`)
            invited.push(campaign)
          } else {
            // User is either host or in player_ids (joined member)
            console.log(`✅ User is MEMBER of "${campaign.title}"`)
            joined.push(campaign)
          }
        })

        console.log('🎯 Joined campaigns:', joined.length)
        console.log('📨 Invited campaigns:', invited.length)

        setCampaigns(joined)
        setInvitedCampaigns(invited)

        // Fetch members for each joined campaign (in parallel)
        const campaignsWithMembers = await Promise.all(
          joined.map(async (campaign) => {
            try {
              const membersResponse = await fetch(`/api/campaigns/${campaign.id}/members`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include'
              })

              if (membersResponse.ok) {
                const members = await membersResponse.json()
                console.log(`📋 Fetched ${members.length} members for campaign "${campaign.title}"`)
                return { ...campaign, members }
              } else {
                console.error(`Failed to fetch members for campaign ${campaign.id}:`, membersResponse.status)
                return { ...campaign, members: [] }
              }
            } catch (error) {
              console.error(`Error fetching members for campaign ${campaign.id}:`, error)
              return { ...campaign, members: [] }
            }
          })
        )

        setCampaigns(campaignsWithMembers)

        // Fetch sessions for joined campaigns only
        await fetchAllSessions(campaignsWithMembers)
      } else {
        console.error('Failed to fetch campaigns:', response.status)
        setError('Failed to load campaigns')
      }
    } catch (error) {
      console.error('Error fetching campaigns:', error)
      setError('Failed to load campaigns')
    } finally {
      setLoading(false)
    }
  }

  // Fetch all sessions for all campaigns
  const fetchAllSessions = async (campaignsData) => {
    try {
      const allSessionsArray = []

      // Fetch sessions for each campaign in parallel
      const sessionsPromises = campaignsData.map(async (campaign) => {
        try {
          const response = await fetch(`/api/sessions/campaign/${campaign.id}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include'
          })

          if (response.ok) {
            const sessionsData = await response.json()
            // Backend returns SessionListResponse with {sessions: [...], total: n}
            return sessionsData.sessions || []
          } else {
            console.error(`Failed to fetch sessions for campaign ${campaign.id}:`, response.status)
            return []
          }
        } catch (error) {
          console.error(`Error fetching sessions for campaign ${campaign.id}:`, error)
          return []
        }
      })

      const sessionsArrays = await Promise.all(sessionsPromises)
      // Flatten all sessions into single array
      sessionsArrays.forEach(sessions => allSessionsArray.push(...sessions))
      setAllSessions(allSessionsArray)
    } catch (error) {
      console.error('Error fetching all games:', error)
    }
  }

  // Handle targeted session updates from WebSocket events
  const handleSessionUpdate = async (campaignId) => {
    // Only fetch sessions for the specific campaign
    try {
      const response = await fetch(`/api/sessions/campaign/${campaignId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      })

      if (response.ok) {
        const sessionsData = await response.json()
        const updatedSessions = sessionsData.sessions || []

        // Update allSessions by replacing sessions for this campaign
        setAllSessions(prev => {
          // Remove old sessions for this campaign
          const otherSessions = prev.filter(session => session.campaign_id !== campaignId)
          // Add updated sessions
          return [...otherSessions, ...updatedSessions]
        })
      }
    } catch (error) {
      console.error(`Error updating sessions for campaign ${campaignId}:`, error)
    }
  }

  // Open game creation modal
  const openCreateGameModal = (campaignId) => {
    openModal('gameCreate', {
      campaign: campaignId,
      name: 'Session 1',
      maxPlayers: 8
    })
  }

  // Accept campaign invite
  const acceptCampaignInvite = async (campaignId) => {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/invites/accept`, {
        method: 'POST',
        credentials: 'include'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to accept invite')
      }

      // Close the expanded drawer before refreshing
      setSelectedInvitedCampaign(null)

      // Refresh campaigns to move from invited to joined
      await fetchCampaigns()
    } catch (err) {
      console.error('Error accepting campaign invite:', err)
      setError(err.message)
    }
  }

  // Decline campaign invite
  const declineCampaignInvite = async (campaignId) => {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/invites`, {
        method: 'DELETE',
        credentials: 'include'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to decline invite')
      }

      // Close the expanded drawer before refreshing
      setSelectedInvitedCampaign(null)

      // Refresh campaigns to remove from invited list
      await fetchCampaigns()
    } catch (err) {
      console.error('Error declining campaign invite:', err)
      setError(err.message)
    }
  }

  // Remove player from campaign (host only)
  const removePlayerFromCampaign = async () => {
    if (!modals.playerRemove.campaign || !modals.playerRemove.member) return

    updateModalData('playerRemove', { isRemoving: true })

    try {
      const response = await fetch(
        `/api/campaigns/${modals.playerRemove.campaign.id}/players/${modals.playerRemove.member.user_id}`,
        {
          method: 'DELETE',
          credentials: 'include'
        }
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to remove player')
      }

      // Refresh campaigns to update member list
      await fetchCampaigns()
      closeModal('playerRemove')
    } catch (err) {
      console.error('Error removing player from campaign:', err)
      setError(err.message)
      updateModalData('playerRemove', { isRemoving: false })
    }
  }

  // Leave campaign (player only - not host)
  const leaveCampaign = async () => {
    if (!modals.campaignLeave.campaign) return

    updateModalData('campaignLeave', { isLeaving: true })

    try {
      const response = await fetch(
        `/api/campaigns/${modals.campaignLeave.campaign.id}/leave`,
        {
          method: 'POST',
          credentials: 'include'
        }
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to leave campaign')
      }

      // Close the drawer and modal, then refresh campaigns
      setSelectedCampaign(null)
      closeModal('campaignLeave')
      await fetchCampaigns()
    } catch (err) {
      console.error('Error leaving campaign:', err)
      setError(err.message)
      updateModalData('campaignLeave', { isLeaving: false })
    }
  }

  // Create game (without starting it)
  const createGame = async () => {
    if (!modals.gameCreate.campaign) return

    updateModalData('gameCreate', { isCreating: true })
    setError(null)

    try {
      const gameData = {
        name: modals.gameCreate.name.trim() || 'Session 1',
        max_players: modals.gameCreate.maxPlayers,
        campaign_id: `${modals.gameCreate.campaign}`
      }

      const response = await fetch(`/api/campaigns/sessions?campaign_id=${modals.gameCreate.campaign}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(gameData)
      })

      if (response.ok) {
        const result = await response.json()
        console.log('Game created:', result)

        // Close modal and refresh campaigns and games
        closeModal('gameCreate')
        await fetchCampaigns()
      } else {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to create game')
      }
    } catch (error) {
      console.error('Error creating game:', error)
      setError('Failed to create game: ' + error.message)
    } finally {
      updateModalData('gameCreate', { isCreating: false })
    }
  }

  // Start game session
  const startGame = async (gameId) => {
    setStartingGame(gameId)
    setError(null)

    try {
      const response = await fetch(`/api/sessions/${gameId}/start`, {
        method: 'POST',
        credentials: 'include'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to start game')
      }

      await fetchCampaigns()
    } catch (err) {
      console.error('Error starting game:', err)
      setError(err.message)
    } finally {
      setStartingGame(null)
    }
  }

  // Show pause session confirmation modal
  const promptPauseSession = (game) => {
    openModal('gamePause', { game })
  }

  // Pause session (after confirmation)
  const confirmPauseSession = async () => {
    if (!modals.gamePause.game) return

    setPausingGame(modals.gamePause.game.id)
    setError(null)

    try {
      const response = await fetch(`/api/sessions/${modals.gamePause.game.id}/pause`, {
        method: 'POST',
        credentials: 'include'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to pause session')
      }

      await fetchCampaigns()
      closeModal('gamePause')
    } catch (err) {
      console.error('Error pausing session:', err)
      setError(err.message)
    } finally {
      setPausingGame(null)
    }
  }

  // Cancel pause session
  const cancelPauseSession = () => {
    closeModal('gamePause')
  }

  // Show finish session confirmation modal
  const promptFinishSession = (game) => {
    openModal('gameFinish', { game })
  }

  // Finish session permanently (after confirmation)
  const confirmFinishSession = async () => {
    if (!modals.gameFinish.game) return

    setFinishingGame(modals.gameFinish.game.id)
    setError(null)

    try {
      const response = await fetch(`/api/sessions/${modals.gameFinish.game.id}/finish`, {
        method: 'POST',
        credentials: 'include'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to finish session')
      }

      await fetchCampaigns()
      closeModal('gameFinish')
    } catch (err) {
      console.error('Error finishing session:', err)
      setError(err.message)
    } finally {
      setFinishingGame(null)
    }
  }

  // Cancel finish session
  const cancelFinishSession = () => {
    closeModal('gameFinish')
  }

  // Handle successful campaign invite
  const handleCampaignInviteSuccess = async (updatedCampaign) => {
    // Update the campaign in our local state (no full refetch needed)
    setCampaigns(prev => prev.map(c =>
      c.id === updatedCampaign.id ? { ...c, ...updatedCampaign } : c
    ))
    // Update the campaign reference in the modal
    updateModalData('campaignInvite', { campaign: { ...modals.campaignInvite.campaign, ...updatedCampaign } })
  }

  // Open delete session modal
  const openDeleteSessionModal = (game) => {
    openModal('gameDelete', { game })
  }

  // Close delete session modal
  const closeDeleteSessionModal = () => {
    closeModal('gameDelete')
  }

  // Delete game (called from modal)
  const deleteGame = async () => {
    if (!modals.gameDelete.game) return

    setDeletingGame(modals.gameDelete.game.id)
    setError(null)

    try {
      const response = await fetch(`/api/sessions/${modals.gameDelete.game.id}`, {
        method: 'DELETE',
        credentials: 'include'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to delete game')
      }

      await fetchCampaigns()
      closeDeleteSessionModal()
    } catch (err) {
      console.error('Error deleting game:', err)
      setError(err.message)
    } finally {
      setDeletingGame(null)
    }
  }

  // Enter game
  const enterGame = (game) => {
    router.push(`/game?room_id=${game.session_id || game.id}`)
  }

  // Create a new campaign
  const createCampaign = async () => {
    if (!user || !modals.campaignCreate.title.trim()) return

    updateModalData('campaignCreate', { isCreating: true })
    setError(null)

    try {
      const campaignData = {
        title: modals.campaignCreate.title.trim(),
        description: modals.campaignCreate.description.trim() || `Campaign created on ${new Date().toLocaleDateString()}`,
        hero_image: modals.campaignCreate.heroImage || null,
        session_name: modals.campaignCreate.sessionName.trim() || null
      }

      console.log('Creating campaign with data:', campaignData)
      console.log('session_name value:', campaignData.session_name, 'type:', typeof campaignData.session_name)

      const response = await fetch('/api/campaigns/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(campaignData)
      })

      if (!response.ok) {
        throw new Error('Failed to create campaign')
      }

      const campaign = await response.json()
      console.log('Created campaign:', campaign.id)

      // Refresh campaigns list
      await fetchCampaigns()

      // Close modal and reset form
      closeModal('campaignCreate')
      updateModalData('campaignCreate', { title: '', description: '', sessionName: '', editingCampaign: null })
    } catch (error) {
      console.error('Error creating campaign:', error)
      setError('Failed to create campaign: ' + error.message)
    } finally {
      updateModalData('campaignCreate', { isCreating: false })
    }
  }

  // Update an existing campaign
  const updateCampaign = async () => {
    const editingCampaign = modals.campaignCreate.editingCampaign
    if (!user || !editingCampaign || !modals.campaignCreate.title.trim()) return

    updateModalData('campaignCreate', { isCreating: true })
    setError(null)

    try {
      const campaignData = {
        title: modals.campaignCreate.title.trim(),
        description: modals.campaignCreate.description.trim() || null,
        hero_image: modals.campaignCreate.heroImage || null,
        session_name: modals.campaignCreate.sessionName?.trim() || null
      }

      const response = await fetch(`/api/campaigns/${editingCampaign.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(campaignData)
      })

      if (!response.ok) {
        throw new Error('Failed to update campaign')
      }

      const updatedCampaign = await response.json()

      // Refresh campaigns list
      await fetchCampaigns()

      // Update the selected campaign if it's the one we edited
      if (selectedCampaign?.id === editingCampaign.id) {
        setSelectedCampaign(updatedCampaign)
      }

      // Close modal and reset form
      closeModal('campaignCreate')
      updateModalData('campaignCreate', { title: '', description: '', sessionName: '', heroImage: '/campaign-tile-bg.png', editingCampaign: null })
    } catch (error) {
      console.error('Error updating campaign:', error)
      setError('Failed to update campaign: ' + error.message)
    } finally {
      updateModalData('campaignCreate', { isCreating: false })
    }
  }

  // Show delete campaign confirmation modal
  const promptDeleteCampaign = (campaign) => {
    openModal('campaignDelete', { campaign })
  }

  // Cancel delete campaign
  const cancelDeleteCampaign = () => {
    closeModal('campaignDelete')
  }

  // Delete a campaign (after confirmation)
  const confirmDeleteCampaign = async () => {
    if (!modals.campaignDelete.campaign) return

    updateModalData('campaignDelete', { isDeleting: true })
    setError(null)

    try {
      const response = await fetch(`/api/campaigns/${modals.campaignDelete.campaign.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      })

      if (response.ok) {
        await fetchCampaigns()
        if (selectedCampaign && selectedCampaign.id === modals.campaignDelete.campaign.id) {
          setSelectedCampaign(null)
        }
        closeModal('campaignDelete')
      } else {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to delete campaign')
      }
    } catch (error) {
      console.error('Error deleting campaign:', error)
      setError(error.message)
      closeModal('campaignDelete')
    } finally {
      updateModalData('campaignDelete', { isDeleting: false })
    }
  }

  // Toggle campaign details
  const toggleCampaignDetails = (campaign) => {
    if (selectedCampaign?.id === campaign.id) {
      setSelectedCampaign(null)
    } else {
      // Close any open invited campaign drawer first
      setSelectedInvitedCampaign(null)
      // Scroll to top before expanding (while overflow-y-auto is still active)
      const mainEl = document.getElementById('dashboard-main')
      if (mainEl) {
        mainEl.scrollTo({ top: 0, behavior: 'smooth' })
      }
      setSelectedCampaign(campaign)
    }
  }

  // Toggle invited campaign details
  const toggleInvitedCampaignDetails = (campaign) => {
    if (selectedInvitedCampaign?.id === campaign.id) {
      setSelectedInvitedCampaign(null)
    } else {
      // Close any open regular campaign drawer first
      setSelectedCampaign(null)
      // Scroll to top before expanding (while overflow-y-auto is still active)
      const mainEl = document.getElementById('dashboard-main')
      if (mainEl) {
        mainEl.scrollTo({ top: 0, behavior: 'smooth' })
      }
      setSelectedInvitedCampaign(campaign)
    }
  }

  useEffect(() => {
    // Only show loading on initial fetch (refreshTrigger = 0)
    fetchCampaigns(refreshTrigger === 0)
  }, [refreshTrigger])

  // Handle invite_campaign_id from URL (notification click)
  // - If invite exists → auto-expand it
  // - If invite doesn't exist → show stale toast
  useEffect(() => {
    if (inviteCampaignId && !loading) {
      // Find the invited campaign by ID
      const invitedCampaign = invitedCampaigns.find(c => c.id === inviteCampaignId)

      if (invitedCampaign) {
        // Invite exists - auto-expand it
        toggleInvitedCampaignDetails(invitedCampaign)
      } else {
        // Invite was revoked - show feedback toast
        showToast?.({
          type: 'warning',
          message: 'This invite is no longer available'
        })
      }
      // Clear the URL param after handling (regardless of result)
      clearInviteCampaignId?.()
    }
  }, [inviteCampaignId, invitedCampaigns, loading])

  // Auto-expand campaign from URL param (e.g., from notification click)
  // - If campaign exists → auto-expand it (not toggle - always open)
  // - If campaign doesn't exist → silently ignore (may be from another user's campaign)
  useEffect(() => {
    if (expandCampaignId && !loading) {
      // Find the campaign by ID
      const campaign = campaigns.find(c => c.id === expandCampaignId)

      if (campaign && selectedCampaign?.id !== campaign.id) {
        // Campaign exists and not already expanded - open it directly (don't toggle)
        setSelectedInvitedCampaign(null)
        const mainEl = document.getElementById('dashboard-main')
        if (mainEl) {
          mainEl.scrollTo({ top: 0, behavior: 'smooth' })
        }
        setSelectedCampaign(campaign)
      }
      // Clear the URL param after handling (regardless of result)
      clearExpandCampaignId?.()
    }
  }, [expandCampaignId, campaigns, loading])

  // Fetch members when an invited campaign is expanded
  useEffect(() => {
    if (selectedInvitedCampaign) {
      const fetchInvitedCampaignMembers = async () => {
        setLoadingInvitedMembers(true)
        try {
          const response = await fetch(`/api/campaigns/${selectedInvitedCampaign.id}/members`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
          })
          if (response.ok) {
            const members = await response.json()
            setInvitedCampaignMembers(members)
          } else {
            setInvitedCampaignMembers([])
          }
        } catch (error) {
          console.error('Error fetching invited campaign members:', error)
          setInvitedCampaignMembers([])
        } finally {
          setLoadingInvitedMembers(false)
        }
      }
      fetchInvitedCampaignMembers()
    } else {
      setInvitedCampaignMembers([])
    }
  }, [selectedInvitedCampaign])

  // Sync invite modal's campaign data when campaigns are updated externally (e.g., player declines)
  useEffect(() => {
    if (modals.campaignInvite.open && modals.campaignInvite.campaign) {
      const updatedCampaign = campaigns.find(c => c.id === modals.campaignInvite.campaign.id)
      if (updatedCampaign) {
        // Only update if invited_player_ids has changed
        const currentIds = modals.campaignInvite.campaign.invited_player_ids || []
        const newIds = updatedCampaign.invited_player_ids || []
        if (JSON.stringify(currentIds) !== JSON.stringify(newIds)) {
          updateModalData('campaignInvite', { campaign: updatedCampaign })
        }
      }
    }
  }, [campaigns])

  // Detect window resize and temporarily disable transitions
  useEffect(() => {
    let resizeTimer
    let isActuallyResizing = false

    const handleResize = () => {
      // Only set isResizing on actual window resize, not layout changes from clicks
      if (!isActuallyResizing) {
        isActuallyResizing = true
        setIsResizing(true)
      }

      clearTimeout(resizeTimer)
      // Resume transitions 100ms after resize stops
      resizeTimer = setTimeout(() => {
        setIsResizing(false)
        isActuallyResizing = false
      }, 100)
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      clearTimeout(resizeTimer)
    }
  }, [])

  // Sync campaign invite modal when campaigns update (e.g., from WebSocket events)
  useEffect(() => {
    if (modals.campaignInvite.campaign) {
      // Find the updated version of the selected campaign in the campaigns array
      const updatedCampaign = campaigns.find(c => c.id === modals.campaignInvite.campaign.id)
      if (updatedCampaign) {
        // Update the selected campaign with fresh data
        updateModalData('campaignInvite', { campaign: updatedCampaign })
      }
    }
  }, [campaigns])

  // Expose handleSessionUpdate to parent via callback
  useEffect(() => {
    if (onCampaignUpdate) {
      onCampaignUpdate({ updateSessions: handleSessionUpdate })
    }
  }, [onCampaignUpdate])

  // Notify parent when expanded state changes (either drawer)
  useEffect(() => {
    onExpandedChange?.(!!selectedCampaign || !!selectedInvitedCampaign)
  }, [selectedCampaign, selectedInvitedCampaign, onExpandedChange])

  // Calculate drawer top position (distance from viewport top to where drawer starts)
  // This allows us to use CSS calc(100vh - drawerTop) for perfect viewport filling
  useEffect(() => {
    const calculateDrawerTop = () => {
      if (selectedCampaign && campaignCardRef.current) {
        // Get card's position relative to the viewport
        const cardRect = campaignCardRef.current.getBoundingClientRect()
        // The drawer starts at the bottom of the card
        setDrawerTop(cardRect.bottom)
      } else {
        setDrawerTop(null)
      }
    }

    // Calculate immediately
    calculateDrawerTop()

    // The scroll-to-top animation uses 'smooth' behavior which takes time
    // We need to recalculate after the scroll completes and layout settles
    // Use multiple timeouts to catch different timing scenarios
    const timeouts = [50, 150, 300, 500].map(delay =>
      setTimeout(calculateDrawerTop, delay)
    )

    window.addEventListener('resize', calculateDrawerTop)
    // Also listen for scroll events in case the user scrolls during expansion
    const mainContainer = document.getElementById('dashboard-main')
    mainContainer?.addEventListener('scroll', calculateDrawerTop)

    return () => {
      window.removeEventListener('resize', calculateDrawerTop)
      mainContainer?.removeEventListener('scroll', calculateDrawerTop)
      timeouts.forEach(clearTimeout)
    }
  }, [selectedCampaign])

  // Calculate invited drawer top position
  useEffect(() => {
    const calculateInvitedDrawerTop = () => {
      if (selectedInvitedCampaign && invitedCampaignCardRef.current) {
        const cardRect = invitedCampaignCardRef.current.getBoundingClientRect()
        setInvitedDrawerTop(cardRect.bottom)
      } else {
        setInvitedDrawerTop(null)
      }
    }

    calculateInvitedDrawerTop()

    const timeouts = [50, 150, 300, 500].map(delay =>
      setTimeout(calculateInvitedDrawerTop, delay)
    )

    window.addEventListener('resize', calculateInvitedDrawerTop)
    const mainContainer = document.getElementById('dashboard-main')
    mainContainer?.addEventListener('scroll', calculateInvitedDrawerTop)

    return () => {
      window.removeEventListener('resize', calculateInvitedDrawerTop)
      mainContainer?.removeEventListener('scroll', calculateInvitedDrawerTop)
      timeouts.forEach(clearTimeout)
    }
  }, [selectedInvitedCampaign])

  // Reset expanded state on unmount
  useEffect(() => {
    return () => {
      onExpandedChange?.(false)
    }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{borderColor: THEME.borderActive}}></div>
        <span className="ml-2" style={{color: THEME.textSecondary}}>Loading campaigns...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
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

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold font-[family-name:var(--font-metamorphous)]" style={{color: THEME.textBold}}>Campaign Management</h1>
        <p className="mt-2" style={{color: THEME.textPrimary}}>Organize your adventures and game sessions</p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="px-4 py-3 rounded-sm border" style={{backgroundColor: '#991b1b', borderColor: '#dc2626', color: '#fca5a5'}}>
          {error}
        </div>
      )}

      {/* Invited Campaigns Section - Only render if there are invites */}
      {invitedCampaigns.length > 0 && (
        <div
          className="space-y-4"
          style={{
            paddingLeft: selectedInvitedCampaign ? '0' : 'clamp(0.5rem, 2.5vw, 3.5rem)',
            paddingRight: selectedInvitedCampaign ? '0' : 'clamp(0.5rem, 2.5vw, 3.5rem)',
            transition: isResizing ? 'none' : 'padding 200ms ease-in-out'
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
                      maxWidth: isSelected ? 'none' : '1600px'
                    }}
                  >
                    {/* Invited Campaign Card - Expandable */}
                    <div
                      ref={isSelected ? invitedCampaignCardRef : null}
                      className="w-full relative rounded-sm overflow-visible cursor-pointer border-2"
                      style={{
                        aspectRatio: isSelected ? 'unset' : '16/4',
                        minHeight: '200px',
                        backgroundImage: campaign.hero_image ? `url(${campaign.hero_image})` : 'none',
                        backgroundColor: campaign.hero_image ? 'transparent' : COLORS.carbon,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        borderColor: isSelected ? THEME.borderActive : '#16a34a',
                        transition: isResizing ? 'none' : 'border-color 200ms ease-in-out'
                      }}
                      onClick={() => toggleInvitedCampaignDetails(campaign)}
                    >
                      {/* Expanding background layer */}
                      <div
                        className="absolute pointer-events-none"
                        style={{
                          left: isSelected ? 'calc(50% - 50vw)' : '0',
                          right: isSelected ? 'calc(50% - 50vw)' : '0',
                          top: 0,
                          height: isSelected ? 'calc(100% + 8px)' : '100%',
                          backgroundImage: campaign.hero_image ? `url(${campaign.hero_image})` : 'none',
                          backgroundColor: campaign.hero_image ? 'transparent' : COLORS.carbon,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          borderRadius: '0.125rem',
                          borderBottomLeftRadius: isSelected ? '0' : '0.125rem',
                          borderBottomRightRadius: isSelected ? '0' : '0.125rem',
                          zIndex: isSelected ? 0 : -1,
                          transition: isResizing
                            ? 'none'
                            : isSelected
                              ? 'left 200ms ease-in-out, right 200ms ease-in-out, border-radius 200ms ease-in-out'
                              : 'left 200ms ease-in-out, right 200ms ease-in-out, border-radius 200ms ease-in-out, z-index 0ms 200ms'
                        }}
                      >
                        {/* Background overlay */}
                        <div
                          className="absolute inset-0"
                          style={{
                            backgroundColor: `${COLORS.onyx}B3`,
                            borderRadius: '0.125rem',
                            borderBottomLeftRadius: isSelected ? '0' : '0.125rem',
                            borderBottomRightRadius: isSelected ? '0' : '0.125rem'
                          }}
                        />
                      </div>

                      {/* Solid overlay for text readability */}
                      <div
                        className="absolute inset-0 rounded-sm"
                        style={{
                          backgroundColor: `${COLORS.onyx}B3`,
                          zIndex: isSelected ? -1 : 0
                        }}
                      />

                      {/* Content container */}
                      <div
                        className="flex flex-col justify-between p-6"
                        style={{
                          position: isSelected ? 'relative' : 'absolute',
                          inset: isSelected ? 'unset' : 0,
                          minHeight: isSelected ? 'max(calc(200px - 3rem), calc(25vw - 3rem))' : 'auto',
                          maxWidth: isSelected ? '1600px' : 'none',
                          zIndex: 1
                        }}
                      >
                        {/* Top Row - Title and Status Badge */}
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <h4 className="text-3xl font-[family-name:var(--font-metamorphous)] mb-1 drop-shadow-lg" style={{color: THEME.textOnDark}}>
                              {campaign.title || 'Unnamed Campaign'}
                            </h4>
                            {campaign.description && (
                              <div className="text-base drop-shadow-md mt-2" style={{maxWidth: '70%'}}>
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

                        {/* Middle - Spacer */}
                        <div className="flex-1" style={{ minHeight: 'max(1rem, 2vh)' }}></div>

                        {/* Bottom Row - Campaign Metadata */}
                        <div className="flex items-center justify-between">
                          <div className="text-sm drop-shadow" style={{color: THEME.textOnDark}}>
                            <span>{campaign.host_screen_name ? `Invited by ${campaign.host_screen_name}` : 'Invited by campaign host'}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Invited Campaign Detail Panel - Expands to full viewport width */}
                    <div
                      className="relative"
                      style={{
                        left: isSelected ? 'calc(50% - 50vw)' : '0',
                        backgroundColor: THEME.bgPanel,
                        borderColor: THEME.borderSubtle,
                        borderWidth: isSelected ? '2px' : '0px',
                        borderStyle: 'solid',
                        width: isSelected ? '100vw' : '100%',
                        minHeight: isSelected && invitedDrawerTop !== null
                          ? `calc(100vh - ${invitedDrawerTop}px)`
                          : '0px',
                        maxHeight: isSelected ? 'none' : '0px',
                        overflow: 'hidden',
                        borderRadius: '0.125rem',
                        borderTopLeftRadius: '0',
                        borderTopRightRadius: '0',
                        transition: isResizing ? 'none' : 'left 200ms ease-in-out, width 200ms ease-in-out, min-height 200ms ease-in-out, max-height 200ms ease-in-out, border-width 200ms ease-in-out',
                        pointerEvents: isSelected ? 'auto' : 'none',
                        visibility: isSelected ? 'visible' : 'hidden'
                      }}
                    >
                      {/* Content wrapper */}
                      <div
                        className="pt-[calc(1rem+16px)] sm:pt-[calc(2rem+16px)] md:pt-[calc(2.5rem+16px)] pb-[calc(1rem+16px)] sm:pb-[calc(2rem+16px)] md:pb-[calc(2.5rem+16px)] px-[calc(1rem+12px)] sm:px-[calc(2rem+12px)] md:px-[calc(2.5rem+12px)]"
                      >
                        {/* Inner content constrained to max-width */}
                        <div style={{ maxWidth: '1600px' }}>
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-semibold font-[family-name:var(--font-metamorphous)]" style={{color: THEME.textOnDark}}>
                              Campaign Details
                            </h3>
                            <button
                              onClick={() => setSelectedInvitedCampaign(null)}
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
          paddingLeft: selectedCampaign ? '0' : 'clamp(0.5rem, 2.5vw, 3.5rem)',
          paddingRight: selectedCampaign ? '0' : 'clamp(0.5rem, 2.5vw, 3.5rem)',
          // Disable padding transition during window resize for instant updates
          transition: isResizing ? 'none' : 'padding 200ms ease-in-out'
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

              const isSelected = selectedCampaign?.id === campaign.id

              return (
                <div
                  key={campaign.id}
                  className="w-full relative"
                  style={{
                    marginBottom: isSelected ? '0' : '3rem',
                    maxWidth: isSelected ? 'none' : '1600px'
                  }}
                >
                  {/* Campaign Card with expanding background */}
                  <div
                    ref={isSelected ? campaignCardRef : null}
                    className="w-full relative rounded-sm overflow-visible cursor-pointer border-2"
                    style={{
                      // When selected, allow card to grow with content but never shrink below collapsed size
                      // Collapsed: 16:4 aspect ratio. Selected: unset to allow content-driven height
                      aspectRatio: isSelected ? 'unset' : '16/4',
                      // Fixed 200px height when expanded since drawer handles content below
                      minHeight: '200px',
                      backgroundImage: `url(${campaign.hero_image || '/campaign-tile-bg.png'})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      borderColor: selectedCampaign?.id === campaign.id ? THEME.borderActive : THEME.borderDefault,
                      // Disable transitions during window resize for instant layout updates
                      transition: isResizing ? 'none' : 'border-color 200ms ease-in-out'
                    }}
                    onClick={() => toggleCampaignDetails(campaign)}
                  >
                    {/* Expanding background layer - extends to full viewport width when selected */}
                    <div
                      className="absolute pointer-events-none"
                      style={{
                        left: selectedCampaign?.id === campaign.id ? 'calc(50% - 50vw)' : '0',
                        right: selectedCampaign?.id === campaign.id ? 'calc(50% - 50vw)' : '0',
                        top: 0,
                        // Use height instead of bottom - percentage tracks parent height instantly
                        height: selectedCampaign?.id === campaign.id ? 'calc(100% + 8px)' : '100%',
                        backgroundImage: `url(${campaign.hero_image || '/campaign-tile-bg.png'})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        borderRadius: '0.125rem', // rounded-sm equivalent
                        borderBottomLeftRadius: selectedCampaign?.id === campaign.id ? '0' : '0.125rem',
                        borderBottomRightRadius: selectedCampaign?.id === campaign.id ? '0' : '0.125rem',
                        zIndex: selectedCampaign?.id === campaign.id ? 0 : -1,
                        // Only animate horizontal position and border-radius, NOT height
                        // Height follows parent instantly via percentage
                        transition: isResizing
                          ? 'none'
                          : selectedCampaign?.id === campaign.id
                            ? 'left 200ms ease-in-out, right 200ms ease-in-out, border-radius 200ms ease-in-out'
                            : 'left 200ms ease-in-out, right 200ms ease-in-out, border-radius 200ms ease-in-out, z-index 0ms 200ms'
                      }}
                    >
                      {/* Background overlay */}
                      <div
                        className="absolute inset-0"
                        style={{
                          backgroundColor: `${COLORS.onyx}B3`,
                          borderRadius: '0.125rem',
                          borderBottomLeftRadius: selectedCampaign?.id === campaign.id ? '0' : '0.125rem',
                          borderBottomRightRadius: selectedCampaign?.id === campaign.id ? '0' : '0.125rem'
                        }}
                      />
                    </div>

                    {/* Solid overlay for text readability */}
                    <div
                      className="absolute inset-0 rounded-sm"
                      style={{
                        backgroundColor: `${COLORS.onyx}B3`,
                        zIndex: selectedCampaign?.id === campaign.id ? -1 : 0
                      }}
                    />

                    {/* Content container - drives height when selected, constrained when collapsed */}
                    <div
                      className="flex flex-col justify-between p-6"
                      style={{
                        // When collapsed: absolute to stay within aspect-ratio bounds
                        // When selected: relative so content can grow the card, with min-height to fill the card
                        position: isSelected ? 'relative' : 'absolute',
                        inset: isSelected ? 'unset' : 0,
                        // When selected, fill at least the card's min-height so justify-between pushes metadata down
                        minHeight: isSelected ? 'max(calc(200px - 3rem), calc(25vw - 3rem))' : 'auto',
                        // Constrain content width on wide screens when expanded
                        maxWidth: isSelected ? '1600px' : 'none',
                        zIndex: 1
                      }}
                    >
                        {/* Top Row - Title and Action Buttons */}
                        <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h4 className="text-3xl font-[family-name:var(--font-metamorphous)] mb-1 drop-shadow-lg" style={{color: THEME.textOnDark}}>
                            {campaign.title || 'Unnamed Campaign'}
                          </h4>
                          {campaign.description && (
                            <div className="text-base drop-shadow-md mt-2" style={{maxWidth: '70%'}}>
                              <p
                                style={{
                                  color: THEME.textAccent,
                                  whiteSpace: 'pre-line',
                                  // Only truncate when NOT selected, otherwise let it overflow naturally
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
                        </div>

                        {/* Action Buttons - Top Right (fixed width container to prevent layout shift) */}
                        <div className="flex gap-2 flex-shrink-0" style={{minWidth: '160px'}}>
                          {/* Active game indicator - always reserves space */}
                          <div className="px-4 py-2 backdrop-blur-sm text-sm font-semibold rounded-sm border"
                               style={{
                                 backgroundColor: activeSessions.length > 0 ? '#166534' : 'transparent',
                                 color: activeSessions.length > 0 ? THEME.textAccent : 'transparent',
                                 borderColor: activeSessions.length > 0 ? '#16a34a' : 'transparent',
                                 animation: activeSessions.length > 0 ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none',
                                 visibility: activeSessions.length > 0 ? 'visible' : 'hidden'
                               }}>
                            Game In Session
                          </div>

                        </div>
                      </div>

                      {/* Middle - Spacer with responsive minimum gap */}
                      <div className="flex-1" style={{ minHeight: 'max(1rem, 2vh)' }}></div>

                      {/* Bottom Row - Campaign Metadata */}
                      <div className="flex items-center justify-between">
                        <div className="text-sm drop-shadow" style={{color: THEME.textOnDark}}>
                          <span>Created: {campaign.created_at ? new Date(campaign.created_at).toLocaleDateString() : 'Unknown'}</span>
                          {campaignSessions.length > 0 && campaignSessions[0].name && (
                            <>
                              <span className="mx-2">•</span>
                              <span>{campaignSessions[0].name}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Game Sessions Detail Panel - Expands to full viewport width */}
                  <div
                    ref={gameSessionsPanelRef}
                    className="relative"
                    style={{
                      left: selectedCampaign?.id === campaign.id ? 'calc(50% - 50vw)' : '0',
                      backgroundColor: THEME.bgPanel,
                      borderColor: THEME.borderSubtle,
                      borderWidth: selectedCampaign?.id === campaign.id ? '2px' : '0px',
                      borderStyle: 'solid',
                      width: selectedCampaign?.id === campaign.id ? '100vw' : '100%',
                      // Use calc(100vh - drawerTop) to fill exactly to viewport bottom
                      // This approach uses the measured position for precise filling
                      minHeight: selectedCampaign?.id === campaign.id && drawerTop !== null
                        ? `calc(100vh - ${drawerTop}px)`
                        : '0px',
                      maxHeight: selectedCampaign?.id === campaign.id ? 'none' : '0px',
                      overflow: 'hidden',
                      borderRadius: '0.125rem',
                      borderTopLeftRadius: '0', // No top radius to connect with campaign tile
                      borderTopRightRadius: '0',
                      // Disable transitions during window resize for instant layout updates
                      transition: isResizing ? 'none' : 'left 200ms ease-in-out, width 200ms ease-in-out, min-height 200ms ease-in-out, max-height 200ms ease-in-out, border-width 200ms ease-in-out',
                      pointerEvents: selectedCampaign?.id === campaign.id ? 'auto' : 'none',
                      visibility: selectedCampaign?.id === campaign.id ? 'visible' : 'hidden'
                    }}
                  >
                    {/* Content wrapper */}
                    <div
                      className="pt-[calc(1rem+16px)] sm:pt-[calc(2rem+16px)] md:pt-[calc(2.5rem+16px)] pb-[calc(1rem+16px)] sm:pb-[calc(2rem+16px)] md:pb-[calc(2.5rem+16px)] px-[calc(1rem+12px)] sm:px-[calc(2rem+12px)] md:px-[calc(2.5rem+12px)]"
                    >
                      {/* Inner content constrained to max-width for readability on wide screens */}
                      <div style={{ maxWidth: '1600px' }}>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-semibold font-[family-name:var(--font-metamorphous)]" style={{color: THEME.textOnDark}}>
                          Campaign Sessions
                        </h3>
                        <button
                          onClick={() => setSelectedCampaign(null)}
                          className="transition-colors text-sm"
                          style={{color: THEME.textSecondary}}
                        >
                          <FontAwesomeIcon icon={faXmark} className="mr-1" />
                          Close
                        </button>
                      </div>

                      <div className="space-y-3">
                        {/* Create Session Template - Only show if user is host and no non-finished sessions exist */}
                        {campaign.host_id === user.id && !campaignSessions.some(g => ['inactive', 'active', 'starting', 'stopping'].includes(g.status?.toLowerCase())) && (
                          <button
                            onClick={() => openModal('gameCreate', { campaign: campaign.id, name: 'Session 1', maxPlayers: 8 })}
                            className="w-full flex items-center justify-between p-4 rounded-sm border-2 border-dashed transition-all hover:border-opacity-100"
                            style={{
                              backgroundColor: `${THEME.bgSecondary}80`,
                              borderColor: `${THEME.borderActive}60`,
                              opacity: 0.7
                            }}
                            title="Create New Session"
                          >
                            <div className="flex items-center gap-3">
                              <FontAwesomeIcon icon={faPlus} className="text-2xl" style={{color: THEME.textAccent}} />
                              <div className="text-left">
                                <p className="font-medium" style={{color: THEME.textOnDark}}>Create New Session</p>
                                <p className="text-sm" style={{color: THEME.textSecondary}}>
                                  Click to add a game session
                                </p>
                              </div>
                            </div>
                          </button>
                        )}

                        {campaignSessions.length === 0 && campaign.host_id !== user.id && (
                          <p className="text-sm py-4 text-center" style={{color: THEME.textSecondary}}>No game sessions yet.</p>
                        )}

                        {campaignSessions.length > 0 && (
                          <div className="space-y-2">
                            {campaignSessions.map((game) => (
                              <div
                                key={game.id}
                                className="flex items-center justify-between p-4 rounded-sm border relative overflow-hidden"
                                style={{backgroundColor: THEME.bgSecondary, borderColor: THEME.borderSubtle}}
                              >
                                {/* Starting animation overlay */}
                                {(game.status === 'starting' || startingGame === game.id) && (
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
                                <div>
                                  <p className="font-medium" style={{color: THEME.textOnDark}}>{game.name || 'Game Session'}</p>
                                  <p className="text-sm" style={{color: THEME.textSecondary}}>
                                    Status: <span className="font-medium" style={{
                                      color: game.status === 'active' ? '#16a34a' :
                                             (game.status === 'starting' || startingGame === game.id) ? '#3b82f6' :
                                             game.status === 'inactive' ? THEME.textSecondary :
                                             '#fbbf24'
                                    }}>
                                      {(game.status === 'starting' || startingGame === game.id) ? 'Starting' : game.status.charAt(0).toUpperCase() + game.status.slice(1)}
                                    </span>
                                  </p>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex gap-2">
                                  {game.status === 'active' ? (
                                    <>
                                      <Button
                                        variant="success"
                                        size="md"
                                        onClick={() => enterGame(game)}
                                      >
                                        <FontAwesomeIcon icon={faRightToBracket} className="mr-2" />
                                        Enter
                                      </Button>
                                      {/* Only show host actions if user is the campaign host */}
                                      {campaign.host_id === user.id && (
                                        <button
                                          onClick={() => promptPauseSession(game)}
                                          disabled={pausingGame === game.id}
                                          className="px-4 py-2 rounded-sm border transition-all text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                          style={{backgroundColor: COLORS.silver, color: THEME.textPrimary, borderColor: COLORS.smoke}}
                                          title="Pause Session"
                                        >
                                          {pausingGame === game.id ? (
                                            <>
                                              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-800"></div>
                                              Pausing...
                                            </>
                                          ) : (
                                            <>
                                              <FontAwesomeIcon icon={faPause} />
                                              Pause
                                            </>
                                          )}
                                        </button>
                                      )}
                                    </>
                                  ) : (game.status === 'starting' || game.status === 'inactive') && campaign.host_id === user.id ? (
                                    /* Show game actions for host - disabled when starting */
                                    <>
                                      <Button
                                        variant="success"
                                        size="md"
                                        onClick={() => startGame(game.id)}
                                        disabled={startingGame === game.id || activeSessions.length > 0 || game.status === 'starting'}
                                      >
                                        <FontAwesomeIcon icon={faPlay} className="mr-2" />
                                        Start
                                      </Button>
                                      <button
                                        onClick={() => promptFinishSession(game)}
                                        disabled={finishingGame === game.id || game.status === 'starting'}
                                        className="px-4 py-2 rounded-sm border transition-all text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                        style={{backgroundColor: '#991b1b', color: COLORS.smoke, borderColor: '#dc2626'}}
                                        title="Finish Session Permanently"
                                      >
                                        {finishingGame === game.id ? (
                                          <>
                                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                                            Finishing...
                                          </>
                                        ) : (
                                          <>
                                            <FontAwesomeIcon icon={faXmark} />
                                            Finish
                                          </>
                                        )}
                                      </button>
                                    </>
                                  ) : game.status === 'finished' && campaign.host_id === user.id ? (
                                    /* Show delete button for finished sessions (host only) */
                                    <Button
                                      variant="danger"
                                      size="md"
                                      onClick={() => openDeleteSessionModal(game)}
                                      disabled={deletingGame === game.id}
                                    >
                                      {deletingGame === game.id ? (
                                        <>
                                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2"></div>
                                          Deleting...
                                        </>
                                      ) : (
                                        <>
                                          <FontAwesomeIcon icon={faTrash} className="mr-2" />
                                          Delete
                                        </>
                                      )}
                                    </Button>
                                  ) : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Campaign Members Section */}
                        <div className="mt-8 pt-6 border-t" style={{borderColor: THEME.borderSubtle}}>
                          <h3 className="text-xl font-semibold font-[family-name:var(--font-metamorphous)] mb-4" style={{color: THEME.textOnDark}}>
                            Campaign Members
                          </h3>
                          <button
                            onClick={() => openModal('campaignInvite', { campaign: selectedCampaign })}
                            className="flex items-center gap-2 px-3 h-10 rounded-sm transition-all border mb-4"
                            style={{backgroundColor: THEME.bgSecondary, color: COLORS.smoke, borderColor: THEME.borderActive}}
                          >
                            <FontAwesomeIcon icon={faUserPlus} className="h-4 w-4" />
                            <span className="text-sm font-medium">Add Members</span>
                          </button>

                          {/* Loading State */}
                          {!campaign.members && (
                            <div className="flex items-center justify-center py-4">
                              <div className="animate-spin rounded-full h-5 w-5 border-b-2"
                                   style={{borderColor: THEME.borderActive}}></div>
                              <span className="ml-2 text-sm" style={{color: THEME.textSecondary}}>
                                Loading members...
                              </span>
                            </div>
                          )}

                          {/* Empty State */}
                          {campaign.members?.length === 0 && (
                            <p className="text-sm py-4 text-center" style={{color: THEME.textSecondary}}>
                              No members yet. Invite players to join your campaign.
                            </p>
                          )}

                          {/* Members Grid - 3 columns */}
                          {campaign.members && campaign.members.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {campaign.members.map((member) => (
                                <div
                                  key={member.user_id}
                                  className="flex flex-col p-3 rounded-sm border relative"
                                  style={{
                                    backgroundColor: THEME.bgSecondary,
                                    borderColor: THEME.borderSubtle
                                  }}
                                >
                                  {/* Remove button - only for host viewing non-host members */}
                                  {campaign.host_id === user.id && !member.is_host && (
                                    <button
                                      onClick={() => openModal('playerRemove', { campaign, member })}
                                      className="absolute top-0 right-0 bottom-0 px-3 flex items-center rounded-r-sm hover:bg-red-900/50 transition-colors"
                                      title="Remove player from campaign"
                                      style={{ color: '#dc2626' }}
                                    >
                                      <FontAwesomeIcon icon={faUserMinus} className="h-5 w-5" />
                                    </button>
                                  )}

                                  {/* Username with host badge */}
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

                                  {/* Character info */}
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

                        {/* Campaign Controls Section - Only show for host */}
                        {campaign.host_id === user.id && (
                          <div className="mt-8 pt-6 border-t" style={{borderColor: THEME.borderSubtle}}>
                            <h3 className="text-xl font-semibold font-[family-name:var(--font-metamorphous)] mb-4" style={{color: THEME.textOnDark}}>
                              Campaign Controls
                            </h3>
                              <div className="flex gap-4">
                                <button
                                  onClick={() => {
                                    // Find current session from allSessions (status !== 'finished')
                                    const campaignSessions = allSessions.filter(s => s.campaign_id === selectedCampaign.id)
                                    const currentSession = campaignSessions.find(s => s.status !== 'finished')
                                    openModal('campaignCreate', {
                                      editingCampaign: selectedCampaign,
                                      title: selectedCampaign.title,
                                      description: selectedCampaign.description || '',
                                      heroImage: selectedCampaign.hero_image || '/campaign-tile-bg.png',
                                      sessionName: currentSession?.name || ''
                                    })
                                  }}
                                  className="flex items-center gap-2 px-3 h-10 rounded-sm transition-all border"
                                  style={{backgroundColor: THEME.bgSecondary, color: COLORS.smoke, borderColor: THEME.borderActive}}
                                >
                                  <FontAwesomeIcon icon={faGear} className="h-4 w-4" />
                                  <span className="text-sm font-medium">Configure</span>
                                </button>
                                <button
                                  onClick={() => promptDeleteCampaign(selectedCampaign)}
                                  disabled={modals.campaignDelete.isDeleting}
                                  className="flex items-center gap-2 px-3 h-10 rounded-sm transition-all border disabled:opacity-50 disabled:cursor-not-allowed"
                                  style={{backgroundColor: '#991b1b', color: COLORS.smoke, borderColor: '#dc2626'}}
                                >
                                  <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                                  <span className="text-sm font-medium">Delete Campaign</span>
                                </button>
                              </div>
                          </div>
                        )}

                        {/* Leave Campaign Button - Only show for non-host members */}
                        {campaign.host_id !== user.id && (
                          <div className="mt-8 pt-6 border-t" style={{borderColor: THEME.borderSubtle}}>
                            <button
                              onClick={() => openModal('campaignLeave', { campaign })}
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
                          </div>
                        )}
                      </div>
                      </div>
                    </div>

                  </div>
                </div>
              )
            })}

            {/* Create Campaign Template Tile - Only render when no campaign is selected */}
            {!selectedCampaign && (
              <div className="w-full" style={{ maxWidth: '1600px' }}>
                <button
                  onClick={() => openModal('campaignCreate')}
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
      {modals.gameCreate.open && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50" style={{backgroundColor: THEME.overlayDark}}>
          <div className="p-6 rounded-sm shadow-2xl max-w-md w-full mx-4 border" style={{backgroundColor: THEME.bgSecondary, borderColor: THEME.borderDefault}}>
            <h3 className="text-lg font-semibold font-[family-name:var(--font-metamorphous)] mb-4" style={{color: THEME.textOnDark}}>Create New Game</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2" style={{color: THEME.textOnDark}}>
                  Game Name
                </label>
                <input
                  type="text"
                  value={modals.gameCreate.name}
                  onChange={(e) => updateModalData('gameCreate', { name: e.target.value })}
                  className="w-full px-3 py-2 rounded-sm border focus:outline-none focus:ring-2"
                  style={{
                    backgroundColor: THEME.bgPrimary,
                    borderColor: THEME.borderDefault,
                    color: THEME.textPrimary
                  }}
                  placeholder="Enter game name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2" style={{color: THEME.textOnDark}}>
                  Number of Seats (1-8)
                </label>
                <select
                  value={modals.gameCreate.maxPlayers}
                  onChange={(e) => updateModalData('gameCreate', { maxPlayers: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 rounded-sm border focus:outline-none focus:ring-2"
                  style={{
                    backgroundColor: THEME.bgPrimary,
                    borderColor: THEME.borderDefault,
                    color: THEME.textPrimary
                  }}
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
                onClick={() => closeModal('gameCreate')}
              >
                Cancel
              </Button>
              <Button
                variant="success"
                onClick={createGame}
                disabled={!modals.gameCreate.name.trim() || modals.gameCreate.isCreating}
              >
                {modals.gameCreate.isCreating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
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
        </div>,
        document.body
      )}

      {modals.campaignCreate.open && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{backgroundColor: THEME.overlayDark}}
          onClick={() => {
            closeModal('campaignCreate')
            updateModalData('campaignCreate', { title: '', description: '', sessionName: '', editingCampaign: null })
          }}
        >
          <div
            className="rounded-sm shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border"
            style={{backgroundColor: THEME.bgSecondary, borderColor: THEME.borderDefault}}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 border-b" style={{borderBottomColor: THEME.borderSubtle}}>
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold font-[family-name:var(--font-metamorphous)]" style={{color: THEME.textOnDark}}>
                  {modals.campaignCreate.editingCampaign ? 'Edit Campaign' : 'Create New Campaign'}
                </h2>
                <button
                  onClick={() => {
                    closeModal('campaignCreate')
                    updateModalData('campaignCreate', { title: '', description: '', sessionName: '', editingCampaign: null })
                  }}
                  className="text-2xl font-bold hover:opacity-80 transition-opacity"
                  style={{color: THEME.textSecondary}}
                >
                  ×
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2" style={{color: THEME.textOnDark}}>
                  Campaign Title
                </label>
                <input
                  type="text"
                  value={modals.campaignCreate.title}
                  onChange={(e) => updateModalData('campaignCreate', { title: e.target.value })}
                  className="w-full px-3 py-2 rounded-sm border focus:outline-none focus:ring-2"
                  style={{
                    backgroundColor: THEME.bgPrimary,
                    borderColor: THEME.borderDefault,
                    color: THEME.textPrimary
                  }}
                  placeholder="Enter campaign title"
                  maxLength={100}
                />
                <div className="text-right text-sm mt-1" style={{color: THEME.textSecondary}}>
                  {(modals.campaignCreate.title || '').length}/100 characters
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2" style={{color: THEME.textOnDark}}>
                  Description (Optional)
                </label>
                <textarea
                  value={modals.campaignCreate.description}
                  onChange={(e) => updateModalData('campaignCreate', { description: e.target.value })}
                  className="w-full px-3 py-2 rounded-sm border focus:outline-none focus:ring-2"
                  style={{
                    backgroundColor: THEME.bgPrimary,
                    borderColor: THEME.borderDefault,
                    color: THEME.textPrimary
                  }}
                  rows="5"
                  placeholder="Enter campaign description"
                  maxLength={1000}
                />
                <div className="text-right text-sm mt-1" style={{color: THEME.textSecondary}}>
                  {(modals.campaignCreate.description || '').length}/1000 characters
                </div>
              </div>
              {/* Session Name - shown in both create and edit modes */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{color: THEME.textOnDark}}>
                  Session Name (Optional)
                </label>
                <input
                  type="text"
                  value={modals.campaignCreate.sessionName}
                  onChange={(e) => updateModalData('campaignCreate', { sessionName: e.target.value })}
                  className="w-full px-3 py-2 rounded-sm border focus:outline-none focus:ring-2"
                  style={{
                    backgroundColor: THEME.bgPrimary,
                    borderColor: THEME.borderDefault,
                    color: THEME.textPrimary
                  }}
                  placeholder="e.g. Session 1"
                  maxLength={100}
                />
                <div className="text-right text-sm mt-1" style={{color: THEME.textSecondary}}>
                  {(modals.campaignCreate.sessionName || '').length}/100 characters
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2" style={{color: THEME.textOnDark}}>
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
                      onClick={() => updateModalData('campaignCreate', { heroImage: option.value })}
                      className="aspect-[16/9] rounded-sm border-2 overflow-hidden relative"
                      style={{
                        width: 'calc(33.333% - 0.5rem)',
                        borderColor: modals.campaignCreate.heroImage === option.value ? THEME.borderActive : THEME.borderDefault,
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
                        className="absolute bottom-1 left-1 right-1 text-xs px-1 py-0.5 rounded-sm text-center"
                        style={{
                          backgroundColor: `${COLORS.onyx}CC`,
                          color: THEME.textAccent
                        }}
                      >
                        {option.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t flex justify-end gap-3" style={{borderTopColor: THEME.borderSubtle}}>
              <Button
                variant="ghost"
                onClick={() => {
                  closeModal('campaignCreate')
                  updateModalData('campaignCreate', { title: '', description: '', sessionName: '', editingCampaign: null })
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={modals.campaignCreate.editingCampaign ? updateCampaign : createCampaign}
                disabled={!modals.campaignCreate.title.trim() || modals.campaignCreate.isCreating}
              >
                {modals.campaignCreate.isCreating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    {modals.campaignCreate.editingCampaign ? 'Saving...' : 'Creating...'}
                  </>
                ) : (
                  <>
                    <FontAwesomeIcon icon={modals.campaignCreate.editingCampaign ? faGear : faPlus} className="mr-2" />
                    {modals.campaignCreate.editingCampaign ? 'Save Changes' : 'Create Campaign'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Pause Session Confirmation Modal */}
      {modals.gamePause.open && (
        <PauseSessionModal
          game={modals.gamePause.game}
          onConfirm={confirmPauseSession}
          onCancel={cancelPauseSession}
          isPausing={pausingGame === modals.gamePause.game?.id}
        />
      )}

      {/* Finish Session Confirmation Modal */}
      {modals.gameFinish.open && (
        <FinishSessionModal
          game={modals.gameFinish.game}
          onConfirm={confirmFinishSession}
          onCancel={cancelFinishSession}
          isFinishing={finishingGame === modals.gameFinish.game?.id}
        />
      )}

      {/* Delete Campaign Confirmation Modal */}
      {modals.campaignDelete.open && (
        <DeleteCampaignModal
          campaign={modals.campaignDelete.campaign}
          onConfirm={confirmDeleteCampaign}
          onCancel={cancelDeleteCampaign}
          isDeleting={modals.campaignDelete.isDeleting}
        />
      )}

      {/* Delete Session Confirmation Modal */}
      {modals.gameDelete.open && (
        <DeleteSessionModal
          session={modals.gameDelete.game}
          onConfirm={deleteGame}
          onCancel={closeDeleteSessionModal}
          isDeleting={deletingGame === modals.gameDelete.game?.id}
        />
      )}

      {/* Campaign Invite Modal */}
      {modals.campaignInvite.open && modals.campaignInvite.campaign && (
        <CampaignInviteModal
          campaign={modals.campaignInvite.campaign}
          onClose={() => closeModal('campaignInvite')}
          onInviteSuccess={handleCampaignInviteSuccess}
        />
      )}

      {/* Remove Player Confirmation Modal */}
      {modals.playerRemove.open && modals.playerRemove.member && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50"
          style={{backgroundColor: THEME.overlayDark}}
          onClick={() => closeModal('playerRemove')}
        >
          <div
            className="p-6 rounded-sm shadow-2xl max-w-md w-full mx-4 border"
            style={{backgroundColor: THEME.bgSecondary, borderColor: THEME.borderDefault}}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold font-[family-name:var(--font-metamorphous)] mb-4" style={{color: THEME.textOnDark}}>
              Remove Player
            </h3>
            <p className="mb-6" style={{color: THEME.textSecondary}}>
              Are you sure you want to remove <span className="font-semibold" style={{color: THEME.textOnDark}}>{modals.playerRemove.member.username}</span> from <span className="font-semibold" style={{color: THEME.textOnDark}}>{modals.playerRemove.campaign?.title}</span>?
            </p>
            <p className="text-sm mb-6" style={{color: '#fbbf24'}}>
              This player will need to be re-invited to rejoin the campaign.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => closeModal('playerRemove')}
                disabled={modals.playerRemove.isRemoving}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={removePlayerFromCampaign}
                disabled={modals.playerRemove.isRemoving}
              >
                {modals.playerRemove.isRemoving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
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
        </div>,
        document.body
      )}

      {/* Leave Campaign Confirmation Modal */}
      {modals.campaignLeave.open && modals.campaignLeave.campaign && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50"
          style={{backgroundColor: THEME.overlayDark}}
          onClick={() => closeModal('campaignLeave')}
        >
          <div
            className="p-6 rounded-sm shadow-2xl max-w-md w-full mx-4 border"
            style={{backgroundColor: THEME.bgSecondary, borderColor: THEME.borderDefault}}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold font-[family-name:var(--font-metamorphous)] mb-4" style={{color: THEME.textOnDark}}>
              Leave Campaign
            </h3>
            <p className="mb-6" style={{color: THEME.textSecondary}}>
              Are you sure you want to leave <span className="font-semibold" style={{color: THEME.textOnDark}}>{modals.campaignLeave.campaign?.title}</span>?
            </p>
            <p className="text-sm mb-6" style={{color: '#fbbf24'}}>
              You will need to be re-invited by the host to rejoin this campaign.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => closeModal('campaignLeave')}
                disabled={modals.campaignLeave.isLeaving}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={leaveCampaign}
                disabled={modals.campaignLeave.isLeaving}
              >
                {modals.campaignLeave.isLeaving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
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
        </div>,
        document.body
      )}

    </div>
  )
}