/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState, useEffect } from 'react'
import { authFetch } from '@/app/shared/utils/authFetch'
import { spotifyDxLog } from '@/app/audio_management/hooks/spotifyDiagnostics'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCopy, faTrash } from '@fortawesome/free-solid-svg-icons'
import { THEME, COLORS } from '@/app/styles/colorTheme'
import { USER_COLORS, resolveUserColor } from '@/app/utils/userColors'
import UserChrome from '@/app/shared/components/UserChrome'
import { SKEW_BOX, SKEW_LABEL, platePolygon } from '@/app/dashboard/components/home/plateGeometry'
import { Button } from './shared/Button'

const SPOTIFY_GREEN = '#1DB954'

// Inline Spotify glyph so we don't depend on the brand-icons package being installed.
function SpotifyGlyph({ size = 20, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.52 17.34c-.24.36-.66.48-1.02.24-2.82-1.74-6.36-2.1-10.56-1.14-.42.12-.78-.18-.9-.54-.12-.42.18-.78.54-.9 4.56-1.02 8.52-.6 11.64 1.32.42.18.48.66.3 1.02zm1.44-3.3c-.3.42-.84.6-1.26.3-3.24-1.98-8.16-2.58-11.94-1.38-.48.12-1.02-.12-1.14-.6-.12-.48.12-1.02.6-1.14 4.38-1.32 9.78-.66 13.5 1.62.36.18.6.78.24 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.1 9.3c-.6.18-1.2-.18-1.38-.72-.18-.6.18-1.2.72-1.38 4.32-1.26 11.34-1.02 15.72 1.5.54.3.72 1.02.42 1.56-.3.42-1.02.66-1.5.36z"/>
    </svg>
  )
}

/**
 * A single account meta field as a slanted plate — label on the flat left
 * face, value carrying across it. The miniature of the working-on card.
 */
function MetaPlate({ label, value, mono = false }) {
  return (
    <div
      className="flex items-center gap-4 px-4 py-2.5"
      style={{
        backgroundColor: THEME.bgSecondary,
        clipPath: `polygon(${platePolygon(14)})`,
      }}
    >
      <span
        className="w-28 flex-none text-[11px] font-semibold uppercase tracking-widest"
        style={{ color: THEME.textAccent }}
      >
        {label}
      </span>
      <span
        className={`min-w-0 flex-1 truncate text-sm ${mono ? 'font-mono text-xs' : ''}`}
        style={{ color: THEME.textOnDark }}
      >
        {value}
      </span>
    </div>
  )
}

export default function ProfileManager({ user, onUserUpdate }) {
  const [screenName, setScreenName] = useState('')
  const [updatingScreenName, setUpdatingScreenName] = useState(false)
  const [error, setError] = useState(null)
  const [copiedAccountTag, setCopiedAccountTag] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [updatingColor, setUpdatingColor] = useState(false)

  // Spotify connection state
  const [spotify, setSpotify] = useState({ loading: true, connected: false, profile: null })
  const [spotifyNotice, setSpotifyNotice] = useState(null) // 'connected' | 'error' | null
  const [disconnectingSpotify, setDisconnectingSpotify] = useState(false)

  // Load the live Spotify profile (also runs after the OAuth redirect back).
  const loadSpotify = async () => {
    try {
      const response = await authFetch('/api/spotify/profile', { credentials: 'include' })
      if (response.ok) {
        const data = await response.json()
        if (!data.connected && data.upstream_status != null) {
          // Spotify rejected us for a LINKED account (allowlist 403, dead refresh
          // token, quota…) — log the raw evidence so a console screenshot of this
          // page is diagnostic. "Not connected" alone hides which failure it was.
          spotifyDxLog('warn', 'Spotify shows as not connected because Spotify rejected the request:',
            `HTTP ${data.upstream_status}`, data.upstream_error || '(no body)')
        }
        setSpotify({ loading: false, connected: data.connected, profile: data.profile || null })
      } else {
        setSpotify({ loading: false, connected: false, profile: null })
      }
    } catch (err) {
      console.error('Error loading Spotify profile:', err)
      setSpotify({ loading: false, connected: false, profile: null })
    }
  }

  useEffect(() => {
    // Surface the ?spotify=connected|error result from the OAuth redirect, then
    // strip it from the URL so a refresh doesn't re-show the banner.
    const params = new URLSearchParams(window.location.search)
    const result = params.get('spotify')
    if (result) {
      setSpotifyNotice(result)
      params.delete('spotify')
      const clean = window.location.pathname + (params.toString() ? `?${params}` : '')
      window.history.replaceState({}, '', clean)
    }
    loadSpotify()
  }, [])

  // Start the OAuth flow. Top-level navigation so the auth cookie + Spotify
  // redirect both work (and, in dev, so nginx bounces us onto 127.0.0.1).
  const connectSpotify = () => {
    window.location.href = '/api/spotify/authorize'
  }

  const disconnectSpotify = async () => {
    setDisconnectingSpotify(true)
    try {
      const response = await authFetch('/api/spotify/disconnect', {
        method: 'DELETE',
        credentials: 'include',
      })
      if (response.ok) {
        setSpotify({ loading: false, connected: false, profile: null })
        setSpotifyNotice(null)
      }
    } catch (err) {
      console.error('Error disconnecting Spotify:', err)
    } finally {
      setDisconnectingSpotify(false)
    }
  }

  // Copy account tag to clipboard
  const handleCopyAccountTag = async () => {
    if (!user.account_identifier) return
    await navigator.clipboard.writeText(user.account_identifier)
    setCopiedAccountTag(true)
    setTimeout(() => setCopiedAccountTag(false), 3000)
  }

  // Update screen name
  const updateScreenName = async () => {
    if (!screenName.trim()) return

    setUpdatingScreenName(true)
    setError(null)

    try {
      const response = await authFetch('/api/users/screen_name', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ screen_name: screenName.trim() })
      })

      if (response.ok) {
        const updatedUser = await response.json()
        onUserUpdate(updatedUser)
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

  // Set identity color — saves immediately on swatch click
  const updateColor = async (colorChoice) => {
    setUpdatingColor(true)
    setError(null)

    try {
      const response = await authFetch('/api/users/me/color', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ color: colorChoice })
      })

      if (response.ok) {
        const updatedUser = await response.json()
        onUserUpdate(updatedUser)
      } else {
        const errorData = await response.json()
        setError(errorData.detail || 'Failed to update color')
      }
    } catch (error) {
      console.error('Error updating color:', error)
      setError('Failed to update color')
    } finally {
      setUpdatingColor(false)
    }
  }

  // Soft delete account (production)
  const handleDeleteAccount = async () => {
    setDeleting(true)
    setError(null)

    try {
      const response = await authFetch('/api/users/me', {
        method: 'DELETE',
        credentials: 'include'
      })

      if (response.ok || response.status === 204) {
        window.location.href = '/auth/magic'
      } else {
        const errorData = await response.json()
        setError(errorData.detail || 'Failed to delete account')
        setShowDeleteConfirm(false)
      }
    } catch (error) {
      console.error('Error deleting account:', error)
      setError('Failed to delete account')
      setShowDeleteConfirm(false)
    } finally {
      setDeleting(false)
    }
  }

  if (!user) {
    return (
      <div
        className="flex items-center justify-center py-8 rounded-sm border"
        style={{backgroundColor: THEME.bgPanel, borderColor: THEME.borderSubtle}}
      >
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 mr-3" style={{borderColor: THEME.borderActive}}></div>
        <div style={{color: THEME.textSecondary}}>Loading profile...</div>
      </div>
    )
  }

  return (
    <div
      className="p-6 rounded-sm border"
      style={{backgroundColor: THEME.bgPanel, borderColor: THEME.borderSubtle}}
    >
      {/* Section Header */}
      <h2
        className="text-xl font-semibold font-[family-name:var(--font-metamorphous)] mb-6"
        style={{color: THEME.textOnDark}}
      >
        Your Profile
      </h2>

      {/* Identity capsule — avatar reads into the name, the same UserChrome
          the header and friend rows use. */}
      <div className="mb-5">
        <UserChrome
          userId={user.id}
          color={user.color}
          name={user.screen_name || user.email.split('@')[0]}
          size="lg"
        />
      </div>

      {/* Meta plates — email and account id, off the identity block. */}
      <div className="mb-6 space-y-2">
        <MetaPlate label="Email" value={user.email} />
        <MetaPlate label="Account ID" value={user.id} mono />
      </div>

      {/* Identity colour — moved up beside the identity it colours; each
          swatch is a card in the page's 8 degree family. */}
      <div className="mb-6">
        <h3 className="mb-2 text-sm font-semibold uppercase" style={{color: THEME.textAccent}}>
          Identity Colour
        </h3>
        <div className="flex flex-wrap gap-2">
          {USER_COLORS.map((paletteColor) => {
            const selected = paletteColor === resolveUserColor(user.color, user.id)
            return (
              <button
                key={paletteColor}
                onClick={() => updateColor(paletteColor)}
                disabled={updatingColor}
                aria-label={`Set identity colour ${paletteColor}`}
                aria-pressed={selected}
                className="h-10 w-14 rounded-lg transition-transform hover:scale-105 disabled:opacity-50"
                style={{
                  backgroundColor: paletteColor,
                  transform: SKEW_BOX,
                  outline: selected ? `2px solid ${THEME.textOnDark}` : 'none',
                  outlineOffset: '2px',
                }}
              />
            )
          })}
        </div>
        <p className="mt-2 text-xs" style={{color: THEME.textSecondary}}>
          Colours your account chip and how friends see you
        </p>
      </div>

      {/* Account Settings */}
      <div className="pt-4 border-t" style={{borderTopColor: THEME.borderSubtle}}>
        <h3 className="text-sm font-semibold uppercase mb-4" style={{color: THEME.textAccent}}>
          Account Settings
        </h3>

        {/* Error Message */}
        {error && (
          <div
            className="mb-4 p-3 rounded-sm border"
            style={{backgroundColor: '#991b1b', borderColor: '#dc2626'}}
          >
            <p style={{color: '#fca5a5'}} className="text-sm">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          {/* Screen Name Field */}
          <div>
            <label
              htmlFor="screenName"
              className="block text-sm font-medium mb-1"
              style={{color: THEME.textOnDark}}
            >
              Screen Name <span style={{color: THEME.textSecondary}}>(Display Name)</span>
            </label>
            <input
              type="text"
              id="screenName"
              value={screenName || user.screen_name || ''}
              onChange={(e) => setScreenName(e.target.value)}
              placeholder={user.screen_name || "Enter your screen name"}
              maxLength={30}
              className="w-full px-3 py-2 rounded-sm border focus:outline-none focus:ring-2"
              style={{
                backgroundColor: THEME.bgSecondary,
                borderColor: THEME.borderDefault,
                color: THEME.textOnDark
              }}
              disabled={updatingScreenName}
            />
            <p className="text-xs mt-1" style={{color: THEME.textSecondary}}>
              This is your display name shown to others (can be changed)
            </p>
          </div>

          {/* Account Tag Field (Read-only) */}
          <div>
            <label
              htmlFor="accountTag"
              className="block text-sm font-medium mb-1"
              style={{color: THEME.textOnDark}}
            >
              Account Tag <span style={{color: THEME.textSecondary}}>(Username)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                id="accountTag"
                value={user.account_identifier || 'Not set'}
                className="flex-1 px-3 py-2 rounded-sm border font-mono cursor-not-allowed"
                style={{
                  backgroundColor: COLORS.onyx,
                  borderColor: THEME.borderSubtle,
                  color: THEME.textSecondary
                }}
                disabled
                title="Account tag cannot be changed"
              />
              <button
                onClick={handleCopyAccountTag}
                className="px-4 py-2 rounded-sm border font-medium flex items-center gap-2 hover:opacity-80 transition-opacity"
                style={{
                  backgroundColor: THEME.bgSecondary,
                  borderColor: THEME.borderDefault,
                  color: THEME.textAccent
                }}
                title="Copy account tag to clipboard"
              >
                <FontAwesomeIcon icon={faCopy} />
                {copiedAccountTag ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-xs mt-1" style={{color: THEME.textSecondary}}>
              Your unique identifier for friend requests (cannot be changed)
            </p>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end mt-6">
          <Button
            variant="primary"
            onClick={updateScreenName}
            disabled={updatingScreenName || !screenName.trim() || screenName === user.screen_name}
          >
            {updatingScreenName ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Spotify Connection */}
      <div className="mt-6 pt-6 border-t" style={{borderTopColor: THEME.borderSubtle}}>
        <h3 className="text-sm font-semibold uppercase mb-4" style={{color: THEME.textAccent}}>
          Spotify
        </h3>

        {/* Post-redirect notice */}
        {spotifyNotice === 'connected' && (
          <div className="mb-4 p-3 rounded-sm border" style={{backgroundColor: `${SPOTIFY_GREEN}22`, borderColor: SPOTIFY_GREEN}}>
            <p className="text-sm" style={{color: SPOTIFY_GREEN}}>Spotify connected successfully.</p>
          </div>
        )}
        {spotifyNotice === 'error' && (
          <div className="mb-4 p-3 rounded-sm border" style={{backgroundColor: '#991b1b', borderColor: '#dc2626'}}>
            <p className="text-sm" style={{color: '#fca5a5'}}>Couldn&apos;t connect Spotify. Please try again.</p>
          </div>
        )}

        {spotify.loading ? (
          <div className="flex items-center py-2" style={{color: THEME.textSecondary}}>
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 mr-3" style={{borderColor: THEME.borderActive}}></div>
            <span className="text-sm">Checking Spotify connection…</span>
          </div>
        ) : spotify.connected && spotify.profile ? (
          <div>
            {/* Profile card */}
            <div
              className="flex items-center gap-4 p-4 rounded-sm border"
              style={{backgroundColor: THEME.bgSecondary, borderColor: THEME.borderSubtle}}
            >
              {spotify.profile.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={spotify.profile.image_url}
                  alt={spotify.profile.display_name || 'Spotify avatar'}
                  className="w-16 h-16 rounded-full object-cover border-2"
                  style={{borderColor: SPOTIFY_GREEN}}
                />
              ) : (
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center border-2"
                  style={{borderColor: SPOTIFY_GREEN, backgroundColor: `${SPOTIFY_GREEN}22`}}
                >
                  <SpotifyGlyph size={28} color={SPOTIFY_GREEN} />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <SpotifyGlyph size={16} color={SPOTIFY_GREEN} />
                  <p className="text-lg font-semibold truncate" style={{color: THEME.textOnDark}}>
                    {spotify.profile.display_name || 'Spotify User'}
                  </p>
                </div>
                {spotify.profile.email && (
                  <p className="text-sm truncate" style={{color: THEME.textSecondary}}>{spotify.profile.email}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {spotify.profile.product && (
                    <span
                      className="text-xs font-semibold uppercase px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: spotify.profile.product === 'premium' ? SPOTIFY_GREEN : THEME.bgPanel,
                        color: spotify.profile.product === 'premium' ? '#000' : THEME.textSecondary,
                        border: `1px solid ${spotify.profile.product === 'premium' ? SPOTIFY_GREEN : THEME.borderDefault}`,
                      }}
                    >
                      {spotify.profile.product}
                    </span>
                  )}
                  {spotify.profile.country && (
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{color: THEME.textSecondary, border: `1px solid ${THEME.borderDefault}`}}>
                      {spotify.profile.country}
                    </span>
                  )}
                  {typeof spotify.profile.followers === 'number' && (
                    <span className="text-xs" style={{color: THEME.textSecondary}}>
                      {spotify.profile.followers} follower{spotify.profile.followers === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 mt-3">
              {spotify.profile.spotify_url && (
                <a
                  href={spotify.profile.spotify_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium hover:opacity-80 transition-opacity"
                  style={{color: SPOTIFY_GREEN}}
                >
                  Open in Spotify ↗
                </a>
              )}
              <button
                onClick={disconnectSpotify}
                disabled={disconnectingSpotify}
                className="ml-auto px-4 py-2 rounded-sm border font-medium hover:opacity-80 transition-opacity disabled:opacity-50"
                style={{backgroundColor: 'transparent', borderColor: THEME.borderDefault, color: THEME.textSecondary}}
              >
                {disconnectingSpotify ? 'Disconnecting…' : 'Disconnect'}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm mb-3" style={{color: THEME.textSecondary}}>
              Connect your Spotify account to link it with Tabletop Tavern.
            </p>
            <button
              onClick={connectSpotify}
              className="px-4 py-2 rounded-full font-semibold flex items-center gap-2 hover:opacity-90 transition-opacity"
              style={{backgroundColor: SPOTIFY_GREEN, color: '#000'}}
            >
              <SpotifyGlyph size={20} color="#000" />
              Connect Spotify
            </button>
          </div>
        )}
      </div>

      {/* Account Actions */}
      <div className="mt-6 pt-6 border-t" style={{borderTopColor: THEME.borderSubtle}}>
        <h3 className="text-sm font-semibold uppercase mb-4" style={{color: THEME.textSecondary}}>
          Account Actions
        </h3>

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 rounded-sm border font-medium flex items-center gap-2 hover:opacity-80 transition-opacity"
            style={{
              backgroundColor: 'transparent',
              borderColor: '#ef4444',
              color: '#ef4444'
            }}
          >
            <FontAwesomeIcon icon={faTrash} />
            Delete Account
          </button>
        ) : (
          <div
            className="p-4 rounded-sm border"
            style={{backgroundColor: '#450a0a', borderColor: '#dc2626'}}
          >
            <p className="text-sm mb-3" style={{color: '#fca5a5'}}>
              Are you sure? Your account will be deactivated and you won&apos;t be able to log in.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="px-4 py-2 rounded-sm font-medium hover:opacity-80 transition-opacity disabled:opacity-50"
                style={{
                  backgroundColor: '#dc2626',
                  color: '#fff'
                }}
              >
                {deleting ? 'Deleting...' : 'Yes, Delete My Account'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 rounded-sm border font-medium hover:opacity-80 transition-opacity"
                style={{
                  backgroundColor: 'transparent',
                  borderColor: THEME.borderDefault,
                  color: THEME.textSecondary
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
