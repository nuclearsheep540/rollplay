/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect } from 'react'
import { THEME } from '@/app/styles/colorTheme'
import { Button } from './shared/Button'

export default function CampaignInviteModal({ campaign, onClose, onInviteSuccess }) {
  const [friendUuid, setFriendUuid] = useState('')
  const [friends, setFriends] = useState([])
  const [lookupUser, setLookupUser] = useState(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState(null)
  const [inviting, setInviting] = useState(false)
  const [canceling, setCanceling] = useState(null) // Track which invite is being canceled
  const [error, setError] = useState(null)
  const [loadingFriends, setLoadingFriends] = useState(true)
  const [pendingInvites, setPendingInvites] = useState([])
  const [loadingPendingInvites, setLoadingPendingInvites] = useState(true)

  // Validate UUID format
  const isValidUUID = (uuid) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    return uuidRegex.test(uuid)
  }

  // Check if identifier is an account tag format (e.g., "claude#2345")
  const isAccountTag = (identifier) => {
    return /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,29}#\d{4}$/.test(identifier)
  }

  // Validate identifier format: UUID or account tag
  const isValidIdentifier = (identifier) => {
    return isValidUUID(identifier) || isAccountTag(identifier)
  }

  // Fetch friends list and pending invites on mount
  useEffect(() => {
    fetchFriends()
    fetchPendingInvites()
  }, [])

  // Refetch pending invites when campaign.invited_player_ids changes
  useEffect(() => {
    fetchPendingInvites()
  }, [campaign.invited_player_ids])

  const fetchFriends = async () => {
    try {
      setLoadingFriends(true)
      const response = await fetch('/api/friendships/', {
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

  const fetchPendingInvites = async () => {
    // Fetch user details for each pending invite
    if (!campaign.invited_player_ids || campaign.invited_player_ids.length === 0) {
      setPendingInvites([])
      setLoadingPendingInvites(false)
      return
    }

    try {
      setLoadingPendingInvites(true)
      const inviteDetails = await Promise.all(
        campaign.invited_player_ids.map(async (userId) => {
          try {
            const response = await fetch(`/api/users/${userId}`, {
              credentials: 'include'
            })
            if (response.ok) {
              const userData = await response.json()
              return {
                id: userId,
                display_name: userData.display_name,
                screen_name: userData.screen_name,
                account_tag: userData.account_tag
              }
            }
          } catch (err) {
            console.error(`Error fetching user ${userId}:`, err)
          }
          // Return basic info if lookup fails
          return { id: userId, display_name: 'Unknown User', screen_name: null, account_tag: null }
        })
      )
      setPendingInvites(inviteDetails)
    } catch (err) {
      console.error('Error fetching pending invites:', err)
    } finally {
      setLoadingPendingInvites(false)
    }
  }

  const cancelInvite = async (playerId) => {
    try {
      setCanceling(playerId)
      setError(null)

      const response = await fetch(`/api/campaigns/${campaign.id}/invites/${playerId}`, {
        method: 'DELETE',
        credentials: 'include'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to cancel invite')
      }

      // Get updated campaign data
      const updatedCampaign = await response.json()

      if (onInviteSuccess) {
        // Pass updated campaign data to parent
        await onInviteSuccess(updatedCampaign)
      }
    } catch (err) {
      console.error('Error canceling invite:', err)
      setError(err.message)
    } finally {
      setCanceling(null)
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

      // Get updated campaign data
      const updatedCampaign = await response.json()

      setFriendUuid('')
      setLookupUser(null)

      if (onInviteSuccess) {
        // Pass updated campaign data to parent - parent will update campaign prop
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
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{backgroundColor: THEME.overlayDark}}
      onClick={onClose}
    >
      <div
        className="rounded-sm shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border"
        style={{backgroundColor: THEME.bgSecondary, borderColor: THEME.borderDefault}}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b" style={{borderBottomColor: THEME.borderSubtle}}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold font-[family-name:var(--font-metamorphous)]" style={{color: THEME.textOnDark}}>Invite Players to Campaign</h2>
              <p className="text-sm mt-1" style={{color: THEME.textSecondary}}>{campaign.title}</p>
              <p className="text-xs mt-1" style={{color: THEME.textSecondary}}>
                Current players: {campaign.player_ids?.length || 0} | Pending invites: {campaign.invited_player_ids?.length || 0}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-2xl font-bold hover:opacity-80 transition-opacity"
              style={{color: THEME.textSecondary}}
            >
              ×
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Error Message */}
          {error && (
            <div className="border px-4 py-3 rounded-sm" style={{backgroundColor: '#7f1d1d', borderColor: '#dc2626', color: THEME.textAccent}}>
              {error}
            </div>
          )}

          {/* Invite by Account Tag Form */}
          <div>
            <h3 className="text-lg font-semibold mb-3" style={{color: THEME.textOnDark}}>Invite by Account Tag</h3>
            <form onSubmit={handleInviteByUuid} className="space-y-3">
              <div>
                <input
                  type="text"
                  value={friendUuid}
                  onChange={(e) => setFriendUuid(e.target.value)}
                  placeholder="Enter username including account tag (e.g., steve#2345)"
                  className="w-full px-4 py-2 border rounded-sm focus:ring-2 focus:outline-none"
                  style={{
                    backgroundColor: THEME.bgPrimary,
                    borderColor: THEME.borderDefault,
                    color: THEME.textPrimary
                  }}
                />
                {lookupLoading && (
                  <p className="text-sm mt-2" style={{color: THEME.textSecondary}}>Looking up user...</p>
                )}
                {lookupError && (
                  <p className="text-sm mt-2" style={{color: '#dc2626'}}>{ lookupError}</p>
                )}
                {lookupUser && (
                  <div className="mt-2 p-3 border rounded-sm" style={{backgroundColor: '#166534', borderColor: '#16a34a'}}>
                    <p className="text-sm" style={{color: THEME.textAccent}}>
                      Found: <span className="font-semibold">{lookupUser.display_name}</span>
                    </p>
                    {getUserStatusMessage(lookupUser.id) && (
                      <p className="text-sm mt-1" style={{color: '#fbbf24'}}>
                        ⚠️ {getUserStatusMessage(lookupUser.id)}
                      </p>
                    )}
                  </div>
                )}
              </div>
              <Button
                type="submit"
                variant="primary"
                disabled={!lookupUser || inviting || !canInviteUser(lookupUser?.id)}
                className="w-full"
              >
                {inviting ? 'Inviting Player...' : 'Invite Player to Campaign'}
              </Button>
            </form>
          </div>

          {/* Friends List */}
          <div>
            <h3 className="text-lg font-semibold mb-3" style={{color: THEME.textOnDark}}>Or invite from friends</h3>
            {loadingFriends ? (
              <p className="text-sm" style={{color: THEME.textSecondary}}>Loading friends...</p>
            ) : friends.length === 0 ? (
              <p className="text-sm" style={{color: THEME.textSecondary}}>No friends available to invite</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {friends.map((friend) => (
                  <div
                    key={friend.id}
                    className="flex items-center justify-between p-3 rounded-sm border transition-colors"
                    style={{backgroundColor: THEME.bgPanel, borderColor: THEME.borderSubtle}}
                  >
                    <span className="font-medium" style={{color: THEME.textOnDark}}>{friend.friend_screen_name}</span>
                    {getUserStatusMessage(friend.friend_id) ? (
                      <span className="text-sm" style={{color: '#fbbf24'}}>{getUserStatusMessage(friend.friend_id)}</span>
                    ) : (
                      <Button
                        variant="primary"
                        size="xs"
                        onClick={() => handleInviteFriend(friend.friend_id)}
                        disabled={inviting}
                      >
                        {inviting ? 'Inviting...' : 'Invite Player'}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending Invites Section */}
          {pendingInvites.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3" style={{color: THEME.textOnDark}}>Pending Invites</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {loadingPendingInvites ? (
                  <p className="text-sm" style={{color: THEME.textSecondary}}>Loading pending invites...</p>
                ) : (
                  pendingInvites.map((invite) => (
                    <div
                      key={invite.id}
                      className="flex items-center justify-between p-3 rounded-sm border transition-colors"
                      style={{backgroundColor: THEME.bgPanel, borderColor: THEME.borderSubtle}}
                    >
                      <div>
                        <span className="font-medium" style={{color: THEME.textOnDark}}>
                          {invite.screen_name || invite.display_name}
                        </span>
                        {invite.account_tag && (
                          <span className="text-sm ml-2" style={{color: THEME.textSecondary}}>
                            #{invite.account_tag}
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => cancelInvite(invite.id)}
                        disabled={canceling === invite.id}
                        style={{color: '#dc2626'}}
                      >
                        {canceling === invite.id ? 'Canceling...' : 'Cancel'}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t" style={{backgroundColor: THEME.bgSecondary, borderTopColor: THEME.borderSubtle}}>
          <Button
            variant="ghost"
            onClick={onClose}
            className="w-full"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
