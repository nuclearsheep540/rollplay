/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  LiveKitRoom,
  VideoTrack,
  useTracks,
  RoomAudioRenderer,
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faVolumeHigh,
  faVolumeLow,
  faVolumeXmark,
  faExpand,
  faCompress,
} from '@fortawesome/free-solid-svg-icons'
import '@livekit/components-styles'

const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL

const CONTROLS_HIDE_MS = 2500

function ControlsOverlay({ volume, muted, fullscreen, onVolume, onMute, onFullscreen, visible }) {
  const volumeIcon = muted || volume === 0
    ? faVolumeXmark
    : volume < 0.5
      ? faVolumeLow
      : faVolumeHigh

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        padding: '1rem 1.25rem',
        background: 'linear-gradient(to top, rgba(0,0,0,0.7), rgba(0,0,0,0))',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.2s ease',
        pointerEvents: visible ? 'auto' : 'none',
        zIndex: 5,
      }}
    >
      <button
        type="button"
        onClick={onMute}
        title={muted ? 'Unmute' : 'Mute'}
        style={iconButtonStyle}
      >
        <FontAwesomeIcon icon={volumeIcon} style={{ width: 18, height: 18 }} />
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={muted ? 0 : volume}
        onChange={(e) => onVolume(parseFloat(e.target.value))}
        style={{ width: 120, accentColor: '#e5e5e5' }}
      />
      <div style={{ flex: 1 }} />
      <button
        type="button"
        onClick={onFullscreen}
        title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        style={iconButtonStyle}
      >
        <FontAwesomeIcon icon={fullscreen ? faCompress : faExpand} style={{ width: 18, height: 18 }} />
      </button>
    </div>
  )
}

const iconButtonStyle = {
  background: 'transparent',
  border: 'none',
  color: '#e5e5e5',
  cursor: 'pointer',
  padding: '0.5rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '4px',
}

function StreamStage() {
  const containerRef = useRef(null)
  const hideTimerRef = useRef(null)

  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)

  const videoTracksAll = useTracks(
    [
      { source: Track.Source.ScreenShare, withPlaceholder: false },
      { source: Track.Source.Camera, withPlaceholder: false },
    ],
    { onlySubscribed: true },
  )
  const videoTracks = videoTracksAll.filter((t) => t.publication?.kind === 'video')

  const audioTracks = useTracks(
    [
      { source: Track.Source.Microphone, withPlaceholder: false },
      { source: Track.Source.ScreenShareAudio, withPlaceholder: false },
    ],
    { onlySubscribed: true },
  )

  // Apply volume / mute to every remote audio track. Re-runs when the
  // set of tracks changes (e.g. when broadcaster un-mutes screen audio).
  useEffect(() => {
    const effective = muted ? 0 : volume
    audioTracks.forEach((t) => {
      const audioTrack = t.publication?.track
      if (audioTrack && typeof audioTrack.setVolume === 'function') {
        audioTrack.setVolume(effective)
      }
    })
  }, [audioTracks, volume, muted])

  // Sync local fullscreen state with the actual browser fullscreen.
  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const showControls = useCallback(() => {
    setControlsVisible(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_MS)
  }, [])

  const toggleMute = () => setMuted((m) => !m)

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      containerRef.current?.requestFullscreen()
    }
  }

  return (
    <div
      ref={containerRef}
      onMouseMove={showControls}
      onMouseLeave={() => setControlsVisible(false)}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        backgroundColor: '#000',
        cursor: controlsVisible ? 'default' : 'none',
      }}
    >
      {videoTracks.length === 0 ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#666',
          }}
        >
          Waiting for stream...
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: videoTracks.length === 1 ? '1fr' : 'repeat(2, 1fr)',
            gap: '0.5rem',
            width: '100%',
            height: '100%',
          }}
        >
          {videoTracks.map((trackRef) => (
            <VideoTrack
              key={trackRef.publication.trackSid}
              trackRef={trackRef}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                backgroundColor: '#000',
              }}
            />
          ))}
        </div>
      )}

      <ControlsOverlay
        volume={volume}
        muted={muted}
        fullscreen={fullscreen}
        onVolume={(v) => {
          setVolume(v)
          if (v > 0 && muted) setMuted(false)
        }}
        onMute={toggleMute}
        onFullscreen={toggleFullscreen}
        visible={controlsVisible}
      />
    </div>
  )
}

export default function StreamViewerPage() {
  const [token, setToken] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/stream/viewer-token')
      .then((r) => {
        if (!r.ok) throw new Error(`viewer-token ${r.status}`)
        return r.json()
      })
      .then((d) => {
        if (!cancelled) setToken(d.token)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!LIVEKIT_URL) {
    return <FullScreenMessage>NEXT_PUBLIC_LIVEKIT_URL is not configured.</FullScreenMessage>
  }
  if (error) {
    return <FullScreenMessage>Failed to get viewer token: {error}</FullScreenMessage>
  }
  if (!token) {
    return <FullScreenMessage>Connecting...</FullScreenMessage>
  }

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#000' }}>
      <LiveKitRoom
        serverUrl={LIVEKIT_URL}
        token={token}
        connect={true}
        audio={false}
        video={false}
        style={{ width: '100%', height: '100%' }}
      >
        <StreamStage />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  )
}

function FullScreenMessage({ children }) {
  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: '#0d0d0d',
        color: '#888',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {children}
    </div>
  )
}
