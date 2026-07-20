/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Transition, Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faUserGroup, faBell, faRightToBracket, faCheck, faUserPlus, faXmark, faCopy } from '@fortawesome/free-solid-svg-icons'
import { ToastNotification } from './ToastNotification'
import { formatPanelMessage, getNavigationTab } from '../config/eventConfig'
import { formatRelativeTime } from '../utils/formatTime'
import { getSeatColorHex } from '@/app/utils/seatColors'
import { Button } from '@/app/dashboard/components/shared/Button'
import { useFriendships } from '@/app/dashboard/hooks/useFriendships'
import { useCampaigns } from '@/app/dashboard/hooks/useCampaigns'
import { useNotifications } from '@/app/dashboard/hooks/useNotifications'
import { useMarkNotificationRead, useMarkAllNotificationsRead } from '@/app/dashboard/hooks/mutations/useNotificationMutations'
import { useBuzzFriend, useInviteToCampaign, useAcceptFriendRequest, useDeclineFriendRequest, useSendFriendRequest } from '@/app/dashboard/hooks/mutations/useFriendshipMutations'
import { useAcceptInvite, useDeclineInvite } from '@/app/dashboard/hooks/mutations/useCampaignMutations'
import { useAccountLookup, isValidAccountIdentifier } from '@/app/dashboard/hooks/useAccountLookup'

const BUZZ_COOLDOWN_MS = 20000

/**
 * SocialPanel — the single social surface for the authenticated shell.
 *
 * One CTA (people icon + unread badge) opening a floating card that UNFOLDS
 * from the trigger (fade + scale, origin top-right — deliberately not an
 * edge-slide, so the geometry holds on ultrawide where the header/content
 * column doesn't reach the viewport edge). Sections top-to-bottom:
 * Friends (presence + in-session Enter + buzz + campaign invite),
 * Requests (accept/decline), Notifications (navigate/mark-read + inline
 * accept/decline for invites and friend requests).
 *
 * Replaces NotificationBell (this component inherits the toast anchor) and
 * the dashboard's bottom-right FriendsWidget. Mounted once in the persistent
 * (authenticated) layout, so open state survives tab navigation — closed
 * only by the CTA, the ✕, or Escape (no click-away: it's a non-modal
 * companion, not a menu).
 */
export default function SocialPanel({ user, toasts = [], onDismissToast }) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [buzzCooldowns, setBuzzCooldowns] = useState({})
  const [cooldownProgress, setCooldownProgress] = useState({})
  const [isAddingFriend, setIsAddingFriend] = useState(false)
  const [friendCode, setFriendCode] = useState('')
  const [sendError, setSendError] = useState(null)
  const [sentToName, setSentToName] = useState(null)
  const [copiedTag, setCopiedTag] = useState(false)
  const userId = user?.id

  const { data: friendshipData, isLoading: friendsLoading } = useFriendships({ enabled: !!userId })
  const friends = friendshipData?.accepted || []
  const friendRequests = friendshipData?.incoming_requests || []

  const { data: campaignData } = useCampaigns(userId, { enabled: !!userId })
  const hostedCampaigns = (campaignData?.campaigns || []).filter(campaign => campaign.host_id === userId)

  const { data: notifications = [] } = useNotifications(userId)
  const unreadNotifications = notifications.filter(notification => !notification.read)

  const markReadMutation = useMarkNotificationRead()
  const markAllReadMutation = useMarkAllNotificationsRead()
  const buzzMutation = useBuzzFriend()
  const inviteMutation = useInviteToCampaign()
  const acceptFriendMutation = useAcceptFriendRequest()
  const declineFriendMutation = useDeclineFriendRequest()
  const acceptInviteMutation = useAcceptInvite()
  const declineInviteMutation = useDeclineInvite()
  const sendRequestMutation = useSendFriendRequest()

  // Type-ahead lookup for the inline add-friend flow (shared with FriendsManager)
  const { matchedUser, isLooking, lookupError } = useAccountLookup(isAddingFriend ? friendCode : '')

  // CTA badge = things needing a human: unread notifications + pending requests
  const badgeCount = unreadNotifications.length + friendRequests.length

  // "Friend is at a live table I'm part of" — derived entirely from the
  // campaigns cache (members + sessions are already merged there). Mutual
  // campaigns only: sessions outside shared campaigns aren't joinable anyway.
  const liveSessionByFriendId = useMemo(() => {
    const map = {}
    for (const campaign of campaignData?.campaigns || []) {
      const liveSession = campaign.sessions?.find(session => session.status === 'active')
      if (!liveSession) continue
      const memberIds = campaign.member_ids || campaign.player_ids || []
      for (const memberId of memberIds) {
        if (!map[memberId]) map[memberId] = { campaignTitle: campaign.title, session: liveSession }
      }
    }
    return map
  }, [campaignData])

  const onlineCount = friends.filter(friend => friend.is_online).length

  // Escape closes; listener only lives while open
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  // Buzz radial cooldown animation (ported from FriendsWidget)
  useEffect(() => {
    const activeCooldowns = Object.keys(buzzCooldowns)
    if (activeCooldowns.length === 0) return

    // Track the LATEST scheduled frame so cleanup cancels whichever one is
    // pending — the loop reschedules recursively, so capturing only the first
    // id would leave later frames firing setState after unmount.
    let frameId = requestAnimationFrame(function animate() {
      const now = Date.now()
      const newProgress = {}
      let hasActive = false

      activeCooldowns.forEach(friendId => {
        const startTime = buzzCooldowns[friendId]
        if (startTime) {
          const elapsed = now - startTime
          const progress = Math.min((elapsed / BUZZ_COOLDOWN_MS) * 100, 100)
          newProgress[friendId] = progress
          if (progress < 100) hasActive = true
        }
      })

      setCooldownProgress(newProgress)

      if (hasActive) {
        frameId = requestAnimationFrame(animate)
      } else {
        setBuzzCooldowns({})
        setCooldownProgress({})
      }
    })

    return () => cancelAnimationFrame(frameId)
  }, [buzzCooldowns])

  const handleBuzz = async (friendId) => {
    if (buzzCooldowns[friendId]) return
    try {
      await buzzMutation.mutateAsync(friendId)
      setBuzzCooldowns(previous => ({ ...previous, [friendId]: Date.now() }))
      setCooldownProgress(previous => ({ ...previous, [friendId]: 0 }))
    } catch (error) {
      console.error('Buzz error:', error.message)
    }
  }

  const handleEnterSession = (session) => {
    setIsOpen(false)
    router.push(`/game?room_id=${session.active_game_id || session.id}`)
  }

  const handleNotificationNavigate = (notification) => {
    markReadMutation.mutate(notification.id)
    setIsOpen(false)
    const tab = getNavigationTab(notification.event_type)
    if (!tab) return
    if (tab === 'campaigns' && notification.data?.campaign_id) {
      if (notification.event_type === 'campaign_invite_received') {
        router.push(`/dashboard?tab=${tab}&invite_campaign_id=${notification.data.campaign_id}`)
      } else {
        router.push(`/dashboard?tab=${tab}&expand_campaign_id=${notification.data.campaign_id}`)
      }
    } else {
      router.push(`/dashboard?tab=${tab}`)
    }
  }

  // Inline actions on actionable notifications. On failure (e.g. stale
  // invite already handled elsewhere) we still mark the row read — the
  // moment has passed and the row shouldn't keep demanding attention.
  const handleInviteAction = async (notification, accept) => {
    const campaignId = notification.data?.campaign_id
    try {
      if (accept) {
        await acceptInviteMutation.mutateAsync(campaignId)
      } else {
        await declineInviteMutation.mutateAsync(campaignId)
      }
    } catch (error) {
      console.error('Campaign invite action failed (marking read):', error.message)
    }
    markReadMutation.mutate(notification.id)
  }

  // When a request is handled in the Requests section, retire its matching
  // unread notification too — the badge shouldn't keep nagging about a
  // request that no longer exists. Runs on failure as well (a revoked
  // request's moment has equally passed).
  const resolveRequestNotification = (requesterId) => {
    const matching = notifications.find(
      notification =>
        notification.event_type === 'friend_request_received' &&
        !notification.read &&
        String(notification.data?.requester_id) === String(requesterId)
    )
    if (matching) markReadMutation.mutate(matching.id)
  }

  const handleAcceptRequest = async (requesterId) => {
    try {
      await acceptFriendMutation.mutateAsync(requesterId)
    } catch (error) {
      console.error('Error accepting friend request:', error.message)
    }
    resolveRequestNotification(requesterId)
  }

  const handleDeclineRequest = async (requesterId) => {
    try {
      await declineFriendMutation.mutateAsync(requesterId)
    } catch (error) {
      console.error('Error declining friend request:', error.message)
    }
    resolveRequestNotification(requesterId)
  }

  const handleCopyOwnTag = async () => {
    if (!user?.account_identifier) return
    await navigator.clipboard.writeText(user.account_identifier)
    setCopiedTag(true)
    setTimeout(() => setCopiedTag(false), 2000)
  }

  const handleSendFriendRequest = async () => {
    const identifier = friendCode.trim()
    if (!identifier) return
    try {
      setSendError(null)
      await sendRequestMutation.mutateAsync(identifier)
      setSentToName(matchedUser?.screen_name || identifier)
      setFriendCode('')
    } catch (error) {
      setSentToName(null)
      setSendError(error.message)
    }
  }

  const handleCancelAddFriend = () => {
    setIsAddingFriend(false)
    setFriendCode('')
    setSendError(null)
    setSentToName(null)
  }

  // Stable per-friend disc tint from the seat palette (friend character
  // colors aren't in the friendships response; hash keeps it varied and
  // consistent without a backend round trip)
  const discColorFor = (friendId) => {
    let hash = 0
    for (const char of String(friendId)) hash = (hash + char.charCodeAt(0)) % 8
    return getSeatColorHex(hash)
  }

  const sectionLabelClass = 'px-4 pt-4 pb-2 text-[11px] font-semibold uppercase tracking-widest text-content-secondary flex items-center gap-2'

  return (
    <div className="relative">
      {/* Toast anchor — inherited from the old NotificationBell: toasts grow leftward from the CTA */}
      {toasts.length > 0 && (
        <div className="absolute right-full top-1/2 -translate-y-1/2 mr-3 flex flex-row-reverse items-center">
          {toasts.map((toast) => (
            <ToastNotification
              key={toast.id}
              id={toast.id}
              type={toast.type}
              message={toast.message}
              duration={toast.duration}
              onDismiss={onDismissToast}
            />
          ))}
        </div>
      )}

      {/* The one CTA */}
      <button
        onClick={() => setIsOpen(open => !open)}
        className="flex items-center text-content-secondary hover:opacity-80 transition-opacity"
        aria-label="Social"
        aria-expanded={isOpen}
        title="Social"
      >
        <FontAwesomeIcon icon={faUserGroup} className="h-7 w-7" />
        {badgeCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-feedback-error text-content-on-dark text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
            {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        )}
      </button>

      {/* Floating card — unfolds from the CTA (origin top-right), never slides */}
      <Transition
        show={isOpen}
        enter="transition duration-200 ease-out"
        enterFrom="opacity-0 scale-95 -translate-y-1"
        enterTo="opacity-100 scale-100 translate-y-0"
        leave="transition duration-150 ease-in"
        leaveFrom="opacity-100 scale-100 translate-y-0"
        leaveTo="opacity-0 scale-95 -translate-y-1"
      >
        <div className="absolute right-0 top-12 z-50 w-96 origin-top-right rounded-xl border border-border bg-surface-secondary shadow-2xl flex flex-col max-h-[calc(100vh-120px)]">

          {/* Panel header */}
          <div className="p-4 border-b border-border flex items-center gap-3">
            <h3 className="font-semibold text-content-on-dark flex-1">Social</h3>
            <span className="flex items-center gap-1.5 text-xs text-content-secondary">
              <span className="w-1.5 h-1.5 rounded-full bg-feedback-success" />
              {onlineCount} online
            </span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-content-secondary hover:text-content-on-dark transition-colors"
              aria-label="Close"
            >
              <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="overflow-y-auto flex-1">

            {/* ── Friends ── */}
            <div className={sectionLabelClass}>Friends <span className="normal-case tracking-normal opacity-60">· {friends.length}</span></div>
            {friendsLoading ? (
              <div className="px-4 pb-3 text-sm text-content-secondary">Loading…</div>
            ) : friends.length === 0 ? (
              <div className="px-4 pb-3 text-sm text-content-secondary">No friends yet</div>
            ) : (
              friends.map(friend => {
                const liveSeat = liveSessionByFriendId[friend.friend_id]
                return (
                  <div
                    key={friend.id}
                    className="flex items-center gap-3 px-4 py-2 hover:bg-interactive-hover/10 transition-colors"
                  >
                    {/* Offline dimming lives on the identity elements, NOT the
                        row container — container opacity would flatten the
                        whole subtree, making the invite dropdown translucent */}
                    <span
                      className={`relative w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-none text-surface-secondary ${!friend.is_online ? 'opacity-60' : ''}`}
                      style={{ backgroundColor: discColorFor(friend.friend_id) }}
                    >
                      {(friend.friend_screen_name || '?')[0].toUpperCase()}
                      <span
                        className={`absolute -right-0.5 -bottom-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface-secondary ${friend.is_online ? 'bg-feedback-success' : 'bg-border'}`}
                      />
                    </span>
                    <span className={`flex-1 min-w-0 ${!friend.is_online ? 'opacity-60' : ''}`}>
                      <span className="block text-sm text-content-on-dark truncate">{friend.friend_screen_name || 'Unknown'}</span>
                      <span className="block text-xs text-content-secondary truncate">
                        {liveSeat
                          ? <>In session · <span className="text-content-on-dark">{liveSeat.campaignTitle}</span></>
                          : friend.is_online ? 'Online' : 'Offline'}
                      </span>
                    </span>
                    {liveSeat && (
                      <Button variant="primary" size="xs" onClick={() => handleEnterSession(liveSeat.session)}>
                        Enter
                      </Button>
                    )}
                    {/* Buzz with radial cooldown (ported from FriendsWidget) */}
                    <button
                      onClick={() => handleBuzz(friend.friend_id)}
                      disabled={!!buzzCooldowns[friend.friend_id]}
                      className="relative w-8 h-8 flex-none flex items-center justify-center rounded-sm transition-colors"
                      title={buzzCooldowns[friend.friend_id] ? 'On cooldown' : 'Buzz friend'}
                    >
                      {buzzCooldowns[friend.friend_id] ? (
                        <>
                          <FontAwesomeIcon icon={faBell} className="text-border opacity-30" />
                          <FontAwesomeIcon
                            icon={faBell}
                            className="absolute inset-0 m-auto text-content-accent"
                            style={{
                              maskImage: `conic-gradient(from 0deg, black ${cooldownProgress[friend.friend_id] || 0}%, transparent ${cooldownProgress[friend.friend_id] || 0}%)`,
                              WebkitMaskImage: `conic-gradient(from 0deg, black ${cooldownProgress[friend.friend_id] || 0}%, transparent ${cooldownProgress[friend.friend_id] || 0}%)`
                            }}
                          />
                        </>
                      ) : (
                        <FontAwesomeIcon icon={faBell} className="text-content-accent" />
                      )}
                    </button>
                    {hostedCampaigns.length > 0 && (
                      <Menu as="div" className="relative flex-none">
                        <MenuButton
                          className="w-8 h-8 flex-none flex items-center justify-center rounded-sm transition-colors text-content-accent hover:opacity-80"
                          title="Invite to campaign"
                        >
                          <FontAwesomeIcon icon={faRightToBracket} />
                        </MenuButton>
                        <MenuItems className="absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded-sm border border-border bg-surface-elevated shadow-lg focus:outline-none">
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
                                  onClick={() => inviteMutation.mutate({ friendId: friend.friend_id, campaignId: campaign.id })}
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
                )
              })
            )}

            {/* ── Requests ── */}
            {friendRequests.length > 0 && (
              <>
                <div className="border-t border-border-subtle mt-2" />
                <div className={sectionLabelClass}>Requests <span className="normal-case tracking-normal opacity-60">· {friendRequests.length} pending</span></div>
                {friendRequests.map(request => (
                  <div key={request.id} className="flex items-center gap-3 px-4 py-2">
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-none text-surface-secondary"
                      style={{ backgroundColor: discColorFor(request.requester_id) }}
                    >
                      {(request.requester_screen_name || '?')[0].toUpperCase()}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-content-on-dark truncate">{request.requester_screen_name || 'Unknown'}</span>
                      <span className="block text-xs text-content-secondary">sent you a friend request</span>
                    </span>
                    <Button variant="success" size="xs" onClick={() => handleAcceptRequest(request.requester_id)}>Accept</Button>
                    <Button variant="ghost" size="xs" onClick={() => handleDeclineRequest(request.requester_id)}>Decline</Button>
                  </div>
                ))}
              </>
            )}

            {/* ── Notifications ── */}
            <div className="border-t border-border-subtle mt-2" />
            <div className={sectionLabelClass}>
              Notifications
              {notifications.length > 0 && (
                <button
                  onClick={() => markAllReadMutation.mutate()}
                  className="ml-auto normal-case tracking-normal font-normal text-feedback-info hover:opacity-80"
                >
                  Mark all read
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <div className="px-4 pb-4 text-sm text-content-secondary">No notifications</div>
            ) : (
              notifications.map(notification => {
                // Campaign invites act inline (no state section for them in
                // the panel); friend-request notifications are deliberately
                // CTA-free — the DB-backed Requests section above is the one
                // action surface, and it reflects revocations correctly.
                const isActionableInvite = notification.event_type === 'campaign_invite_received' && !notification.read
                return (
                  <div
                    key={notification.id}
                    className={`flex border-b border-border-subtle last:border-b-0 ${!notification.read ? 'bg-feedback-info/10' : ''}`}
                  >
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => handleNotificationNavigate(notification)}
                        className="w-full text-left px-4 pt-3 pb-1 hover:bg-interactive-hover/20 transition-colors"
                      >
                        <p className="text-sm text-content-on-dark">{formatPanelMessage(notification, user?.id)}</p>
                        <p className="text-xs text-content-secondary mt-1">{formatRelativeTime(notification.created_at)}</p>
                      </button>
                      {isActionableInvite && (
                        <div className="flex gap-2 px-4 pb-3 pt-1">
                          <Button variant="success" size="xs" onClick={() => handleInviteAction(notification, true)}>
                            Accept
                          </Button>
                          <Button variant="ghost" size="xs" onClick={() => handleInviteAction(notification, false)}>
                            Decline
                          </Button>
                        </div>
                      )}
                    </div>
                    {!notification.read && (
                      <button
                        onClick={(event) => { event.stopPropagation(); markReadMutation.mutate(notification.id) }}
                        className="px-3 flex items-center text-content-secondary hover:text-feedback-success hover:bg-feedback-success/10 transition-colors"
                        aria-label="Mark as read"
                      >
                        <FontAwesomeIcon icon={faCheck} className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* Footer — pinned. Add-friend happens INLINE (same lookup + send
              plumbing as the account page's FriendsManager, via
              useAccountLookup + useSendFriendRequest) instead of routing away
              from the social surface. The reciprocal half — your own tag with
              a copy button — sits beside it, since adding usually starts with
              trading tags. */}
          <div className="border-t border-border-subtle p-3 flex-none">
            {isAddingFriend ? (
              <div>
                <div className="flex gap-2">
                  <input
                    value={friendCode}
                    onChange={(event) => { setFriendCode(event.target.value); setSentToName(null); setSendError(null) }}
                    onKeyDown={(event) => {
                      // Enter sends when the identifier is well-formed; Escape
                      // must not bubble to the panel's close handler
                      if (event.key === 'Enter' && isValidAccountIdentifier(friendCode.trim())) handleSendFriendRequest()
                      if (event.key === 'Escape') { event.stopPropagation(); handleCancelAddFriend() }
                    }}
                    placeholder="name#1234"
                    autoFocus
                    className="flex-1 min-w-0 px-3 py-2 text-sm rounded-sm bg-surface-panel border border-border text-content-on-dark placeholder:text-content-secondary focus:outline-none focus:border-border-active"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!isValidAccountIdentifier(friendCode.trim()) || sendRequestMutation.isPending}
                    onClick={handleSendFriendRequest}
                  >
                    Add
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleCancelAddFriend}>Cancel</Button>
                </div>

                {/* Live lookup feedback / outcome — rendered only when there is
                    something to say, so the footer's height (and the spacing
                    around the input row) matches the resting state exactly */}
                {(sentToName || sendError || isLooking || matchedUser || lookupError) && (
                  <div className="mt-2 text-xs">
                    {sentToName ? (
                      <span className="text-feedback-success">Request sent to {sentToName}</span>
                    ) : sendError ? (
                      <span className="text-feedback-error">{sendError}</span>
                    ) : isLooking ? (
                      <span className="text-content-secondary">Looking up…</span>
                    ) : matchedUser ? (
                      <span className="flex items-center gap-2 text-content-secondary">
                        <span
                          className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold text-surface-secondary"
                          style={{ backgroundColor: discColorFor(matchedUser.id) }}
                        >
                          {(matchedUser.screen_name || '?')[0].toUpperCase()}
                        </span>
                        <span className="text-content-on-dark">{matchedUser.screen_name || 'Unknown'}</span>
                        {matchedUser.account_identifier}
                      </span>
                    ) : (
                      <span className="text-content-secondary">{lookupError}</span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <Button variant="primary" onClick={() => setIsAddingFriend(true)}>
                  <FontAwesomeIcon icon={faUserPlus} className="mr-2" />
                  Add Friend
                </Button>
                {user?.account_identifier && (
                  <button
                    onClick={handleCopyOwnTag}
                    className="flex items-center gap-1.5 text-xs text-content-secondary hover:text-content-on-dark transition-colors"
                    title="Copy your tag to share"
                  >
                    {copiedTag ? 'Copied!' : user.account_identifier}
                    <FontAwesomeIcon icon={faCopy} className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </Transition>
    </div>
  )
}
