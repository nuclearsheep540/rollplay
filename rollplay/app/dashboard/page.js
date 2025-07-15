/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Dashboard() {
  const router = useRouter()
  const [activeSection, setActiveSection] = useState('characters')
  const [user, setUser] = useState(null)
  const [characters, setCharacters] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [creatingCampaign, setCreatingCampaign] = useState(false)


  // Fetch characters from API
  const fetchCharacters = async () => {
    try {
      const response = await fetch('/api/characters/', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      })

      if (response.ok) {
        const charactersData = await response.json()
        setCharacters(charactersData)
      } else {
        console.error('Failed to fetch characters:', response.status)
        setError('Failed to load characters')
      }
    } catch (error) {
      console.error('Error fetching characters:', error)
      setError('Failed to load characters')
    }
  }

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
      } else {
        console.error('Failed to fetch campaigns:', response.status)
        setError('Failed to load campaigns')
      }
    } catch (error) {
      console.error('Error fetching campaigns:', error)
      setError('Failed to load campaigns')
    }
  }

  // Create a new campaign using proper PostgreSQL-first flow
  const createCampaign = async () => {
    if (!user) return
    
    setCreatingCampaign(true)
    setError(null)

    try {
      // Step 1: Create a campaign in PostgreSQL
      const campaignData = {
        name: `Campaign ${new Date().toLocaleDateString()}`,
        description: `Campaign created on ${new Date().toLocaleDateString()}`
      }

      const campaignResponse = await fetch('/api/campaigns/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(campaignData)
      })

      if (!campaignResponse.ok) {
        throw new Error('Failed to create campaign')
      }

      const campaign = await campaignResponse.json()
      console.log('Created campaign:', campaign.id)
      
      // Step 2: Create a game within the campaign
      const gameData = {
        session_name: `Session 1`,
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

      const gameResponse = await fetch(`/api/campaigns/${campaign.id}/games/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(gameData)
      })

      if (!gameResponse.ok) {
        throw new Error('Failed to create game')
      }

      const game = await gameResponse.json()
      console.log('Created game:', game.id)
      
      // Step 3: Start the game to create MongoDB active_session
      const startResponse = await fetch(`/api/games/${game.id}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      })

      if (!startResponse.ok) {
        throw new Error('Failed to start game')
      }

      const startedGame = await startResponse.json()
      console.log('Started game:', startedGame.id)
      
      // Refresh the campaigns list
      await fetchCampaigns()
      
      // Show success message
      alert('Campaign created successfully!')
    } catch (error) {
      console.error('Error creating campaign:', error)
      setError('Failed to create campaign: ' + error.message)
    } finally {
      setCreatingCampaign(false)
    }
  }

  useEffect(() => {
    const checkAuthenticationAndGetUser = async () => {
      try {
        // Get or create user from api-site (this validates auth and gets user data)
        const userResponse = await fetch('/api/users/', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include' // Include httpOnly cookies
        })

        if (userResponse.ok) {
          const userData = await userResponse.json()
          setUser(userData)
          
          // Once user is authenticated, fetch characters and campaigns
          await Promise.all([
            fetchCharacters(),
            fetchCampaigns()
          ])
          
          setLoading(false)
          return
        }

        // If 401, user is not authenticated
        if (userResponse.status === 401) {
          router.push('/auth/magic')
          return
        }

        // Other errors
        console.error('Failed to get user data:', userResponse.status)
        router.push('/auth/magic')
        
      } catch (error) {
        console.error('Auth/user check error:', error)
        router.push('/auth/magic')
      }
    }

    checkAuthenticationAndGetUser()
  }, [router])

  const handleLogout = async () => {
    try {
      // Call backend logout endpoint to clear httpOnly cookie
      await fetch('/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include' // Include httpOnly cookies
      })
    } catch (error) {
      console.error('Logout error:', error)
    }
    
    // Redirect regardless of API success
    router.push('/')
  }

  const switchSection = (targetId) => {
    setActiveSection(targetId)
  }

  const renderCharacters = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center py-8">
          <div className="text-slate-600">Loading characters...</div>
        </div>
      )
    }

    if (error) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )
    }

    if (characters.length === 0) {
      return (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-8 text-center">
          <p className="text-slate-600 text-lg mb-4">No characters found</p>
          <p className="text-slate-500">Create your first character to get started!</p>
        </div>
      )
    }

    return characters.map((char, index) => (
      <div key={char.id || index} className="bg-white p-4 rounded-lg shadow-md border border-gray-200 flex items-center justify-between hover:shadow-lg transition-all duration-300">
        <div className="flex items-center flex-grow">
          <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-xl font-bold mr-4 flex-shrink-0">
            {char.name ? char.name[0].toUpperCase() : '?'}
          </div>
          <div className="flex-grow">
            <h3 className="text-lg font-bold text-slate-800">{char.name || 'Unnamed Character'}</h3>
            <p className="text-slate-600 text-sm">{char.race || 'Unknown'} {char.class || 'Unknown'} - Level {char.level || 1}</p>
            <p className="text-slate-500 text-xs mt-1">Campaign: {char.campaign || 'No Campaign'}</p>
            <p className="text-slate-500 text-xs mt-1">Created: {char.created_at ? new Date(char.created_at).toLocaleDateString() : 'Unknown'}</p>
          </div>
        </div>
        <div className="flex space-x-2 flex-shrink-0">
          <button className="p-2 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors" title="Edit Character">
            <span className="text-lg">✎</span>
          </button>
          <button className="p-2 rounded-full bg-indigo-100 text-indigo-600 hover:bg-indigo-200 transition-colors" title="View Character">
            <span className="text-lg">📖</span>
          </button>
        </div>
      </div>
    ))
  }

  const renderCampaigns = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center py-8">
          <div className="text-slate-600">Loading campaigns...</div>
        </div>
      )
    }

    if (error) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )
    }

    if (campaigns.length === 0) {
      return (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-8 text-center">
          <p className="text-slate-600 text-lg mb-4">No campaigns found</p>
          <p className="text-slate-500">Create your first campaign to get started!</p>
        </div>
      )
    }

    return campaigns.map((campaign, index) => {
      const statusColor = campaign.status === 'active' ? 'text-green-600 bg-green-100' : 'text-slate-600 bg-slate-100'
      return (
        <div key={campaign.id || index} className="bg-white p-4 rounded-lg shadow-md border border-gray-200 flex items-center justify-between hover:shadow-lg transition-all duration-300">
          <div className="flex items-center flex-grow">
            <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-xl font-bold mr-4 flex-shrink-0">
              {campaign.name ? campaign.name[0].toUpperCase() : '?'}
            </div>
            <div className="flex-grow">
              <h3 className="text-lg font-bold text-slate-800">{campaign.name || 'Unnamed Campaign'}</h3>
              <p className="text-slate-600 text-sm">DM: {user?.screen_name || user?.email || 'Unknown'}</p>
              <p className="text-slate-500 text-xs mt-1">Status: <span className={`font-semibold ${statusColor}`}>{campaign.status || 'Unknown'}</span></p>
              <p className="text-slate-500 text-xs mt-1">Created: {campaign.created_at ? new Date(campaign.created_at).toLocaleDateString() : 'Unknown'}</p>
            </div>
          </div>
          <div className="flex-shrink-0">
            <button 
              onClick={async () => {
                try {
                  // For real campaigns, get the games and start the first one
                  const gamesResponse = await fetch(`/api/campaigns/${campaign.id}/games/`, {
                    method: 'GET',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    credentials: 'include'
                  })
                  
                  if (gamesResponse.ok) {
                    const games = await gamesResponse.json()
                    if (games.length > 0) {
                      const game = games[0] // Use the first game
                      
                      // If game is not active, start it
                      if (game.status !== 'active') {
                        await fetch(`/api/games/${game.id}/start`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          credentials: 'include'
                        })
                      }
                      
                      // Navigate to the game room
                      router.push(`/game?roomId=${game.id}`)
                    } else {
                      setError('No games found for this campaign')
                    }
                  } else {
                    setError('Failed to load campaign games')
                  }
                } catch (error) {
                  console.error('Error entering room:', error)
                  setError('Failed to enter room')
                }
              }}
              className="w-full text-center bg-indigo-600 text-white font-semibold px-4 py-2 rounded-lg shadow-md hover:bg-indigo-700 transition-colors duration-200"
            >
              Enter Room
            </button>
          </div>
        </div>
      )
    })
  }

  if (!user || loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-slate-600">Loading...</div>
    </div>
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-700">
      {/* Top Navigation Bar */}
      <header className="bg-white p-4 shadow-md flex justify-between items-center">
        <div className="text-2xl font-extrabold text-slate-800 flex items-center">
          <span>Tabletop Tavern</span>
        </div>
        <nav>
          <ul className="flex space-x-4 sm:space-x-6">
            <li>
              <button 
                onClick={() => switchSection('profile')}
                className={`flex items-center p-2 transition-colors duration-200 text-slate-700 hover:bg-slate-200 ${
                  activeSection === 'profile' ? 'border-b-2 border-indigo-600 text-indigo-600 font-semibold' : ''
                }`}
              >
                <span className="text-xl mr-2">👤</span>
                <span className="font-semibold hidden sm:inline">Profile</span>
              </button>
            </li>
            <li>
              <button 
                onClick={handleLogout}
                className="flex items-center p-2 transition-colors duration-200 text-slate-600 hover:bg-slate-200"
              >
                <span className="text-xl mr-2">🚪</span>
                <span className="font-semibold hidden sm:inline">Logout</span>
              </button>
            </li>
          </ul>
        </nav>
      </header>

      <div className="flex flex-1">
        {/* Sidebar Navigation */}
        <aside className="w-64 bg-slate-200 p-4 flex flex-col justify-between shadow-lg">
          <div>
            <nav>
              <ul>
                <li className="mb-4">
                  <button 
                    onClick={() => switchSection('characters')}
                    className={`w-full flex items-center p-3 transition-colors duration-200 text-slate-700 hover:bg-slate-300 ${
                      activeSection === 'characters' ? 'border-l-4 border-indigo-600 text-indigo-600 font-semibold bg-indigo-100' : ''
                    }`}
                    title="Characters"
                  >
                    <span className="text-xl mr-3">👥</span>
                    <span className="font-semibold">Characters</span>
                  </button>
                </li>
                <li className="mb-4">
                  <button 
                    onClick={() => switchSection('campaigns')}
                    className={`w-full flex items-center p-3 transition-colors duration-200 text-slate-700 hover:bg-slate-300 ${
                      activeSection === 'campaigns' ? 'border-l-4 border-indigo-600 text-indigo-600 font-semibold bg-indigo-100' : ''
                    }`}
                    title="Campaigns"
                  >
                    <span className="text-xl mr-3">🗺️</span>
                    <span className="font-semibold">Campaigns</span>
                  </button>
                </li>
              </ul>
            </nav>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-4 sm:p-8 md:p-10">
          {/* Characters Section */}
          {activeSection === 'characters' && (
            <section>
              <div className="mb-8">
                <h1 className="text-4xl font-bold text-slate-800">Your Characters</h1>
                <p className="mt-2 text-slate-600">This is your hub for managing all your characters. From here, you can create new heroes, edit existing ones, or get them ready for the next adventure. Each row provides detailed metadata for your characters.</p>
              </div>
              <div className="flex justify-end items-center mb-6 space-x-4">
                <button className="bg-slate-300 text-slate-800 font-semibold px-5 py-3 rounded-xl shadow-md hover:bg-slate-400 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 flex items-center">
                  <span className="text-xl mr-2">📋</span> Clone Character
                </button>
                <button className="bg-indigo-600 text-white font-semibold px-5 py-3 rounded-xl shadow-md hover:bg-indigo-700 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 flex items-center">
                  <span className="text-xl mr-2">+</span> Create New Character
                </button>
              </div>
              <div className="flex flex-col gap-4">
                {renderCharacters()}
              </div>
            </section>
          )}

          {/* Campaigns Section */}
          {activeSection === 'campaigns' && (
            <section>
              <div className="mb-8">
                <h1 className="text-4xl font-bold text-slate-800">Your Campaigns</h1>
                <p className="mt-2 text-slate-600">Here you'll find all the game rooms and campaigns you've joined. Each campaign card provides a quick overview, letting you see the Game Master and its current status, so you can jump right back into the action.</p>
              </div>
              <div className="flex justify-end items-center mb-6 space-x-4">
                <button 
                  onClick={createCampaign}
                  disabled={creatingCampaign}
                  className={`font-semibold px-5 py-3 rounded-xl shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 flex items-center ${
                    creatingCampaign 
                      ? 'bg-slate-200 text-slate-500 cursor-not-allowed' 
                      : 'bg-slate-300 text-slate-800 hover:bg-slate-400'
                  }`}
                >
                  <span className="text-xl mr-2">{creatingCampaign ? '⏳' : '➕'}</span> 
                  {creatingCampaign ? 'Creating...' : 'Create Campaign'}
                </button>
                <button className="bg-indigo-600 text-white font-semibold px-5 py-3 rounded-xl shadow-md hover:bg-indigo-700 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 flex items-center">
                  <span className="text-xl mr-2">🔗</span> Join Campaign
                </button>
              </div>
              <div className="flex flex-col gap-4">
                {renderCampaigns()}
              </div>
            </section>
          )}

          {/* Profile Section */}
          {activeSection === 'profile' && (
            <section>
              <div className="mb-8">
                <h1 className="text-4xl font-bold text-slate-800">Your Profile</h1>
                <p className="mt-2 text-slate-600">Manage your user profile and account settings. You can update your personal information and change your preferences to customize your experience on the platform.</p>
              </div>
              <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-200 max-w-2xl mx-auto">
                <div className="flex items-center mb-6">
                  <div className="w-24 h-24 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-5xl font-bold mr-6">
                    {user.screen_name ? user.screen_name[0].toUpperCase() : user.email[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-3xl font-semibold text-slate-800">{user.screen_name || user.email.split('@')[0]}</p>
                    <p className="text-slate-600 mt-1">{user.email}</p>
                  </div>
                </div>
                <div className="mt-8 pt-6 border-t border-gray-200">
                  <h3 className="text-xl font-semibold text-slate-700 mb-4">Account Settings</h3>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                      <input 
                        type="text" 
                        id="username" 
                        defaultValue={user.screen_name || user.email.split('@')[0]}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                      <input 
                        type="email" 
                        id="email" 
                        defaultValue={user.email}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end mt-6">
                    <button className="bg-indigo-600 text-white font-semibold px-6 py-3 rounded-xl shadow-md hover:bg-indigo-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}