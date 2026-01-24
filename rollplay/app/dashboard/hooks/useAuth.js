/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { authFetch, authPut } from '@/app/shared/utils/authFetch'
import { useTokenRefresh } from '@/app/shared/hooks/useTokenRefresh'

export function useAuth() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [screenName, setScreenName] = useState('')
  const [updatingScreenName, setUpdatingScreenName] = useState(false)
  const [showScreenNameModal, setShowScreenNameModal] = useState(false)

  // Proactive token refresh - only active when user is authenticated
  useTokenRefresh(user !== null)

  // Update screen name
  const updateScreenName = async () => {
    if (!screenName.trim()) return

    setUpdatingScreenName(true)
    setError(null)

    try {
      const response = await authPut('/api/users/screen_name', {
        screen_name: screenName.trim()
      })

      if (response.ok) {
        const updatedUser = await response.json()
        setUser(updatedUser)
        setShowScreenNameModal(false)
        setScreenName('')
      } else {
        const errorData = await response.json()
        setError(errorData.detail || 'Failed to update screen name')
      }
    } catch (error) {
      console.error('Error updating screen name:', error)
      setError('Failed to update screen name')
    } finally {
      setUpdatingScreenName(false)
    }
  }

  // Handle logout
  const handleLogout = async () => {
    try {
      // Call backend logout endpoint to clear httpOnly cookie
      await fetch('/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include' // Include httpOnly cookies
      })
    } catch (error) {
      console.error('Logout error:', error)
    }
    
    // Redirect regardless of API success
    router.push('/')
  }

  // Check authentication and get user data
  useEffect(() => {
    const checkAuthenticationAndGetUser = async () => {
      try {
        // Get or create user from api-site (this validates auth and gets user data)
        // authFetch handles 401 with automatic token refresh
        const userResponse = await authFetch('/api/users/get_current_user', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        })

        if (userResponse.ok) {
          const userData = await userResponse.json()
          setUser(userData)

          // Check if user needs to set a screen name
          if (!userData.screen_name) {
            setShowScreenNameModal(true)
          }

          setLoading(false)
          return
        }

        // If still 401 after refresh attempt, redirect to login
        // (authFetch handles the redirect, but just in case)
        if (userResponse.status === 401) {
          router.push('/auth/magic')
          return
        }

        // Other errors
        router.push('/auth/magic')

      } catch (error) {
        console.error('Auth/user check error:', error)
        router.push('/auth/magic')
      }
    }

    checkAuthenticationAndGetUser()
  }, [router])

  return {
    user,
    setUser,
    loading,
    error,
    screenName,
    setScreenName,
    updatingScreenName,
    showScreenNameModal,
    setShowScreenNameModal,
    updateScreenName,
    handleLogout,
    setError
  }
}