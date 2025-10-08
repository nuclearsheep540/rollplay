/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function CampaignManager({ user }) {
  const router = useRouter()
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [creatingCampaign, setCreatingCampaign] = useState(false)
  const [showCampaignModal, setShowCampaignModal] = useState(false)
  const [campaignName, setCampaignName] = useState('')
  const [campaignDescription, setCampaignDescription] = useState('')
  const [deletingCampaign, setDeletingCampaign] = useState(null)
  const [selectedCampaign, setSelectedCampaign] = useState(null)
  const [campaignGames, setCampaignGames] = useState([])
  const [allCampaignGames, setAllCampaignGames] = useState({}) // Store games for all campaigns
  const [creatingGame, setCreatingGame] = useState(null)
  const [endingGame, setEndingGame] = useState(null)
  const [deletingGame, setDeletingGame] = useState(null)

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

        // Fetch games for each campaign
        await fetchAllCampaignGames(campaignsData)
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

  // Fetch games for all campaigns
  const fetchAllCampaignGames = async (campaignsData) => {
    try {
      const gamesMap = {}
      
      // Fetch games for each campaign in parallel
      const gamesPromises = campaignsData.map(async (campaign) => {
        try {
          const response = await fetch(`/api/campaigns/${campaign.id}/games/`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include'
          })

          if (response.ok) {
            const gamesData = await response.json()
            gamesMap[campaign.id] = gamesData
          } else {
            console.error(`Failed to fetch games for campaign ${campaign.id}:`, response.status)
            gamesMap[campaign.id] = []
          }
        } catch (error) {
          console.error(`Error fetching games for campaign ${campaign.id}:`, error)
          gamesMap[campaign.id] = []
        }
      })

      await Promise.all(gamesPromises)
      setAllCampaignGames(gamesMap)
    } catch (error) {
      console.error('Error fetching all campaign games:', error)
    }
  }

  // Fetch games for a specific campaign
  const fetchCampaignGames = async (campaignId) => {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/games/`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      })

      if (response.ok) {
        const gamesData = await response.json()
        setCampaignGames(gamesData)
      } else {
        console.error('Failed to fetch campaign games:', response.status)
        setError('Failed to load campaign games')
      }
    } catch (error) {
      console.error('Error fetching campaign games:', error)
      setError('Failed to load campaign games')
    }
  }

  // Create game (without starting it)
  const createGame = async (campaignId) => {
    setCreatingGame(campaignId)
    setError(null)

    try {
      const gameData = {
        name: `Session 1`,
        max_players: 6,
        seat_colors: {
          "0": "#3b82f6",
          "1": "#ef4444", 
          "2": "#22c55e",
          "3": "#f97316",
          "4": "#8b5cf6",
          "5": "#f59e0b"
        }
      }

      const response = await fetch(`/api/campaigns/${campaignId}/games/`, {
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
        
        // Refresh campaigns and games
        await fetchCampaigns()
        if (selectedCampaign) {
          await fetchCampaignGames(selectedCampaign.id)
        }
      } else {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to create game')
      }
    } catch (error) {
      console.error('Error creating game:', error)
      setError('Failed to create game: ' + error.message)
    } finally {
      setCreatingGame(null)
    }
  }

  // Start game session (cold → hot storage migration)
  const startGameSession = async (campaignId) => {
    setCreatingGame(campaignId)
    setError(null)

    try {
      const response = await fetch(`/api/migration/campaigns/${campaignId}/start-game`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          session_config: {
            max_players: 6,
            seat_colors: {
              "0": "#3b82f6",
              "1": "#ef4444", 
              "2": "#22c55e",
              "3": "#f97316",
              "4": "#8b5cf6",
              "5": "#f59e0b"
            }
          }
        })
      })

      if (response.ok) {
        const result = await response.json()
        console.log('Game session started:', result)
        
        // Refresh campaigns and games
        await fetchCampaigns()
        if (selectedCampaign) {
          await fetchCampaignGames(selectedCampaign.id)
        }
      } else {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to start game session')
      }
    } catch (error) {
      console.error('Error starting game session:', error)
      setError('Failed to start game session: ' + error.message)
    } finally {
      setCreatingGame(null)
    }
  }

  // End game session (hot → cold storage migration)
  const endGameSession = async (gameId) => {
    setEndingGame(gameId)
    setError(null)

    try {
      const response = await fetch(`/api/migration/games/${gameId}/end-game`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      })

      if (response.ok) {
        const result = await response.json()
        console.log('Game session ended:', result)
        
        // Refresh campaigns and games
        await fetchCampaigns()
        if (selectedCampaign) {
          await fetchCampaignGames(selectedCampaign.id)
        }
      } else {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to end game session')
      }
    } catch (error) {
      console.error('Error ending game session:', error)
      setError('Failed to end game session: ' + error.message)
    } finally {
      setEndingGame(null)
    }
  }

  // Delete game (only if INACTIVE)
  const deleteGame = async (gameId, gameName) => {
    if (!confirm(`Are you sure you want to delete "${gameName || 'this game'}"?\n\nAll progress on this game will be lost. This action cannot be undone.`)) {
      return
    }

    setDeletingGame(gameId)
    setError(null)

    try {
      const response = await fetch(`/api/games/${gameId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      })

      if (response.ok) {
        console.log('Game deleted successfully')
        
        // Refresh campaigns and games
        await fetchCampaigns()
        if (selectedCampaign) {
          await fetchCampaignGames(selectedCampaign.id)
        }
      } else {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to delete game')
      }
    } catch (error) {
      console.error('Error deleting game:', error)
      setError('Failed to delete game: ' + error.message)
    } finally {
      setDeletingGame(null)
    }
  }

  // Create a new campaign
  const createCampaign = async () => {
    if (!user || !campaignName.trim()) return

    setCreatingCampaign(true)
    setError(null)

    try {
      const campaignData = {
        name: campaignName.trim(),
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
      setCampaignName('')
      setCampaignDescription('')
    } catch (error) {
      console.error('Error creating campaign:', error)
      setError('Failed to create campaign: ' + error.message)
    } finally {
      setCreatingCampaign(false)
    }
  }

  // Delete a campaign
  const deleteCampaign = async (campaignId, campaignName) => {
    if (!confirm(`Are you sure you want to delete "${campaignName}"? This action cannot be undone.`)) {
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
          setCampaignGames([])
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
  const showCampaignDetails = async (campaign) => {
    setSelectedCampaign(campaign)
    await fetchCampaignGames(campaign.id)
  }

  useEffect(() => {
    fetchCampaigns()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading campaigns...</span>
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
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Campaign Management</h2>
        <button
          onClick={() => setShowCampaignModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          Create Campaign
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Campaigns List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Campaigns */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-700">Your Campaigns</h3>
          {campaigns.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No campaigns yet. Create your first campaign to get started!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  className={`bg-white p-4 rounded-lg shadow-md border ${
                    selectedCampaign?.id === campaign.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  } cursor-pointer hover:shadow-lg transition-all duration-300`}
                  onClick={() => showCampaignDetails(campaign)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center flex-grow">
                      <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-xl font-bold mr-4 flex-shrink-0">
                        {campaign.name ? campaign.name[0].toUpperCase() : '?'}
                      </div>
                      <div className="flex-grow">
                        <h4 className="text-lg font-bold text-slate-800">{campaign.name || 'Unnamed Campaign'}</h4>
                        <p className="text-slate-600 text-sm">DM: {user?.screen_name || user?.email || 'Unknown'}</p>
                        {/* Game Status Indicator */}
                        {(() => {
                          const campaignGames = allCampaignGames[campaign.id] || []
                          const activeGames = campaignGames.filter(game => game.status === 'active')
                          const inactiveGames = campaignGames.filter(game => game.status === 'inactive')
                          const startingGames = campaignGames.filter(game => game.status === 'starting')
                          const stoppingGames = campaignGames.filter(game => game.status === 'stopping')
                          
                          if (activeGames.length > 0) {
                            return (
                              <p className="text-green-600 text-sm font-medium">
                                🎮 Active Game: {activeGames[0].name || 'Session'}
                              </p>
                            )
                          } else if (startingGames.length > 0) {
                            return (
                              <p className="text-yellow-600 text-sm font-medium">
                                ⏳ Starting: {startingGames[0].name || 'Session'}
                              </p>
                            )
                          } else if (stoppingGames.length > 0) {
                            return (
                              <p className="text-orange-600 text-sm font-medium">
                                ⏸️ Stopping: {stoppingGames[0].name || 'Session'}
                              </p>
                            )
                          } else if (inactiveGames.length > 0) {
                            return (
                              <p className="text-slate-500 text-sm">
                                📋 {inactiveGames.length} session{inactiveGames.length !== 1 ? 's' : ''} ready
                              </p>
                            )
                          } else {
                            return (
                              <p className="text-slate-400 text-sm">
                                📝 No sessions configured
                              </p>
                            )
                          }
                        })()}
                        <p className="text-slate-500 text-xs mt-1">
                          Created: {campaign.created_at ? new Date(campaign.created_at).toLocaleDateString() : 'Unknown'}
                        </p>
                      </div>
                    </div>
                    <div className="flex-shrink-0 flex space-x-2">
                      {/* Determine button state based on campaign games */}
                      {(() => {
                        // Get games for this specific campaign
                        const campaignGames = allCampaignGames[campaign.id] || []
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
                                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
                              >
                                Configure
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  createGame(campaign.id)
                                }}
                                disabled={creatingGame === campaign.id}
                                className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                {creatingGame === campaign.id ? 'Creating...' : 'Create Game'}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  deleteCampaign(campaign.id, campaign.name)
                                }}
                                disabled={deletingCampaign === campaign.id}
                                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                {deletingCampaign === campaign.id ? 'Deleting...' : 'Delete'}
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
          {selectedCampaign ? (
            <>
              <h3 className="text-lg font-semibold text-gray-700">
                {selectedCampaign.name} - Game Sessions
              </h3>
              <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
                <div className="mb-4">
                  <h4 className="font-medium text-gray-800">Campaign Details</h4>
                  <p className="text-sm text-gray-600 mt-1">{selectedCampaign.description}</p>
                </div>

                <div className="space-y-3">
                  <h5 className="font-medium text-gray-700">Game Sessions</h5>
                  {campaignGames.length === 0 ? (
                    <p className="text-gray-500 text-sm">No game sessions yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {campaignGames.map((game) => (
                        <div
                          key={game.id}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded border"
                        >
                          <div>
                            <p className="font-medium text-gray-800">{game.name || 'Game Session'}</p>
                            <p className="text-sm text-gray-600">
                              Status: <span className={`font-medium ${
                                game.status === 'active' ? 'text-green-600' : 
                                game.status === 'inactive' ? 'text-gray-600' : 
                                'text-yellow-600'
                              }`}>
                                {game.status}
                              </span>
                            </p>
                          </div>
                          <div className="flex space-x-2">
                            {game.status === 'active' ? (
                              <>
                                {game.mongodb_session_id && (
                                  <button
                                    onClick={() => router.push(`/game?roomId=${game.mongodb_session_id}`)}
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
                                  >
                                    Join Game
                                  </button>
                                )}
                                {!game.mongodb_session_id && (
                                  <button
                                    disabled={true}
                                    className="bg-gray-400 text-white px-3 py-1 rounded text-sm font-medium cursor-not-allowed"
                                  >
                                    Session Loading...
                                  </button>
                                )}
                                <button
                                  onClick={() => endGameSession(game.id)}
                                  disabled={endingGame === game.id}
                                  className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                  {endingGame === game.id ? 'Ending...' : 'End Game'}
                                </button>
                              </>
                            ) : (
                              <>
                                {game.status === 'inactive' && (
                                  <>
                                    <button
                                      onClick={() => startGameSession(selectedCampaign.id)}
                                      disabled={creatingGame === selectedCampaign.id}
                                      className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                      {creatingGame === selectedCampaign.id ? 'Starting...' : 'Start Game'}
                                    </button>
                                    <button
                                      onClick={() => deleteGame(game.id, game.name)}
                                      disabled={deletingGame === game.id}
                                      className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                      {deletingGame === game.id ? 'Deleting...' : 'Delete'}
                                    </button>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <p className="text-gray-500">Select a campaign to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Campaign Creation Modal */}
      {showCampaignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Create New Campaign</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Campaign Name
                </label>
                <input
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter campaign name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description (Optional)
                </label>
                <textarea
                  value={campaignDescription}
                  onChange={(e) => setCampaignDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows="3"
                  placeholder="Enter campaign description"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowCampaignModal(false)
                  setCampaignName('')
                  setCampaignDescription('')
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={createCampaign}
                disabled={!campaignName.trim() || creatingCampaign}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {creatingCampaign ? 'Creating...' : 'Create Campaign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}