/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useEffect, useState } from 'react'
import {
  LiveKitRoom,
  VideoTrack,
  AudioTrack,
  useTracks,
  RoomAudioRenderer,
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import '@livekit/components-styles'

const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL

function StreamStage() {
  const tracks = useTracks(
    [
      { source: Track.Source.ScreenShare, withPlaceholder: false },
      { source: Track.Source.Camera, withPlaceholder: false },
    ],
    { onlySubscribed: true },
  )

  const videoTracks = tracks.filter((t) => t.publication?.kind === 'video')

  if (videoTracks.length === 0) {
    return (
      <div style={{ color: '#888', textAlign: 'center', padding: '4rem' }}>
        Waiting for stream...
      </div>
    )
  }

  return (
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
    return (
      <FullScreenMessage>
        NEXT_PUBLIC_LIVEKIT_URL is not configured.
      </FullScreenMessage>
    )
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
