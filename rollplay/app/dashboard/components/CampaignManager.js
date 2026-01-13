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
  faUserPlus
} from '@fortawesome/free-solid-svg-icons'
import { COLORS, THEME } from '@/app/styles/colorTheme'
import { Button, Badge } from './shared/Button'

export default function CampaignManager({ user, refreshTrigger }) {
  const router = useRouter()
  const [campaigns, setCampaigns] = useState([])
  const [invitedCampaigns, setInvitedCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedCampaign, setSelectedCampaign] = useState(null)
  const [allGames, setAllGames] = useState([]) // Store all games from all campaigns

  // Action state tracking (not modals, but ongoing operations)
  const [startingGame, setStartingGame] = useState(null) // Track game currently being started
  const [pausingGame, setPausingGame] = useState(null) // Track game being paused
  const [finishingGame, setFinishingGame] = useState(null) // Track game being finished
  const [deletingGame, setDeletingGame] = useState(null) // Track game being deleted

  const gameSessionsPanelRef = useRef(null)

  // Consolidated modal state
  const [modals, setModals] = useState({
    campaignCreate: { open: false, title: '', description: '', heroImage: '/campaign-tile-bg.png', isCreating: false },
    campaignDelete: { open: false, campaign: null, isDeleting: false },
    campaignInvite: { open: false, campaign: null },
    gameCreate: { open: false, campaign: null, name: 'Session 1', maxPlayers: 8, isCreating: false },
    gameDelete: { open: false, game: null, isDeleting: false },
    gamePause: { open: false, game: null, isPausing: false },
    gameFinish: { open: false, game: null, isFinishing: false }
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

        // Fetch games for joined campaigns only
        await fetchAllGames(joined)
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
    // Refresh campaigns to show updated player count
    await fetchCampaigns()
    // Update the selected campaign being passed to the modal
    updateModalData('campaignInvite', { campaign: updatedCampaign })
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
      setSelectedCampaign(campaign)
    }
  }

  useEffect(() => {
    // Only show loading on initial fetch (refreshTrigger = 0)
    fetchCampaigns(refreshTrigger === 0)
  }, [refreshTrigger])

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
        <div className="space-y-4">
          <h3 className="text-lg font-[family-name:var(--font-metamorphous)] text-amber-400">Invited Campaigns</h3>
          <div className="space-y-4">
            {invitedCampaigns.map((campaign) => (
              <div key={campaign.id} className="w-full">
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
                        <h4 className="text-3xl font-[family-name:var(--font-metamorphous)] mb-1 drop-shadow-lg" style={{color: THEME.textAccent}}>
                          {campaign.title || 'Unnamed Campaign'}
                        </h4>
                        <Badge>Pending Invite</Badge>
                      </div>
                    </div>

                    {/* Bottom Row - Campaign Info and Actions */}
                    <div className="flex items-end justify-between">
                      {/* Campaign Description */}
                      <div className="flex-1">
                        {campaign.description && (
                          <p className="text-sm drop-shadow-md mb-2" style={{color: THEME.textOnDark}}>
                            {campaign.description}
                          </p>
                        )}
                        <p className="text-sm drop-shadow-md" style={{color: THEME.textSecondary}}>
                          Invited by campaign host
                        </p>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2 ml-4">
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
          transition: 'padding 100ms cubic-bezier(0.42, 0, 1, 1)'
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
                    marginBottom: isSelected ? '0' : '3rem'
                  }}
                >
                  {/* Campaign Card with expanding background */}
                  <div
                    className="aspect-[16/4] w-full relative rounded-sm overflow-visible cursor-pointer border-2"
                    style={{
                      backgroundImage: `url(${campaign.hero_image || '/campaign-tile-bg.png'})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      borderColor: selectedCampaign?.id === campaign.id ? THEME.borderActive : THEME.borderDefault
                    }}
                    onClick={() => toggleCampaignDetails(campaign)}
                  >
                    {/* Expanding background layer - slightly taller to overlap drawer */}
                    <div
                      className="absolute pointer-events-none"
                      style={{
                        left: selectedCampaign?.id === campaign.id ? 'calc(50% - 50vw)' : '0',
                        width: selectedCampaign?.id === campaign.id ? '100vw' : '100%',
                        height: selectedCampaign?.id === campaign.id ? 'calc(100% + 16px)' : '100%', // 16px overlap when expanded
                        top: 0,
                        backgroundImage: `url(${campaign.hero_image || '/campaign-tile-bg.png'})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        borderRadius: '0.125rem', // rounded-sm equivalent
                        borderBottomLeftRadius: selectedCampaign?.id === campaign.id ? '0' : '0.125rem',
                        borderBottomRightRadius: selectedCampaign?.id === campaign.id ? '0' : '0.125rem',
                        zIndex: selectedCampaign?.id === campaign.id ? 0 : -1,
                        transition: selectedCampaign?.id === campaign.id
                          ? 'left 100ms cubic-bezier(0.42, 0, 1, 1), width 100ms cubic-bezier(0.42, 0, 1, 1), height 100ms cubic-bezier(0.42, 0, 1, 1), border-radius 100ms'
                          : 'left 100ms cubic-bezier(0.42, 0, 1, 1), width 100ms cubic-bezier(0.42, 0, 1, 1), height 100ms cubic-bezier(0.42, 0, 1, 1), border-radius 100ms, z-index 0ms 100ms'
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

                    {/* Content container - never moves */}
                    <div className="absolute inset-0 flex flex-col justify-between p-6" style={{ zIndex: 1 }}>
                        {/* Top Row - Title and Action Buttons */}
                        <div className="flex items-start justify-between">
                        <div className="flex-1 pr-4">
                          <h4 className="text-3xl font-[family-name:var(--font-metamorphous)] mb-1 drop-shadow-lg" style={{color: THEME.textAccent}}>
                            {campaign.title || 'Unnamed Campaign'}
                          </h4>
                          {campaign.description && (
                            <p className="text-sm drop-shadow-md mt-2" style={{color: THEME.textOnDark}}>
                              {campaign.description}
                            </p>
                          )}
                        </div>

                        {/* Action Buttons - Top Right */}
                        <div className="flex gap-2">
                          {/* Active game indicator */}
                          {activeGames.length > 0 && (
                            <div className="px-4 py-2 backdrop-blur-sm text-sm font-semibold rounded-sm border animate-pulse"
                                 style={{backgroundColor: '#166534', color: THEME.textAccent, borderColor: '#16a34a'}}>
                              Game In Session
                            </div>
                          )}

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

                      {/* Middle - Spacer */}
                      <div className="flex-1"></div>

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

                  {/* Game Sessions Detail Panel - Expands to full viewport width, no top margin */}
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
                      maxHeight: selectedCampaign?.id === campaign.id ? '2000px' : '0px',
                      overflow: 'hidden',
                      borderRadius: '0.125rem',
                      borderTopLeftRadius: '0', // No top radius to connect with campaign tile
                      borderTopRightRadius: '0',
                      marginTop: '-16px', // Negative margin to overlap with campaign tile
                      transition: 'left 100ms cubic-bezier(0.42, 0, 1, 1), width 100ms cubic-bezier(0.42, 0, 1, 1), max-height 100ms cubic-bezier(0.42, 0, 1, 1), border-width 100ms cubic-bezier(0.42, 0, 1, 1)',
                      pointerEvents: selectedCampaign?.id === campaign.id ? 'auto' : 'none',
                      visibility: selectedCampaign?.id === campaign.id ? 'visible' : 'hidden'
                    }}
                  >
                    {/* Content wrapper with padding - matches main container responsive padding + 12px horizontal */}
                    <div className="pb-4 sm:pb-8 md:pb-10 pt-[calc(1rem+16px)] sm:pt-[calc(2rem+16px)] md:pt-[calc(2.5rem+16px)] px-[calc(1rem+12px)] sm:px-[calc(2rem+12px)] md:px-[calc(2.5rem+12px)]">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-semibold font-[family-name:var(--font-metamorphous)]" style={{color: THEME.textOnDark}}>
                          Game Sessions for "{selectedCampaign?.title || ''}"
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

                      <div className="mb-4 pb-4 border-b" style={{borderBottomColor: THEME.borderSubtle}}>
                        <p className="text-sm" style={{color: THEME.textSecondary}}>{selectedCampaign?.description || 'No description provided.'}</p>
                      </div>

                      <div className="space-y-3">
                        {/* Create Session Template - Only show if user is host and no active games */}
                        {campaign.host_id === user.id && activeGames.length === 0 && (
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
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Create Campaign Template Tile - Fades when campaign is expanded */}
            <div
              className="w-full"
              style={{
                opacity: selectedCampaign ? 0 : 1,
                pointerEvents: selectedCampaign ? 'none' : 'auto',
                transition: selectedCampaign
                  ? 'opacity 100ms cubic-bezier(0.42, 0, 1, 1)'
                  : 'opacity 100ms cubic-bezier(0.42, 0, 1, 1) 50ms'
              }}
            >
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
                      className="text-6xl mb-4 opacity-30"
                      style={{color: THEME.textSecondary}}
                    />
                    <h4 className="text-2xl font-[family-name:var(--font-metamorphous)] mb-2 opacity-50" style={{color: THEME.textPrimary}}>
                      Create New Campaign
                    </h4>
                  </div>
                </button>
            </div>
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
                  rows="3"
                  placeholder="Enter campaign description"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2" style={{color: THEME.textOnDark}}>
                  Tile Background
                </label>
                <div className="flex gap-3">
                  {[
                    { value: '/campaign-tile-bg.png', label: 'Mountains' },
                    { value: '/floating-city.png', label: 'Floating City' },
                    { value: null, label: 'None' }
                  ].map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => updateModalData('campaignCreate', { heroImage: option.value })}
                      className="flex-1 aspect-[16/9] rounded-sm border-2 overflow-hidden relative"
                      style={{
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
          key={`campaign-invite-${modals.campaignInvite.campaign.id}-${modals.campaignInvite.campaign.invited_player_ids?.length || 0}`}
          campaign={modals.campaignInvite.campaign}
          onClose={() => closeModal('campaignInvite')}
          onInviteSuccess={handleCampaignInviteSuccess}
        />
      )}

    </div>
  )
}