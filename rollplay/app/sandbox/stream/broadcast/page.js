/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useRef, useState } from 'react'
import {
  LiveKitRoom,
  VideoTrack,
  useLocalParticipant,
  useTracks,
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import '@livekit/components-styles'
import Modal from '@/app/shared/components/Modal'

const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL

const ROOM_OPTIONS = {
  publishDefaults: {
    screenShareEncoding: {
      maxBitrate: 5_000_000,
      maxFramerate: 30,
    },
  },
}

const SCREEN_SHARE_CAPTURE = {
  resolution: { width: 1920, height: 1080, frameRate: 30 },
  audio: true,
}

const styles = {
  page: { width: '100vw', height: '100vh', backgroundColor: '#000', color: '#e5e5e5', fontFamily: 'system-ui, sans-serif' },
  topbar: { position: 'absolute', top: 0, left: 0, right: 0, padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(13, 13, 13, 0.85)', backdropFilter: 'blur(4px)', zIndex: 10 },
  status: { display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' },
  dot: (live) => ({ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: live ? '#3fb950' : '#666' }),
  button: { backgroundColor: '#2a2a2a', color: '#e5e5e5', border: '1px solid #3a3a3a', padding: '0.5rem 1rem', fontSize: '0.85rem', borderRadius: '4px', cursor: 'pointer', fontFamily: 'inherit' },
  buttonPrimary: { backgroundColor: '#2a5a2a', color: '#e5e5e5', border: '1px solid #3a6a3a', padding: '0.5rem 1rem', fontSize: '0.85rem', borderRadius: '4px', cursor: 'pointer', fontFamily: 'inherit' },
  buttonDanger: { backgroundColor: '#5a2a2a', color: '#f5e5e5', border: '1px solid #6a3a3a', padding: '0.5rem 1rem', fontSize: '0.85rem', borderRadius: '4px', cursor: 'pointer', fontFamily: 'inherit' },
  preview: { width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#000' },
  emptyState: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' },
  modalBody: { padding: '1.5rem', backgroundColor: '#1a1a1a', color: '#e5e5e5' },
  modalTitle: { fontSize: '1rem', marginBottom: '1rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: '#888' },
  input: { width: '100%', padding: '0.6rem 0.75rem', backgroundColor: '#0d0d0d', border: '1px solid #3a3a3a', borderRadius: '4px', color: '#e5e5e5', fontFamily: 'inherit', fontSize: '0.9rem', boxSizing: 'border-box' },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' },
  error: { color: '#f5a5a5', fontSize: '0.85rem', marginTop: '0.5rem' },
}

function Broadcaster() {
  const { localParticipant } = useLocalParticipant()
  const tracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: false })
  const myScreenShare = tracks.find((t) => t.participant?.isLocal)
  const isBroadcasting = Boolean(myScreenShare)

  const [error, setError] = useState(null)
  const [working, setWorking] = useState(false)

  const handleStart = async () => {
    setError(null)
    setWorking(true)
    try {
      await localParticipant.setScreenShareEnabled(true, SCREEN_SHARE_CAPTURE)
    } catch (e) {
      setError(e.message || 'Failed to start screen share')
    } finally {
      setWorking(false)
    }
  }

  const handleStop = async () => {
    setWorking(true)
    try {
      await localParticipant.setScreenShareEnabled(false)
    } finally {
      setWorking(false)
    }
  }

  return (
    <>
      <div style={styles.topbar}>
        <div style={styles.status}>
          <span style={styles.dot(isBroadcasting)} />
          <span>{isBroadcasting ? 'Broadcasting' : 'Connected — not broadcasting'}</span>
          {error && <span style={{ ...styles.error, marginLeft: '1rem', marginTop: 0 }}>{error}</span>}
        </div>
        <div>
          {isBroadcasting ? (
            <button style={styles.buttonDanger} onClick={handleStop} disabled={working} type="button">
              {working ? 'Stopping...' : 'Stop broadcast'}
            </button>
          ) : (
            <button style={styles.buttonPrimary} onClick={handleStart} disabled={working} type="button">
              {working ? 'Starting...' : 'Start screen share'}
            </button>
          )}
        </div>
      </div>

      {myScreenShare ? (
        <VideoTrack trackRef={myScreenShare} style={styles.preview} />
      ) : (
        <div style={styles.emptyState}>
          Click <strong style={{ margin: '0 0.4rem' }}>Start screen share</strong> to begin.
        </div>
      )}
    </>
  )
}

function PasswordGate({ onSubmit, error, submitting }) {
  const inputRef = useRef(null)
  const [value, setValue] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!value.trim()) return
    onSubmit(value)
  }

  return (
    <Modal
      open={true}
      onClose={() => {}}
      size="sm"
      initialFocus={inputRef}
      panelClassName="bg-[#1a1a1a] border border-[#2a2a2a] rounded text-[#e5e5e5]"
    >
      <form onSubmit={handleSubmit} style={styles.modalBody}>
        <div style={styles.modalTitle}>Broadcast password</div>
        <input
          ref={inputRef}
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Enter password"
          style={styles.input}
          autoComplete="off"
          disabled={submitting}
        />
        {error && <div style={styles.error}>{error}</div>}
        <div style={styles.modalActions}>
          <button type="submit" style={styles.buttonPrimary} disabled={submitting}>
            {submitting ? 'Checking...' : 'Unlock'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function BroadcastPage() {
  const [token, setToken] = useState(null)
  const [authError, setAuthError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const tryPassword = async (password) => {
    setSubmitting(true)
    setAuthError(null)
    try {
      const res = await fetch('/api/stream/publisher-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.status === 403) {
        setAuthError('Wrong password')
        return
      }
      if (!res.ok) {
        setAuthError(`Failed: ${res.status}`)
        return
      }
      const data = await res.json()
      setToken(data.token)
    } catch (e) {
      setAuthError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!LIVEKIT_URL) {
    return (
      <div style={{ ...styles.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        NEXT_PUBLIC_LIVEKIT_URL is not configured.
      </div>
    )
  }

  if (!token) {
    return (
      <div style={styles.page}>
        <PasswordGate onSubmit={tryPassword} error={authError} submitting={submitting} />
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <LiveKitRoom
        serverUrl={LIVEKIT_URL}
        token={token}
        connect={true}
        video={false}
        audio={false}
        options={ROOM_OPTIONS}
        style={{ width: '100%', height: '100%', position: 'relative' }}
      >
        <Broadcaster />
      </LiveKitRoom>
    </div>
  )
}
