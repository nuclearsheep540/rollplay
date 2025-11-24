/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faUserPlus,
  faUserCheck,
  faUserXmark,
  faUserMinus,
  faUndo,
  faCopy
} from '@fortawesome/free-solid-svg-icons'

export default function FriendsManager({ user, refreshTrigger }) {
  const [friends, setFriends] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [friendCode, setFriendCode] = useState('')
  const [sending, setSending] = useState(false)
  const [actionLoading, setActionLoading] = useState({})
  const [lookupUser, setLookupUser] = useState(null)
  const [copiedCode, setCopiedCode] = useState(false)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState(null)

  useEffect(() => {
    // Only show loading on initial fetch (refreshTrigger = 0)
    fetchFriends(refreshTrigger === 0)
  }, [refreshTrigger])

  // Validate UUID format
  const isValidUUID = (uuid) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    return uuidRegex.test(uuid)
  }

  // Copy Friend Code to clipboard
  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(user.id)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  // Lookup user by Friend Code when valid code is entered
  useEffect(() => {
    const lookupUserByCode = async () => {
      if (!friendCode.trim()) {
        setLookupUser(null)
        setLookupError(null)
        return
      }

      if (!isValidUUID(friendCode.trim())) {
        setLookupUser(null)
        setLookupError(null)
        return
      }

      try {
        setLookupLoading(true)
        setLookupError(null)

        const response = await fetch(`/api/users/${friendCode.trim()}`, {
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
    const timeoutId = setTimeout(lookupUserByCode, 500)
    return () => clearTimeout(timeoutId)
  }, [friendCode])

  const fetchFriends = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true)

      // Single API call to get all friendships categorized
      const response = await fetch('/api/friends/', {
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error('Failed to fetch friends')
      }

      const data = await response.json()

      // Store the categorized response directly (no merging needed!)
      setFriends(data)
      setError(null)
    } catch (err) {
      console.error('Error fetching friends:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const sendFriendRequest = async (e) => {
    e.preventDefault()

    if (!friendCode.trim()) {
      setError('Please enter a friend code')
      return
    }

    try {
      setSending(true)
      setError(null)

      const response = await fetch('/api/friends/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ friend_uuid: friendCode.trim() })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to send friend request')
      }

      setFriendCode('')
      await fetchFriends()
    } catch (err) {
      console.error('Error sending friend request:', err)
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  const acceptFriendRequest = async (requesterId) => {
    const actionKey = `accept-${requesterId}`

    try {
      setActionLoading({ ...actionLoading, [actionKey]: true })
      setError(null)

      const response = await fetch(`/api/friends/${requesterId}/accept`, {
        method: 'POST',
        credentials: 'include'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to accept friend request')
      }

      await fetchFriends()
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

      const response = await fetch(`/api/friends/${requesterId}/decline`, {
        method: 'DELETE',
        credentials: 'include'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to reject friend request')
      }

      await fetchFriends()
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

      const response = await fetch(`/api/friends/${friendId}`, {
        method: 'DELETE',
        credentials: 'include'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to remove friend')
      }

      await fetchFriends()
    } catch (err) {
      console.error('Error removing friend:', err)
      setError(err.message)
    } finally {
      setActionLoading({ ...actionLoading, [actionKey]: false })
    }
  }

  // Friends are already categorized by backend - no filtering needed!
  const acceptedFriends = friends.accepted || []
  const pendingReceived = friends.incoming_requests || []
  const pendingSent = friends.outgoing_requests || []

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mr-3"></div>
        <div className="text-slate-400">Loading friends...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white uppercase">Friends</h1>
        <p className="mt-2 text-slate-400">Manage your friend connections and invitations</p>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Add Friend Form */}
      <div className="bg-slate-800 p-6 rounded-lg border border-purple-500/30 max-w-xl mx-auto">
        <h2 className="text-xl font-semibold text-purple-400 mb-4">Add Friend</h2>
        <form onSubmit={sendFriendRequest} className="space-y-3">
          <div>
            <input
              type="text"
              value={friendCode}
              onChange={(e) => setFriendCode(e.target.value)}
              placeholder="Enter friend's unique code"
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 text-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
              disabled={sending}
            />
            {/* Real-time lookup feedback */}
            {friendCode && isValidUUID(friendCode) && (
              <div className="mt-2">
                {lookupLoading && (
                  <p className="text-sm text-slate-500 flex items-center gap-2">
                    <span className="animate-spin">⏳</span> Looking up user...
                  </p>
                )}
                {!lookupLoading && lookupUser && (
                  <div className="p-3 bg-green-500/20 border border-green-500/30 rounded">
                    <p className="text-sm text-green-400 font-semibold flex items-center gap-2">
                      <FontAwesomeIcon icon={faUserCheck} />
                      User found: {lookupUser.screen_name || 'User #' + lookupUser.id.substring(0, 8)}
                    </p>
                    <p className="text-xs text-green-500">ID: {lookupUser.id}</p>
                  </div>
                )}
                {!lookupLoading && lookupError && (
                  <p className="text-sm text-red-400 flex items-center gap-2">
                    <FontAwesomeIcon icon={faUserXmark} />
                    {lookupError}
                  </p>
                )}
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={sending || !lookupUser}
            className="w-full px-6 py-2 bg-purple-600 text-white rounded-lg border border-purple-500 hover:bg-purple-500 disabled:bg-slate-600 disabled:border-slate-600 disabled:cursor-not-allowed transition-all font-semibold flex items-center justify-center gap-2"
          >
            {sending ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Sending...
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={faUserPlus} />
                {lookupUser ? `Send Request to ${lookupUser.screen_name || 'User'}` : 'Send Friend Request'}
              </>
            )}
          </button>
        </form>
        <div className="mt-4 flex items-center gap-2">
          <p className="text-sm text-slate-400">
            Your Friend Code: <code className="bg-slate-900 border border-slate-700 px-2 py-1 rounded text-xs font-mono text-purple-400">{user.id}</code>
          </p>
          <button
            onClick={handleCopyCode}
            className="px-3 py-0.5 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-lg font-semibold text-sm flex items-center hover:bg-purple-500/30 hover:border-purple-500/50 transition-all"
            title="Copy Friend Code"
          >
            <FontAwesomeIcon icon={faCopy} className="text-xs" />
            {copiedCode ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Accepted Friends */}
      <div className="bg-slate-800 p-6 rounded-lg border border-purple-500/30">
        <h2 className="text-xl font-semibold text-purple-400 mb-4">
          Friends ({acceptedFriends.length})
        </h2>
        {acceptedFriends.length === 0 ? (
          <p className="text-slate-400">No friends yet. Add some friends to get started!</p>
        ) : (
          <div className="space-y-3">
            {acceptedFriends.map((friendship) => (
              <div
                key={friendship.id}
                className="flex items-center justify-between p-4 bg-slate-900 rounded border border-slate-700"
              >
                <div>
                  <p className="font-semibold text-slate-200">
                    {friendship.friend_screen_name || 'User'}
                  </p>
                  <p className="text-sm text-slate-500 font-mono">ID: {friendship.friend_id}</p>
                </div>
                <button
                  onClick={() => removeFriend(friendship.friend_id)}
                  disabled={actionLoading[`remove-${friendship.friend_id}`]}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg border border-red-500 hover:bg-red-500 disabled:bg-slate-600 disabled:border-slate-600 disabled:cursor-not-allowed transition-all"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending Requests (Received from others) */}
      <div className="bg-slate-800 p-6 rounded-lg border border-purple-500/30">
        <h2 className="text-xl font-semibold text-purple-400 mb-4">
          Pending Requests ({pendingReceived.length})
        </h2>
        <p className="text-sm text-slate-400 mb-4">Friend requests you've received from other players</p>
        {pendingReceived.length === 0 ? (
          <p className="text-slate-500 text-sm py-4">No pending requests</p>
        ) : (
          <div className="space-y-3">
            {pendingReceived.map((request) => (
              <div
                key={request.id}
                className="flex items-center justify-between p-4 bg-slate-900 rounded border border-slate-700"
              >
                <div>
                  <p className="font-semibold text-slate-200">
                    {request.requester_screen_name || 'User'}
                  </p>
                  <p className="text-sm text-slate-500 font-mono">ID: {request.requester_id}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => acceptFriendRequest(request.requester_id)}
                    disabled={actionLoading[`accept-${request.requester_id}`]}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg border border-green-500 hover:bg-green-500 hover:shadow-lg hover:shadow-green-500/30 disabled:bg-slate-600 disabled:border-slate-600 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                  >
                    <FontAwesomeIcon icon={faUserCheck} />
                    Accept
                  </button>
                  <button
                    onClick={() => rejectFriendRequest(request.requester_id)}
                    disabled={actionLoading[`reject-${request.requester_id}`]}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg border border-red-500 hover:bg-red-500 hover:shadow-lg hover:shadow-red-500/30 disabled:bg-slate-600 disabled:border-slate-600 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                  >
                    <FontAwesomeIcon icon={faUserXmark} />
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending Invites (Sent by you) */}
      <div className="bg-slate-800 p-6 rounded-lg border border-purple-500/30">
        <h2 className="text-xl font-semibold text-purple-400 mb-4">
          Pending Invites ({pendingSent.length})
        </h2>
        <p className="text-sm text-slate-400 mb-4">Friend invites you've sent to other players</p>
        {pendingSent.length === 0 ? (
          <p className="text-slate-500 text-sm py-4">No pending invites</p>
        ) : (
          <div className="space-y-3">
            {pendingSent.map((request) => (
              <div
                key={request.id}
                className="flex items-center justify-between p-4 bg-slate-900 rounded border border-slate-700"
              >
                <div>
                  <p className="font-semibold text-slate-200">
                    {request.recipient_screen_name || 'User'}
                  </p>
                  <p className="text-sm text-slate-500 font-mono">ID: {request.recipient_id}</p>
                  <p className="text-xs text-slate-500 mt-1">Waiting for response...</p>
                </div>
                <button
                  onClick={() => removeFriend(request.recipient_id)}
                  disabled={actionLoading[`remove-${request.recipient_id}`]}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg border border-red-500 hover:bg-red-500 disabled:bg-slate-600 disabled:border-slate-600 disabled:cursor-not-allowed transition-all"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
