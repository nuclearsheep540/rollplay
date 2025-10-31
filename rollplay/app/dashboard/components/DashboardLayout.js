/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'

export default function DashboardLayout({ 
  children, 
  activeSection, 
  setActiveSection, 
  onLogout 
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Initialize activeSection from URL parameter - run only once on mount
  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam && ['characters', 'campaigns', 'games', 'friends', 'profile'].includes(tabParam)) {
      setActiveSection(tabParam)
    } else if (!tabParam) {
      // If no tab parameter, set default and update URL
      const current = new URLSearchParams(Array.from(searchParams.entries()))
      current.set('tab', 'characters')
      const search = current.toString()
      router.replace(`/dashboard?${search}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Intentionally empty - only run on mount

  const switchSection = (targetId) => {
    setActiveSection(targetId)
    
    // Update URL with tab parameter
    const current = new URLSearchParams(Array.from(searchParams.entries()))
    current.set('tab', targetId)
    const search = current.toString()
    const query = search ? `?${search}` : ''
    
    router.push(`/dashboard${query}`)
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
                onClick={onLogout}
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
                <li className="mb-4">
                  <button
                    onClick={() => switchSection('games')}
                    className={`w-full flex items-center p-3 transition-colors duration-200 text-slate-700 hover:bg-slate-300 ${
                      activeSection === 'games' ? 'border-l-4 border-indigo-600 text-indigo-600 font-semibold bg-indigo-100' : ''
                    }`}
                    title="Games"
                  >
                    <span className="text-xl mr-3">🎲</span>
                    <span className="font-semibold">Games</span>
                  </button>
                </li>
                <li className="mb-4">
                  <button
                    onClick={() => switchSection('friends')}
                    className={`w-full flex items-center p-3 transition-colors duration-200 text-slate-700 hover:bg-slate-300 ${
                      activeSection === 'friends' ? 'border-l-4 border-indigo-600 text-indigo-600 font-semibold bg-indigo-100' : ''
                    }`}
                    title="Friends"
                  >
                    <span className="text-xl mr-3">👫</span>
                    <span className="font-semibold">Friends</span>
                  </button>
                </li>
              </ul>
            </nav>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-4 sm:p-8 md:p-10">
          {children}
        </main>
      </div>
    </div>
  )
}