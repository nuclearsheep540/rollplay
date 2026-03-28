/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useCallback, useEffect } from 'react'

function getFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement
}

/**
 * Cross-browser fullscreen toggle hook.
 *
 * Tracks fullscreen state via fullscreenchange events — stays in sync
 * regardless of whether fullscreen was entered/exited by our button,
 * the browser menu, or the Escape key.
 *
 * Uses { navigationUI: 'hide' } to request toolbar hiding in Chrome/Safari.
 * Falls back to webkit-prefixed API for older Safari.
 */
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const handleChange = () => {
      setIsFullscreen(Boolean(getFullscreenElement()))
    }

    // Initialize from current state in case we mounted while already fullscreen
    handleChange()

    document.addEventListener('fullscreenchange', handleChange)
    document.addEventListener('webkitfullscreenchange', handleChange)

    return () => {
      document.removeEventListener('fullscreenchange', handleChange)
      document.removeEventListener('webkitfullscreenchange', handleChange)
    }
  }, [])

  const toggleFullscreen = useCallback(async () => {
    try {
      if (getFullscreenElement()) {
        if (document.exitFullscreen) {
          await document.exitFullscreen()
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen()
        }
      } else {
        const el = document.documentElement
        if (el.requestFullscreen) {
          await el.requestFullscreen({ navigationUI: 'hide' })
        } else if (el.webkitRequestFullscreen) {
          el.webkitRequestFullscreen()
        }
      }
    } catch (error) {
      console.warn('Failed to toggle fullscreen:', error)
    }
  }, [])

  return { isFullscreen, toggleFullscreen }
}
