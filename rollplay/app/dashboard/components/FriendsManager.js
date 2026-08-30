/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState } from 'react'
import { useAccountLookup, isValidAccountIdentifier } from '../hooks/useAccountLookup'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faUserPlus,
  faUserCheck,
  faUserXmark,
  faUserMinus,
  faCopy,
  faUsers
} from '@fortawesome/free-solid-svg-icons'
import { THEME, COLORS } from '@/app/styles/colorTheme'
import UserChrome from '@/app/shared/components/UserChrome'
import { Button } from './shared/Button'
import { useFriendships } from '../hooks/useFriendships'
import { useSendFriendRequest, useAcceptFriendRequest, useDeclineFriendRequest, useRemoveFriend } from '../hooks/mutations/useFriendshipMutations'

export default function FriendsManager({ user, fillHeight = false }) {
  const [friendCode, setFriendCode] = useState('')
  const [actionLoading, setActionLoading] = useState({})
  const [copiedCode, setCopiedCode] = useState(false)
  const [error, setError] = useState(null)

  // Debounced type-ahead lookup — shared with SocialPanel
  const { matchedUser: lookupUser, isLooking: lookupLoading, lookupError } = useAccountLookup(friendCode)

  // TanStack Query: friendships
  const { data: friends = {}, isLoading: loading } = useFriendships()

  // Mutation hooks
  const sendRequestMutation = useSendFriendRequest()
  const acceptMutation = useAcceptFriendRequest()
  const declineMutation = useDeclineFriendRequest()
  const removeMutation = useRemoveFriend()

  // Copy account tag to clipboard
  const handleCopyCode = async () => {
    if (!user.account_identifier) return
    await navigator.clipboard.writeText(user.account_identifier)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  // Get display code (account identifier)
  const displayCode = user.account_identifier || 'Not set'

  const sendFriendRequest = async (e) => {
    e.preventDefault()

    if (!friendCode.trim()) {
      setError('Please enter a friend code')
      return
    }

    try {
      setError(null)
      await sendRequestMutation.mutateAsync(friendCode.trim())
      setFriendCode('')
    } catch (err) {
      console.error('Error sending friend request:', err)
      setError(err.message)
    }
  }

  const acceptFriendRequest = async (requesterId) => {
    const actionKey = `accept-${requesterId}`

    try {
      setActionLoading({ ...actionLoading, [actionKey]: true })
      setError(null)
      await acceptMutation.mutateAsync(requesterId)
    } catch (err) {
      console.error('Error accepting friend request:', err)
      setError(err.message)
    } finally {
      setActionLoading({ ...actionLoading, [actionKey]: false })
    }
  }

  const rejectFriendRequest = async (requesterId) => {
    const actionKey = `reject-${requesterId}`

    try {
      setActionLoading({ ...actionLoading, [actionKey]: true })
      setError(null)
      await declineMutation.mutateAsync(requesterId)
    } catch (err) {
      console.error('Error rejecting friend request:', err)
      setError(err.message)
    } finally {
      setActionLoading({ ...actionLoading, [actionKey]: false })
    }
  }

  const removeFriend = async (friendId) => {
    const actionKey = `remove-${friendId}`

    if (!confirm('Are you sure you want to remove this friend?')) {
      return
    }

    try {
      setActionLoading({ ...actionLoading, [actionKey]: true })
      setError(null)
      await removeMutation.mutateAsync(friendId)
    } catch (err) {
      console.error('Error removing friend:', err)
      setError(err.message)
    } finally {
      setActionLoading({ ...actionLoading, [actionKey]: false })
    }
  }

  // Friends are already categorized by backend
  const acceptedFriends = friends.accepted || []
  const pendingReceived = friends.incoming_requests || []

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 mr-3" style={{borderColor: THEME.borderActive}}></div>
        <span style={{color: THEME.textSecondary}}>Loading friends...</span>
      </div>
    )
  }

  return (
    <div className={`flex flex-col gap-6 ${fillHeight ? 'h-full' : ''}`}>
      {/* Error Display */}
      {error && (
        <div
          className="p-3 rounded-sm border"
          style={{backgroundColor: '#991b1b', borderColor: '#dc2626'}}
        >
          <p style={{color: '#fca5a5'}}>{error}</p>
        </div>
      )}

      {/* Add Friend Panel */}
      <div
        className="p-6 rounded-sm border"
        style={{backgroundColor: THEME.bgPanel, borderColor: THEME.borderSubtle}}
      >
        <h3 className="text-sm font-semibold uppercase mb-4" style={{color: THEME.textAccent}}>
          Add Friend
        </h3>
        <form onSubmit={sendFriendRequest} className="space-y-3">
          <div>
            <input
              type="text"
              value={friendCode}
              onChange={(e) => setFriendCode(e.target.value)}
              placeholder="Enter username (e.g. steve#2345)"
              className="w-full px-3 py-2 rounded-sm border focus:outline-none focus:ring-2"
              style={{
                backgroundColor: THEME.bgSecondary,
                borderColor: THEME.borderDefault,
                color: THEME.textOnDark
              }}
              disabled={sendRequestMutation.isPending}
            />
            {/* Real-time lookup feedback */}
            {friendCode && isValidAccountIdentifier(friendCode) && (
              <div className="mt-2">
                {lookupLoading && (
                  <p className="text-sm flex items-center gap-2" style={{color: THEME.textSecondary}}>
                    <span className="animate-spin">⏳</span> Looking up user...
                  </p>
                )}
                {!lookupLoading && lookupUser && (
                  <div
                    className="p-3 rounded-sm border"
                    style={{backgroundColor: '#14532d', borderColor: '#22c55e'}}
                  >
                    <p className="text-sm font-semibold flex items-center gap-2" style={{color: '#86efac'}}>
                      <FontAwesomeIcon icon={faUserCheck} />
                      User found: {lookupUser.screen_name || 'User #' + lookupUser.id.substring(0, 8)}
                    </p>
                    <p className="text-xs font-mono" style={{color: '#4ade80'}}>
                      {lookupUser.account_identifier}
                    </p>
                  </div>
                )}
                {!lookupLoading && lookupError && (
                  <p className="text-sm flex items-center gap-2" style={{color: '#fca5a5'}}>
                    <FontAwesomeIcon icon={faUserXmark} />
                    {lookupError}
                  </p>
                )}
              </div>
            )}
          </div>
          <Button
            type="submit"
            variant="primary"
            className="w-full justify-center"
            disabled={sendRequestMutation.isPending || !lookupUser}
          >
            {sendRequestMutation.isPending ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Sending...
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={faUserPlus} className="mr-2" />
                {lookupUser ? `Send Request to ${lookupUser.screen_name || 'User'}` : 'Send Friend Request'}
              </>
            )}
          </Button>
        </form>

        {/* Your Account Tag */}
        <div className="mt-4 pt-4 border-t" style={{borderTopColor: THEME.borderSubtle}}>
          <p className="text-sm mb-2" style={{color: THEME.textSecondary}}>
            Your Account Tag:
          </p>
          <div className="flex items-center gap-2">
            <code
              className="flex-1 px-3 py-2 rounded-sm border text-sm font-mono"
              style={{
                backgroundColor: COLORS.onyx,
                borderColor: THEME.borderSubtle,
                color: THEME.textAccent
              }}
            >
              {displayCode}
            </code>
            <button
              onClick={handleCopyCode}
              className="px-3 py-2 rounded-sm border font-medium text-sm flex items-center gap-1 hover:opacity-80 transition-opacity"
              style={{
                backgroundColor: THEME.bgSecondary,
                borderColor: THEME.borderDefault,
                color: THEME.textAccent
              }}
              title="Copy Account Tag"
            >
              <FontAwesomeIcon icon={faCopy} className="text-xs" />
              {copiedCode ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      </div>

      {/* Friend Requests - Show if there are any */}
      {pendingReceived.length > 0 && (
        <div
          className="p-6 rounded-sm border"
          style={{backgroundColor: THEME.bgPanel, borderColor: THEME.borderSubtle}}
        >
          <h3 className="text-sm font-semibold uppercase mb-4" style={{color: THEME.textAccent}}>
            Friend Requests ({pendingReceived.length})
          </h3>
          <div className="space-y-2">
            {pendingReceived.map((request) => (
              <div
                key={request.id}
                className="flex items-center justify-between p-3 rounded-sm border"
                style={{backgroundColor: THEME.bgSecondary, borderColor: THEME.borderSubtle}}
              >
                <div>
                  <p className="font-semibold" style={{color: THEME.textOnDark}}>
                    {request.requester_screen_name || 'User'}
                  </p>
                  <p className="text-xs font-mono" style={{color: THEME.textSecondary}}>
                    {request.requester_account_tag || 'No tag'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    onClick={() => acceptFriendRequest(request.requester_id)}
                    disabled={actionLoading[`accept-${request.requester_id}`]}
                  >
                    <FontAwesomeIcon icon={faUserCheck} className="mr-1" />
                    Accept
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => rejectFriendRequest(request.requester_id)}
                    disabled={actionLoading[`reject-${request.requester_id}`]}
                  >
                    <FontAwesomeIcon icon={faUserXmark} className="mr-1" />
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Friends List Panel */}
      <div
        className={`p-6 rounded-sm border flex flex-col ${fillHeight ? 'flex-1 min-h-0' : ''}`}
        style={{backgroundColor: THEME.bgPanel, borderColor: THEME.borderSubtle}}
      >
        <h3 className="text-sm font-semibold uppercase mb-4" style={{color: THEME.textAccent}}>
          Friends ({acceptedFriends.length})
        </h3>
        {acceptedFriends.length === 0 ? (
          <div className="py-8 text-center flex-1 flex flex-col items-center justify-center">
            <FontAwesomeIcon
              icon={faUsers}
              className="text-4xl mb-3 opacity-30"
              style={{color: THEME.textSecondary}}
            />
            <p style={{color: THEME.textSecondary}}>No friends yet</p>
            <p className="text-sm mt-1" style={{color: THEME.textSecondary}}>
              Add some friends to get started!
            </p>
          </div>
        ) : (
          <div className={`space-y-2 overflow-y-auto pr-2 ${fillHeight ? 'flex-1' : 'max-h-80'}`} style={{scrollbarWidth: 'thin'}}>
            {acceptedFriends.map((friendship) => (
              <div
                key={friendship.id}
                className="flex items-center justify-between p-3 rounded-sm border"
                style={{backgroundColor: THEME.bgSecondary, borderColor: THEME.borderSubtle}}
              >
                <UserChrome
                  userId={friendship.friend_id}
                  color={friendship.friend_color}
                  name={friendship.friend_screen_name}
                  status={friendship.friend_account_tag || 'No tag'}
                  size="md"
                />
                <button
                  onClick={() => removeFriend(friendship.friend_id)}
                  disabled={actionLoading[`remove-${friendship.friend_id}`]}
                  className="p-2 rounded-sm hover:opacity-80 transition-opacity"
                  style={{color: THEME.textSecondary}}
                  title="Remove friend"
                >
                  <FontAwesomeIcon icon={faUserMinus} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
