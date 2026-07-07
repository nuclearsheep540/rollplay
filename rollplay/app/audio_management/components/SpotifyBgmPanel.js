/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useState } from 'react'
import { authFetch } from '@/app/shared/utils/authFetch'
import { THEME } from '@/app/styles/colorTheme'

const SPOTIFY_GREEN = '#1DB954'

/**
 * DM-only Spotify BGM control surface, rendered inside the audio tab.
 *
 * Control is server-authoritative: buttons call sendSpotifyControl(...) which
 * goes over the WS; the server re-broadcasts `spotify_state` to everyone (incl.
 * this client), and the SDK reacts. So the UI reflects `spotify.nowPlaying`
 * (the last applied snapshot), not optimistic local state.
 *
 * @param {(action: string, payload?: object) => void} sendSpotifyControl
 * @param {{status: string, profile: object|null, nowPlaying: object|null}} spotify
 */
export default function SpotifyBgmPanel({ sendSpotifyControl, spotify }) {
  const { status, nowPlaying } = spotify || {}
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(null)

  const runSearch = async () => {
    const q = query.trim()
    if (!q) return
    setSearching(true)
    setError(null)
    try {
      const res = await authFetch(`/api/spotify/search?q=${encodeURIComponent(q)}&limit=15`, { credentials: 'include' })
      if (!res.ok) { setError('Search failed'); setResults([]); return }
      const data = await res.json()
      setResults(data.tracks || [])
    } catch {
      setError('Search failed')
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  // Every control click also activates the SDK's audio element (browser autoplay
  // unlock) — playback itself fires later via the WS round-trip, off-gesture.
  const control = (action, payload) => {
    spotify?.activate?.()
    sendSpotifyControl?.(action, payload)
  }

  const selectTrack = (t) => {
    control('select', {
      track_uri: t.uri,
      track_meta: { name: t.name, artist: t.artist, art_url: t.art_url, duration_ms: t.duration_ms },
    })
  }

  // --- Gating: only a connected Premium account can drive playback ---
  if (status !== 'ready') {
    const message = {
      idle: 'Starting Spotify…',
      connecting: 'Connecting to Spotify…',
      not_connected: 'Connect your Spotify account on the Account page to use Spotify BGM.',
      not_premium: 'Spotify Premium is required to play music through the app.',
      error: 'Spotify could not start. Try reconnecting on the Account page.',
    }[status] || 'Spotify unavailable.'
    return (
      <div className="p-3 rounded-sm border" style={{ borderColor: THEME.borderSubtle, backgroundColor: THEME.bgSecondary }}>
        <p className="text-sm" style={{ color: THEME.textSecondary }}>{message}</p>
      </div>
    )
  }

  const meta = nowPlaying?.track_meta
  const state = nowPlaying?.playback_state

  return (
    <div className="flex flex-col gap-3">
      {/* Now playing */}
      {meta && (
        <div className="flex items-center gap-3 p-2 rounded-sm border" style={{ borderColor: THEME.borderSubtle, backgroundColor: THEME.bgSecondary }}>
          {meta.art_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={meta.art_url} alt="" className="w-12 h-12 rounded object-cover" />
          ) : (
            <div className="w-12 h-12 rounded" style={{ backgroundColor: `${SPOTIFY_GREEN}33` }} />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: THEME.textOnDark }}>{meta.name}</p>
            <p className="text-xs truncate" style={{ color: THEME.textSecondary }}>{meta.artist}</p>
          </div>
          <div className="flex items-center gap-2">
            {state === 'playing' ? (
              <button onClick={() => control('pause')} className="px-3 py-1 rounded-full text-sm font-semibold" style={{ backgroundColor: SPOTIFY_GREEN, color: '#000' }}>Pause</button>
            ) : (
              <button onClick={() => control('play')} className="px-3 py-1 rounded-full text-sm font-semibold" style={{ backgroundColor: SPOTIFY_GREEN, color: '#000' }}>Play</button>
            )}
            <button onClick={() => control('stop')} className="px-3 py-1 rounded-full text-sm font-medium border" style={{ borderColor: THEME.borderDefault, color: THEME.textSecondary }}>Stop</button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') runSearch() }}
          placeholder="Search Spotify for a track…"
          className="flex-1 px-3 py-2 rounded-sm border text-sm focus:outline-none"
          style={{ backgroundColor: THEME.bgSecondary, borderColor: THEME.borderDefault, color: THEME.textOnDark }}
        />
        <button
          onClick={runSearch}
          disabled={searching || !query.trim()}
          className="px-4 py-2 rounded-sm text-sm font-semibold disabled:opacity-50"
          style={{ backgroundColor: SPOTIFY_GREEN, color: '#000' }}
        >
          {searching ? '…' : 'Search'}
        </button>
      </div>

      {error && <p className="text-xs" style={{ color: '#fca5a5' }}>{error}</p>}

      {/* Results */}
      {results.length > 0 && (
        <div className="max-h-64 overflow-y-auto flex flex-col gap-1">
          {results.map((t) => (
            <button
              key={t.uri}
              onClick={() => selectTrack(t)}
              className="flex items-center gap-2 p-2 rounded-sm text-left hover:opacity-80 transition-opacity border"
              style={{ borderColor: THEME.borderSubtle, backgroundColor: THEME.bgSecondary }}
            >
              {t.art_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.art_url} alt="" className="w-9 h-9 rounded object-cover" />
              ) : (
                <div className="w-9 h-9 rounded" style={{ backgroundColor: `${SPOTIFY_GREEN}33` }} />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate" style={{ color: THEME.textOnDark }}>{t.name}</p>
                <p className="text-xs truncate" style={{ color: THEME.textSecondary }}>{t.artist}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
