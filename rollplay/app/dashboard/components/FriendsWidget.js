/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown, faChevronUp, faUserPlus } from '@fortawesome/free-solid-svg-icons'
import { THEME } from '@/app/styles/colorTheme'
import { Button } from './shared/Button'

export default function FriendsWidget({ user, refreshTrigger }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [friends, setFriends] = useState([])
  const [friendRequests, setFriendRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddFriendModal, setShowAddFriendModal] = useState(false)

  // Auto-collapse on mobile on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsExpanded(false)
    }
  }, [])

  // Fetch friends and requests
  const fetchFriends = async () => {
    try {
      const response = await fetch('/api/friendships/', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      })

      if (response.ok) {
        const data = await response.json()

        // Separate accepted friends from pending requests
        const acceptedFriends = data.filter(f => f.status === 'accepted')
        const pendingRequests = data.filter(f =>
          f.status === 'pending' && f.requested_user_id === user.id
        )

        setFriends(acceptedFriends)
        setFriendRequests(pendingRequests)
      }
    } catch (error) {
      console.error('Error fetching friends:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user?.id) {
      fetchFriends()
    }
  }, [user, refreshTrigger])

  const handleAcceptRequest = async (friendshipId) => {
    try {
      const response = await fetch(`/api/friendships/${friendshipId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      })

      if (response.ok) {
        fetchFriends() // Refresh
      }
    } catch (error) {
      console.error('Error accepting friend request:', error)
    }
  }

  const handleDeclineRequest = async (friendshipId) => {
    try {
      const response = await fetch(`/api/friendships/${friendshipId}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      })

      if (response.ok) {
        fetchFriends() // Refresh
      }
    } catch (error) {
      console.error('Error declining friend request:', error)
    }
  }

  return (
    <div className="fixed bottom-0 right-8 z-30" style={{width: '320px'}}>
      {/* Expandable Panel - appears above the tab when expanded */}
      {isExpanded && (
        <div
          className="border-2 border-b-0 rounded-t-sm shadow-lg mb-0 transition-all duration-300 ease-in-out"
          style={{
            backgroundColor: THEME.bgPanel,
            borderColor: THEME.borderDefault,
            width: '100%',
            maxHeight: '500px'
          }}
        >
          {/* Content */}
          <div className="overflow-y-auto" style={{maxHeight: '500px'}}>
            {loading ? (
              <div className="p-4 text-center text-sm" style={{color: THEME.textSecondary}}>
                Loading...
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="p-3 border-b">
                  <span className="font-semibold text-sm font-[family-name:var(--font-metamorphous)]" style={{color: THEME.textOnDark}}>
                    Friends
                  </span>
                </div>

                {/* Friends List */}
                <div className="p-2">
                  {friends.length === 0 ? (
                    <div className="p-2 text-center text-sm" style={{color: THEME.textSecondary}}>
                      No friends yet
                    </div>
                  ) : (
                    friends.map(friend => {
                      const friendUser = friend.requester_user_id === user.id
                        ? friend.requested_user
                        : friend.requester_user

                      return (
                        <div
                          key={friend.id}
                          className="flex items-center gap-2 p-2 rounded-sm mb-1"
                          style={{color: THEME.textOnDark}}
                        >
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{backgroundColor: friend.is_online ? '#16a34a' : THEME.dimGrey}}
                          />
                          <span className="text-sm truncate">{friendUser?.screen_name || 'Unknown'}</span>
                        </div>
                      )
                    })
                  )}
                </div>

                {/* Friend Requests */}
                {friendRequests.length > 0 && (
                  <div className="border-t p-2" style={{borderTopColor: THEME.borderSubtle}}>
                    <p className="text-xs font-semibold mb-2" style={{color: THEME.textSecondary}}>
                      Pending Requests ({friendRequests.length})
                    </p>
                    {friendRequests.map(request => (
                      <div key={request.id} className="mb-2 p-2 rounded-sm" style={{backgroundColor: THEME.bgSecondary}}>
                        <p className="text-sm mb-2" style={{color: THEME.textOnDark}}>
                          {request.requester_user?.screen_name || 'Unknown'}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="success"
                            size="xs"
                            onClick={() => handleAcceptRequest(request.id)}
                          >
                            Accept
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => handleDeclineRequest(request.id)}
                          >
                            Decline
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Friend Button */}
                <div className="border-t p-2" style={{borderTopColor: THEME.borderSubtle}}>
                  <Button
                    variant="primary"
                    className="w-full text-xs"
                    onClick={() => setShowAddFriendModal(true)}
                  >
                    <FontAwesomeIcon icon={faUserPlus} className="mr-2" />
                    Add Friend
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Horizontal Bottom Tab */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full border-2 border-b-0 rounded-t-sm px-6 py-2 flex items-center gap-2 hover:opacity-80 transition-opacity"
        style={{
          backgroundColor: THEME.bgPanel,
          borderColor: THEME.borderDefault
        }}
      >
        <FontAwesomeIcon
          icon={isExpanded ? faChevronDown : faChevronUp}
          className="text-xs"
          style={{color: THEME.textOnDark}}
        />
        <span className="font-semibold text-sm font-[family-name:var(--font-metamorphous)]" style={{color: THEME.textOnDark}}>
          Friends
        </span>
        {friendRequests.length > 0 && (
          <span
            className="px-1.5 py-0.5 rounded-sm text-xs font-semibold"
            style={{backgroundColor: '#dc2626', color: THEME.textAccent}}
          >
            {friendRequests.length}
          </span>
        )}
      </button>
    </div>
  )
}
