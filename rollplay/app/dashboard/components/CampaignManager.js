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
  faUserMinus
} from '@fortawesome/free-solid-svg-icons'
import { COLORS, THEME } from '@/app/styles/colorTheme'
import { Button, Badge } from './shared/Button'

export default function CampaignManager({ user, refreshTrigger, onCampaignUpdate, onExpandedChange, inviteCampaignId, clearInviteCampaignId, showToast }) {
  const router = useRouter()
  const [campaigns, setCampaigns] = useState([])
  const [invitedCampaigns, setInvitedCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedCampaign, setSelectedCampaign] = useState(null)
  const [allGames, setAllGames] = useState([]) // Store all games from all campaigns
  const [isResizing, setIsResizing] = useState(false) // Track window resize state

  // Action state tracking (not modals, but ongoing operations)
  const [startingGame, setStartingGame] = useState(null) // Track game currently being started
  const [pausingGame, setPausingGame] = useState(null) // Track game being paused
  const [finishingGame, setFinishingGame] = useState(null) // Track game being finished
  const [deletingGame, setDeletingGame] = useState(null) // Track game being deleted

  const gameSessionsPanelRef = useRef(null)
  const campaignCardRef = useRef(null)
  const [drawerTop, setDrawerTop] = useState(null) // Distance from viewport top to drawer start

  // Consolidated modal state
  const [modals, setModals] = useState({
    campaignCreate: { open: false, title: '', description: '', heroImage: '/campaign-tile-bg.png', isCreating: false },
    campaignDelete: { open: false, campaign: null, isDeleting: false },
    campaignInvite: { open: false, campaign: null },
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

        // Fetch games for joined campaigns only
        await fetchAllGames(campaignsWithMembers)
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

  // Fetch all games for all campaigns
  const fetchAllGames = async (campaignsData) => {
    try {
      const allGamesArray = []

      // Fetch games for each campaign in parallel
      const gamesPromises = campaignsData.map(async (campaign) => {
        try {
          const response = await fetch(`/api/games/campaign/${campaign.id}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include'
          })

          if (response.ok) {
            const gamesData = await response.json()
            // Backend returns GameListResponse with {games: [...], total: n}
            return gamesData.games || []
          } else {
            console.error(`Failed to fetch games for campaign ${campaign.id}:`, response.status)
            return []
          }
        } catch (error) {
          console.error(`Error fetching games for campaign ${campaign.id}:`, error)
          return []
        }
      })

      const gamesArrays = await Promise.all(gamesPromises)
      // Flatten all games into single array
      gamesArrays.forEach(games => allGamesArray.push(...games))
      setAllGames(allGamesArray)
    } catch (error) {
      console.error('Error fetching all games:', error)
    }
  }

  // Handle targeted game updates from WebSocket events
  const handleGameUpdate = async (campaignId) => {
    // Only fetch games for the specific campaign
    try {
      const response = await fetch(`/api/games/campaign/${campaignId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      })

      if (response.ok) {
        const gamesData = await response.json()
        const updatedGames = gamesData.games || []

        // Update allGames by replacing games for this campaign
        setAllGames(prev => {
          // Remove old games for this campaign
          const otherGames = prev.filter(game => game.campaign_id !== campaignId)
          // Add updated games
          return [...otherGames, ...updatedGames]
        })
      }
    } catch (error) {
      console.error(`Error updating games for campaign ${campaignId}:`, error)
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

      const response = await fetch(`/api/campaigns/games?campaign_id=${modals.gameCreate.campaign}`, {
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
      const response = await fetch(`/api/games/${gameId}/start`, {
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
      const response = await fetch(`/api/games/${modals.gamePause.game.id}/end`, {
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
      const response = await fetch(`/api/games/${modals.gameFinish.game.id}/finish`, {
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
      const response = await fetch(`/api/games/${modals.gameDelete.game.id}`, {
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
        hero_image: modals.campaignCreate.heroImage || null
      }

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
      updateModalData('campaignCreate', { title: '', description: '' })
    } catch (error) {
      console.error('Error creating campaign:', error)
      setError('Failed to create campaign: ' + error.message)
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
      setError('Failed to delete campaign: ' + error.message)
    } finally {
      updateModalData('campaignDelete', { isDeleting: false })
    }
  }

  // Toggle campaign details
  const toggleCampaignDetails = (campaign) => {
    if (selectedCampaign?.id === campaign.id) {
      setSelectedCampaign(null)
    } else {
      // Scroll to top before expanding (while overflow-y-auto is still active)
      const mainEl = document.getElementById('dashboard-main')
      if (mainEl) {
        mainEl.scrollTo({ top: 0, behavior: 'smooth' })
      }
      setSelectedCampaign(campaign)
    }
  }

  useEffect(() => {
    // Only show loading on initial fetch (refreshTrigger = 0)
    fetchCampaigns(refreshTrigger === 0)
  }, [refreshTrigger])

  // Check for stale campaign invites (when user clicks old notification but invite was canceled)
  useEffect(() => {
    if (inviteCampaignId && !loading) {
      // Check if the expected invite still exists
      const inviteExists = invitedCampaigns.some(c => c.id === inviteCampaignId)
      if (!inviteExists) {
        // Invite was revoked - show feedback toast
        showToast?.({
          type: 'warning',
          message: 'This invite is no longer available'
        })
      }
      // Clear the URL param after checking (regardless of result)
      clearInviteCampaignId?.()
    }
  }, [inviteCampaignId, invitedCampaigns, loading])

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

  // Expose handleGameUpdate to parent via callback
  useEffect(() => {
    if (onCampaignUpdate) {
      onCampaignUpdate({ updateGames: handleGameUpdate })
    }
  }, [onCampaignUpdate])

  // Notify parent when expanded state changes
  useEffect(() => {
    onExpandedChange?.(!!selectedCampaign)
  }, [selectedCampaign, onExpandedChange])

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
            paddingLeft: 'clamp(0.5rem, 2.5vw, 3.5rem)',
            paddingRight: 'clamp(0.5rem, 2.5vw, 3.5rem)'
          }}
        >
          <h3 className="text-lg font-[family-name:var(--font-metamorphous)] font-bold" style={{color: THEME.textBold}}>Invited Campaigns</h3>
          <div className="space-y-4">
            {invitedCampaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="w-full relative"
                style={{
                  marginBottom: '3rem',
                  maxWidth: '1600px'
                }}
              >
                {/* Invited Campaign Card - NO gradients, NO min-width */}
                <div
                  className="aspect-[16/4] w-full relative rounded-sm overflow-hidden border-2"
                  style={{
                    backgroundImage: campaign.hero_image ? `url(${campaign.hero_image})` : 'none',
                    backgroundColor: campaign.hero_image ? 'transparent' : COLORS.carbon,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    borderColor: '#f59e0b' // Amber for invited campaigns
                  }}
                >
                  {/* Solid overlay for text readability (NO gradient) */}
                  <div
                    className="absolute inset-0 flex flex-col justify-between p-6"
                    style={{
                      backgroundColor: campaign.hero_image ? `${COLORS.onyx}B3` : 'transparent' // 70% opacity solid
                    }}
                  >
                    {/* Top Row - Title and Status Badge */}
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-3xl font-[family-name:var(--font-metamorphous)] mb-1 drop-shadow-lg" style={{color: THEME.textOnDark}}>
                          {campaign.title || 'Unnamed Campaign'}
                        </h4>
                        <Badge>Pending Invite</Badge>
                      </div>
                    </div>

                    {/* Bottom Row - Campaign Info */}
                    <div>
                      {/* Campaign Description */}
                      <div className="mb-3">
                        {campaign.description && (
                          <p className="text-sm drop-shadow-md mb-2" style={{color: THEME.textOnDark}}>
                            {campaign.description}
                          </p>
                        )}
                        <p className="text-sm drop-shadow-md mb-3" style={{color: THEME.textSecondary}}>
                          {campaign.host_screen_name ? `Invited by ${campaign.host_screen_name}` : 'Invited by campaign host'}
                        </p>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2">
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
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Campaigns List - Full Width Hero Cards */}
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
              const campaignGames = allGames.filter(game => game.campaign_id === campaign.id)
              // Active games are STARTING, ACTIVE, or STOPPING (excludes INACTIVE and FINISHED)
              const activeGames = campaignGames.filter(game =>
                game.status === 'active' || game.status === 'starting' || game.status === 'stopping'
              )
              const inactiveGames = campaignGames.filter(game => game.status === 'inactive')
              const finishedGames = campaignGames.filter(game => game.status === 'finished')
              const startingGames = campaignGames.filter(game => game.status === 'starting')
              const stoppingGames = campaignGames.filter(game => game.status === 'stopping')

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
                        <div className="flex gap-2 flex-shrink-0" style={{minWidth: campaign.host_id === user.id ? '310px' : '160px'}}>
                          {/* Active game indicator - always reserves space */}
                          <div className="px-4 py-2 backdrop-blur-sm text-sm font-semibold rounded-sm border"
                               style={{
                                 backgroundColor: activeGames.length > 0 ? '#166534' : 'transparent',
                                 color: activeGames.length > 0 ? THEME.textAccent : 'transparent',
                                 borderColor: activeGames.length > 0 ? '#16a34a' : 'transparent',
                                 animation: activeGames.length > 0 ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none',
                                 visibility: activeGames.length > 0 ? 'visible' : 'hidden'
                               }}>
                            Game In Session
                          </div>

                          {/* Always show action buttons if user is the host */}
                          {campaign.host_id === user.id && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openModal('campaignInvite', { campaign })
                                }}
                                className="w-10 h-10 backdrop-blur-sm rounded-sm transition-all flex items-center justify-center border disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{backgroundColor: THEME.bgSecondary, color: THEME.textAccent, borderColor: THEME.borderActive}}
                                title="Invite Player to Campaign"
                              >
                                <FontAwesomeIcon icon={faUserPlus} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleCampaignDetails(campaign)
                                }}
                                disabled={activeGames.length > 0}
                                className="w-10 h-10 backdrop-blur-sm rounded-sm transition-all flex items-center justify-center border disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{backgroundColor: THEME.bgSecondary, color: THEME.textAccent, borderColor: THEME.borderActive}}
                                title={activeGames.length > 0 ? "Cannot configure campaign during active games" : "Configure Campaign"}
                              >
                                <FontAwesomeIcon icon={faGear} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  promptDeleteCampaign(campaign)
                                }}
                                disabled={modals.campaignDelete.isDeleting || activeGames.length > 0}
                                className="w-10 h-10 backdrop-blur-sm rounded-sm transition-all flex items-center justify-center border disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{backgroundColor: '#991b1b', color: THEME.textAccent, borderColor: '#dc2626'}}
                                title={activeGames.length > 0 ? "Cannot delete campaign with active games" : "Delete Campaign"}
                              >
                                <FontAwesomeIcon icon={faTrash} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Middle - Spacer with responsive minimum gap */}
                      <div className="flex-1" style={{ minHeight: 'max(1rem, 2vh)' }}></div>

                      {/* Bottom Row - Campaign Metadata */}
                      <div className="flex items-center justify-between">
                        <div className="text-sm drop-shadow" style={{color: THEME.textOnDark}}>
                          <span>Created: {campaign.created_at ? new Date(campaign.created_at).toLocaleDateString() : 'Unknown'}</span>
                          <span className="mx-2">•</span>
                          <span>{campaignGames.length} session{campaignGames.length !== 1 ? 's' : ''}</span>
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
                      className="pt-[calc(1rem+16px)] sm:pt-[calc(2rem+16px)] md:pt-[calc(2.5rem+16px)] pb-4 sm:pb-6 md:pb-8 px-[calc(1rem+12px)] sm:px-[calc(2rem+12px)] md:px-[calc(2.5rem+12px)]"
                    >
                      {/* Inner content constrained to max-width for readability on wide screens */}
                      <div style={{ maxWidth: '1600px' }}>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-semibold font-[family-name:var(--font-metamorphous)]" style={{color: THEME.textOnDark}}>
                          Campaign Sessions for {selectedCampaign?.title || ''}
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
                        {campaign.host_id === user.id && !campaignGames.some(g => ['inactive', 'active', 'starting', 'stopping'].includes(g.status?.toLowerCase())) && (
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

                        {campaignGames.length === 0 && campaign.host_id !== user.id && (
                          <p className="text-sm py-4 text-center" style={{color: THEME.textSecondary}}>No game sessions yet.</p>
                        )}

                        {campaignGames.length > 0 && (
                          <div className="space-y-2">
                            {campaignGames.map((game) => (
                              <div
                                key={game.id}
                                className="flex items-center justify-between p-4 rounded-sm border"
                                style={{backgroundColor: THEME.bgSecondary, borderColor: THEME.borderSubtle}}
                              >
                                <div>
                                  <p className="font-medium" style={{color: THEME.textOnDark}}>{game.name || 'Game Session'}</p>
                                  <p className="text-sm" style={{color: THEME.textSecondary}}>
                                    Status: <span className="font-medium" style={{
                                      color: game.status === 'active' ? '#16a34a' :
                                             game.status === 'inactive' ? THEME.textSecondary :
                                             '#fbbf24'
                                    }}>
                                      {game.status.charAt(0).toUpperCase() + game.status.slice(1)}
                                    </span>
                                  </p>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex gap-2">
                                  {game.status === 'active' ? (
                                    <>
                                      <Button
                                        variant="primary"
                                        size="md"
                                        onClick={() => enterGame(game)}
                                      >
                                        <FontAwesomeIcon icon={faRightToBracket} className="mr-2" />
                                        Enter
                                      </Button>
                                      {/* Only show host actions if user is the campaign host */}
                                      {campaign.host_id === user.id && (
                                        <>
                                          <button
                                            onClick={() => promptPauseSession(game)}
                                            disabled={pausingGame === game.id}
                                            className="px-4 py-2 rounded-sm border transition-all text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                            style={{backgroundColor: '#d97706', color: THEME.textPrimary, borderColor: '#fbbf24'}}
                                            title="Pause Session"
                                          >
                                            {pausingGame === game.id ? (
                                              <>
                                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                                                Pausing...
                                              </>
                                            ) : (
                                              <>
                                                <FontAwesomeIcon icon={faPause} />
                                                Pause
                                              </>
                                            )}
                                          </button>
                                          <button
                                            onClick={() => promptFinishSession(game)}
                                            disabled={finishingGame === game.id}
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
                                      )}
                                    </>
                                  ) : game.status === 'inactive' && campaign.host_id === user.id ? (
                                    /* Only show inactive game actions if user is the host */
                                    <>
                                      <Button
                                        variant="success"
                                        size="md"
                                        onClick={() => startGame(game.id)}
                                        disabled={startingGame === game.id || activeGames.length > 0}
                                      >
                                        {startingGame === game.id ? (
                                          <>
                                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2"></div>
                                            Starting...
                                          </>
                                        ) : (
                                          <>
                                            <FontAwesomeIcon icon={faPlay} className="mr-2" />
                                            Start
                                          </>
                                        )}
                                      </Button>
                                      <button
                                        onClick={() => promptFinishSession(game)}
                                        disabled={finishingGame === game.id}
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

                        {/* Divider before campaign members */}
                        <div className="my-6 border-t" style={{borderColor: THEME.borderSubtle}}></div>

                        {/* Campaign Members Section */}
                        <div className="mb-6">
                          <h3 className="text-xl font-semibold font-[family-name:var(--font-metamorphous)] mb-4" style={{color: THEME.textOnDark}}>
                            Campaign Members
                          </h3>

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
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50" style={{backgroundColor: THEME.overlayDark}}>
          <div className="p-6 rounded-sm shadow-2xl max-w-md w-full mx-4 border" style={{backgroundColor: THEME.bgSecondary, borderColor: THEME.borderDefault}}>
            <h3 className="text-lg font-semibold font-[family-name:var(--font-metamorphous)] mb-4" style={{color: THEME.textOnDark}}>Create New Campaign</h3>
            <div className="space-y-4">
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
                />
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
            <div className="flex justify-end gap-3 mt-6">
              <Button
                variant="ghost"
                onClick={() => closeModal('campaignCreate')}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={createCampaign}
                disabled={!modals.campaignCreate.title.trim() || modals.campaignCreate.isCreating}
              >
                {modals.campaignCreate.isCreating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Creating...
                  </>
                ) : (
                  <>
                    <FontAwesomeIcon icon={faPlus} className="mr-2" />
                    Create Campaign
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

    </div>
  )
}