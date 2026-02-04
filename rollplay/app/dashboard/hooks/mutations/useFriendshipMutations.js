/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useMutation, useQueryClient } from '@tanstack/react-query'

/**
 * Mutation hook for buzzing a friend.
 * Replaces: handleBuzz() in FriendsWidget
 *
 * No cache invalidation — cooldown is purely local UI state.
 */
export function useBuzzFriend() {
  return useMutation({
    mutationFn: async (friendId) => {
      const response = await fetch(`/api/friendships/${friendId}/buzz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })

      if (!response.ok && response.status !== 204) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to buzz friend')
      }

      return friendId
    },
  })
}

/**
 * Mutation hook for inviting a friend to a campaign.
 * Replaces: handleInviteToCampaign() in FriendsWidget
 */
export function useInviteToCampaign() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ friendId, campaignId }) => {
      const response = await fetch(`/api/campaigns/${campaignId}/players/${friendId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to invite to campaign')
      }

      return { friendId, campaignId }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })
}

/**
 * Mutation hook for accepting a friend request.
 * Replaces: handleAcceptRequest() in FriendsWidget + acceptFriendRequest() in FriendsManager
 */
export function useAcceptFriendRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (requesterId) => {
      const response = await fetch(`/api/friendships/${requesterId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to accept friend request')
      }

      return requesterId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friendships'] })
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] })
    },
  })
}

/**
 * Mutation hook for declining a friend request.
 * Replaces: handleDeclineRequest() in FriendsWidget + rejectFriendRequest() in FriendsManager
 *
 * Backend uses DELETE method: DELETE /api/friendships/{requesterId}/decline
 */
export function useDeclineFriendRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (requesterId) => {
      const response = await fetch(`/api/friendships/${requesterId}/decline`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to decline friend request')
      }

      return requesterId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friendships'] })
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] })
    },
  })
}

/**
 * Mutation hook for sending a friend request.
 * Replaces: sendFriendRequest() in FriendsManager
 */
export function useSendFriendRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (friendIdentifier) => {
      const response = await fetch('/api/friendships/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ friend_identifier: friendIdentifier }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to send friend request')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friendships'] })
    },
  })
}

/**
 * Mutation hook for removing a friend.
 * Replaces: removeFriend() in FriendsManager
 */
export function useRemoveFriend() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (friendId) => {
      const response = await fetch(`/api/friendships/${friendId}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to remove friend')
      }

      return friendId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friendships'] })
    },
  })
}
