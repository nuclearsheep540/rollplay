/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faUserPlus, faUserXmark } from '@fortawesome/free-solid-svg-icons'
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

  // Sync pending invites when campaign.invited_player_ids changes externally (e.g., player declines)
  // This removes invites from local state that are no longer in the campaign prop
  // without triggering a full refetch (preserves smooth UX for host actions)
  useEffect(() => {
    const campaignInviteIds = campaign.invited_player_ids || []
    setPendingInvites(prev => {
      // Keep only invites that still exist in campaign.invited_player_ids
      const filtered = prev.filter(invite => campaignInviteIds.includes(invite.id))
      // Only update if something was actually removed
      if (filtered.length !== prev.length) {
        return filtered
      }
      return prev
    })
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

      // Remove from local pending invites list (smooth update without refetch)
      setPendingInvites(prev => prev.filter(invite => invite.id !== playerId))

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

      // Lookup user details before invite (for optimistic UI update)
      let invitedUserDetails = null
      try {
        const userResponse = await fetch(`/api/users/${userId}`, { credentials: 'include' })
        if (userResponse.ok) {
          const userData = await userResponse.json()
          invitedUserDetails = {
            id: userId,
            display_name: userData.display_name,
            screen_name: userData.screen_name,
            account_tag: userData.account_tag
          }
        }
      } catch (err) {
        // If lookup fails, we'll still proceed with invite
        console.warn('Could not fetch user details for optimistic update:', err)
      }

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

      // Optimistically add to pending invites list (smooth update without refetch)
      if (invitedUserDetails) {
        setPendingInvites(prev => [...prev, invitedUserDetails])
      }

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
    // Use local pendingInvites state for immediate UI updates
    return pendingInvites.some(invite => invite.id === userId)
  }

  // Get appropriate message for user status (returns null if user can be invited)
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

  // Render modal to document.body via portal to ensure backdrop fills full viewport
  return createPortal(
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
            <div className="space-y-3">
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
                <p className="text-sm" style={{color: THEME.textSecondary}}>Looking up user...</p>
              )}
              {lookupError && (
                <p className="text-sm" style={{color: '#dc2626'}}>{lookupError}</p>
              )}
              {/* Found user row - integrated invite button */}
              {lookupUser && (
                <div
                  className="flex items-stretch rounded-sm border overflow-hidden"
                  style={{backgroundColor: THEME.bgPanel, borderColor: THEME.borderSubtle}}
                >
                  <span className="flex-1 flex items-center font-medium py-3 pl-4" style={{color: THEME.textOnDark}}>{lookupUser.display_name}</span>
                  {getUserStatusMessage(lookupUser.id) ? (
                    <span className="flex items-center text-sm px-4" style={{color: '#fbbf24'}}>{getUserStatusMessage(lookupUser.id)}</span>
                  ) : (
                    <button
                      onClick={handleInviteByUuid}
                      disabled={inviting}
                      className="px-8 flex items-center hover:bg-green-900/50 transition-colors disabled:opacity-50"
                      title="Invite player"
                      style={{ color: '#22c55e' }}
                    >
                      {inviting ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-green-500"></div>
                      ) : (
                        <FontAwesomeIcon icon={faUserPlus} className="h-5 w-5" />
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
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
                    className="flex items-stretch rounded-sm border overflow-hidden"
                    style={{backgroundColor: THEME.bgPanel, borderColor: THEME.borderSubtle}}
                  >
                    <span className="flex-1 flex items-center font-medium py-3 pl-4" style={{color: THEME.textOnDark}}>{friend.friend_screen_name}</span>
                    {getUserStatusMessage(friend.friend_id) ? (
                      <span className="flex items-center text-sm px-4" style={{color: '#fbbf24'}}>{getUserStatusMessage(friend.friend_id)}</span>
                    ) : (
                      <button
                        onClick={() => handleInviteFriend(friend.friend_id)}
                        disabled={inviting}
                        className="px-8 flex items-center hover:bg-green-900/50 transition-colors disabled:opacity-50"
                        title="Invite player"
                        style={{ color: '#22c55e' }}
                      >
                        {inviting ? (
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-green-500"></div>
                        ) : (
                          <FontAwesomeIcon icon={faUserPlus} className="h-5 w-5" />
                        )}
                      </button>
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
                      className="flex items-stretch rounded-sm border overflow-hidden"
                      style={{backgroundColor: THEME.bgPanel, borderColor: THEME.borderSubtle}}
                    >
                      <div className="flex-1 flex items-center py-3 pl-4">
                        <span className="font-medium" style={{color: THEME.textOnDark}}>
                          {invite.screen_name || invite.display_name}
                        </span>
                        {invite.account_tag && (
                          <span className="text-sm ml-2" style={{color: THEME.textSecondary}}>
                            #{invite.account_tag}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => cancelInvite(invite.id)}
                        disabled={canceling === invite.id}
                        className="px-8 flex items-center hover:bg-red-900/50 transition-colors disabled:opacity-50"
                        title="Cancel invite"
                        style={{ color: '#dc2626' }}
                      >
                        {canceling === invite.id ? (
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-500"></div>
                        ) : (
                          <FontAwesomeIcon icon={faUserXmark} className="h-5 w-5" />
                        )}
                      </button>
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
    </div>,
    document.body
  )
}
