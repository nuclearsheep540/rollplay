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
 * In-browser Spotify SDK player for the game-runtime BGM bed.
 *
 * Two roles:
 *  - LEADER (the DM's client): drives real playback on its own SDK (play a track or
 *    a playlist context; next/prev/seek/togglePlay), and reports its live state up via
 *    onLeaderState so the server can anchor + broadcast it. Spotify handles gapless
 *    auto-advance natively.
 *  - FOLLOWER (everyone else): applies the broadcast anchor snapshots to its own SDK,
 *    staying synced to the leader. No controls.
 *
 * status: 'idle' | 'connecting' | 'ready' | 'not_connected' | 'not_premium' | 'error'
 *
 * @param {object}   opts
 * @param {boolean}  opts.enabled              master switch (e.g. only in an active game)
 * @param {boolean}  opts.isLeader             true for the DM (drives + reports); false = follow
 * @param {function} opts.onLeaderState        called with the leader's live state to broadcast
 * @param {number}   opts.masterVolume         local per-client master (0..1)
 * @param {number}   opts.broadcastMasterVolume DM-synced master (0..1)
 */
export function useSpotifyPlayback({
  enabled = true,
  isLeader = false,
  onLeaderState = null,
  masterVolume = 1,
  broadcastMasterVolume = 1,
} = {}) {
  const [status, setStatus] = useState('idle');
  const [profile, setProfile] = useState(null);
  const [nowPlaying, setNowPlaying] = useState(null); // last broadcast snapshot (UI)
  const [playbackState, setPlaybackState] = useState(null); // leader's live SDK state (for the seek bar)
  const [shouldInit, setShouldInit] = useState(false);

  const playerRef = useRef(null);
  const deviceIdRef = useRef(null);
  const readyRef = useRef(false);
  const currentTrackRef = useRef(null);
  const pendingSnapshotRef = useRef(null);
  const volumeRef = useRef(clamp01((masterVolume ?? 1) * (broadcastMasterVolume ?? 1)));
  const isLeaderRef = useRef(isLeader);
  const onLeaderStateRef = useRef(onLeaderState);
  const lastReportKeyRef = useRef(null);

  useEffect(() => { isLeaderRef.current = isLeader; }, [isLeader]);
  useEffect(() => { onLeaderStateRef.current = onLeaderState; }, [onLeaderState]);

  // --- Leader: read the SDK's live state and push it up (deduped by track+play-state) ---
  const reportState = useCallback(async (force = false) => {
    const player = playerRef.current;
    if (!player || !isLeaderRef.current) return;
    const st = await player.getCurrentState().catch(() => null);
    if (!st) {
      if (force) { lastReportKeyRef.current = 'none'; onLeaderStateRef.current?.({ track_uri: null, is_playing: false }); }
      return;
    }
    const ct = st.track_window?.current_track;
    const payload = {
      track_uri: ct?.uri || null,
      track_meta: ct ? {
        name: ct.name,
        artist: (ct.artists || []).map((a) => a.name).join(', '),
        art_url: ct.album?.images?.[0]?.url || null,
        duration_ms: st.duration,
      } : {},
      is_playing: !st.paused,
      position_ms: st.position,
      context_uri: st.context?.uri || null,
    };
    // Report on track change / play-pause toggle (position drift is handled by the anchor).
    // Explicit actions (seek etc.) pass force=true to push the new position.
    const key = `${payload.track_uri}|${payload.is_playing}`;
    if (!force && key === lastReportKeyRef.current) return;
    lastReportKeyRef.current = key;
    onLeaderStateRef.current?.(payload);
  }, []);

  // Unlock the SDK's audio element — MUST run from a user gesture (browser autoplay).
  const activate = useCallback(async () => {
    try { await playerRef.current?.activateElement(); } catch { /* noop */ }
  }, []);

  // Play a body (uris or context_uri) on our device, with the device-activation retry.
  const playBody = useCallback(async (body) => {
    const deviceId = deviceIdRef.current;
    if (!deviceId) return;
    try {
      const token = await fetchAccessToken();
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const doPlay = () => fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, { method: 'PUT', headers, body: JSON.stringify(body) });
      let resp = await doPlay();
      if (resp.status === 404) {
        // Device not active yet — transfer to it, then retry once.
        await fetch('https://api.spotify.com/v1/me/player', { method: 'PUT', headers, body: JSON.stringify({ device_ids: [deviceId], play: false }) });
        await new Promise((r) => setTimeout(r, 600));
        resp = await doPlay();
      }
      if (!resp.ok) {
        const t = await resp.text().catch(() => '');
        console.error(`🎵 Spotify play failed: ${resp.status} ${t.slice(0, 200)}`);
      }
    } catch (e) {
      console.error('Spotify play failed:', e);
    }
  }, []);

  // Follower: play a single track at a synced position.
  const playTrackAt = useCallback(async (trackUri, positionMs) => {
    await playBody({ uris: [trackUri], position_ms: Math.max(0, Math.floor(positionMs)) });
    currentTrackRef.current = trackUri;
  }, [playBody]);

  // --- Leader controls (used by the DM's panel; each reports the resulting state) ---
  const playTrack = useCallback(async (trackUri) => { await activate(); await playBody({ uris: [trackUri] }); setTimeout(() => reportState(true), 500); }, [activate, playBody, reportState]);
  const playContext = useCallback(async (contextUri, offsetUri = null) => {
    await activate();
    const body = offsetUri ? { context_uri: contextUri, offset: { uri: offsetUri } } : { context_uri: contextUri };
    await playBody(body);
    setTimeout(() => reportState(true), 600);
  }, [activate, playBody, reportState]);
  const togglePlay = useCallback(async () => { await activate(); await playerRef.current?.togglePlay().catch(() => {}); setTimeout(() => reportState(true), 250); }, [activate, reportState]);
  const next = useCallback(async () => { await playerRef.current?.nextTrack().catch(() => {}); setTimeout(() => reportState(true), 350); }, [reportState]);
  const previous = useCallback(async () => { await playerRef.current?.previousTrack().catch(() => {}); setTimeout(() => reportState(true), 350); }, [reportState]);
  const seek = useCallback(async (positionMs) => { await playerRef.current?.seek(Math.max(0, Math.floor(positionMs))).catch(() => {}); setTimeout(() => reportState(true), 250); }, [reportState]);

  // Follower: reconcile the SDK to a broadcast anchor snapshot.
  const applyToSDK = useCallback((snap) => {
    const player = playerRef.current;
    if (!snap || !snap.track_uri || !player || !readyRef.current) return;
    const durationMs = snap.track_meta?.duration_ms || null;
    const state = snap.playback_state;
    if (state === 'stopped') { player.pause().catch(() => {}); return; }
    const positionMs = computePositionMs(snap, durationMs);
    const sameTrack = currentTrackRef.current === snap.track_uri;
    if (state === 'paused') {
      if (sameTrack) player.seek(positionMs).then(() => player.pause()).catch(() => {});
      else playTrackAt(snap.track_uri, positionMs).then(() => setTimeout(() => player.pause().catch(() => {}), 350));
      return;
    }
    // playing
    if (sameTrack) player.seek(positionMs).then(() => player.resume()).catch(() => {});
    else playTrackAt(snap.track_uri, positionMs);
  }, [playTrackAt]);

  // Called for every `spotify_state` broadcast + the initial_state snapshot.
  const applySpotifySnapshot = useCallback((snap) => {
    setNowPlaying(snap || null);
    // The leader is the source of truth — don't re-apply its own broadcast to its SDK.
    if (isLeaderRef.current) return;
    if (!snap || !snap.track_uri) { playerRef.current?.pause?.().catch(() => {}); return; }
    if (readyRef.current) applyToSDK(snap);
    else pendingSnapshotRef.current = snap; // catch up on 'ready'
  }, [applyToSDK]);

  // 1) Connection + Premium.
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

  // 2) Create the SDK player exactly once (driven by shouldInit, NOT status — status
  //    changes to 'ready' inside this effect, and depending on it would tear the player
  //    down and deregister the device the instant it becomes ready).
  useEffect(() => {
    if (!shouldInit) return;
    let cancelled = false;
    let player = null;
    (async () => {
      try {
        const Spotify = await loadSpotifySDK();
        if (cancelled) return;
        player = new Spotify.Player({
          name: 'Tabletop Tavern',
          getOAuthToken: (cb) => { fetchAccessToken().then(cb).catch((e) => console.error('Spotify token error', e)); },
          volume: volumeRef.current,
        });

        player.addListener('ready', ({ device_id }) => {
          if (cancelled) return;
          deviceIdRef.current = device_id;
          readyRef.current = true;
          setStatus('ready');
          if (pendingSnapshotRef.current) { applyToSDK(pendingSnapshotRef.current); pendingSnapshotRef.current = null; }
        });
        player.addListener('not_ready', () => { readyRef.current = false; });
        player.addListener('initialization_error', ({ message }) => { console.error('Spotify init error:', message); if (!cancelled) setStatus('error'); });
        player.addListener('authentication_error', ({ message }) => { console.error('Spotify auth error:', message); if (!cancelled) setStatus('error'); });
        player.addListener('account_error', ({ message }) => { console.error('Spotify account error:', message); if (!cancelled) setStatus('not_premium'); });
        player.addListener('playback_error', ({ message }) => { console.error('🎵 Spotify playback_error:', message); });
        player.addListener('autoplay_failed', () => { console.warn('🎵 Spotify autoplay blocked — click a control to activate audio.'); });

        // Live state → seek bar + leader reporting (track changes, natural advances, pause).
        player.addListener('player_state_changed', (st) => {
          if (!st) { setPlaybackState(null); return; }
          const ct = st.track_window?.current_track;
          setPlaybackState({
            position: st.position,
            duration: st.duration,
            paused: st.paused,
            trackName: ct?.name || null,
            artist: (ct?.artists || []).map((a) => a.name).join(', '),
            artUrl: ct?.album?.images?.[0]?.url || null,
            contextUri: st.context?.uri || null,
          });
          if (isLeaderRef.current) reportState(false);
        });

        await player.connect();
        playerRef.current = player;
      } catch (e) {
        console.error('Spotify SDK setup failed:', e);
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      try { player?.disconnect(); } catch { /* noop */ }
      playerRef.current = null;
      readyRef.current = false;
      deviceIdRef.current = null;
      currentTrackRef.current = null;
    };
  }, [shouldInit]); // eslint-disable-line react-hooks/exhaustive-deps

  // 3) Mirror master volume (masterVolume * broadcastMasterVolume) onto the SDK.
  useEffect(() => {
    const v = clamp01((masterVolume ?? 1) * (broadcastMasterVolume ?? 1));
    volumeRef.current = v;
    if (readyRef.current) playerRef.current?.setVolume(v).catch(() => {});
  }, [masterVolume, broadcastMasterVolume]);

  return {
    status,
    profile,
    nowPlaying,
    playbackState,
    applySpotifySnapshot,
    activate,
    // leader controls
    playTrack,
    playContext,
    togglePlay,
    next,
    previous,
    seek,
  };
}

function clamp01(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return 1;
  return Math.max(0, Math.min(1, n));
}

function computePositionMs(snap, durationMs) {
  if (snap.playback_state === 'paused') return (snap.paused_elapsed || 0) * 1000;
  let posSec = Math.max(0, (Date.now() / 1000) - (snap.started_at || 0) - NETWORK_COMPENSATION);
  if (durationMs) {
    const durSec = durationMs / 1000;
    posSec = snap.is_looping ? (posSec % durSec) : Math.min(posSec, durSec);
  }
  return posSec * 1000;
}
