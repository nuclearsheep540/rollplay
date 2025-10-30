/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect } from 'react'

export default function FriendsManager({ user }) {
  const [friends, setFriends] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [friendUuid, setFriendUuid] = useState('')
  const [sending, setSending] = useState(false)
  const [actionLoading, setActionLoading] = useState({})
  const [lookupUser, setLookupUser] = useState(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState(null)

  useEffect(() => {
    fetchFriends()
  }, [])

  // Validate UUID format
  const isValidUUID = (uuid) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    return uuidRegex.test(uuid)
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

  const fetchFriends = async () => {
    try {
      setLoading(true)

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

    if (!friendUuid.trim()) {
      setError('Please enter a friend UUID')
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
        body: JSON.stringify({ friend_uuid: friendUuid.trim() })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to send friend request')
      }

      setFriendUuid('')
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
        <div className="text-slate-600">Loading friends...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-800">Friends</h1>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Add Friend Form */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold text-slate-800 mb-4">Add Friend</h2>
        <form onSubmit={sendFriendRequest} className="space-y-3">
          <div>
            <input
              type="text"
              value={friendUuid}
              onChange={(e) => setFriendUuid(e.target.value)}
              placeholder="Enter friend's UUID"
              className="w-full px-4 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={sending}
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
                    <p className="text-xs text-green-600">ID: {lookupUser.id}</p>
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
            disabled={sending || !lookupUser}
            className="w-full px-6 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors font-semibold"
          >
            {sending ? 'Sending...' : lookupUser ? `Send Friend Request to ${lookupUser.screen_name || 'User'}` : 'Send Friend Request'}
          </button>
        </form>
        <p className="text-sm text-slate-600 mt-4">
          Your UUID: <code className="bg-slate-100 px-2 py-1 rounded text-xs">{user.id}</code>
        </p>
      </div>

      {/* Pending Requests (Received from others) */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold text-slate-800 mb-4">
          Pending Requests ({pendingReceived.length})
        </h2>
        <p className="text-sm text-slate-600 mb-4">Friend requests you've received from other players</p>
        {pendingReceived.length === 0 ? (
          <p className="text-slate-500 text-sm py-4">No pending requests</p>
        ) : (
          <div className="space-y-3">
            {pendingReceived.map((request) => (
              <div
                key={request.id}
                className="flex items-center justify-between p-4 bg-slate-50 rounded border border-slate-200"
              >
                <div>
                  <p className="font-semibold text-slate-800">
                    {request.requester_screen_name || 'User'}
                  </p>
                  <p className="text-sm text-slate-600">ID: {request.requester_id}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => acceptFriendRequest(request.requester_id)}
                    disabled={actionLoading[`accept-${request.requester_id}`]}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => rejectFriendRequest(request.requester_id)}
                    disabled={actionLoading[`reject-${request.requester_id}`]}
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending Invites (Sent by you) */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold text-slate-800 mb-4">
          Pending Invites ({pendingSent.length})
        </h2>
        <p className="text-sm text-slate-600 mb-4">Friend invites you've sent to other players</p>
        {pendingSent.length === 0 ? (
          <p className="text-slate-500 text-sm py-4">No pending invites</p>
        ) : (
          <div className="space-y-3">
            {pendingSent.map((request) => (
              <div
                key={request.id}
                className="flex items-center justify-between p-4 bg-slate-50 rounded border border-slate-200"
              >
                <div>
                  <p className="font-semibold text-slate-800">
                    {request.recipient_screen_name || 'User'}
                  </p>
                  <p className="text-sm text-slate-600">ID: {request.recipient_id}</p>
                  <p className="text-xs text-slate-500 mt-1">Waiting for response...</p>
                </div>
                <button
                  onClick={() => removeFriend(request.recipient_id)}
                  disabled={actionLoading[`remove-${request.recipient_id}`]}
                  className="px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Accepted Friends */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold text-slate-800 mb-4">
          Friends ({acceptedFriends.length})
        </h2>
        {acceptedFriends.length === 0 ? (
          <p className="text-slate-600">No friends yet. Add some friends to get started!</p>
        ) : (
          <div className="space-y-3">
            {acceptedFriends.map((friendship) => (
              <div
                key={friendship.id}
                className="flex items-center justify-between p-4 bg-slate-50 rounded border border-slate-200"
              >
                <div>
                  <p className="font-semibold text-slate-800">
                    {friendship.friend_screen_name || 'User'}
                  </p>
                  <p className="text-sm text-slate-600">ID: {friendship.friend_id}</p>
                </div>
                <button
                  onClick={() => removeFriend(friendship.friend_id)}
                  disabled={actionLoading[`remove-${friendship.friend_id}`]}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
