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

export default function FriendsWidget({ user, refreshTrigger, isStandalone = false }) {
  const [isExpanded, setIsExpanded] = useState(isStandalone ? true : false)
  const [friends, setFriends] = useState([])
  const [friendRequests, setFriendRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddFriendModal, setShowAddFriendModal] = useState(false)

  // Auto-collapse on mobile on mount (only for fixed mode)
  useEffect(() => {
    if (!isStandalone && typeof window !== 'undefined' && window.innerWidth < 768) {
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

        // Backend returns categorized response with accepted and incoming_requests
        setFriends(data.accepted || [])
        setFriendRequests(data.incoming_requests || [])
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

  // Reusable content component
  const FriendsContent = () => (
    <>
      {loading ? (
        <div className="p-4 text-center text-sm" style={{color: THEME.textSecondary}}>
          Loading...
        </div>
      ) : (
        <>
          {/* Friends List */}
          <div className="p-4">
            <h3 className="text-sm font-semibold mb-3" style={{color: THEME.textOnDark}}>
              Friends ({friends.length})
            </h3>
            {friends.length === 0 ? (
              <div className="p-2 text-center text-sm" style={{color: THEME.textSecondary}}>
                No friends yet
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {friends.map(friend => (
                  <div
                    key={friend.id}
                    className="flex items-center gap-2 p-3 rounded-sm border"
                    style={{backgroundColor: THEME.bgSecondary, borderColor: THEME.borderSubtle, color: THEME.textOnDark}}
                  >
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{backgroundColor: friend.is_online ? '#16a34a' : THEME.dimGrey}}
                    />
                    <span className="text-sm truncate">{friend.friend_screen_name || 'Unknown'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Friend Requests */}
          {friendRequests.length > 0 && (
            <div className="border-t p-4" style={{borderTopColor: THEME.borderSubtle}}>
              <h3 className="text-sm font-semibold mb-3" style={{color: THEME.textOnDark}}>
                Pending Requests ({friendRequests.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {friendRequests.map(request => (
                  <div key={request.id} className="p-3 rounded-sm border" style={{backgroundColor: THEME.bgSecondary, borderColor: THEME.borderSubtle}}>
                    <p className="text-sm mb-2" style={{color: THEME.textOnDark}}>
                      {request.requester_screen_name || 'Unknown'}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="success"
                        size="xs"
                        onClick={() => handleAcceptRequest(request.requester_id)}
                      >
                        Accept
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => handleDeclineRequest(request.requester_id)}
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add Friend Button */}
          <div className="border-t p-4" style={{borderTopColor: THEME.borderSubtle}}>
            <Button
              variant="primary"
              onClick={() => setShowAddFriendModal(true)}
            >
              <FontAwesomeIcon icon={faUserPlus} className="mr-2" />
              Add Friend
            </Button>
          </div>
        </>
      )}
    </>
  )

  // Standalone mode - full page layout
  if (isStandalone) {
    return (
      <div className="border rounded-sm" style={{backgroundColor: THEME.bgPanel, borderColor: THEME.borderDefault}}>
        <FriendsContent />
      </div>
    )
  }

  // Fixed mode - bottom-right widget
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
            {/* Header */}
            <div className="p-3 border-b">
              <span className="font-semibold text-sm font-[family-name:var(--font-metamorphous)]" style={{color: THEME.textOnDark}}>
                Friends
              </span>
            </div>
            <FriendsContent />
          </div>
        </div>
      )}

      {/* Horizontal Bottom Tab */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full border-2 border-b-0 rounded-t-sm px-6 py-4 flex items-center gap-2"
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
