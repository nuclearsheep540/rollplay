/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useState } from 'react'
import { THEME } from '@/app/styles/colorTheme'
import { tryOpenInSafari } from '@/app/shared/utils/platform'

const SPOTIFY_GREEN = '#1DB954'

/**
 * Shown to players on non-Safari iOS browsers when the session is actively playing
 * Spotify: those browsers have no DRM, so in-browser Spotify audio is impossible —
 * Safari is the only iOS browser Apple grants FairPlay. Everything else about the
 * session still works; this gates the Spotify feature only.
 *
 * "Open in Safari" uses an undocumented URL scheme that may silently no-op on some
 * iOS versions, so a copy-link fallback sits next to it.
 */
export default function SpotifyUnsupportedNotice() {
  const [dismissed, setDismissed] = useState(false)
  const [copied, setCopied] = useState(false)

  if (dismissed) return null

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable — the address bar still exists */ }
  }

  return (
    <div
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[95] w-[92%] max-w-md rounded-lg border shadow-lg px-4 py-3"
      style={{ backgroundColor: THEME.bgSecondary, borderColor: THEME.borderSubtle }}
    >
      <div className="flex items-start gap-3">
        <span className="text-lg leading-none mt-0.5">🎵</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: THEME.textBold }}>
            Spotify audio needs Safari on this device
          </p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: THEME.textSecondary }}>
            This browser can&apos;t play Spotify on iPad/iPhone. Reopen the session in Safari
            to hear the DM&apos;s music — everything else works right here.
          </p>
          <div className="flex gap-2 mt-2.5">
            <button
              onClick={tryOpenInSafari}
              className="px-3 py-1 rounded-full text-xs font-semibold hover:opacity-90"
              style={{ backgroundColor: SPOTIFY_GREEN, color: '#000' }}
            >
              Open in Safari
            </button>
            <button
              onClick={copyLink}
              className="px-3 py-1 rounded-full text-xs font-medium border hover:opacity-80"
              style={{ borderColor: THEME.borderSubtle, color: THEME.textSecondary }}
            >
              {copied ? 'Copied ✓' : 'Copy link'}
            </button>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          title="Dismiss"
          className="text-sm opacity-60 hover:opacity-100 px-1"
          style={{ color: THEME.textSecondary }}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
