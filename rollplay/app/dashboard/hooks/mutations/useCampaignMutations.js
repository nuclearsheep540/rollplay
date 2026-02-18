/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authFetch } from '@/app/shared/utils/authFetch'

/**
 * Mutation hook for creating a campaign.
 * Replaces: createCampaign() in CampaignManager
 */
export function useCreateCampaign() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ title, description, heroImage, sessionName }) => {
      const campaignData = {
        title: title.trim(),
        description: description?.trim() || `Campaign created on ${new Date().toLocaleDateString()}`,
        hero_image: heroImage || null,
        session_name: sessionName?.trim() || null,
      }

      const response = await authFetch('/api/campaigns/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(campaignData),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to create campaign')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })
}

/**
 * Mutation hook for updating an existing campaign.
 * Replaces: updateCampaign() in CampaignManager
 */
export function useUpdateCampaign() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ campaignId, title, description, heroImage, sessionName }) => {
      const campaignData = {
        title: title.trim(),
        description: description?.trim() || null,
        hero_image: heroImage || null,
        session_name: sessionName?.trim() || null,
      }

      const response = await authFetch(`/api/campaigns/${campaignId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(campaignData),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to update campaign')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })
}

/**
 * Mutation hook for deleting a campaign.
 * Replaces: confirmDeleteCampaign() in CampaignManager
 */
export function useDeleteCampaign() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (campaignId) => {
      const response = await authFetch(`/api/campaigns/${campaignId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to delete campaign')
      }

      return campaignId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })
}

/**
 * Mutation hook for accepting a campaign invite.
 * Replaces: acceptCampaignInvite() in CampaignManager
 */
export function useAcceptInvite() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (campaignId) => {
      const response = await authFetch(`/api/campaigns/${campaignId}/invites/accept`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to accept invite')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })
}

/**
 * Mutation hook for declining a campaign invite.
 * Replaces: declineCampaignInvite() in CampaignManager
 */
export function useDeclineInvite() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (campaignId) => {
      const response = await authFetch(`/api/campaigns/${campaignId}/invites`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to decline invite')
      }

      return campaignId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })
}

/**
 * Mutation hook for leaving a campaign (non-host player).
 * Replaces: leaveCampaign() in CampaignManager
 */
export function useLeaveCampaign() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (campaignId) => {
      const response = await authFetch(`/api/campaigns/${campaignId}/leave`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to leave campaign')
      }

      return campaignId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })
}

/**
 * Mutation hook for removing a player from a campaign (host only).
 * Replaces: removePlayerFromCampaign() in CampaignManager
 */
export function useRemovePlayer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ campaignId, playerId }) => {
      const response = await authFetch(
        `/api/campaigns/${campaignId}/players/${playerId}`,
        {
          method: 'DELETE',
          credentials: 'include',
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to remove player')
      }

      return { campaignId, playerId }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })
}
