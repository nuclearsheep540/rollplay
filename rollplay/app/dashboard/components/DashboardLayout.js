/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faUsers,
  faMap,
  faDiceD20,
  faUserGroup,
  faUser,
  faRightFromBracket
} from '@fortawesome/free-solid-svg-icons'

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
      current.set('tab', 'campaigns')
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
    <div className="h-screen flex flex-col bg-slate-950 text-slate-200 overflow-hidden">
      {/* Top Navigation Bar - Fixed */}
      <header className="flex-shrink-0 bg-gray-900 border-b border-gray-800 p-4 flex justify-between items-center">
        <div className="text-2xl font-extrabold text-white flex items-center">
          <span>Tabletop Tavern</span>
        </div>
        <nav>
          <ul className="flex space-x-4 sm:space-x-6">
            <li>
              <button
                onClick={() => switchSection('profile')}
                className={`flex items-center px-3 py-2 rounded-lg transition-all duration-200 ${
                  activeSection === 'profile'
                    ? 'bg-purple-500/20 text-purple-400 font-semibold'
                    : 'text-slate-400 hover:bg-purple-500/10 hover:text-purple-300'
                }`}
              >
                <FontAwesomeIcon icon={faUser} className="text-base mr-2" />
                <span className="font-semibold hidden sm:inline">Profile</span>
              </button>
            </li>
            <li>
              <button
                onClick={onLogout}
                className="flex items-center px-3 py-2 rounded-lg transition-all duration-200 text-slate-400 hover:bg-red-500/10 hover:text-red-400"
              >
                <FontAwesomeIcon icon={faRightFromBracket} className="text-base mr-2" />
                <span className="font-semibold hidden sm:inline">Logout</span>
              </button>
            </li>
          </ul>
        </nav>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Navigation - Fixed */}
        <aside className="flex-shrink-0 w-64 bg-gray-900 border-r border-gray-800 p-4 flex flex-col justify-between overflow-y-auto">
          <div>
            <nav>
              <ul className="space-y-1">
                <li>
                  <button
                    onClick={() => switchSection('campaigns')}
                    className={`w-full flex items-center p-3 transition-all duration-200 ${
                      activeSection === 'campaigns'
                        ? 'border-l-[3px] border-purple-500 text-purple-400 font-semibold'
                        : 'border-l-[3px] border-transparent text-slate-400 hover:bg-purple-500/5 hover:text-slate-300'
                    }`}
                    title="Campaigns"
                  >
                    <FontAwesomeIcon icon={faMap} className="text-base mr-3 w-5" />
                    <span className="font-semibold">Campaigns</span>
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => switchSection('games')}
                    className={`w-full flex items-center p-3 transition-all duration-200 ${
                      activeSection === 'games'
                        ? 'border-l-[3px] border-purple-500 text-purple-400 font-semibold'
                        : 'border-l-[3px] border-transparent text-slate-400 hover:bg-purple-500/5 hover:text-slate-300'
                    }`}
                    title="Games"
                  >
                    <FontAwesomeIcon icon={faDiceD20} className="text-base mr-3 w-5" />
                    <span className="font-semibold">Games</span>
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => switchSection('characters')}
                    className={`w-full flex items-center p-3 transition-all duration-200 ${
                      activeSection === 'characters'
                        ? 'border-l-[3px] border-purple-500 text-purple-400 font-semibold'
                        : 'border-l-[3px] border-transparent text-slate-400 hover:bg-purple-500/5 hover:text-slate-300'
                    }`}
                    title="Characters"
                  >
                    <FontAwesomeIcon icon={faUsers} className="text-base mr-3 w-5" />
                    <span className="font-semibold">Characters</span>
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => switchSection('friends')}
                    className={`w-full flex items-center p-3 transition-all duration-200 ${
                      activeSection === 'friends'
                        ? 'border-l-[3px] border-purple-500 text-purple-400 font-semibold'
                        : 'border-l-[3px] border-transparent text-slate-400 hover:bg-purple-500/5 hover:text-slate-300'
                    }`}
                    title="Friends"
                  >
                    <FontAwesomeIcon icon={faUserGroup} className="text-base mr-3 w-5" />
                    <span className="font-semibold">Friends</span>
                  </button>
                </li>
              </ul>
            </nav>
          </div>
        </aside>

        {/* Main Content Area - Scrollable */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-8 md:p-10 pb-64">
          {children}
        </main>
      </div>
    </div>
  )
}