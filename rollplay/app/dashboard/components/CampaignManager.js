/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import EndGameModal from './EndGameModal'
import GameInviteModal from './GameInviteModal'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faGear,
  faGamepad,
  faTrash,
  faCheck,
  faXmark,
  faPlus,
  faPlay,
  faStop,
  faRightToBracket,
  faUserPlus
} from '@fortawesome/free-solid-svg-icons'

export default function CampaignManager({ user }) {
  const router = useRouter()
  const [campaigns, setCampaigns] = useState([])
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
  const [endingGame, setEndingGame] = useState(null)
  const [deletingGame, setDeletingGame] = useState(null)
  const [showEndGameModal, setShowEndGameModal] = useState(false)
  const [gameToEnd, setGameToEnd] = useState(null)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [selectedGameForInvite, setSelectedGameForInvite] = useState(null)
  const gameSessionsPanelRef = useRef(null)

  // Fetch campaigns from API
  const fetchCampaigns = async () => {
    try {
      const response = await fetch('/api/campaigns/', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      })

      if (response.ok) {
        const campaignsData = await response.json()
        setCampaigns(campaignsData)

        // Fetch games for all campaigns
        await fetchAllGames(campaignsData)
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

  // Show end game confirmation modal
  const promptEndGame = (game) => {
    setGameToEnd(game)
    setShowEndGameModal(true)
  }

  // End game session (after confirmation)
  const confirmEndGame = async () => {
    if (!gameToEnd) return

    setEndingGame(gameToEnd.id)
    setError(null)

    try {
      const response = await fetch(`/api/games/${gameToEnd.id}/end`, {
        method: 'POST',
        credentials: 'include'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to end game')
      }

      await fetchCampaigns()
      setShowEndGameModal(false)
      setGameToEnd(null)
    } catch (err) {
      console.error('Error ending game:', err)
      setError(err.message)
    } finally {
      setEndingGame(null)
    }
  }

  // Cancel end game
  const cancelEndGame = () => {
    setShowEndGameModal(false)
    setGameToEnd(null)
  }

  // Open invite modal for game
  const openInviteModal = (game) => {
    setSelectedGameForInvite(game)
    setShowInviteModal(true)
  }

  // Handle successful invite
  const handleInviteSuccess = async (updatedGame) => {
    // Refresh campaigns to show updated invite count
    await fetchCampaigns()
    // Update the selected game being passed to the modal
    setSelectedGameForInvite(updatedGame)
  }

  // Delete game
  const deleteGame = async (gameId, gameName) => {
    if (!confirm(`Are you sure you want to delete "${gameName}"? This action cannot be undone.`)) {
      return
    }

    setDeletingGame(gameId)
    setError(null)

    try {
      const response = await fetch(`/api/games/${gameId}`, {
        method: 'DELETE',
        credentials: 'include'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to delete game')
      }

      await fetchCampaigns()
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

  // Delete a campaign
  const deleteCampaign = async (campaignId, campaignTitle) => {
    if (!confirm(`Are you sure you want to delete "${campaignTitle}"? This action cannot be undone.`)) {
      return
    }

    setDeletingCampaign(campaignId)
    setError(null)

    try {
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      })

      if (response.ok) {
        await fetchCampaigns()
        if (selectedCampaign && selectedCampaign.id === campaignId) {
          setSelectedCampaign(null)
        }
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

  // Show campaign details
  const showCampaignDetails = (campaign) => {
    setSelectedCampaign(campaign)
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
    fetchCampaigns()
  }, [])

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
              const activeGames = campaignGames.filter(game => game.status === 'active')
              const inactiveGames = campaignGames.filter(game => game.status === 'inactive')
              const startingGames = campaignGames.filter(game => game.status === 'starting')
              const stoppingGames = campaignGames.filter(game => game.status === 'stopping')

              return (
                <div key={campaign.id} className="w-full max-w-[1200px] min-w-[800px]">
                  {/* Campaign Card */}
                  <div
                    className={`aspect-[16/4] w-full relative rounded-lg overflow-hidden cursor-pointer hover:shadow-lg transition-all duration-200 border-2 ${
                      selectedCampaign?.id === campaign.id
                        ? 'border-purple-500 shadow-lg shadow-purple-500/30'
                        : 'border-purple-500/30 hover:shadow-purple-500/30'
                    }`}
                    style={campaign.hero_image ? {
                      backgroundImage: `url(${campaign.hero_image})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center'
                    } : {
                      background: 'linear-gradient(135deg, rgba(192, 132, 252, 0.3) 0%, rgba(233, 213, 255, 0.15) 50%)'
                    }}
                    onClick={() => showCampaignDetails(campaign)}
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
                          {activeGames.length > 0 ? (
                            <div className="px-4 py-2 bg-green-500/90 backdrop-blur-sm text-white text-sm font-semibold rounded-lg border border-green-400 animate-pulse">
                              Game In Session
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  showCampaignDetails(campaign)
                                }}
                                className="w-10 h-10 bg-purple-500/80 backdrop-blur-sm hover:bg-purple-500 text-white rounded-lg transition-all flex items-center justify-center border border-purple-400/50"
                                title="Configure Campaign"
                              >
                                <FontAwesomeIcon icon={faGear} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openCreateGameModal(campaign.id)
                                }}
                                className="w-10 h-10 bg-green-500/80 backdrop-blur-sm hover:bg-green-500 text-white rounded-lg transition-all flex items-center justify-center border border-green-400/50"
                                title="Create Game"
                              >
                                <FontAwesomeIcon icon={faGamepad} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  deleteCampaign(campaign.id, campaign.title)
                                }}
                                disabled={deletingCampaign === campaign.id}
                                className="w-10 h-10 bg-red-500/80 backdrop-blur-sm hover:bg-red-500 text-white rounded-lg transition-all flex items-center justify-center border border-red-400/50 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Delete Campaign"
                              >
                                <FontAwesomeIcon icon={faTrash} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Middle - Spacer */}
                      <div className="flex-1"></div>

                      {/* Bottom Row - Metadata */}
                      <div className="text-slate-200 text-sm drop-shadow">
                        <span>Created: {campaign.created_at ? new Date(campaign.created_at).toLocaleDateString() : 'Unknown'}</span>
                        <span className="mx-2">•</span>
                        <span>{campaignGames.length} session{campaignGames.length !== 1 ? 's' : ''}</span>
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
                                      {game.status}
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
                                      <button
                                        onClick={() => openInviteModal(game)}
                                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg border border-blue-500 hover:shadow-lg hover:shadow-blue-500/30 transition-all text-sm font-medium flex items-center gap-2"
                                        title="Invite Players"
                                      >
                                        <FontAwesomeIcon icon={faUserPlus} />
                                        Invite
                                      </button>
                                      <button
                                        onClick={() => promptEndGame(game)}
                                        disabled={endingGame === game.id}
                                        className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg border border-orange-500 hover:shadow-lg hover:shadow-orange-500/30 transition-all text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                        title="End Game"
                                      >
                                        {endingGame === game.id ? (
                                          <>
                                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                                            Ending...
                                          </>
                                        ) : (
                                          <>
                                            <FontAwesomeIcon icon={faStop} />
                                            End
                                          </>
                                        )}
                                      </button>
                                    </>
                                  ) : game.status === 'inactive' ? (
                                    <>
                                      <button
                                        onClick={() => startGame(game.id)}
                                        disabled={startingGame === game.id}
                                        className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg border border-green-500 hover:shadow-lg hover:shadow-green-500/30 transition-all text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                        title="Start Game"
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
                                        onClick={() => openInviteModal(game)}
                                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg border border-blue-500 hover:shadow-lg hover:shadow-blue-500/30 transition-all text-sm font-medium flex items-center gap-2"
                                        title="Invite Players"
                                      >
                                        <FontAwesomeIcon icon={faUserPlus} />
                                        Invite
                                      </button>
                                      <button
                                        onClick={() => deleteGame(game.id, game.name)}
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

      {/* End Game Confirmation Modal */}
      {showEndGameModal && (
        <EndGameModal
          game={gameToEnd}
          onConfirm={confirmEndGame}
          onCancel={cancelEndGame}
          isEnding={endingGame === gameToEnd?.id}
        />
      )}

      {/* Game Invite Modal */}
      {showInviteModal && selectedGameForInvite && (
        <GameInviteModal
          game={selectedGameForInvite}
          onClose={() => {
            setShowInviteModal(false)
            setSelectedGameForInvite(null)
          }}
          onInviteSuccess={handleInviteSuccess}
        />
      )}

    </div>
  )
}