/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowsRotate, faArrowRotateRight } from '@fortawesome/free-solid-svg-icons'
import { authFetch } from '@/app/shared/utils/authFetch'
import { THEME } from '@/app/styles/colorTheme'

const SPOTIFY_GREEN = '#1DB954'
const PAGE = 50

function fmt(ms) {
  if (!ms || ms < 0) return '0:00'
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Module-scope (stable) so it isn't torn down + rebuilt on the panel's 1s position
// poll — otherwise a click landing across a re-render gets dropped.
const TrackRow = memo(function TrackRow({ t, onClick }) {
  const disabled = t.is_playable === false // region-blocked/unlicensed (playlist tracks)
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={disabled ? 'Unavailable in your region' : t.name}
      className={`flex items-center gap-2 p-2 rounded-sm text-left border ${disabled ? 'cursor-not-allowed' : 'hover:opacity-80'}`}
      style={{ borderColor: THEME.borderSubtle, backgroundColor: THEME.bgSecondary, opacity: disabled ? 0.4 : 1 }}
    >
      {t.art_url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={t.art_url} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0" />
        : <div className="w-9 h-9 rounded flex-shrink-0" style={{ backgroundColor: `${SPOTIFY_GREEN}33` }} />}
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate" style={{ color: THEME.textOnDark }}>{t.name}</p>
        <p className="text-xs truncate" style={{ color: THEME.textSecondary }}>{disabled ? 'Unavailable in your region' : t.artist}</p>
      </div>
    </button>
  )
})

function SkeletonRow() {
  return (
    <div className="flex items-center gap-2 p-2 rounded-sm border animate-pulse" style={{ borderColor: THEME.borderSubtle, backgroundColor: THEME.bgSecondary }}>
      <div className="w-9 h-9 rounded flex-shrink-0" style={{ backgroundColor: THEME.borderDefault }} />
      <div className="flex-1 flex flex-col gap-1.5">
        <div className="h-3 rounded" style={{ width: '70%', backgroundColor: THEME.borderDefault }} />
        <div className="h-2 rounded" style={{ width: '45%', backgroundColor: THEME.borderDefault }} />
      </div>
    </div>
  )
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
  const getCurrentState = spotify?.getCurrentState

  const [tab, setTab] = useState('search') // 'search' | 'playlists' | 'selected'
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [playlists, setPlaylists] = useState([])
  const [loadingPlaylists, setLoadingPlaylists] = useState(false)
  const [error, setError] = useState(null)

  // Drill-in: the opened playlist + its (lazily-paged) tracks
  const [selectedPlaylist, setSelectedPlaylist] = useState(null) // { id, name, uri }
  const [tracks, setTracks] = useState([])
  const [tracksTotal, setTracksTotal] = useState(0)
  const [tracksLoading, setTracksLoading] = useState(false)
  const loadingRef = useRef(false)

  // Seek-bar drag state
  const [seeking, setSeeking] = useState(false)
  const [seekValue, setSeekValue] = useState(0)

  // Live playhead — poll the SDK's real position (getCurrentState is a local call).
  const [live, setLive] = useState({ position: 0, duration: 0, paused: true })
  const [repeatMode, setRepeatMode] = useState(0) // 0 off · 1 playlist · 2 track
  const repeatSettleRef = useRef(0) // ignore polled repeat until this ts, so an optimistic click doesn't flicker
  useEffect(() => {
    if (status !== 'ready') return
    let active = true
    const poll = async () => {
      const st = await getCurrentState?.()
      if (!active || !st) return
      setLive({ position: st.position, duration: st.duration, paused: st.paused })
      // Only trust the polled repeat once our optimistic change has had time to apply,
      // otherwise the poll briefly reads the old value and the icon flickers back.
      if (Date.now() > repeatSettleRef.current) setRepeatMode(st.repeat_mode || 0)
    }
    poll()
    const id = setInterval(poll, 1000)
    return () => { active = false; clearInterval(id) }
  }, [status, getCurrentState])

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

  const loadTracks = useCallback(async (playlistId, offset, reset = false) => {
    if (loadingRef.current) return
    loadingRef.current = true
    setTracksLoading(true)
    setError(null)
    try {
      const res = await authFetch(`/api/spotify/playlists/${playlistId}/tracks?limit=${PAGE}&offset=${offset}`, { credentials: 'include' })
      if (!res.ok) { setError('Could not load playlist tracks'); return }
      const data = await res.json()
      setTracks((prev) => (reset ? (data.tracks || []) : [...prev, ...(data.tracks || [])]))
      setTracksTotal(data.total || 0)
    } catch {
      setError('Could not load playlist tracks')
    } finally {
      loadingRef.current = false
      setTracksLoading(false)
    }
  }, [])

  const openPlaylist = (p) => {
    setSelectedPlaylist({ id: p.id, name: p.name, uri: p.uri })
    setTracks([])
    setTracksTotal(0)
    setTab('selected')
    loadTracks(p.id, 0, true)
  }

  const closeSelected = () => {
    setSelectedPlaylist(null)
    setTracks([])
    setTracksTotal(0)
    setTab('playlists')
  }

  // Lazy-load next page when scrolled within ~3 rows (~140px) of the bottom.
  const onTracksScroll = (e) => {
    if (loadingRef.current || !selectedPlaylist || tracks.length >= tracksTotal) return
    const el = e.currentTarget
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 140) {
      loadTracks(selectedPlaylist.id, tracks.length)
    }
  }

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
  const duration = live.duration || ps?.duration || 0
  const isPlaying = !live.paused
  const position = seeking ? seekValue : live.position
  const cycleRepeat = () => {
    const next = (repeatMode + 1) % 3
    setRepeatMode(next)                          // optimistic + authoritative for the DM
    repeatSettleRef.current = Date.now() + 2500  // hold off the poll while Spotify applies it
    spotify.setRepeat?.(['off', 'context', 'track'][next])
  }

  const capsule = (active) => (active
    ? { backgroundColor: SPOTIFY_GREEN, color: '#000' }
    : { backgroundColor: THEME.bgSecondary, color: THEME.textSecondary, border: `1px solid ${THEME.borderDefault}` })

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
              onMouseUp={(e) => { spotify.seek?.(Number(e.currentTarget.value)); setSeeking(false) }}
              onTouchEnd={(e) => { spotify.seek?.(Number(e.currentTarget.value)); setSeeking(false) }}
              className="flex-1 h-1"
              style={{ accentColor: SPOTIFY_GREEN }}
            />
            <span className="text-[10px] tabular-nums" style={{ color: THEME.textSecondary }}>{fmt(duration)}</span>
          </div>

          {/* Transport — prev/play/next stay centered; repeat is absolutely positioned on the
              right so it doesn't shift the centre. */}
          <div className="relative flex items-center justify-center gap-4 mt-2">
            <button onClick={() => spotify.previous?.()} title="Previous" className="text-lg hover:opacity-80" style={{ color: THEME.textOnDark }}>⏮</button>
            <button
              onClick={() => spotify.togglePlay?.()}
              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
              style={{ backgroundColor: SPOTIFY_GREEN, color: '#000' }}
            >
              {isPlaying ? '❚❚' : '▶'}
            </button>
            <button onClick={() => spotify.next?.()} title="Next" className="text-lg hover:opacity-80" style={{ color: THEME.textOnDark }}>⏭</button>
            <button
              onClick={cycleRepeat}
              title={['Repeat: off', 'Repeat: playlist', 'Repeat: track'][repeatMode]}
              className="absolute right-1 top-1/2 -translate-y-1/2 hover:opacity-80"
              style={{ color: repeatMode === 0 ? THEME.textSecondary : SPOTIFY_GREEN, opacity: repeatMode === 0 ? 0.5 : 1 }}
            >
              {/* One fixed, centred box for both glyphs so track (with the "1") and playlist align */}
              <span className="relative inline-flex items-center justify-center" style={{ width: '1.15em', height: '1.15em' }}>
                <FontAwesomeIcon icon={repeatMode === 2 ? faArrowRotateRight : faArrowsRotate} fixedWidth />
                {repeatMode === 2 && (
                  <span className="absolute font-bold" style={{ fontSize: '0.5em', lineHeight: 1 }}>1</span>
                )}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Source tabs */}
      <div className="flex gap-2 text-sm items-center">
        <button onClick={() => setTab('search')} className="px-3 py-1 rounded-full font-medium" style={capsule(tab === 'search')}>Search</button>
        <button onClick={() => setTab('playlists')} className="px-3 py-1 rounded-full font-medium" style={capsule(tab === 'playlists')}>Your Playlists</button>
        {selectedPlaylist && (
          <div className="flex items-center rounded-full overflow-hidden" style={capsule(tab === 'selected')}>
            <button onClick={() => setTab('selected')} className="pl-3 pr-2 py-1 font-medium truncate max-w-[130px]" title={selectedPlaylist.name}>♪ {selectedPlaylist.name}</button>
            <button onClick={closeSelected} title="Close playlist" className="px-2 py-1 opacity-70 hover:opacity-100">✕</button>
          </div>
        )}
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
              {results.map((t) => <TrackRow key={t.uri} t={t} onClick={() => spotify.playTrack?.(t.uri)} />)}
            </div>
          )}
        </>
      )}

      {/* Your Playlists — click to open (drill in), not play */}
      {tab === 'playlists' && (
        <div className="max-h-56 overflow-y-auto flex flex-col gap-1">
          {loadingPlaylists && <p className="text-xs" style={{ color: THEME.textSecondary }}>Loading playlists…</p>}
          {!loadingPlaylists && playlists.length === 0 && !error && <p className="text-xs" style={{ color: THEME.textSecondary }}>No playlists found.</p>}
          {playlists.map((p) => (
            <button key={p.id} onClick={() => openPlaylist(p)} className="flex items-center gap-2 p-2 rounded-sm text-left hover:opacity-80 border" style={{ borderColor: THEME.borderSubtle, backgroundColor: THEME.bgSecondary }}>
              {p.image_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={p.image_url} alt="" className="w-9 h-9 rounded object-cover" />
                : <div className="w-9 h-9 rounded" style={{ backgroundColor: `${SPOTIFY_GREEN}33` }} />}
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate" style={{ color: THEME.textOnDark }}>{p.name}</p>
                <p className="text-xs truncate" style={{ color: THEME.textSecondary }}>{p.track_count != null ? `${p.track_count} tracks` : ''}</p>
              </div>
              <span style={{ color: THEME.textSecondary }}>›</span>
            </button>
          ))}
        </div>
      )}

      {/* Selected playlist — pick a starting track; playback continues through the playlist.
          Fixed height + skeleton on first load so nothing below jumps while fetching. */}
      {tab === 'selected' && selectedPlaylist && (
        <div className="h-56 overflow-y-auto flex flex-col gap-1" onScroll={onTracksScroll}>
          {tracks.length === 0 && tracksLoading
            ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
            : tracks.map((t, i) => (
                <TrackRow key={`${t.uri}-${i}`} t={t} onClick={() => spotify.playContext?.(selectedPlaylist.uri, t.uri)} />
              ))}
          {tracksLoading && tracks.length > 0 && <p className="text-xs text-center py-1" style={{ color: THEME.textSecondary }}>Loading…</p>}
          {!tracksLoading && tracks.length === 0 && <p className="text-xs" style={{ color: THEME.textSecondary }}>No tracks.</p>}
        </div>
      )}
    </div>
  )
}
