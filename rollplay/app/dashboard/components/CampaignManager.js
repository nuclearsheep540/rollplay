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
  faCheckCircle,
  faRightToBracket,
  faUserPlus,
  faInfoCircle
} from '@fortawesome/free-solid-svg-icons'

export default function CampaignManager({ user, refreshTrigger }) {
  const router = useRouter()
  const [campaigns, setCampaigns] = useState([])
  const [invitedCampaigns, setInvitedCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [creatingCampaign, setCreatingCampaign] = useState(false)
  const [showCampaignModal, setShowCampaignModal] = useState(false)
  const [campaignTitle, setCampaignTitle] = useState('')
  const [campaignDescription, setCampaignDescription] = useState('')
  const [deletingCampaign, setDeletingCampaign] = useState(null)
  const [selectedCampaign, setSelectedCampaign] = useState(null)
  const [allGames, setAllGames] = useState([]) // Store all games from all campaigns
  const [creatingGame, setCreatingGame] = useState(false) // For game creation modal
  const [showGameModal, setShowGameModal] = useState(false)
  const [gameName, setGameName] = useState('')
  const [gameMaxPlayers, setGameMaxPlayers] = useState(8)
  const [selectedCampaignForGame, setSelectedCampaignForGame] = useState(null)
  const [startingGame, setStartingGame] = useState(null)
  const [pausingGame, setPausingGame] = useState(null)
  const [finishingGame, setFinishingGame] = useState(null)
  const [deletingGame, setDeletingGame] = useState(null)
  const [showPauseSessionModal, setShowPauseSessionModal] = useState(false)
  const [gameToPause, setGameToPause] = useState(null)
  const [showFinishSessionModal, setShowFinishSessionModal] = useState(false)
  const [gameToFinish, setGameToFinish] = useState(null)
  const [showDeleteCampaignModal, setShowDeleteCampaignModal] = useState(false)
  const [campaignToDelete, setCampaignToDelete] = useState(null)
  const [showDeleteSessionModal, setShowDeleteSessionModal] = useState(false)
  const [sessionToDelete, setSessionToDelete] = useState(null)
  const [showCampaignInviteModal, setShowCampaignInviteModal] = useState(false)
  const [selectedCampaignForInvite, setSelectedCampaignForInvite] = useState(null)
  const gameSessionsPanelRef = useRef(null)

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
    setSelectedCampaignForGame(campaignId)
    setGameName('Session 1')
    setGameMaxPlayers(8)
    setShowGameModal(true)
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
    if (!selectedCampaignForGame) return

    setCreatingGame(true)
    setError(null)

    try {
      const gameData = {
        name: gameName.trim() || 'Session 1',
        max_players: gameMaxPlayers,
        campaign_id: `${selectedCampaignForGame}`
      }

      const response = await fetch(`/api/campaigns/games?campaign_id=${selectedCampaignForGame}`, {
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
        setShowGameModal(false)
        await fetchCampaigns()
      } else {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to create game')
      }
    } catch (error) {
      console.error('Error creating game:', error)
      setError('Failed to create game: ' + error.message)
    } finally {
      setCreatingGame(false)
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
    setGameToPause(game)
    setShowPauseSessionModal(true)
  }

  // Pause session (after confirmation)
  const confirmPauseSession = async () => {
    if (!gameToPause) return

    setPausingGame(gameToPause.id)
    setError(null)

    try {
      const response = await fetch(`/api/games/${gameToPause.id}/end`, {
        method: 'POST',
        credentials: 'include'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to pause session')
      }

      await fetchCampaigns()
      setShowPauseSessionModal(false)
      setGameToPause(null)
    } catch (err) {
      console.error('Error pausing session:', err)
      setError(err.message)
    } finally {
      setPausingGame(null)
    }
  }

  // Cancel pause session
  const cancelPauseSession = () => {
    setShowPauseSessionModal(false)
    setGameToPause(null)
  }

  // Show finish session confirmation modal
  const promptFinishSession = (game) => {
    setGameToFinish(game)
    setShowFinishSessionModal(true)
  }

  // Finish session permanently (after confirmation)
  const confirmFinishSession = async () => {
    if (!gameToFinish) return

    setFinishingGame(gameToFinish.id)
    setError(null)

    try {
      const response = await fetch(`/api/games/${gameToFinish.id}/finish`, {
        method: 'POST',
        credentials: 'include'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to finish session')
      }

      await fetchCampaigns()
      setShowFinishSessionModal(false)
      setGameToFinish(null)
    } catch (err) {
      console.error('Error finishing session:', err)
      setError(err.message)
    } finally {
      setFinishingGame(null)
    }
  }

  // Cancel finish session
  const cancelFinishSession = () => {
    setShowFinishSessionModal(false)
    setGameToFinish(null)
  }

  // Handle successful campaign invite
  const handleCampaignInviteSuccess = async (updatedCampaign) => {
    // Refresh campaigns to show updated player count
    await fetchCampaigns()
    // Update the selected campaign being passed to the modal
    setSelectedCampaignForInvite(updatedCampaign)
  }

  // Open delete session modal
  const openDeleteSessionModal = (game) => {
    setSessionToDelete(game)
    setShowDeleteSessionModal(true)
  }

  // Close delete session modal
  const closeDeleteSessionModal = () => {
    setSessionToDelete(null)
    setShowDeleteSessionModal(false)
  }

  // Delete game (called from modal)
  const deleteGame = async () => {
    if (!sessionToDelete) return

    setDeletingGame(sessionToDelete.id)
    setError(null)

    try {
      const response = await fetch(`/api/games/${sessionToDelete.id}`, {
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
    if (!user || !campaignTitle.trim()) return

    setCreatingCampaign(true)
    setError(null)

    try {
      const campaignData = {
        title: campaignTitle.trim(),
        description: campaignDescription.trim() || `Campaign created on ${new Date().toLocaleDateString()}`
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
      setShowCampaignModal(false)
      setCampaignTitle('')
      setCampaignDescription('')
    } catch (error) {
      console.error('Error creating campaign:', error)
      setError('Failed to create campaign: ' + error.message)
    } finally {
      setCreatingCampaign(false)
    }
  }

  // Show delete campaign confirmation modal
  const promptDeleteCampaign = (campaign) => {
    setCampaignToDelete(campaign)
    setShowDeleteCampaignModal(true)
  }

  // Cancel delete campaign
  const cancelDeleteCampaign = () => {
    setShowDeleteCampaignModal(false)
    setCampaignToDelete(null)
  }

  // Delete a campaign (after confirmation)
  const confirmDeleteCampaign = async () => {
    if (!campaignToDelete) return

    setDeletingCampaign(campaignToDelete.id)
    setError(null)

    try {
      const response = await fetch(`/api/campaigns/${campaignToDelete.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      })

      if (response.ok) {
        await fetchCampaigns()
        if (selectedCampaign && selectedCampaign.id === campaignToDelete.id) {
          setSelectedCampaign(null)
        }
        setShowDeleteCampaignModal(false)
        setCampaignToDelete(null)
      } else {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to delete campaign')
      }
    } catch (error) {
      console.error('Error deleting campaign:', error)
      setError('Failed to delete campaign: ' + error.message)
    } finally {
      setDeletingCampaign(null)
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

  // Scroll to game sessions panel when selectedCampaign changes
  useEffect(() => {
    if (selectedCampaign && gameSessionsPanelRef.current) {
      // Small delay to ensure DOM has updated
      setTimeout(() => {
        gameSessionsPanelRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        })
      }, 100)
    }
  }, [selectedCampaign])

  useEffect(() => {
    // Only show loading on initial fetch (refreshTrigger = 0)
    fetchCampaigns(refreshTrigger === 0)
  }, [refreshTrigger])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
        <span className="ml-2 text-slate-400">Loading campaigns...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* CSS for gradient animation */}
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

      `}</style>

      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold text-white uppercase">Campaign Management</h1>
          <p className="mt-2 text-slate-400">Organize your adventures and game sessions</p>
        </div>
        <button
          onClick={() => setShowCampaignModal(true)}
          className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2.5 rounded-lg font-semibold border border-purple-500 hover:shadow-lg hover:shadow-purple-500/30 transition-all flex items-center gap-2 text-sm"
        >
          <FontAwesomeIcon icon={faPlus} />
          Create Campaign
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Invited Campaigns Section - Only render if there are invites */}
      {invitedCampaigns.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-amber-400 uppercase">Invited Campaigns</h3>
          <div className="space-y-4">
            {invitedCampaigns.map((campaign) => (
              <div key={campaign.id} className="w-full max-w-[1200px] min-w-[800px]">
                {/* Invited Campaign Card */}
                <div
                  className="aspect-[16/4] w-full relative rounded-lg overflow-hidden border-2 border-amber-500/30"
                  style={campaign.hero_image ? {
                    backgroundImage: `url(${campaign.hero_image})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                  } : {
                    background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.3) 0%, rgba(254, 243, 199, 0.15) 50%)'
                  }}
                >
                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/25 via-slate-900/15 to-slate-900/5" />

                  {/* Content Overlay */}
                  <div className="relative z-10 p-6 h-full flex flex-col justify-between">
                    {/* Top Row - Title and Status Badge */}
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-3xl font-bold text-white mb-1 drop-shadow-lg">
                          {campaign.title || 'Unnamed Campaign'}
                        </h4>
                        <span className="inline-block px-3 py-1 bg-amber-500/20 text-amber-400 border border-amber-500/50 rounded-full text-sm font-semibold">
                          Pending Invite
                        </span>
                      </div>
                    </div>

                    {/* Bottom Row - Campaign Info and Actions */}
                    <div className="flex items-end justify-between">
                      {/* Campaign Description */}
                      <div className="flex-1">
                        {campaign.description && (
                          <p className="text-sm text-white/90 drop-shadow-md mb-2">
                            {campaign.description}
                          </p>
                        )}
                        <p className="text-sm text-white/70 drop-shadow-md">
                          Invited by campaign host
                        </p>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2 ml-4">
                        <button
                          onClick={() => acceptCampaignInvite(campaign.id)}
                          className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg border border-green-500 hover:shadow-lg hover:shadow-green-500/30 transition-all text-sm font-medium flex items-center gap-2"
                          title="Accept Invite"
                        >
                          <FontAwesomeIcon icon={faCheck} />
                          Accept
                        </button>
                        <button
                          onClick={() => declineCampaignInvite(campaign.id)}
                          className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg border border-red-500 hover:shadow-lg hover:shadow-red-500/30 transition-all text-sm font-medium flex items-center gap-2"
                          title="Decline Invite"
                        >
                          <FontAwesomeIcon icon={faXmark} />
                          Decline
                        </button>
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
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-purple-400 uppercase">Your Campaigns</h3>
        {campaigns.length === 0 ? (
          <div className="text-center py-8 bg-slate-800 rounded-lg border border-purple-500/30">
            <p className="text-slate-400">No campaigns yet. Create your first campaign to get started!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {campaigns.map((campaign) => {
              const campaignGames = allGames.filter(game => game.campaign_id === campaign.id)
              // Active games are STARTING, ACTIVE, or STOPPING (excludes INACTIVE and FINISHED)
              const activeGames = campaignGames.filter(game =>
                game.status === 'active' || game.status === 'starting' || game.status === 'stopping'
              )
              const inactiveGames = campaignGames.filter(game => game.status === 'inactive')
              const finishedGames = campaignGames.filter(game => game.status === 'finished')
              const startingGames = campaignGames.filter(game => game.status === 'starting')
              const stoppingGames = campaignGames.filter(game => game.status === 'stopping')

              return (
                <div key={campaign.id} className="w-full max-w-[1200px] min-w-[800px]">
                  {/* Campaign Card */}
                  <div
                    className={`aspect-[16/4] w-full relative rounded-lg overflow-hidden cursor-pointer transition-all duration-200 border-2 ${
                      selectedCampaign?.id === campaign.id
                        ? 'border-purple-500'
                        : 'border-purple-500/30'
                    }`}
                    style={campaign.hero_image ? {
                      backgroundImage: `url(${campaign.hero_image})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center'
                    } : {
                      background: 'linear-gradient(135deg, rgba(192, 132, 252, 0.3) 0%, rgba(233, 213, 255, 0.15) 50%)'
                    }}
                    onClick={() => toggleCampaignDetails(campaign)}
                  >
                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/25 via-slate-900/15 to-slate-900/5" />

                    {/* Content Overlay */}
                    <div className="relative z-10 p-6 h-full flex flex-col justify-between">
                      {/* Top Row - Title and Action Buttons */}
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="text-3xl font-bold text-white mb-1 drop-shadow-lg">
                            {campaign.title || 'Unnamed Campaign'}
                          </h4>
                        </div>

                        {/* Action Buttons - Top Right */}
                        <div className="flex gap-2">
                          {/* Active game indicator */}
                          {activeGames.length > 0 && (
                            <div className="px-4 py-2 bg-green-500/90 backdrop-blur-sm text-white text-sm font-semibold rounded-lg border border-green-400 animate-pulse">
                              Game In Session
                            </div>
                          )}

                          {/* Always show action buttons if user is the host */}
                          {campaign.host_id === user.id && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedCampaignForInvite(campaign)
                                  setShowCampaignInviteModal(true)
                                }}
                                className="w-10 h-10 bg-blue-500/80 backdrop-blur-sm hover:bg-blue-500 text-white rounded-lg transition-all flex items-center justify-center border border-blue-400/50"
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
                                className="w-10 h-10 bg-purple-500/80 backdrop-blur-sm hover:bg-purple-500 text-white rounded-lg transition-all flex items-center justify-center border border-purple-400/50 disabled:opacity-50 disabled:cursor-not-allowed"
                                title={activeGames.length > 0 ? "Cannot configure campaign during active games" : "Configure Campaign"}
                              >
                                <FontAwesomeIcon icon={faGear} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  promptDeleteCampaign(campaign)
                                }}
                                disabled={deletingCampaign === campaign.id || activeGames.length > 0}
                                className="w-10 h-10 bg-red-500/80 backdrop-blur-sm hover:bg-red-500 text-white rounded-lg transition-all flex items-center justify-center border border-red-400/50 disabled:opacity-50 disabled:cursor-not-allowed"
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

                      {/* Bottom Row - Create Session Button & Metadata */}
                      <div className="flex items-center justify-between">
                        {activeGames.length > 0 ? (
                          <div className="space-y-2">
                            {/* Campaign metadata */}
                            <div className="text-slate-200 text-sm drop-shadow">
                              <span>Created: {campaign.created_at ? new Date(campaign.created_at).toLocaleDateString() : 'Unknown'}</span>
                              <span className="mx-2">•</span>
                              <span>{campaignGames.length} session{campaignGames.length !== 1 ? 's' : ''}</span>
                            </div>

                            {/* Clarity message: why Create Session button is hidden */}
                            <div className="text-amber-400/80 text-xs flex items-center gap-1">
                              <FontAwesomeIcon icon={faInfoCircle} />
                              <span>End active session to create another</span>
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* Only show Create Session button if user is the host */}
                            {campaign.host_id === user.id && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openCreateGameModal(campaign.id)
                                }}
                                className="px-6 py-3 bg-green-500/90 backdrop-blur-sm hover:bg-green-500 text-white rounded-lg transition-all flex items-center gap-2 border border-green-400/50 font-semibold text-base"
                                title="Create Session"
                              >
                                <FontAwesomeIcon icon={faPlus} />
                                Create Session
                              </button>
                            )}
                            <div className="text-slate-200 text-sm drop-shadow">
                              <span>Created: {campaign.created_at ? new Date(campaign.created_at).toLocaleDateString() : 'Unknown'}</span>
                              <span className="mx-2">•</span>
                              <span>{campaignGames.length} session{campaignGames.length !== 1 ? 's' : ''}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Game Sessions Detail Panel - Appears Below Selected Campaign */}
                  {selectedCampaign?.id === campaign.id && (
                    <div ref={gameSessionsPanelRef} className="mt-4 ml-16 bg-slate-800 p-6 rounded-lg border border-purple-500/30">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-semibold text-purple-400">
                          Game Sessions for "{selectedCampaign.title}"
                        </h3>
                        <button
                          onClick={() => setSelectedCampaign(null)}
                          className="text-slate-400 hover:text-slate-200 transition-colors text-sm"
                        >
                          <FontAwesomeIcon icon={faXmark} className="mr-1" />
                          Close
                        </button>
                      </div>

                      <div className="mb-4 pb-4 border-b border-slate-700">
                        <p className="text-sm text-slate-400">{selectedCampaign.description || 'No description provided.'}</p>
                      </div>

                      <div className="space-y-3">
                        {campaignGames.length === 0 ? (
                          <p className="text-slate-500 text-sm py-4 text-center">No game sessions yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {campaignGames.map((game) => (
                              <div
                                key={game.id}
                                className="flex items-center justify-between p-4 bg-slate-900 rounded-lg border border-slate-700"
                              >
                                <div>
                                  <p className="font-medium text-slate-200">{game.name || 'Game Session'}</p>
                                  <p className="text-sm text-slate-500">
                                    Status: <span className={`font-medium ${
                                      game.status === 'active' ? 'text-green-400' :
                                      game.status === 'inactive' ? 'text-slate-400' :
                                      'text-amber-400'
                                    }`}>
                                      {game.status.charAt(0).toUpperCase() + game.status.slice(1)}
                                    </span>
                                  </p>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex gap-2">
                                  {game.status === 'active' ? (
                                    <>
                                      <button
                                        onClick={() => enterGame(game)}
                                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg border border-purple-500 hover:shadow-lg hover:shadow-purple-500/30 transition-all text-sm font-medium flex items-center gap-2"
                                        title="Enter Game"
                                      >
                                        <FontAwesomeIcon icon={faRightToBracket} />
                                        Enter
                                      </button>
                                      {/* Only show host actions if user is the campaign host */}
                                      {campaign.host_id === user.id && (
                                        <>
                                          <button
                                            onClick={() => promptPauseSession(game)}
                                            disabled={pausingGame === game.id}
                                            className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg border border-orange-500 hover:shadow-lg hover:shadow-orange-500/30 transition-all text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
                                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg border border-amber-500 hover:shadow-lg hover:shadow-amber-500/30 transition-all text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                            title="Finish Session Permanently"
                                          >
                                            {finishingGame === game.id ? (
                                              <>
                                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                                                Finishing...
                                              </>
                                            ) : (
                                              <>
                                                <FontAwesomeIcon icon={faCheckCircle} />
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
                                      <button
                                        onClick={() => startGame(game.id)}
                                        disabled={startingGame === game.id || activeGames.length > 0}
                                        className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg border border-green-500 hover:shadow-lg hover:shadow-green-500/30 transition-all text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                        title={activeGames.length > 0 ? "Pause or finish the active session before starting another" : "Start Game"}
                                      >
                                        {startingGame === game.id ? (
                                          <>
                                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                                            Starting...
                                          </>
                                        ) : (
                                          <>
                                            <FontAwesomeIcon icon={faPlay} />
                                            Start
                                          </>
                                        )}
                                      </button>
                                      <button
                                        onClick={() => promptFinishSession(game)}
                                        disabled={finishingGame === game.id}
                                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg border border-amber-500 hover:shadow-lg hover:shadow-amber-500/30 transition-all text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                        title="Finish Session Permanently"
                                      >
                                        {finishingGame === game.id ? (
                                          <>
                                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                                            Finishing...
                                          </>
                                        ) : (
                                          <>
                                            <FontAwesomeIcon icon={faCheckCircle} />
                                            Finish
                                          </>
                                        )}
                                      </button>
                                      <button
                                        onClick={() => openDeleteSessionModal(game)}
                                        disabled={deletingGame === game.id}
                                        className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg border border-red-500 hover:shadow-lg hover:shadow-red-500/30 transition-all text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                        title="Delete Game"
                                      >
                                        {deletingGame === game.id ? (
                                          <>
                                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                                            Deleting...
                                          </>
                                        ) : (
                                          <>
                                            <FontAwesomeIcon icon={faTrash} />
                                            Delete
                                          </>
                                        )}
                                      </button>
                                    </>
                                  ) : game.status === 'finished' && campaign.host_id === user.id ? (
                                    /* Show delete button for finished sessions (host only) */
                                    <button
                                      onClick={() => openDeleteSessionModal(game)}
                                      disabled={deletingGame === game.id}
                                      className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg border border-red-500 hover:shadow-lg hover:shadow-red-500/30 transition-all text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                      title="Delete Finished Session"
                                    >
                                      {deletingGame === game.id ? (
                                        <>
                                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                                          Deleting...
                                        </>
                                      ) : (
                                        <>
                                          <FontAwesomeIcon icon={faTrash} />
                                          Delete
                                        </>
                                      )}
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Game Creation Modal */}
      {showGameModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-purple-500/30 p-6 rounded-lg shadow-2xl shadow-purple-500/20 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-purple-400 mb-4">Create New Game</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Game Name
                </label>
                <input
                  type="text"
                  value={gameName}
                  onChange={(e) => setGameName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Enter game name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Number of Seats (1-8)
                </label>
                <select
                  value={gameMaxPlayers}
                  onChange={(e) => setGameMaxPlayers(parseInt(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(num => (
                    <option key={num} value={num}>{num} seats</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowGameModal(false)
                  setGameName('')
                  setGameMaxPlayers(8)
                }}
                className="px-4 py-2 bg-slate-700 text-slate-300 border border-slate-600 rounded-lg hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createGame}
                disabled={!gameName.trim() || creatingGame}
                className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg font-medium border border-green-500 hover:shadow-lg hover:shadow-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                {creatingGame ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Creating...
                  </>
                ) : (
                  <>
                    <FontAwesomeIcon icon={faPlus} />
                    Create Game
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showCampaignModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-purple-500/30 p-6 rounded-lg shadow-2xl shadow-purple-500/20 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-purple-400 mb-4">Create New Campaign</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Campaign Title
                </label>
                <input
                  type="text"
                  value={campaignTitle}
                  onChange={(e) => setCampaignTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Enter campaign title"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Description (Optional)
                </label>
                <textarea
                  value={campaignDescription}
                  onChange={(e) => setCampaignDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  rows="3"
                  placeholder="Enter campaign description"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCampaignModal(false)
                  setCampaignTitle('')
                  setCampaignDescription('')
                }}
                className="px-4 py-2 bg-slate-700 text-slate-300 border border-slate-600 rounded-lg hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createCampaign}
                disabled={!campaignTitle.trim() || creatingCampaign}
                className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg font-medium border border-purple-500 hover:shadow-lg hover:shadow-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                {creatingCampaign ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Creating...
                  </>
                ) : (
                  <>
                    <FontAwesomeIcon icon={faPlus} />
                    Create Campaign
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Pause Session Confirmation Modal */}
      {showPauseSessionModal && (
        <PauseSessionModal
          game={gameToPause}
          onConfirm={confirmPauseSession}
          onCancel={cancelPauseSession}
          isPausing={pausingGame === gameToPause?.id}
        />
      )}

      {/* Finish Session Confirmation Modal */}
      {showFinishSessionModal && (
        <FinishSessionModal
          game={gameToFinish}
          onConfirm={confirmFinishSession}
          onCancel={cancelFinishSession}
          isFinishing={finishingGame === gameToFinish?.id}
        />
      )}

      {/* Delete Campaign Confirmation Modal */}
      {showDeleteCampaignModal && (
        <DeleteCampaignModal
          campaign={campaignToDelete}
          onConfirm={confirmDeleteCampaign}
          onCancel={cancelDeleteCampaign}
          isDeleting={deletingCampaign === campaignToDelete?.id}
        />
      )}

      {/* Delete Session Confirmation Modal */}
      {showDeleteSessionModal && (
        <DeleteSessionModal
          session={sessionToDelete}
          onConfirm={deleteGame}
          onCancel={closeDeleteSessionModal}
          isDeleting={deletingGame === sessionToDelete?.id}
        />
      )}

      {/* Campaign Invite Modal */}
      {showCampaignInviteModal && selectedCampaignForInvite && (
        <CampaignInviteModal
          key={`campaign-invite-${selectedCampaignForInvite.id}-${selectedCampaignForInvite.invited_player_ids?.length || 0}`}
          campaign={selectedCampaignForInvite}
          onClose={() => {
            setShowCampaignInviteModal(false)
            setSelectedCampaignForInvite(null)
          }}
          onInviteSuccess={handleCampaignInviteSuccess}
        />
      )}

    </div>
  )
}