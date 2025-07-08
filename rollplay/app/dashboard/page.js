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

  // Mock data - replace with actual API calls
  const mockCharacters = [
    { name: 'Kaelen', race: 'Sun Elf', class: 'Wizard', level: 8, lastPlayed: '2 days ago', campaign: 'The Dragon\'s Demise' },
    { name: 'Grom', race: 'Half-Orc', class: 'Barbarian', level: 7, lastPlayed: '5 days ago', campaign: 'Shadows over Silver-reach' },
    { name: 'Lyra', race: 'Halfling', class: 'Rogue', level: 7, lastPlayed: '1 week ago', campaign: 'The Dragon\'s Demise' },
    { name: 'Seraphina', race: 'Aasimar', class: 'Cleric', level: 8, lastPlayed: '3 days ago', campaign: 'Curse of the Crimson Throne' },
    { name: 'Borg', race: 'Dwarf', class: 'Fighter', level: 7, lastPlayed: '1 day ago', campaign: 'Shadows over Silver-reach' },
    { name: 'Elara', race: 'Human', class: 'Bard', level: 6, lastPlayed: '4 days ago', campaign: 'The Dragon\'s Demise' },
  ]

  const mockCampaigns = [
    { name: 'The Dragon\'s Demise', gm: 'DM Dave', status: 'Active' },
    { name: 'Shadows over Silver-reach', gm: 'GM Jane', status: 'Active' },
    { name: 'Curse of the Crimson Throne', gm: 'DM Dave', status: 'Inactive' },
  ]

  useEffect(() => {
    const checkAuthentication = async () => {
      try {
        // Validate authentication with backend (reads from httpOnly cookie)
        const response = await fetch('/auth/validate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include' // Include httpOnly cookies
        })

        if (response.ok) {
          const data = await response.json()
          if (data.valid && data.user) {
            setUser(data.user)
            return
          }
        }

        // Authentication failed, redirect to login
        router.push('/magic')
        
      } catch (error) {
        console.error('Auth check error:', error)
        router.push('/magic')
      }
    }

    checkAuthentication()
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
    return mockCharacters.map((char, index) => (
      <div key={index} className="bg-white p-4 rounded-lg shadow-md border border-gray-200 flex items-center justify-between hover:shadow-lg transition-all duration-300">
        <div className="flex items-center flex-grow">
          <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-xl font-bold mr-4 flex-shrink-0">
            {char.name[0].toUpperCase()}
          </div>
          <div className="flex-grow">
            <h3 className="text-lg font-bold text-slate-800">{char.name}</h3>
            <p className="text-slate-600 text-sm">{char.race} {char.class} - Level {char.level}</p>
            <p className="text-slate-500 text-xs mt-1">Campaign: {char.campaign}</p>
            <p className="text-slate-500 text-xs mt-1">Last Played: {char.lastPlayed}</p>
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
    return mockCampaigns.map((campaign, index) => {
      const statusColor = campaign.status === 'Active' ? 'text-green-600 bg-green-100' : 'text-slate-600 bg-slate-100'
      return (
        <div key={index} className="bg-white p-4 rounded-lg shadow-md border border-gray-200 flex items-center justify-between hover:shadow-lg transition-all duration-300">
          <div className="flex items-center flex-grow">
            <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-xl font-bold mr-4 flex-shrink-0">
              {campaign.name[0].toUpperCase()}
            </div>
            <div className="flex-grow">
              <h3 className="text-lg font-bold text-slate-800">{campaign.name}</h3>
              <p className="text-slate-600 text-sm">GM: {campaign.gm}</p>
              <p className="text-slate-500 text-xs mt-1">Status: <span className={`font-semibold ${statusColor}`}>{campaign.status}</span></p>
            </div>
          </div>
          <div className="flex-shrink-0">
            <button 
              onClick={() => router.push('/game')}
              className="w-full text-center bg-indigo-600 text-white font-semibold px-4 py-2 rounded-lg shadow-md hover:bg-indigo-700 transition-colors duration-200"
            >
              Enter Room
            </button>
          </div>
        </div>
      )
    })
  }

  if (!user) {
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
                <button className="bg-slate-300 text-slate-800 font-semibold px-5 py-3 rounded-xl shadow-md hover:bg-slate-400 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 flex items-center">
                  <span className="text-xl mr-2">➕</span> Create Campaign
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
                    {user.display_name ? user.display_name[0].toUpperCase() : user.email[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-3xl font-semibold text-slate-800">{user.display_name || user.email.split('@')[0]}</p>
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
                        defaultValue={user.display_name || user.email.split('@')[0]}
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