/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown, faChevronUp, faUserPlus, faBell, faPersonCirclePlus } from '@fortawesome/free-solid-svg-icons'
import { THEME } from '@/app/styles/colorTheme'
import { Button } from './shared/Button'

export default function FriendsWidget({ user, refreshTrigger, isStandalone = false }) {
  const router = useRouter()
  const [isExpanded, setIsExpanded] = useState(isStandalone)
  const [friends, setFriends] = useState([])
  const [friendRequests, setFriendRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [hostedCampaigns, setHostedCampaigns] = useState([])
  const [buzzCooldowns, setBuzzCooldowns] = useState({}) // Track cooldown start times per friend (timestamp)
  const [cooldownProgress, setCooldownProgress] = useState({}) // Track animation progress 0-100
  const [inviteDropdown, setInviteDropdown] = useState(null) // Track which friend's dropdown is open
  const dropdownRef = useRef(null)
  const COOLDOWN_DURATION = 20000 // 20 seconds in ms

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

  // Fetch hosted campaigns for invite dropdown
  const fetchHostedCampaigns = async () => {
    try {
      const response = await fetch('/api/campaigns/hosted', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      })

      if (response.ok) {
        const data = await response.json()
        setHostedCampaigns(data || [])
      }
    } catch (error) {
      console.error('Error fetching hosted campaigns:', error)
    }
  }

  useEffect(() => {
    if (user?.id) {
      fetchFriends()
      fetchHostedCampaigns()
    }
  }, [user, refreshTrigger])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setInviteDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Animate cooldown progress
  useEffect(() => {
    const activeCooldowns = Object.keys(buzzCooldowns)
    if (activeCooldowns.length === 0) return

    const animationFrame = requestAnimationFrame(function animate() {
      const now = Date.now()
      const newProgress = {}
      let hasActive = false

      activeCooldowns.forEach(friendId => {
        const startTime = buzzCooldowns[friendId]
        if (startTime) {
          const elapsed = now - startTime
          const progress = Math.min((elapsed / COOLDOWN_DURATION) * 100, 100)
          newProgress[friendId] = progress
          if (progress < 100) hasActive = true
        }
      })

      setCooldownProgress(newProgress)

      if (hasActive) {
        requestAnimationFrame(animate)
      } else {
        // Clear completed cooldowns
        setBuzzCooldowns({})
        setCooldownProgress({})
      }
    })

    return () => cancelAnimationFrame(animationFrame)
  }, [buzzCooldowns])

  const handleBuzz = async (friendId) => {
    // Check if on cooldown
    if (buzzCooldowns[friendId]) return

    try {
      const response = await fetch(`/api/friendships/${friendId}/buzz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      })

      if (response.ok || response.status === 204) {
        // Set cooldown start time
        const startTime = Date.now()
        setBuzzCooldowns(prev => ({ ...prev, [friendId]: startTime }))
        setCooldownProgress(prev => ({ ...prev, [friendId]: 0 }))
      } else {
        const error = await response.json()
        console.error('Buzz error:', error.detail)
      }
    } catch (error) {
      console.error('Error buzzing friend:', error)
    }
  }

  const handleInviteToCampaign = async (friendId, campaignId) => {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/players/${friendId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      })

      if (response.ok) {
        setInviteDropdown(null)
        // Refresh campaigns to update invite state
        fetchHostedCampaigns()
      } else {
        const error = await response.json()
        console.error('Invite error:', error.detail)
      }
    } catch (error) {
      console.error('Error inviting to campaign:', error)
    }
  }

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

  // Grid class - multi-column only for standalone mode, single column for widget
  const gridClass = isStandalone
    ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
    : "flex flex-col gap-2"

  // Reusable content component
  const FriendsContent = () => (
    <div className="flex flex-col h-full">
      {loading ? (
        <div className="p-4 text-center text-sm flex-1 flex items-center justify-center" style={{color: THEME.textSecondary}}>
          Loading...
        </div>
      ) : (
        <>
          {/* Scrollable content area */}
          <div className="flex-1 overflow-y-auto">
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
                <div className={gridClass}>
                  {friends.map(friend => (
                    <div
                      key={friend.id}
                      className="flex items-center justify-between py-4 px-3 rounded-sm border"
                      style={{backgroundColor: THEME.bgSecondary, borderColor: THEME.borderSubtle, color: THEME.textOnDark}}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{backgroundColor: friend.is_online ? '#16a34a' : '#dc2626'}}
                        />
                        <span className="text-sm truncate">{friend.friend_screen_name || 'Unknown'}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 relative">
                        {/* Buzz Button with Radial Cooldown */}
                        <button
                          onClick={() => handleBuzz(friend.friend_id)}
                          disabled={!!buzzCooldowns[friend.friend_id]}
                          className="p-2 rounded-sm transition-colors relative"
                          style={{
                            backgroundColor: 'transparent',
                            width: '36px',
                            height: '36px'
                          }}
                          title={buzzCooldowns[friend.friend_id] ? 'On cooldown' : 'Buzz friend'}
                        >
                          {buzzCooldowns[friend.friend_id] ? (
                            <>
                              {/* During cooldown: dimmed base + bright reveal */}
                              <FontAwesomeIcon
                                icon={faBell}
                                size="lg"
                                style={{ color: THEME.borderDefault, opacity: 0.3 }}
                              />
                              <FontAwesomeIcon
                                icon={faBell}
                                size="lg"
                                className="absolute inset-0 m-auto"
                                style={{
                                  color: THEME.textAccent,
                                  maskImage: `conic-gradient(from 0deg, black ${cooldownProgress[friend.friend_id] || 0}%, transparent ${cooldownProgress[friend.friend_id] || 0}%)`,
                                  WebkitMaskImage: `conic-gradient(from 0deg, black ${cooldownProgress[friend.friend_id] || 0}%, transparent ${cooldownProgress[friend.friend_id] || 0}%)`
                                }}
                              />
                            </>
                          ) : (
                            /* Ready state: bright icon */
                            <FontAwesomeIcon
                              icon={faBell}
                              size="lg"
                              style={{ color: THEME.textAccent }}
                            />
                          )}
                        </button>
                        {/* Invite to Campaign Button */}
                        {hostedCampaigns.length > 0 && (
                          <div className="relative" ref={inviteDropdown === friend.friend_id ? dropdownRef : null}>
                            <button
                              onClick={() => setInviteDropdown(inviteDropdown === friend.friend_id ? null : friend.friend_id)}
                              className="p-2 rounded-sm transition-colors hover:bg-opacity-20"
                              style={{
                                backgroundColor: 'transparent',
                                color: THEME.textAccent
                              }}
                              title="Invite to campaign"
                            >
                              <FontAwesomeIcon icon={faPersonCirclePlus} size="lg" />
                            </button>
                            {/* Campaign Dropdown */}
                            {inviteDropdown === friend.friend_id && (
                              <div
                                className="absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded-sm border shadow-lg"
                                style={{backgroundColor: THEME.bgPanel, borderColor: THEME.borderDefault}}
                              >
                                <div className="p-2 text-xs font-semibold border-b" style={{color: THEME.textSecondary, borderColor: THEME.borderSubtle}}>
                                  Invite to Campaign
                                </div>
                                {hostedCampaigns.map(campaign => {
                                  const isAlreadyInvited = campaign.invited_player_ids?.includes(friend.friend_id)
                                  const isAlreadyMember = campaign.player_ids?.includes(friend.friend_id)
                                  const isDisabled = isAlreadyInvited || isAlreadyMember
                                  return (
                                    <button
                                      key={campaign.id}
                                      onClick={() => !isDisabled && handleInviteToCampaign(friend.friend_id, campaign.id)}
                                      disabled={isDisabled}
                                      className="w-full text-left px-3 py-2 text-sm hover:bg-opacity-50 transition-colors"
                                      style={{
                                        color: isDisabled ? THEME.textSecondary : THEME.textOnDark,
                                        backgroundColor: isDisabled ? 'transparent' : 'transparent',
                                        opacity: isDisabled ? 0.5 : 1
                                      }}
                                    >
                                      {campaign.title}
                                      {isAlreadyMember && <span className="text-xs ml-1" style={{color: THEME.textSecondary}}>(member)</span>}
                                      {isAlreadyInvited && !isAlreadyMember && <span className="text-xs ml-1" style={{color: THEME.textSecondary}}>(invited)</span>}
                                    </button>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
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
                <div className={gridClass}>
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
          </div>

          {/* Add Friend Button - pinned to bottom */}
          <div className="border-t p-4 flex-shrink-0" style={{borderTopColor: THEME.borderSubtle}}>
            <Button
              variant="primary"
              onClick={() => router.push('/dashboard?tab=account')}
            >
              <FontAwesomeIcon icon={faUserPlus} className="mr-2" />
              Add Friend
            </Button>
          </div>
        </>
      )}
    </div>
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
    <div className="fixed bottom-0 right-10 z-30" style={{width: '370px'}}>
      {/* Expandable Panel - appears above the tab when expanded */}
      {isExpanded && (
        <div
          className="border-2 border-b-0 rounded-t-sm shadow-lg mb-0 transition-all duration-300 ease-in-out"
          style={{
            backgroundColor: THEME.bgPanel,
            borderColor: THEME.borderDefault,
            width: '100%',
            height: '500px'
          }}
        >
          {/* Content */}
          <div className="overflow-y-auto h-full">
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
