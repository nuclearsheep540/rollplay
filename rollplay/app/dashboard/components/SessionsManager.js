/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faGamepad,
  faHourglass,
  faRightToBracket
} from '@fortawesome/free-solid-svg-icons'

export default function SessionsManager({ user, refreshTrigger }) {
  const router = useRouter()
  const [sessions, setSessions] = useState([])
  const [characters, setCharacters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Only show loading on initial fetch (refreshTrigger = 0)
    fetchSessionsAndCharacters(refreshTrigger === 0)
  }, [refreshTrigger])

  const fetchSessionsAndCharacters = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true)

      // Fetch sessions and characters in parallel
      const [sessionsResponse, charactersResponse] = await Promise.all([
        fetch('/api/sessions/my-sessions', { credentials: 'include' }),
        fetch('/api/characters/', { credentials: 'include' })
      ])

      if (!sessionsResponse.ok || !charactersResponse.ok) {
        throw new Error('Failed to fetch data')
      }

      const sessionsData = await sessionsResponse.json()
      const charactersData = await charactersResponse.json()

      setSessions(sessionsData.sessions || [])
      setCharacters(charactersData || [])
      setError(null)
    } catch (err) {
      console.error('Error fetching sessions:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Helper functions
  const isUserHost = (session) => session.host_id === user.id
  const isUserJoined = (session) => session.joined_users && session.joined_users.includes(user.id)

  const getUserRole = (session) => {
    if (isUserHost(session)) return 'DM'
    if (isUserJoined(session)) return 'Player'
    return 'Unknown'
  }

  // Enter game - allow entry regardless of character selection (spectator mode supported)
  const enterGame = (session) => {
    // DM or any player can enter - spectator handling happens in game page
    router.push(`/game?room_id=${session.active_game_id || session.id}`)
  }

  // Filter to show only active sessions
  const mySessions = sessions.filter(session =>
    (isUserHost(session) || isUserJoined(session)) && session.status === 'active'
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mr-3"></div>
        <div className="text-slate-400">Loading sessions...</div>
      </div>
    )
  }

  // Render session card component
  const renderSessionCard = (session, role) => {
    const isOwner = isUserHost(session)

    return (
      <div
        key={session.id}
        className="bg-slate-800 p-6 rounded-lg border border-purple-500/30 transition-all"
      >
        <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
          {/* Left side: Title and badges */}
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-semibold text-slate-200">
              {session.name}
            </h2>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold border flex items-center gap-1.5 ${
              role === 'DM'
                ? 'bg-purple-500/20 text-purple-400 border-purple-500/30'
                : role === 'Player'
                ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
            }`}>
              <FontAwesomeIcon icon={faGamepad} className="text-xs" />
              {role}
            </span>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold border ${
              session.status === 'active'
                ? 'bg-green-500/20 text-green-400 border-green-500/30'
                : session.status === 'starting'
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                : 'bg-slate-700 text-slate-400 border-slate-600'
            }`}>
              {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
            </span>
          </div>

          {/* Right side: Enter button (read-only view) */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => enterGame(session)}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg border border-blue-500 hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-500/30 transition-all font-semibold text-base flex items-center gap-2"
            >
              <FontAwesomeIcon icon={faRightToBracket} />
              Enter Game
            </button>
          </div>
        </div>

        {/* Session Meta Info */}
        <div className="text-sm text-slate-400 space-y-1 mb-4">
          <p>
            <span className="font-semibold text-slate-300">Dungeon Master:</span>{' '}
            {session.host_name}
          </p>
          <p>
            <span className="font-semibold text-slate-300">Players:</span>{' '}
            {session.player_count} / {session.max_players}
          </p>
          <p>
            <span className="font-semibold text-slate-300">Created:</span>{' '}
            {new Date(session.created_at).toLocaleDateString()}
          </p>
          <p>
            <span className="font-semibold text-slate-300">Last played:</span>{' '}
            {session.started_at ? new Date(session.started_at).toLocaleDateString() : 'Never played'}
          </p>
        </div>


        {/* Roster Display - Show players who have joined */}
        {session.roster && session.roster.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-700">
            <h4 className="text-sm font-semibold text-slate-300 mb-3">
              Session Roster ({session.roster.length}/{session.max_players})
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {session.roster.map((player) => {
                const isCurrentUser = player.user_id === user.id
                return (
                  <div
                    key={player.user_id}
                    className={`p-3 rounded border max-w-xs ${
                      isCurrentUser
                        ? 'bg-purple-500/20 border-purple-500/50'
                        : 'bg-slate-900 border-slate-700'
                    }`}
                  >
                    {player.character_name ? (
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          {isCurrentUser && (
                            <span className="text-xs px-1.5 py-0.5 bg-purple-500/30 text-purple-300 rounded border border-purple-500/50 font-semibold flex-shrink-0">
                              You
                            </span>
                          )}
                          <div className="flex items-baseline gap-1.5 min-w-0">
                            <p className="text-sm font-semibold text-slate-200 truncate">
                              {player.character_name}
                            </p>
                            <p className="text-xs text-slate-400 whitespace-nowrap">
                              Lvl {player.character_level} {player.character_race} {player.character_class}
                            </p>
                          </div>
                        </div>
                        <p className="text-xs text-slate-500 truncate">
                          Player: {player.username}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          {isCurrentUser && (
                            <span className="text-xs px-1.5 py-0.5 bg-purple-500/30 text-purple-300 rounded border border-purple-500/50 font-semibold flex-shrink-0">
                              You
                            </span>
                          )}
                          <p className="text-sm font-semibold text-slate-200 truncate">
                            {player.username}
                          </p>
                        </div>
                        <p className="text-xs text-amber-400">
                          {isCurrentUser ? 'Spectator (select character in Campaigns)' : 'Spectator'}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white uppercase">Sessions</h1>
        <p className="mt-2 text-slate-400">View and enter your active game sessions</p>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Active Sessions Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold text-purple-400 uppercase">Active Sessions</h2>
          <span className="px-3 py-1 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-full text-sm font-semibold">
            {mySessions.length}
          </span>
        </div>

        {mySessions.length === 0 ? (
          <div className="bg-slate-800 p-8 rounded-lg text-center border-2 border-dashed border-purple-500/30">
            <p className="text-slate-300 mb-2">No active sessions.</p>
            <p className="text-sm text-slate-500">
              When a game master starts a session, it will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {mySessions.map((session) => {
              // Determine role: DM if host, Player if joined
              const role = isUserHost(session) ? 'DM' : 'Player'
              return renderSessionCard(session, role)
            })}
          </div>
        )}
      </div>

    </div>
  )
}
