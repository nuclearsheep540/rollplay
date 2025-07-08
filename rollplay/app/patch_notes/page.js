/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function PatchNotesIndex() {
  const router = useRouter()
  const [versions, setVersions] = useState([])

  useEffect(() => {
    // Get available versions from the patch_notes directory
    const getVersions = async () => {
      try {
        const response = await fetch('/api/patch-notes-versions')
        if (response.ok) {
          const data = await response.json()
          setVersions(data.versions)
        }
      } catch (error) {
        console.error('Error fetching versions:', error)
        // Fallback to hardcoded versions if API fails
        setVersions([])
      }
    }
    getVersions()
  }, [])


  return (
    <div className="bg-slate-800 min-h-screen">
      <div className="relative bg-cover bg-center bg-no-repeat opacity-90 min-h-screen" 
           style={{backgroundImage: 'url(/bg.jpeg)'}}>
        <div className="absolute inset-0 backdrop-blur-lg z-[1]"></div>
        
        <nav className="nav-bar relative z-[2]">
          <div className="logo text-4xl">TABLETOP<span>TAVERN</span></div>
          <div className="flex space-x-4">
            <button 
              onClick={() => router.push('/')}
              className="text-white hover:text-amber-300 transition-colors duration-200 text-base bg-none border-none cursor-pointer"
            >
              Back to Home
            </button>
            <button 
              onClick={() => router.push('/game')}
              className="text-white hover:text-amber-300 transition-colors duration-200 text-base bg-none border-none cursor-pointer"
            >
              Game
            </button>
          </div>
        </nav>
        
        <div className="relative z-[2] flex items-center justify-center p-8" 
             style={{minHeight: 'calc(100vh - 80px)'}}>
          <div className="bg-black/80 backdrop-blur-xl rounded-2xl border border-white/10 p-12 w-full max-w-4xl shadow-2xl"
               style={{boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)'}}>
            
            <div className="text-center mb-8">
              <h1 className="text-white text-4xl font-bold mb-4 text-shadow-lg">
                📋 Patch Notes
              </h1>
              <p className="text-white/70 text-lg leading-relaxed">
                Stay up to date with the latest features, improvements, and fixes in Tabletop Tavern
              </p>
            </div>

            <div className="grid gap-4">
              {versions.map((versionData, index) => (
                <div 
                  key={versionData.version}
                  onClick={() => router.push(`/patch_notes/${versionData.version}`)}
                  className="group bg-white/5 hover:bg-white/10 border border-white/10 hover:border-amber-500/50 rounded-xl p-6 cursor-pointer transition-all duration-200 hover:shadow-lg hover:shadow-amber-500/10"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl">🚀</span>
                        <h3 className="text-white text-xl font-bold group-hover:text-amber-300 transition-colors">
                          Version {versionData.version}
                        </h3>
                        {index === 0 && (
                          <span className="bg-amber-500/20 text-amber-300 text-xs px-2 py-1 rounded-full font-medium">
                            LATEST
                          </span>
                        )}
                      </div>
                      <p className="text-white/60 text-sm leading-relaxed">
                        {versionData.description}
                      </p>
                    </div>
                    <div className="text-white/40 group-hover:text-amber-300 transition-colors text-xl">
                      →
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {versions.length === 0 && (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">📭</div>
                <h3 className="text-white text-xl font-bold mb-2">Loading ...</h3>
                <p className="text-white/60">Check back later for updates!</p>
              </div>
            )}

            <div className="mt-8 pt-6 border-t border-white/10 text-center">
              <p className="text-white/60 text-sm">
                Questions or feedback? Join our community or report issues on GitHub.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}