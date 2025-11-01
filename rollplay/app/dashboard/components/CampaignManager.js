/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faGear,
  faGamepad,
  faTrash,
  faCheck,
  faXmark,
  faPlus
} from '@fortawesome/free-solid-svg-icons'

export default function CampaignManager({ user }) {
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

  // Game session controls (Start, End, Delete, Invite) moved to Games tab

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

      {/* Campaigns List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Campaigns */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-purple-400 uppercase">Your Campaigns</h3>
          {campaigns.length === 0 ? (
            <div className="text-center py-8 bg-slate-800 rounded-lg border border-purple-500/30">
              <p className="text-slate-400">No campaigns yet. Create your first campaign to get started!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  className={`bg-slate-800 p-4 rounded-lg border cursor-pointer hover:shadow-lg transition-all duration-200 ${
                    selectedCampaign?.id === campaign.id
                      ? 'border-purple-500 shadow-lg shadow-purple-500/30'
                      : 'border-purple-500/30 hover:shadow-purple-500/30'
                  }`}
                  onClick={() => showCampaignDetails(campaign)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center flex-grow">
                      <div className="w-12 h-12 bg-purple-500/20 border-2 border-purple-500/50 rounded-full flex items-center justify-center text-purple-400 text-xl font-bold mr-4 flex-shrink-0">
                        {campaign.title ? campaign.title[0].toUpperCase() : '?'}
                      </div>
                      <div className="flex-grow">
                        <h4 className="text-lg font-bold text-slate-200">{campaign.title || 'Unnamed Campaign'}</h4>
                        <p className="text-slate-400 text-sm">DM: {user?.screen_name || user?.email || 'Unknown'}</p>
                        {/* Game Status Indicator */}
                        {(() => {
                          const campaignGames = allGames.filter(game => game.campaign_id === campaign.id)
                          const activeGames = campaignGames.filter(game => game.status === 'active')
                          const inactiveGames = campaignGames.filter(game => game.status === 'inactive')
                          const startingGames = campaignGames.filter(game => game.status === 'starting')
                          const stoppingGames = campaignGames.filter(game => game.status === 'stopping')
                          
                          if (activeGames.length > 0) {
                            return (
                              <p className="text-green-400 text-sm font-medium flex items-center gap-1">
                                <FontAwesomeIcon icon={faGamepad} className="text-xs" />
                                Active Game: {activeGames[0].name || 'Session'}
                              </p>
                            )
                          } else if (startingGames.length > 0) {
                            return (
                              <p className="text-amber-400 text-sm font-medium">
                                Starting: {startingGames[0].name || 'Session'}
                              </p>
                            )
                          } else if (stoppingGames.length > 0) {
                            return (
                              <p className="text-orange-400 text-sm font-medium">
                                Stopping: {stoppingGames[0].name || 'Session'}
                              </p>
                            )
                          } else if (inactiveGames.length > 0) {
                            return (
                              <p className="text-slate-500 text-sm">
                                {inactiveGames.length} session{inactiveGames.length !== 1 ? 's' : ''} ready
                              </p>
                            )
                          } else {
                            return (
                              <p className="text-slate-500 text-sm">
                                No sessions configured
                              </p>
                            )
                          }
                        })()}
                        <p className="text-slate-600 text-xs mt-1">
                          Created: {campaign.created_at ? new Date(campaign.created_at).toLocaleDateString() : 'Unknown'}
                        </p>
                      </div>
                    </div>
                    <div className="flex-shrink-0 flex space-x-2">
                      {/* Determine button state based on campaign games */}
                      {(() => {
                        // Get games for this specific campaign
                        const campaignGames = allGames.filter(game => game.campaign_id === campaign.id)
                        const activeGames = campaignGames.filter(game => game.status === 'active')
                        const inactiveGames = campaignGames.filter(game => game.status === 'inactive')
                        
                        if (activeGames.length > 0) {
                          return (
                            <button
                              disabled={true}
                              className="animate-gradient-x text-white px-3 py-1 rounded text-sm font-medium cursor-not-allowed"
                            >
                              Game In Session
                            </button>
                          )
                        } else {
                          // Always show Configure when no active games
                          return (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  showCampaignDetails(campaign)
                                }}
                                className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/30 px-3 py-1.5 rounded text-sm font-medium transition-all flex items-center gap-1"
                              >
                                <FontAwesomeIcon icon={faGear} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openCreateGameModal(campaign.id)
                                }}
                                className="bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 px-3 py-1.5 rounded text-sm font-medium transition-all flex items-center gap-1"
                              >
                                <FontAwesomeIcon icon={faGamepad} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  deleteCampaign(campaign.id, campaign.title)
                                }}
                                disabled={deletingCampaign === campaign.id}
                                className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 px-3 py-1.5 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1"
                              >
                                <FontAwesomeIcon icon={faTrash} />
                              </button>
                            </>
                          )
                        }
                      })()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column - Campaign Details */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-purple-400 uppercase">
            Game Sessions
          </h3>
          {selectedCampaign ? (
            <div className="bg-slate-800 p-4 rounded-lg border border-purple-500/30 mt-2">
              <div className="mb-4 pb-4 border-b border-slate-700">
                <h4 className="font-medium text-purple-400">Campaign Details</h4>
                <p className="text-sm text-slate-400 mt-1">{selectedCampaign.description}</p>
              </div>

              <div className="space-y-3">
                <h5 className="font-medium text-slate-300">Game Sessions</h5>
                {(() => {
                  const campaignGames = allGames.filter(game => game.campaign_id === selectedCampaign.id)
                  return campaignGames.length === 0 ? (
                    <p className="text-slate-500 text-sm">No game sessions yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {campaignGames.map((game) => (
                      <div
                        key={game.id}
                        className="flex items-center justify-between p-3 bg-slate-900 rounded border border-slate-700"
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
                        <div className="flex space-x-2">
                          {/* Game session controls moved to Games tab */}
                        </div>
                      </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 bg-slate-800 rounded-lg border-2 border-dashed border-purple-500/30 mt-2">
              <p className="text-slate-500">Select a campaign to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Game Creation Modal */}
      {showGameModal && (
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
        </div>
      )}

      {showCampaignModal && (
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
        </div>
      )}

    </div>
  )
}