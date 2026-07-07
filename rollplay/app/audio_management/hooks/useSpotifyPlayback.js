/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useState, useEffect, useRef, useCallback } from 'react';
import { authFetch } from '@/app/shared/utils/authFetch';

const SDK_SRC = 'https://sdk.scdn.co/spotify-player.js';
// Match useUnifiedAudio's JIT compensation so Spotify aligns with the S3 bed.
const NETWORK_COMPENSATION = 0.4; // seconds

// Load the Web Playback SDK <script> exactly once per page.
let sdkPromise = null;
function loadSpotifySDK() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.Spotify) return Promise.resolve(window.Spotify);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    // The SDK requires this global to exist BEFORE the script executes.
    window.onSpotifyWebPlaybackSDKReady = () => resolve(window.Spotify);
    const s = document.createElement('script');
    s.src = SDK_SRC;
    s.async = true;
    s.onerror = () => reject(new Error('Failed to load Spotify Web Playback SDK'));
    document.body.appendChild(s);
  });
  return sdkPromise;
}

async function fetchAccessToken() {
  const r = await authFetch('/api/spotify/token', { credentials: 'include' });
  if (!r.ok) throw new Error(`token ${r.status}`);
  const j = await r.json();
  return j.access_token;
}

/**
 * Drives an in-browser Spotify SDK player from DM-broadcast anchor snapshots.
 *
 * status: 'idle' | 'connecting' | 'ready' | 'not_connected' | 'not_premium' | 'error'
 *
 * Only initialises the SDK for a connected Premium account. Players who aren't
 * Premium/connected get status !== 'ready' and simply don't hear the Spotify bed
 * (they still hear the S3 mixer — clean fallback).
 *
 * @param {object}  opts
 * @param {boolean} opts.enabled            master switch (e.g. only in an active game)
 * @param {number}  opts.masterVolume       local per-client master (0..1)
 * @param {number}  opts.broadcastMasterVolume DM-synced master (0..1)
 */
export function useSpotifyPlayback({ enabled = true, masterVolume = 1, broadcastMasterVolume = 1 } = {}) {
  const [status, setStatus] = useState('idle');
  const [profile, setProfile] = useState(null);
  const [nowPlaying, setNowPlaying] = useState(null); // last applied snapshot (for the panel UI)
  // Stable trigger for creating the SDK player exactly once. Must NOT be `status`,
  // because the create-effect calls setStatus('ready') internally — depending on
  // status would tear the player down (and disconnect the just-registered device)
  // the instant it becomes ready.
  const [shouldInit, setShouldInit] = useState(false);

  const playerRef = useRef(null);
  const deviceIdRef = useRef(null);
  const readyRef = useRef(false);
  const currentTrackRef = useRef(null);   // track_uri currently loaded on the SDK device
  const pendingSnapshotRef = useRef(null); // snapshot that arrived before the SDK was ready
  const volumeRef = useRef(clamp01((masterVolume ?? 1) * (broadcastMasterVolume ?? 1)));

  // 1) Determine connection + Premium via the profile endpoint.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch('/api/spotify/profile', { credentials: 'include' });
        if (cancelled) return;
        if (!res.ok) { setStatus('not_connected'); return; }
        const data = await res.json();
        if (cancelled) return;
        if (!data.connected) { setStatus('not_connected'); return; }
        setProfile(data.profile || null);
        if (data.profile?.product !== 'premium') { setStatus('not_premium'); return; }
        setStatus('connecting');
        setShouldInit(true);
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [enabled]);

  // 2) Once connected+Premium, load the SDK and create the player — exactly once.
  useEffect(() => {
    if (!shouldInit) return;
    let cancelled = false;
    let player = null;
    (async () => {
      try {
        const Spotify = await loadSpotifySDK();
        if (cancelled) return;
        console.log('🎵 creating Spotify SDK player');
        player = new Spotify.Player({
          name: 'Tabletop Tavern',
          getOAuthToken: (cb) => { fetchAccessToken().then(cb).catch((e) => console.error('Spotify token error', e)); },
          volume: volumeRef.current,
        });

        player.addListener('ready', ({ device_id }) => {
          if (cancelled) return; // ignore a stale/disconnected player's late 'ready' (StrictMode double-mount)
          deviceIdRef.current = device_id;
          readyRef.current = true;
          setStatus('ready');
          console.log('🎵 Spotify device ready:', device_id);
          // Diagnostic: what account does our token resolve to, and is THIS device
          // actually registered under it? (phantom-device check)
          fetchAccessToken().then(async (token) => {
            try {
              const auth = { Authorization: `Bearer ${token}` };
              const me = await (await fetch('https://api.spotify.com/v1/me', { headers: auth })).json();
              const dj = await (await fetch('https://api.spotify.com/v1/me/player/devices', { headers: auth })).json();
              const ours = (dj.devices || []).find((d) => d.id === device_id);
              console.log(`🎵 SDK-account=${me.email || me.id} product=${me.product} | this-device-registered=${!!ours} | all-devices=`, (dj.devices || []).map((d) => `${d.name}(${d.type})`));
            } catch (e) { console.warn('🎵 device check failed', e); }
          });
          if (pendingSnapshotRef.current) {
            applyToSDK(pendingSnapshotRef.current);
            pendingSnapshotRef.current = null;
          }
        });
        player.addListener('not_ready', () => { readyRef.current = false; });
        player.addListener('initialization_error', ({ message }) => { console.error('Spotify init error:', message); if (!cancelled) setStatus('error'); });
        player.addListener('authentication_error', ({ message }) => { console.error('Spotify auth error:', message); if (!cancelled) setStatus('error'); });
        player.addListener('account_error', ({ message }) => { console.error('Spotify account error:', message); if (!cancelled) setStatus('not_premium'); });
        player.addListener('playback_error', ({ message }) => { console.error('🎵 Spotify playback_error:', message); });
        // Fires when the browser blocks autoplay — the SDK needs activateElement() from a user gesture.
        player.addListener('autoplay_failed', () => { console.warn('🎵 Spotify autoplay blocked — needs a user gesture. Click a track/Play to activate.'); });

        await player.connect();
        playerRef.current = player;
      } catch (e) {
        console.error('Spotify SDK setup failed:', e);
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      console.log('🎵 disconnecting Spotify SDK player (cleanup)');
      try { player?.disconnect(); } catch { /* noop */ }
      playerRef.current = null;
      readyRef.current = false;
      deviceIdRef.current = null;
      currentTrackRef.current = null;
    };
  }, [shouldInit]); // eslint-disable-line react-hooks/exhaustive-deps

  // 3) Mirror the master volume (masterVolume * broadcastMasterVolume) onto the SDK.
  useEffect(() => {
    const v = clamp01((masterVolume ?? 1) * (broadcastMasterVolume ?? 1));
    volumeRef.current = v;
    if (readyRef.current) playerRef.current?.setVolume(v).catch(() => {});
  }, [masterVolume, broadcastMasterVolume]);

  // Start a specific track at a position via the Web API on our SDK device.
  const playTrackAt = useCallback(async (trackUri, positionMs) => {
    const deviceId = deviceIdRef.current;
    if (!deviceId) return;
    const body = JSON.stringify({ uris: [trackUri], position_ms: Math.max(0, Math.floor(positionMs)) });
    try {
      const token = await fetchAccessToken();
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const doPlay = () => fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, { method: 'PUT', headers, body });

      let resp = await doPlay();
      // 404 "Device not found": the SDK device isn't the active Connect device yet.
      // Transfer playback to it, then retry once.
      if (resp.status === 404) {
        console.warn('🎵 device not active — transferring to SDK device and retrying');
        await fetch('https://api.spotify.com/v1/me/player', {
          method: 'PUT', headers,
          body: JSON.stringify({ device_ids: [deviceId], play: false }),
        });
        await new Promise((r) => setTimeout(r, 600));
        resp = await doPlay();
      }

      if (!resp.ok) {
        const t = await resp.text().catch(() => '');
        console.error(`🎵 Spotify play PUT failed: ${resp.status} ${t.slice(0, 200)}`);
      } else {
        console.log(`🎵 Spotify play PUT ok (device ${deviceId.slice(0, 8)}…, pos ${Math.floor(positionMs)}ms)`);
        currentTrackRef.current = trackUri;
        // Probe: is the SDK actually the active device, and at what volume?
        setTimeout(async () => {
          try {
            const st = await playerRef.current?.getCurrentState();
            const vol = await playerRef.current?.getVolume();
            console.log('🎵 post-play probe:',
              st ? { paused: st.paused, pos: st.position, track: st.track_window?.current_track?.name } : 'getCurrentState=NULL (SDK is NOT the active device — audio went elsewhere)',
              'volume=', vol);
          } catch (e) { console.warn('probe failed', e); }
        }, 1500);
      }
    } catch (e) {
      console.error('Spotify play failed:', e);
    }
  }, []);

  // Core: reconcile the SDK to a broadcast anchor snapshot.
  const applyToSDK = useCallback((snap) => {
    const player = playerRef.current;
    console.log('🎵 applyToSDK: player=%s ready=%s state=%s sameTrack=%s',
      !!player, readyRef.current, snap?.playback_state, currentTrackRef.current === snap?.track_uri);
    if (!snap || !snap.track_uri || !player || !readyRef.current) {
      console.warn('🎵 applyToSDK early-return (no player / not ready / no track)');
      return;
    }

    const durationMs = snap.track_meta?.duration_ms || null;
    const state = snap.playback_state;

    if (state === 'stopped') {
      player.pause().catch(() => {});
      return;
    }

    const positionMs = computePositionMs(snap, durationMs);
    const sameTrack = currentTrackRef.current === snap.track_uri;

    if (state === 'paused') {
      if (sameTrack) {
        player.seek(positionMs).then(() => player.pause()).catch(() => {});
      } else {
        // Late-join into a paused track: load then settle to paused (brief blip).
        playTrackAt(snap.track_uri, positionMs).then(() => {
          setTimeout(() => player.pause().catch(() => {}), 350);
        });
      }
      return;
    }

    // playing
    if (sameTrack) {
      // Resume/seek on the same track — avoids a re-buffer/hard cut.
      player.seek(positionMs).then(() => player.resume()).catch(() => {});
    } else {
      playTrackAt(snap.track_uri, positionMs);
    }
  }, [playTrackAt]);

  // Public: called for every `spotify_state` broadcast and the initial_state snapshot.
  const applySpotifySnapshot = useCallback((snap) => {
    if (!snap || !snap.track_uri) { setNowPlaying(snap || null); return; }
    setNowPlaying(snap);
    console.log('🎵 applySnapshot: ready=%s -> %s', readyRef.current, readyRef.current ? 'applyToSDK' : 'pending');
    if (readyRef.current) {
      applyToSDK(snap);
    } else {
      // SDK not up yet (still connecting, or a non-Premium client) — remember the
      // latest so we can catch up the moment 'ready' fires.
      pendingSnapshotRef.current = snap;
    }
  }, [applyToSDK]);

  // Unlock the SDK's audio element. MUST be called from a user gesture (click),
  // otherwise the browser's autoplay policy silently blocks Spotify audio — and
  // our play() fires after an async WS round-trip, detached from the click.
  const activate = useCallback(async () => {
    try {
      await playerRef.current?.activateElement();
      console.log('🎵 Spotify audio element activated');
    } catch (e) {
      console.warn('Spotify activateElement failed:', e);
    }
  }, []);

  return { status, profile, nowPlaying, applySpotifySnapshot, activate };
}

function clamp01(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return 1;
  return Math.max(0, Math.min(1, n));
}

function computePositionMs(snap, durationMs) {
  if (snap.playback_state === 'paused') {
    return (snap.paused_elapsed || 0) * 1000;
  }
  // playing: derive from the server epoch anchor (same math as useUnifiedAudio).
  let posSec = Math.max(0, (Date.now() / 1000) - (snap.started_at || 0) - NETWORK_COMPENSATION);
  if (durationMs) {
    const durSec = durationMs / 1000;
    posSec = snap.is_looping ? (posSec % durSec) : Math.min(posSec, durSec);
  }
  return posSec * 1000;
}
