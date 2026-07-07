/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useState, useEffect } from 'react'
import { authFetch } from '@/app/shared/utils/authFetch'
import { THEME } from '@/app/styles/colorTheme'

const SPOTIFY_GREEN = '#1DB954'

function fmt(ms) {
  if (!ms || ms < 0) return '0:00'
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * DM-only Spotify BGM control surface (rendered in the audio tab).
 *
 * The DM's client is the leader: these controls drive its own SDK via the hook
 * (playTrack / playContext / next / previous / seek / togglePlay), and the hook
 * reports the resulting state up so the server broadcasts it to everyone.
 *
 * @param {object} spotify  the useSpotifyPlayback() return (status, playbackState, controls…)
 */
export default function SpotifyBgmPanel({ spotify }) {
  const { status, playbackState } = spotify || {}
  const [tab, setTab] = useState('search') // 'search' | 'playlists'
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [playlists, setPlaylists] = useState([])
  const [loadingPlaylists, setLoadingPlaylists] = useState(false)
  const [error, setError] = useState(null)

  // Seek-bar drag state
  const [seeking, setSeeking] = useState(false)
  const [seekValue, setSeekValue] = useState(0)

  // Lazy-load the DM's playlists the first time the tab is opened.
  useEffect(() => {
    if (tab !== 'playlists' || playlists.length || loadingPlaylists) return
    let cancelled = false
    ;(async () => {
      setLoadingPlaylists(true)
      setError(null)
      try {
        const res = await authFetch('/api/spotify/playlists?limit=50', { credentials: 'include' })
        if (!res.ok) { setError(res.status === 403 ? 'Reconnect Spotify to grant playlist access' : 'Could not load playlists'); return }
        const data = await res.json()
        if (!cancelled) setPlaylists(data.playlists || [])
      } catch {
        if (!cancelled) setError('Could not load playlists')
      } finally {
        if (!cancelled) setLoadingPlaylists(false)
      }
    })()
    return () => { cancelled = true }
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  const runSearch = async () => {
    const q = query.trim()
    if (!q) return
    setSearching(true); setError(null)
    try {
      const res = await authFetch(`/api/spotify/search?q=${encodeURIComponent(q)}&limit=15`, { credentials: 'include' })
      if (!res.ok) { setError('Search failed'); setResults([]); return }
      const data = await res.json()
      setResults(data.tracks || [])
    } catch {
      setError('Search failed'); setResults([])
    } finally {
      setSearching(false)
    }
  }

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

  const ps = playbackState
  const duration = ps?.duration || 0
  const position = seeking ? seekValue : (ps?.position || 0)
  const isPlaying = ps && !ps.paused

  return (
    <div className="flex flex-col gap-3">
      {/* Now playing + transport */}
      {ps?.trackName && (
        <div className="p-3 rounded-sm border" style={{ borderColor: THEME.borderSubtle, backgroundColor: THEME.bgSecondary }}>
          <div className="flex items-center gap-3">
            {ps.artUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ps.artUrl} alt="" className="w-12 h-12 rounded object-cover" />
            ) : (
              <div className="w-12 h-12 rounded" style={{ backgroundColor: `${SPOTIFY_GREEN}33` }} />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: THEME.textOnDark }}>{ps.trackName}</p>
              <p className="text-xs truncate" style={{ color: THEME.textSecondary }}>{ps.artist}</p>
            </div>
          </div>

          {/* Seek bar */}
          <div className="flex items-center gap-2 mt-3">
            <span className="text-[10px] tabular-nums" style={{ color: THEME.textSecondary }}>{fmt(position)}</span>
            <input
              type="range"
              min={0}
              max={duration || 1}
              value={position}
              onChange={(e) => { setSeeking(true); setSeekValue(Number(e.target.value)) }}
              onMouseUp={() => { spotify.seek?.(seekValue); setSeeking(false) }}
              onTouchEnd={() => { spotify.seek?.(seekValue); setSeeking(false) }}
              className="flex-1 h-1 accent-[color:var(--spotify-green,#1DB954)]"
              style={{ accentColor: SPOTIFY_GREEN }}
            />
            <span className="text-[10px] tabular-nums" style={{ color: THEME.textSecondary }}>{fmt(duration)}</span>
          </div>

          {/* Transport */}
          <div className="flex items-center justify-center gap-4 mt-2">
            <button onClick={() => spotify.previous?.()} title="Previous" className="text-lg hover:opacity-80" style={{ color: THEME.textOnDark }}>⏮</button>
            <button
              onClick={() => spotify.togglePlay?.()}
              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
              style={{ backgroundColor: SPOTIFY_GREEN, color: '#000' }}
            >
              {isPlaying ? '❚❚' : '▶'}
            </button>
            <button onClick={() => spotify.next?.()} title="Next" className="text-lg hover:opacity-80" style={{ color: THEME.textOnDark }}>⏭</button>
          </div>
        </div>
      )}

      {/* Source tabs */}
      <div className="flex gap-2 text-sm">
        {['search', 'playlists'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-3 py-1 rounded-full font-medium capitalize"
            style={tab === t
              ? { backgroundColor: SPOTIFY_GREEN, color: '#000' }
              : { backgroundColor: THEME.bgSecondary, color: THEME.textSecondary, border: `1px solid ${THEME.borderDefault}` }}
          >
            {t === 'playlists' ? 'Your Playlists' : 'Search'}
          </button>
        ))}
      </div>

      {error && <p className="text-xs" style={{ color: '#fca5a5' }}>{error}</p>}

      {/* Search */}
      {tab === 'search' && (
        <>
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
            <button onClick={runSearch} disabled={searching || !query.trim()} className="px-4 py-2 rounded-sm text-sm font-semibold disabled:opacity-50" style={{ backgroundColor: SPOTIFY_GREEN, color: '#000' }}>
              {searching ? '…' : 'Search'}
            </button>
          </div>
          {results.length > 0 && (
            <div className="max-h-56 overflow-y-auto flex flex-col gap-1">
              {results.map((t) => (
                <button key={t.uri} onClick={() => spotify.playTrack?.(t.uri)} className="flex items-center gap-2 p-2 rounded-sm text-left hover:opacity-80 border" style={{ borderColor: THEME.borderSubtle, backgroundColor: THEME.bgSecondary }}>
                  {t.art_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={t.art_url} alt="" className="w-9 h-9 rounded object-cover" />
                    : <div className="w-9 h-9 rounded" style={{ backgroundColor: `${SPOTIFY_GREEN}33` }} />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate" style={{ color: THEME.textOnDark }}>{t.name}</p>
                    <p className="text-xs truncate" style={{ color: THEME.textSecondary }}>{t.artist}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Playlists */}
      {tab === 'playlists' && (
        <div className="max-h-56 overflow-y-auto flex flex-col gap-1">
          {loadingPlaylists && <p className="text-xs" style={{ color: THEME.textSecondary }}>Loading playlists…</p>}
          {!loadingPlaylists && playlists.length === 0 && !error && <p className="text-xs" style={{ color: THEME.textSecondary }}>No playlists found.</p>}
          {playlists.map((p) => (
            <button key={p.id} onClick={() => spotify.playContext?.(p.uri)} className="flex items-center gap-2 p-2 rounded-sm text-left hover:opacity-80 border" style={{ borderColor: THEME.borderSubtle, backgroundColor: THEME.bgSecondary }}>
              {p.image_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={p.image_url} alt="" className="w-9 h-9 rounded object-cover" />
                : <div className="w-9 h-9 rounded" style={{ backgroundColor: `${SPOTIFY_GREEN}33` }} />}
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate" style={{ color: THEME.textOnDark }}>{p.name}</p>
                <p className="text-xs truncate" style={{ color: THEME.textSecondary }}>{p.track_count != null ? `${p.track_count} tracks` : ''}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
