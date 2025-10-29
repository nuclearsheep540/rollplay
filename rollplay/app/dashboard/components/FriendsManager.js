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

  useEffect(() => {
    fetchFriends()
  }, [])

  const fetchFriends = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/friends/', {
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error('Failed to fetch friends')
      }

      const data = await response.json()
      setFriends(data.friendships || [])
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

  const acceptFriendRequest = async (friendshipUserId, friendshipFriendId) => {
    const actionKey = `accept-${friendshipUserId}-${friendshipFriendId}`

    // Determine which ID is the requester (the one who sent the request)
    const requesterId = friendshipUserId === user.id ? friendshipFriendId : friendshipUserId

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

  const rejectFriendRequest = async (friendshipUserId, friendshipFriendId) => {
    const actionKey = `reject-${friendshipUserId}-${friendshipFriendId}`

    // Determine which ID is the requester (the one who sent the request)
    const requesterId = friendshipUserId === user.id ? friendshipFriendId : friendshipUserId

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

  const removeFriend = async (friendshipUserId, friendshipFriendId) => {
    const actionKey = `remove-${friendshipUserId}-${friendshipFriendId}`

    if (!confirm('Are you sure you want to remove this friend?')) {
      return
    }

    // Determine which ID is the other user (not current user)
    const otherUserId = friendshipUserId === user.id ? friendshipFriendId : friendshipUserId

    try {
      setActionLoading({ ...actionLoading, [actionKey]: true })
      setError(null)

      const response = await fetch(`/api/friends/${otherUserId}`, {
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

  // Separate friends by status
  const acceptedFriends = friends.filter(f => f.status === 'accepted')
  const pendingReceived = friends.filter(f => f.status === 'pending' && f.user_id !== user.id)
  const pendingSent = friends.filter(f => f.status === 'pending' && f.user_id === user.id)

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
        <form onSubmit={sendFriendRequest} className="flex gap-2">
          <input
            type="text"
            value={friendUuid}
            onChange={(e) => setFriendUuid(e.target.value)}
            placeholder="Enter friend's UUID"
            className="flex-1 px-4 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={sending}
            className="px-6 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors"
          >
            {sending ? 'Sending...' : 'Send Request'}
          </button>
        </form>
        <p className="text-sm text-slate-600 mt-2">
          Your UUID: <code className="bg-slate-100 px-2 py-1 rounded">{user.id}</code>
        </p>
      </div>

      {/* Incoming Friend Requests */}
      {pendingReceived.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold text-slate-800 mb-4">
            Incoming Requests ({pendingReceived.length})
          </h2>
          <div className="space-y-3">
            {pendingReceived.map((friendship) => (
              <div
                key={`${friendship.user_id}-${friendship.friend_id}`}
                className="flex items-center justify-between p-4 bg-slate-50 rounded border border-slate-200"
              >
                <div>
                  <p className="font-semibold text-slate-800">
                    {friendship.friend_screen_name || friendship.friend_email}
                  </p>
                  <p className="text-sm text-slate-600">{friendship.friend_email}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => acceptFriendRequest(friendship.user_id, friendship.friend_id)}
                    disabled={actionLoading[`accept-${friendship.user_id}-${friendship.friend_id}`]}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => rejectFriendRequest(friendship.user_id, friendship.friend_id)}
                    disabled={actionLoading[`reject-${friendship.user_id}-${friendship.friend_id}`]}
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Outgoing Friend Requests */}
      {pendingSent.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold text-slate-800 mb-4">
            Pending Requests ({pendingSent.length})
          </h2>
          <div className="space-y-3">
            {pendingSent.map((friendship) => (
              <div
                key={`${friendship.user_id}-${friendship.friend_id}`}
                className="flex items-center justify-between p-4 bg-slate-50 rounded border border-slate-200"
              >
                <div>
                  <p className="font-semibold text-slate-800">
                    {friendship.friend_screen_name || friendship.friend_email}
                  </p>
                  <p className="text-sm text-slate-600">{friendship.friend_email}</p>
                  <p className="text-xs text-slate-500 mt-1">Waiting for response...</p>
                </div>
                <button
                  onClick={() => removeFriend(friendship.user_id, friendship.friend_id)}
                  disabled={actionLoading[`remove-${friendship.user_id}-${friendship.friend_id}`]}
                  className="px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
                key={`${friendship.user_id}-${friendship.friend_id}`}
                className="flex items-center justify-between p-4 bg-slate-50 rounded border border-slate-200"
              >
                <div>
                  <p className="font-semibold text-slate-800">
                    {friendship.friend_screen_name || friendship.friend_email}
                  </p>
                  <p className="text-sm text-slate-600">{friendship.friend_email}</p>
                </div>
                <button
                  onClick={() => removeFriend(friendship.user_id, friendship.friend_id)}
                  disabled={actionLoading[`remove-${friendship.user_id}-${friendship.friend_id}`]}
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
