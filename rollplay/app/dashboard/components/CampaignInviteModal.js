/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect } from 'react'

export default function CampaignInviteModal({ campaign, onClose, onInviteSuccess }) {
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

  // Check if identifier is an account tag format (e.g., "claude#2345")
  const isAccountTag = (identifier) => {
    return /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,19}#\d{4}$/.test(identifier)
  }

  // Validate identifier format: UUID or account tag
  const isValidIdentifier = (identifier) => {
    return isValidUUID(identifier) || isAccountTag(identifier)
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
      console.log('📋 Campaign Invite Modal - Friends API response:', data)
      console.log('📋 Campaign Invite Modal - Accepted friends:', data.accepted)
      setFriends(data.accepted || [])
    } catch (err) {
      console.error('Error fetching friends:', err)
      setError('Failed to load friends list')
    } finally {
      setLoadingFriends(false)
    }
  }

  // Lookup user by UUID or account tag when valid identifier is entered
  useEffect(() => {
    const lookupUserByIdentifier = async () => {
      if (!friendUuid.trim()) {
        setLookupUser(null)
        setLookupError(null)
        return
      }

      if (!isValidIdentifier(friendUuid.trim())) {
        setLookupUser(null)
        setLookupError(null)
        return
      }

      try {
        setLookupLoading(true)
        setLookupError(null)

        // Use appropriate endpoint based on identifier type
        const identifier = friendUuid.trim()
        let endpoint
        if (isAccountTag(identifier)) {
          endpoint = `/api/users/by-account-tag/${encodeURIComponent(identifier)}`
        } else {
          endpoint = `/api/users/${identifier}`
        }

        const response = await fetch(endpoint, {
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
    const timeoutId = setTimeout(lookupUserByIdentifier, 500)
    return () => clearTimeout(timeoutId)
  }, [friendUuid])

  const inviteUser = async (userId) => {
    try {
      setInviting(true)
      setError(null)

      const response = await fetch(`/api/campaigns/${campaign.id}/players/${userId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to invite player to campaign')
      }

      // Get updated campaign data with new invited_player_ids list
      const updatedCampaign = await response.json()

      setFriendUuid('')
      setLookupUser(null)

      if (onInviteSuccess) {
        // Pass updated campaign data to parent
        await onInviteSuccess(updatedCampaign)
      }
    } catch (err) {
      console.error('Error adding player:', err)
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

  // Helper functions to distinguish between different user states
  const isUserHost = (userId) => {
    return campaign.host_id === userId
  }

  const hasUserAccepted = (userId) => {
    return campaign.player_ids?.includes(userId)
  }

  const hasUserPendingInvite = (userId) => {
    return campaign.invited_player_ids?.includes(userId)
  }

  const canInviteUser = (userId) => {
    // Can invite if: not host, not already accepted, and no pending invite
    return !isUserHost(userId) && !hasUserAccepted(userId) && !hasUserPendingInvite(userId)
  }

  // Get appropriate message for user status
  const getUserStatusMessage = (userId) => {
    if (isUserHost(userId)) {
      return "This is the campaign host"
    }
    if (hasUserAccepted(userId)) {
      return "Already in campaign"
    }
    if (hasUserPendingInvite(userId)) {
      return "Invite pending"
    }
    return null
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Invite Players to Campaign</h2>
              <p className="text-sm text-slate-600 mt-1">{campaign.title}</p>
              <p className="text-xs text-slate-500 mt-1">
                Current players: {campaign.player_ids?.length || 0}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-2xl font-bold"
            >
              ×
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {/* Invite by Account Tag Form */}
          <div>
            <h3 className="text-lg font-semibold text-slate-800 mb-3">Invite by Account Tag</h3>
            <form onSubmit={handleInviteByUuid} className="space-y-3">
              <div>
                <input
                  type="text"
                  value={friendUuid}
                  onChange={(e) => setFriendUuid(e.target.value)}
                  placeholder="Enter account tag (e.g., claude#2345)"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                {lookupLoading && (
                  <p className="text-sm text-slate-500 mt-2">Looking up user...</p>
                )}
                {lookupError && (
                  <p className="text-sm text-red-500 mt-2">{lookupError}</p>
                )}
                {lookupUser && (
                  <div className="mt-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                    <p className="text-sm text-slate-700">
                      Found: <span className="font-semibold">{lookupUser.display_name}</span>
                    </p>
                    {getUserStatusMessage(lookupUser.id) && (
                      <p className="text-sm text-orange-600 mt-1">
                        ⚠️ {getUserStatusMessage(lookupUser.id)}
                      </p>
                    )}
                  </div>
                )}
              </div>
              <button
                type="submit"
                disabled={!lookupUser || inviting || !canInviteUser(lookupUser?.id)}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {inviting ? 'Inviting Player...' : 'Invite Player to Campaign'}
              </button>
            </form>
          </div>

          {/* Friends List */}
          <div>
            <h3 className="text-lg font-semibold text-slate-800 mb-3">Or invite from friends</h3>
            {loadingFriends ? (
              <p className="text-sm text-slate-500">Loading friends...</p>
            ) : friends.length === 0 ? (
              <p className="text-sm text-slate-500">No friends available to invite</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {friends.map((friend) => (
                  <div
                    key={friend.id}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <span className="text-slate-700 font-medium">{friend.friend_screen_name}</span>
                    {getUserStatusMessage(friend.friend_id) ? (
                      <span className="text-sm text-orange-600">{getUserStatusMessage(friend.friend_id)}</span>
                    ) : (
                      <button
                        onClick={() => handleInviteFriend(friend.friend_id)}
                        disabled={inviting}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {inviting ? 'Inviting...' : 'Invite Player'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-200 bg-slate-50">
          <button
            onClick={onClose}
            className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-lg font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
