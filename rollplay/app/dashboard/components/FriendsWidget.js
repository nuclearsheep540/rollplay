/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown, faChevronUp, faUserPlus, faBell, faPersonCirclePlus } from '@fortawesome/free-solid-svg-icons'
import { Button } from './shared/Button'
import { useFriendships } from '../hooks/useFriendships'
import { useCampaigns } from '../hooks/useCampaigns'
import { useBuzzFriend, useInviteToCampaign, useAcceptFriendRequest, useDeclineFriendRequest } from '../hooks/mutations/useFriendshipMutations'

export default function FriendsWidget({ user, isStandalone = false }) {
  const router = useRouter()
  const [isExpanded, setIsExpanded] = useState(isStandalone)
  const [buzzCooldowns, setBuzzCooldowns] = useState({})
  const [cooldownProgress, setCooldownProgress] = useState({})
  const COOLDOWN_DURATION = 20000

  // TanStack Query: friendships
  const { data: friendshipData, isLoading: loading } = useFriendships({ enabled: !!user?.id })
  const friends = friendshipData?.accepted || []
  const friendRequests = friendshipData?.incoming_requests || []

  // Derive hosted campaigns from existing campaigns query (no extra fetch needed)
  const { data: campaignData } = useCampaigns(user?.id, { enabled: !!user?.id })
  const hostedCampaigns = (campaignData?.campaigns || []).filter(c => c.host_id === user?.id)

  // Mutation hooks
  const buzzMutation = useBuzzFriend()
  const inviteMutation = useInviteToCampaign()
  const acceptMutation = useAcceptFriendRequest()
  const declineMutation = useDeclineFriendRequest()

  // Auto-collapse on mobile on mount (only for fixed mode)
  useEffect(() => {
    if (!isStandalone && typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsExpanded(false)
    }
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
        setBuzzCooldowns({})
        setCooldownProgress({})
      }
    })

    return () => cancelAnimationFrame(animationFrame)
  }, [buzzCooldowns])

  const handleBuzz = async (friendId) => {
    if (buzzCooldowns[friendId]) return

    try {
      await buzzMutation.mutateAsync(friendId)
      const startTime = Date.now()
      setBuzzCooldowns(prev => ({ ...prev, [friendId]: startTime }))
      setCooldownProgress(prev => ({ ...prev, [friendId]: 0 }))
    } catch (error) {
      console.error('Buzz error:', error.message)
    }
  }

  const handleInviteToCampaign = async (friendId, campaignId) => {
    try {
      await inviteMutation.mutateAsync({ friendId, campaignId })
    } catch (error) {
      console.error('Invite error:', error.message)
    }
  }

  const handleAcceptRequest = async (friendshipId) => {
    try {
      await acceptMutation.mutateAsync(friendshipId)
    } catch (error) {
      console.error('Error accepting friend request:', error)
    }
  }

  const handleDeclineRequest = async (friendshipId) => {
    try {
      await declineMutation.mutateAsync(friendshipId)
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
        <div className="p-4 text-center text-sm flex-1 flex items-center justify-center text-content-secondary">
          Loading...
        </div>
      ) : (
        <>
          {/* Scrollable content area */}
          <div className="flex-1 overflow-y-auto">
            {/* Friends List */}
            <div className="p-4">
              <h3 className="text-sm font-semibold mb-3 text-content-on-dark">
                Friends ({friends.length})
              </h3>
              {friends.length === 0 ? (
                <div className="p-2 text-center text-sm text-content-secondary">
                  No friends yet
                </div>
              ) : (
                <div className={gridClass}>
                  {friends.map(friend => (
                    <div
                      key={friend.id}
                      className="flex items-center justify-between py-4 px-3 rounded-sm border bg-surface-secondary border-border-subtle text-content-on-dark"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${friend.is_online ? 'bg-feedback-success' : 'bg-feedback-error'}`}
                        />
                        <span className="text-sm truncate">{friend.friend_screen_name || 'Unknown'}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 relative">
                        {/* Buzz Button with Radial Cooldown */}
                        <button
                          onClick={() => handleBuzz(friend.friend_id)}
                          disabled={!!buzzCooldowns[friend.friend_id]}
                          className="p-2 rounded-sm transition-colors relative w-9 h-9"
                          title={buzzCooldowns[friend.friend_id] ? 'On cooldown' : 'Buzz friend'}
                        >
                          {buzzCooldowns[friend.friend_id] ? (
                            <>
                              {/* During cooldown: dimmed base + bright reveal */}
                              <FontAwesomeIcon
                                icon={faBell}
                                size="lg"
                                className="text-border opacity-30"
                              />
                              <FontAwesomeIcon
                                icon={faBell}
                                size="lg"
                                className="absolute inset-0 m-auto text-content-accent"
                                style={{
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
                              className="text-content-accent"
                            />
                          )}
                        </button>
                        {/* Invite to Campaign Button */}
                        {hostedCampaigns.length > 0 && (
                          <Menu as="div" className="relative">
                            <MenuButton
                              className="p-2 rounded-sm transition-colors text-content-accent hover:opacity-80"
                              title="Invite to campaign"
                            >
                              <FontAwesomeIcon icon={faPersonCirclePlus} size="lg" />
                            </MenuButton>
                            <MenuItems className="absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded-sm border border-border bg-surface-panel shadow-lg focus:outline-none">
                              <div className="p-2 text-xs font-semibold border-b border-border-subtle text-content-secondary">
                                Invite to Campaign
                              </div>
                              {hostedCampaigns.map(campaign => {
                                const isAlreadyInvited = campaign.invited_player_ids?.includes(friend.friend_id)
                                const isAlreadyMember = campaign.player_ids?.includes(friend.friend_id)
                                const isDisabled = isAlreadyInvited || isAlreadyMember
                                return (
                                  <MenuItem key={campaign.id} disabled={isDisabled}>
                                    <button
                                      onClick={() => handleInviteToCampaign(friend.friend_id, campaign.id)}
                                      className="w-full text-left px-3 py-2 text-sm text-content-on-dark data-[focus]:bg-interactive-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                      {campaign.title}
                                      {isAlreadyMember && <span className="text-xs ml-1 text-content-secondary">(member)</span>}
                                      {isAlreadyInvited && !isAlreadyMember && <span className="text-xs ml-1 text-content-secondary">(invited)</span>}
                                    </button>
                                  </MenuItem>
                                )
                              })}
                            </MenuItems>
                          </Menu>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Friend Requests */}
            {friendRequests.length > 0 && (
              <div className="border-t border-border-subtle p-4">
                <h3 className="text-sm font-semibold mb-3 text-content-on-dark">
                  Pending Requests ({friendRequests.length})
                </h3>
                <div className={gridClass}>
                  {friendRequests.map(request => (
                    <div key={request.id} className="p-3 rounded-sm border bg-surface-secondary border-border-subtle">
                      <p className="text-sm mb-2 text-content-on-dark">
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
          <div className="border-t border-border-subtle p-4 flex-shrink-0">
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
      <div className="border rounded-sm bg-surface-panel border-border">
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
          className="border-2 border-b-0 rounded-t-sm shadow-lg mb-0 transition-all duration-300 ease-in-out bg-surface-panel border-border w-full"
          style={{ height: '500px' }}
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
        className="w-full border-2 border-b-0 rounded-t-sm px-6 py-4 flex items-center gap-2 bg-surface-panel border-border"
      >
        <FontAwesomeIcon
          icon={isExpanded ? faChevronDown : faChevronUp}
          className="text-xs text-content-on-dark"
        />
        <span className="font-semibold text-sm font-[family-name:var(--font-metamorphous)] text-content-on-dark">
          Friends
        </span>
        {friendRequests.length > 0 && (
          <span className="px-1.5 py-0.5 rounded-sm text-xs font-semibold bg-feedback-error text-content-accent">
            {friendRequests.length}
          </span>
        )}
      </button>
    </div>
  )
}
