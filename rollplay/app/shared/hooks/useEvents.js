/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useEffect, useRef, useState } from 'react'
import { authFetch } from '@/app/shared/utils/authFetch'

export const useEvents = (userId, handlers) => {
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const reconnectAttemptsRef = useRef(0)
  const MAX_RECONNECT_ATTEMPTS = 5

  const getAuthToken = async () => {
    try {
      // Fetch token from backend endpoint (extracts from httpOnly cookie)
      const response = await authFetch('/api/users/ws-token', {
        credentials: 'include'
      })

      if (!response.ok) {
        console.warn('Failed to get WebSocket token:', response.status)
        return null
      }

      const data = await response.json()
      return data.token
    } catch (error) {
      console.error('Error fetching WebSocket token:', error)
      return null
    }
  }

  const connect = async () => {
    const token = await getAuthToken()
    if (!token) {
      console.warn('No auth token, cannot connect to events WebSocket')
      return
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws/events`

    console.log('Connecting to events WebSocket...')
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      console.log('Events WebSocket opened, sending auth...')

      ws.send(JSON.stringify({
        event_type: 'authenticate',
        data: { token }
      }))
    }

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data)
      const { event_type, data } = message

      console.log(`Event received: ${event_type}`, data)

      if (event_type === 'connected') {
        console.log('Events WebSocket authenticated and connected')
        setIsConnected(true)
        reconnectAttemptsRef.current = 0

        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current)
          reconnectTimerRef.current = null
        }
        return
      }

      if (event_type === 'pong') {
        return
      }

      if (handlers[event_type]) {
        handlers[event_type](message)
      } else {
        console.warn(`No handler for event type: ${event_type}`)
      }
    }

    ws.onerror = (error) => {
      console.error('Events WebSocket error:', error)
    }

    ws.onclose = (event) => {
      console.log(`Events WebSocket closed: ${event.code} - ${event.reason}`)
      setIsConnected(false)
      wsRef.current = null

      if (event.code === 1008) {
        console.error('Authentication failed:', event.reason)
        return
      }

      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000)
        console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/${MAX_RECONNECT_ATTEMPTS})`)

        reconnectTimerRef.current = setTimeout(() => {
          reconnectAttemptsRef.current += 1
          connect()
        }, delay)
      } else {
        console.error('Max reconnection attempts reached')
      }
    }

    wsRef.current = ws
  }

  useEffect(() => {
    if (userId) {
      connect()
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
    }
  }, [userId])

  useEffect(() => {
    const interval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ event_type: 'ping' }))
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [])

  return { isConnected, ws: wsRef.current }
}
