/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect } from 'react'

export default function GameInviteModal({ game, onClose, onInviteSuccess }) {
  const [friendUuid, setFriendUuid] = useState('')
  const [friends, setFriends] = useState([])
  const [lookupUser, setLookupUser] = useState(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState(null)
  const [inviting, setInviting] = useState(false)
  const [error, setError] = useState(null)
  const [loadingFriends, setLoadingFriends] = useState(true)

  // Validate UUID format
  const isValidUUID = (uuid) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    return uuidRegex.test(uuid)
  }

  // Fetch friends list on mount
  useEffect(() => {
    fetchFriends()
  }, [])

  const fetchFriends = async () => {
    try {
      setLoadingFriends(true)
      const response = await fetch('/api/friends/', {
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error('Failed to fetch friends')
      }

      const data = await response.json()
      setFriends(data.accepted || [])
    } catch (err) {
      console.error('Error fetching friends:', err)
      setError('Failed to load friends list')
    } finally {
      setLoadingFriends(false)
    }
  }

  // Lookup user by UUID when valid UUID is entered
  useEffect(() => {
    const lookupUserByUuid = async () => {
      if (!friendUuid.trim()) {
        setLookupUser(null)
        setLookupError(null)
        return
      }

      if (!isValidUUID(friendUuid.trim())) {
        setLookupUser(null)
        setLookupError(null)
        return
      }

      try {
        setLookupLoading(true)
        setLookupError(null)

        const response = await fetch(`/api/users/${friendUuid.trim()}`, {
          credentials: 'include'
        })

        if (response.ok) {
          const userData = await response.json()
          setLookupUser(userData)
        } else if (response.status === 404) {
          setLookupError('User not found')
          setLookupUser(null)
        } else {
          setLookupError('Failed to lookup user')
          setLookupUser(null)
        }
      } catch (err) {
        console.error('Error looking up user:', err)
        setLookupError('Failed to lookup user')
        setLookupUser(null)
      } finally {
        setLookupLoading(false)
      }
    }

    // Debounce the lookup
    const timeoutId = setTimeout(lookupUserByUuid, 500)
    return () => clearTimeout(timeoutId)
  }, [friendUuid])

  const inviteUser = async (userId) => {
    try {
      setInviting(true)
      setError(null)

      const response = await fetch(`/api/games/${game.id}/invites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ user_id: userId })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to send invite')
      }

      // Get updated game data with new invited_users list
      const updatedGame = await response.json()

      setFriendUuid('')
      setLookupUser(null)

      if (onInviteSuccess) {
        // Pass updated game data to parent
        await onInviteSuccess(updatedGame)
      }
    } catch (err) {
      console.error('Error sending invite:', err)
      setError(err.message)
    } finally {
      setInviting(false)
    }
  }

  const handleInviteByUuid = async (e) => {
    e.preventDefault()

    if (!lookupUser) {
      setError('Please enter a valid user UUID')
      return
    }

    await inviteUser(lookupUser.id)
  }

  const handleInviteFriend = async (friendId) => {
    await inviteUser(friendId)
  }

  // Check if user is already invited or joined
  const isUserInvited = (userId) => {
    return game.invited_users?.includes(userId) || game.joined_users?.includes(userId)
  }

  // Calculate available seats and pending count
  const invitedCount = game.pending_invites_count || 0
  const pendingCount = game.pending_invites_count || 0
  const availableSeats = game.max_players - invitedCount

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Invite Friends to Game</h2>
              <p className="text-sm text-slate-600 mt-1">{game.name}</p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-2xl font-bold"
            >
              ×
            </button>
          </div>

          {/* Capacity Info */}
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
            <p className="text-sm text-blue-800">
              <span className="font-semibold">{availableSeats} seat{availableSeats !== 1 ? 's' : ''} available</span>
              {' '}({invitedCount}/{game.max_players} invited)
            </p>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Invite by UUID Section */}
        <div className="p-6 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Invite by UUID</h3>
          <form onSubmit={handleInviteByUuid} className="space-y-3">
            <div>
              <input
                type="text"
                value={friendUuid}
                onChange={(e) => setFriendUuid(e.target.value)}
                placeholder="Enter player's UUID"
                className="w-full px-4 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                disabled={inviting || availableSeats === 0}
              />

              {/* Real-time lookup feedback */}
              {friendUuid && isValidUUID(friendUuid) && (
                <div className="mt-2">
                  {lookupLoading && (
                    <p className="text-sm text-slate-500 flex items-center gap-2">
                      <span className="animate-spin">⏳</span> Looking up user...
                    </p>
                  )}
                  {!lookupLoading && lookupUser && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded">
                      <p className="text-sm text-green-800 font-semibold">
                        ✓ User found: {lookupUser.screen_name || 'User #' + lookupUser.id.substring(0, 8)}
                      </p>
                      {isUserInvited(lookupUser.id) && (
                        <p className="text-xs text-orange-600 mt-1">⚠️ Already invited to this game</p>
                      )}
                    </div>
                  )}
                  {!lookupLoading && lookupError && (
                    <p className="text-sm text-red-600">✗ {lookupError}</p>
                  )}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={inviting || !lookupUser || isUserInvited(lookupUser?.id) || availableSeats === 0}
              className="w-full px-6 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors font-semibold"
            >
              {inviting ? 'Sending Invite...' :
               availableSeats === 0 ? 'Game Full' :
               isUserInvited(lookupUser?.id) ? 'Already Invited' :
               lookupUser ? `Send Invite to ${lookupUser.screen_name || 'User'}` :
               'Send Invite'}
            </button>
          </form>
        </div>

        {/* Friends List Section */}
        <div className="p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Invite from Friends List</h3>

          {loadingFriends ? (
            <p className="text-slate-500 text-center py-4">Loading friends...</p>
          ) : friends.length === 0 ? (
            <p className="text-slate-500 text-center py-4">
              No friends yet. Add friends from the Friends tab to invite them to games.
            </p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {friends.map((friendship) => {
                const friendId = friendship.friend_id  // Backend now computes the "other user" correctly!
                const friendName = friendship.friend_screen_name || 'User'
                const alreadyInvited = isUserInvited(friendId)

                return (
                  <div
                    key={friendId}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded border border-slate-200"
                  >
                    <div>
                      <p className="font-semibold text-slate-800">{friendName}</p>
                      <p className="text-xs text-slate-500">ID: {friendId}</p>
                    </div>

                    {alreadyInvited ? (
                      <span className="px-4 py-2 bg-slate-200 text-slate-600 rounded text-sm font-semibold">
                        Already Invited
                      </span>
                    ) : (
                      <button
                        onClick={() => handleInviteFriend(friendId)}
                        disabled={inviting || availableSeats === 0}
                        className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors text-sm font-semibold"
                      >
                        {inviting ? 'Sending...' : availableSeats === 0 ? 'Full' : 'Invite'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Pending Invites Info */}
        {pendingCount > 0 && (
          <div className="p-6 border-t border-slate-200 bg-amber-50">
            <p className="text-sm text-amber-800">
              <span className="font-semibold">{pendingCount}</span> pending invite{pendingCount !== 1 ? 's' : ''} waiting for response
            </p>
          </div>
        )}

        {/* Close Button */}
        <div className="p-6 border-t border-slate-200">
          <button
            onClick={onClose}
            className="w-full px-6 py-2 bg-slate-600 text-white rounded hover:bg-slate-700 transition-colors font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
