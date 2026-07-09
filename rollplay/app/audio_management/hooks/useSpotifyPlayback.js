/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useState, useEffect, useRef, useCallback } from 'react';
import { authFetch } from '@/app/shared/utils/authFetch';
import { isIOSNonSafari } from '@/app/shared/utils/platform';

const SDK_SRC = 'https://sdk.scdn.co/spotify-player.js';
const PLAYER_NAME = 'Tabletop Tavern'; // the SDK device name — used to find our device in Spotify's list
// Default mixer level for the Spotify bed: -12 dB (linear ≈ 0.251). Display priming only —
// the authoritative default lives in the SpotifyState contract (rollplay-shared-contracts/
// shared_contracts/spotify.py) and arrives with the first snapshot; this just matches it for
// the moments before that broadcast lands. Keep the two values in sync.
export const SPOTIFY_DEFAULT_LEVEL = 10 ** (-12 / 20);
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

// --- TEMPORARY device-race instrumentation. Flip off (or delete) once the first-entry ---
// --- "Device not found" timing is nailed down. Timestamps are ms since page/module load. ---
const SPOTIFY_DEBUG = false;
const _dbgT0 = (typeof performance !== 'undefined') ? performance.now() : 0;
function dbg(...args) {
  if (!SPOTIFY_DEBUG) return;
  const t = ((typeof performance !== 'undefined' ? performance.now() : 0) - _dbgT0).toFixed(0);
  // eslint-disable-next-line no-console
  console.log(`🎛️[+${t}ms]`, ...args);
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
 * status: 'idle' | 'connecting' | 'ready' | 'blocked' | 'unsupported_browser'
 *       | 'not_connected' | 'not_premium' | 'error'
 *
 * 'unsupported_browser': non-Safari iOS browser (Chrome/Firefox/etc. on iPad/iPhone) —
 * WebKit shells with no FairPlay DRM, so the SDK can never produce audio. We skip SDK
 * init entirely; snapshots still flow (nowPlaying populates for UI/notices).
 *
 * Autoplay/unlock model: the SDK's media element only produces sound if it was activated
 * from a user gesture (or Chrome's per-origin engagement score happens to waive it).
 * `unlock()` must be called synchronously from the one guaranteed gesture (the Enter
 * Session gate click) — it activates the element AND starts `connect()`, because Safari
 * only honours activation when connect() itself originates from a gesture. If playback is
 * still blocked (`autoplay_failed`), status becomes 'blocked' and the next pointerdown
 * anywhere recovers (re-activate + re-apply the last snapshot).
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
  onChannelLevel = null,
  channelLevel = SPOTIFY_DEFAULT_LEVEL,
  masterVolume = 1,
  broadcastMasterVolume = 1,
} = {}) {
  const [status, setStatus] = useState('idle');
  const [profile, setProfile] = useState(null);
  const [nowPlaying, setNowPlaying] = useState(null); // last broadcast snapshot (UI)
  const [playbackState, setPlaybackState] = useState(null); // leader's live SDK state (for the seek bar)
  const [shouldInit, setShouldInit] = useState(false);

  const playerRef = useRef(null);
  const creatingRef = useRef(false);        // guards against creating a 2nd player (StrictMode double-invoke)
  const gestureSeenRef = useRef(false);     // the gate (or another gesture) has fired unlock()
  const connectStartedRef = useRef(false);  // connect() dispatched — never connect twice per player
  const disconnectTimerRef = useRef(null);  // deferred teardown so StrictMode's transient unmount doesn't kill the device
  const deviceIdRef = useRef(null);
  const readyRef = useRef(false);
  const currentTrackRef = useRef(null);
  const pendingSnapshotRef = useRef(null);
  const nowPlayingRef = useRef(null);       // last snapshot, for blocked-state recovery re-apply
  const applyToSDKRef = useRef(null);       // recoverPlayback → applyToSDK (declared later) bridge
  const volumeRef = useRef(clamp01((masterVolume ?? 1) * (broadcastMasterVolume ?? 1) * (channelLevel ?? SPOTIFY_DEFAULT_LEVEL)));
  const isLeaderRef = useRef(isLeader);
  const onLeaderStateRef = useRef(onLeaderState);
  const onChannelLevelRef = useRef(onChannelLevel);
  const lastReportKeyRef = useRef(null);
  const lastPlaybackSigRef = useRef(null);
  const currentContextRef = useRef(null); // playlist/album we're playing — tracked ourselves; the SDK's context.uri is unreliable

  useEffect(() => { dbg('isLeader ->', isLeader); isLeaderRef.current = isLeader; }, [isLeader]);
  useEffect(() => { onLeaderStateRef.current = onLeaderState; }, [onLeaderState]);
  useEffect(() => { onChannelLevelRef.current = onChannelLevel; }, [onChannelLevel]);

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
      context_uri: currentContextRef.current || st.context?.uri || null,
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
    dbg('activateElement CALLED, player=', !!playerRef.current);
    try { await playerRef.current?.activateElement(); dbg('activateElement OK'); } catch (e) { dbg('activateElement THREW', String(e)); }
  }, []);

  // Connect exactly once per player instance. Re-activates after connect resolves — the SDK's
  // media element exists by then, and we're usually still inside the gesture's transient window.
  const connectNow = useCallback(async () => {
    const player = playerRef.current;
    if (!player || connectStartedRef.current) return;
    connectStartedRef.current = true;
    try {
      const ok = await player.connect();
      dbg('connect ->', ok);
      if (!ok) {
        // connect() resolves false instead of throwing (auth/network/token failures) —
        // release the guard so a later gesture can retry, and surface the failure
        // instead of sitting on 'connecting' forever.
        connectStartedRef.current = false;
        console.error('Spotify connect refused (resolved false)');
        setStatus('error');
        return;
      }
      try { await player.activateElement(); } catch { /* activation retried on next gesture */ }
    } catch (e) {
      connectStartedRef.current = false;
      console.error('Spotify connect failed:', e);
    }
  }, []);

  // The gate-click entry point. Call synchronously inside the gesture handler (before any
  // await): Safari only unblocks SDK audio when connect() originates from a user gesture, and
  // activateElement() only counts inside the synchronous event path. Safe to call when the
  // player doesn't exist yet — the create effect connects on creation once a gesture was seen,
  // and the 'blocked' recovery path picks up activation on the next interaction if needed.
  const unlock = useCallback(() => {
    gestureSeenRef.current = true;
    const player = playerRef.current;
    dbg('unlock CALLED, player=', !!player, 'connectStarted=', connectStartedRef.current);
    if (!player) return;
    try { player.activateElement()?.catch?.(() => {}); } catch { /* pre-connect activation is best-effort */ }
    connectNow();
  }, [connectNow]);

  // Recover from 'blocked' (autoplay_failed) — MUST run from a user gesture. Re-activates the
  // element, then re-applies the last snapshot (the dedup signature would otherwise swallow it).
  // Cooldown guard: clicking the recovery pill fires the hook's one-shot pointerdown listener
  // AND the pill's onClick — absorb the pair into one recovery.
  const recoveringRef = useRef(false);
  const recoverPlayback = useCallback(async () => {
    const player = playerRef.current;
    if (!player || recoveringRef.current) return;
    recoveringRef.current = true;
    setTimeout(() => { recoveringRef.current = false; }, 500);
    try { await player.activateElement(); } catch { /* noop */ }
    setStatus(readyRef.current ? 'ready' : 'connecting');
    if (isLeaderRef.current) { player.resume().catch(() => {}); return; }
    lastPlaybackSigRef.current = null;
    if (nowPlayingRef.current) applyToSDKRef.current?.(nowPlayingRef.current);
  }, []);

  // On first game entry the device may still be registering (profile fetch → SDK load →
  // connect → 'ready' is several async hops). Wait for it instead of dropping the action —
  // otherwise an early click on resume/a track silently no-ops until a full page reload.
  const waitForDevice = useCallback(async (timeoutMs = 10000) => {
    if (deviceIdRef.current) return true;
    const start = Date.now();
    while (!deviceIdRef.current && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 150));
    }
    return !!deviceIdRef.current;
  }, []);

  // Transfer playback to our SDK device so it becomes the active Spotify Connect device.
  // Right after the 'ready' event, Spotify's backend hasn't finished registering the device,
  // so playback/transport commands 404 "Device not found" until this lands.
  // DIAGNOSTIC: ask Spotify what devices it actually has registered right now.
  const logDevices = useCallback(async (headers, tag) => {
    try {
      const r = await fetch('https://api.spotify.com/v1/me/player/devices', { headers });
      const j = await r.json().catch(() => ({}));
      const list = (j.devices || []).map((d) => `${d.id?.slice(0, 8)}${d.is_active ? '*' : ''}:${d.name}`);
      dbg(`devices[${tag}] ->`, r.status, list.length ? list.join(' | ') : '(NONE)', '| want=', deviceIdRef.current?.slice(0, 8));
    } catch (e) { dbg(`devices[${tag}] THREW`, String(e)); }
  }, []);

  // Reconcile our cached device id against Spotify's LIVE device list. StrictMode/remounts can
  // leave us holding the id of a player Spotify has already reaped; the real SDK device is the
  // one currently listed under our player name. Adopt it so we never transfer/play to a corpse.
  const reconcileDevice = useCallback(async (headers) => {
    try {
      const r = await fetch('https://api.spotify.com/v1/me/player/devices', { headers });
      if (!r.ok) return deviceIdRef.current;
      const devices = (await r.json().catch(() => ({}))).devices || [];
      if (deviceIdRef.current && devices.some((d) => d.id === deviceIdRef.current)) return deviceIdRef.current;
      const ours = devices.find((d) => d.name === PLAYER_NAME);
      if (ours && ours.id !== deviceIdRef.current) {
        dbg('reconcile: adopting live device', ours.id?.slice(0, 8), 'was', deviceIdRef.current?.slice(0, 8) ?? 'null');
        deviceIdRef.current = ours.id;
      }
      return deviceIdRef.current;
    } catch { return deviceIdRef.current; }
  }, []);

  const transferToDevice = useCallback(async (headers, deviceId) => {
    try {
      const r = await fetch('https://api.spotify.com/v1/me/player', {
        method: 'PUT', headers, body: JSON.stringify({ device_ids: [deviceId], play: false }),
      });
      dbg('transfer ->', r.status, 'device=', deviceId?.slice(0, 8));
      if (r.status === 404) await logDevices(headers, 'on-transfer-404'); // what DOES Spotify see?
    } catch (e) { dbg('transfer THREW', String(e)); }
  }, [logDevices]);

  // Play a body (uris or context_uri) on our device. Retries through the device-registration
  // race: on 404, transfer to our device and retry with backoff (registration can take >600ms
  // on a cold start, and is churned by StrictMode's double-mount in dev).
  const playBody = useCallback(async (body) => {
    dbg('playBody CALLED device=', deviceIdRef.current?.slice(0, 8) ?? 'null', 'isLeader=', isLeaderRef.current, 'body=', JSON.stringify(body).slice(0, 80));
    if (!deviceIdRef.current) { dbg('playBody waiting for device…'); await waitForDevice(); dbg('playBody waited, device=', deviceIdRef.current?.slice(0, 8) ?? 'STILL-NULL'); }
    try {
      const token = await fetchAccessToken();
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      // Adopt Spotify's live device before playing — our cached id may point at a reaped player.
      const deviceId = await reconcileDevice(headers);
      if (!deviceId) { dbg('playBody ABORT — no live device'); return; }
      const doPlay = () => fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, { method: 'PUT', headers, body: JSON.stringify(body) });
      let resp = await doPlay();
      dbg('play attempt#0 ->', resp.status);
      for (let attempt = 0; resp.status === 404 && attempt < 3; attempt++) {
        await transferToDevice(headers, deviceId);
        await new Promise((r) => setTimeout(r, 400 + attempt * 400)); // 400 / 800 / 1200ms
        resp = await doPlay();
        dbg(`play retry#${attempt + 1} ->`, resp.status);
      }
      if (!resp.ok) {
        const t = await resp.text().catch(() => '');
        console.error(`🎵 Spotify play failed: ${resp.status} ${t.slice(0, 200)}`);
      } else {
        dbg('play OK');
      }
    } catch (e) {
      console.error('Spotify play failed:', e);
    }
  }, [transferToDevice, waitForDevice, reconcileDevice]);

  // Follower: play a single track at a synced position.
  const playTrackAt = useCallback(async (trackUri, positionMs) => {
    await playBody({ uris: [trackUri], position_ms: Math.max(0, Math.floor(positionMs)) });
    currentTrackRef.current = trackUri;
  }, [playBody]);

  // --- Leader controls (used by the DM's panel; each reports the resulting state) ---
  const playTrack = useCallback(async (trackUri) => { await activate(); currentContextRef.current = null; await playBody({ uris: [trackUri] }); setTimeout(() => reportState(true), 500); }, [activate, playBody, reportState]);
  const playContext = useCallback(async (contextUri, offsetUri = null) => {
    await activate();
    currentContextRef.current = contextUri; // remember the playlist/album we're playing
    const body = offsetUri ? { context_uri: contextUri, offset: { uri: offsetUri } } : { context_uri: contextUri };
    await playBody(body);
    setTimeout(() => reportState(true), 600);
  }, [activate, playBody, reportState]);
  const togglePlay = useCallback(async () => { await activate(); await playerRef.current?.togglePlay().catch(() => {}); setTimeout(() => reportState(true), 250); }, [activate, reportState]);
  const next = useCallback(async () => { await playerRef.current?.nextTrack().catch(() => {}); setTimeout(() => reportState(true), 350); }, [reportState]);
  const previous = useCallback(async () => { await playerRef.current?.previousTrack().catch(() => {}); setTimeout(() => reportState(true), 350); }, [reportState]);
  const seek = useCallback(async (positionMs) => { await playerRef.current?.seek(Math.max(0, Math.floor(positionMs))).catch(() => {}); setTimeout(() => reportState(true), 250); }, [reportState]);

  // "Resume where you left off" — start PLAYING the persisted snapshot at its anchored
  // position. Must be triggered from a user gesture (autoplay). Restored snapshots are
  // always frozen as 'paused' by the ETL, so do NOT honor that state here — this gesture
  // IS the un-pause. (Honoring it caused the old play-then-pause-at-450ms audio blip.)
  const resumeFromSnapshot = useCallback(async (snap) => {
    if (!snap || !snap.track_uri || snap.playback_state === 'stopped') return;
    await activate();
    const positionMs = computePositionMs(snap, snap.track_meta?.duration_ms || null);
    const body = snap.context_uri
      ? { context_uri: snap.context_uri, offset: { uri: snap.track_uri }, position_ms: Math.max(0, Math.floor(positionMs)) }
      : { uris: [snap.track_uri], position_ms: Math.max(0, Math.floor(positionMs)) };
    await playBody(body);
    currentTrackRef.current = snap.track_uri;
    currentContextRef.current = snap.context_uri || null;
    setTimeout(() => reportState(true), 700);
  }, [activate, playBody, reportState]);

  // Repeat mode via the Web API (the SDK has no method for it). state: 'off'|'context'|'track'.
  const setRepeat = useCallback(async (mode) => {
    const deviceId = deviceIdRef.current;
    if (!deviceId) return;
    try {
      const token = await fetchAccessToken();
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const doPut = () => fetch(`https://api.spotify.com/v1/me/player/repeat?state=${mode}&device_id=${deviceId}`, { method: 'PUT', headers });
      let resp = await doPut();
      if (resp.status === 404) { // device not active yet — transfer then retry once
        await transferToDevice(headers, deviceId);
        await new Promise((r) => setTimeout(r, 400));
        resp = await doPut();
      }
    } catch (e) {
      console.error('Spotify repeat failed:', e);
    }
  }, [transferToDevice]);

  // The SDK's live playback state (local, no network) — poll this for a real playhead.
  const getCurrentState = useCallback(() => playerRef.current?.getCurrentState?.() ?? Promise.resolve(null), []);

  // Follower: reconcile the SDK to a broadcast anchor snapshot.
  const applyToSDK = useCallback((snap) => {
    const player = playerRef.current;
    if (!snap || !snap.track_uri || !player || !readyRef.current) { dbg('applyToSDK SKIP player=', !!player, 'ready=', readyRef.current, 'track=', !!snap?.track_uri); return; }
    const durationMs = snap.track_meta?.duration_ms || null;
    const state = snap.playback_state;
    const sameTrack = currentTrackRef.current === snap.track_uri;
    dbg('applyToSDK state=', state, 'sameTrack=', sameTrack);
    if (state === 'stopped') { player.pause().catch(() => {}); return; }
    const positionMs = computePositionMs(snap, durationMs);
    if (state === 'paused') {
      // Already on this track → just seek + pause. Otherwise DON'T load audio just to pause it:
      // on a fresh entry there's been no user gesture, so the device isn't activated and the
      // load 404s "Device not found". Record the track; it loads when it actually plays.
      if (sameTrack) player.seek(positionMs).then(() => player.pause()).catch(() => {});
      else currentTrackRef.current = snap.track_uri;
      return;
    }
    // playing
    if (sameTrack) player.seek(positionMs).then(() => player.resume()).catch(() => {});
    else playTrackAt(snap.track_uri, positionMs);
  }, [playTrackAt]);
  useEffect(() => { applyToSDKRef.current = applyToSDK; }, [applyToSDK]);

  // Called for every `spotify_state` broadcast + the initial_state snapshot.
  const applySpotifySnapshot = useCallback((snap) => {
    dbg('applySnapshot isLeader=', isLeaderRef.current, 'track=', snap?.track_uri?.slice(14, 26), 'state=', snap?.playback_state, 'ready=', readyRef.current);
    setNowPlaying(snap || null);
    nowPlayingRef.current = snap || null;
    // Remember the playing context across reload/late-join so the leader reports it back
    // (the SDK's own context.uri is unreliable). Restored before the leader's early return.
    if (snap?.context_uri) currentContextRef.current = snap.context_uri;
    // Mixer channel level is synced to everyone (DM included — harmless echo).
    if (snap && snap.channel_level != null) onChannelLevelRef.current?.(snap.channel_level);
    // The leader is the source of truth — don't re-apply its own broadcast to its SDK.
    if (isLeaderRef.current) { dbg('applySnapshot -> leader early-return'); return; }
    if (!snap || !snap.track_uri) { playerRef.current?.pause?.().catch(() => {}); lastPlaybackSigRef.current = null; return; }
    // Skip re-applying playback when only the channel volume changed (avoids an audible re-seek).
    const sig = `${snap.track_uri}|${snap.playback_state}|${snap.started_at}|${snap.paused_elapsed}`;
    if (sig === lastPlaybackSigRef.current) return;
    lastPlaybackSigRef.current = sig;
    if (readyRef.current) applyToSDK(snap);
    else pendingSnapshotRef.current = snap; // catch up on 'ready'
  }, [applyToSDK]);

  // 1) Connection + Premium.
  useEffect(() => {
    if (!enabled) return;
    // Non-Safari iOS: no DRM, the SDK is a guaranteed silent failure — don't even probe
    // the profile. (iOS Safari proceeds: FairPlay exists there; treat it as supported
    // until real-device testing says otherwise.)
    if (isIOSNonSafari()) { setStatus('unsupported_browser'); return; }
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

  // 2) Create the SDK player exactly ONCE per page, StrictMode-safe.
  //    React StrictMode (dev) runs this effect's setup→cleanup→setup on the same instance, and a
  //    synchronous disconnect() in cleanup would deregister the device we just created — leaving us
  //    caching the id of a reaped player (the proven root cause of "Device not found" on first
  //    entry). So: guard against a second create, and DEFER teardown so a fast remount cancels it.
  useEffect(() => {
    if (!shouldInit) return;

    // A cleanup that just fired (StrictMode remount / fast re-entry) scheduled a teardown — we're
    // still here, so cancel it and keep the existing player + device.
    if (disconnectTimerRef.current) { clearTimeout(disconnectTimerRef.current); disconnectTimerRef.current = null; }

    // Real unmount: no re-run cancels this, so after the grace window we truly disconnect.
    // Spotify also reaps the device when the socket drops — this is just prompt cleanup.
    const scheduleTeardown = () => {
      if (disconnectTimerRef.current) return;
      disconnectTimerRef.current = setTimeout(() => {
        disconnectTimerRef.current = null;
        const p = playerRef.current;
        try { p?.disconnect(); } catch { /* noop */ }
        dbg('player torn down (real unmount)');
        playerRef.current = null;
        creatingRef.current = false;
        connectStartedRef.current = false;
        readyRef.current = false;
        deviceIdRef.current = null;
        currentTrackRef.current = null;
      }, 2000);
    };

    // Guard: one player only. StrictMode's 2nd invoke (or a re-entry mid-connect) reuses it.
    if (playerRef.current || creatingRef.current) { dbg('create effect: reusing existing player'); return scheduleTeardown; }
    creatingRef.current = true;

    (async () => {
      try {
        const Spotify = await loadSpotifySDK();
        if (playerRef.current) { creatingRef.current = false; return; } // a concurrent invoke won
        const player = new Spotify.Player({
          name: PLAYER_NAME,
          getOAuthToken: (cb) => { fetchAccessToken().then(cb).catch((e) => console.error('Spotify token error', e)); },
          volume: volumeRef.current,
        });

        player.addListener('ready', ({ device_id }) => {
          dbg('READY device=', device_id?.slice(0, 8), 'isLeader=', isLeaderRef.current, 'pending=', !!pendingSnapshotRef.current);
          deviceIdRef.current = device_id;
          readyRef.current = true;
          setStatus('ready');
          // DM: 'ready' means Spotify has registered this device, so make it the ACTIVE Connect
          // device now — otherwise the first play/resume 404s "Device not found" (= not active).
          if (isLeaderRef.current) {
            fetchAccessToken()
              .then((token) => transferToDevice({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, device_id))
              .catch(() => {});
          }
          if (pendingSnapshotRef.current) { applyToSDK(pendingSnapshotRef.current); pendingSnapshotRef.current = null; }
        });
        player.addListener('not_ready', ({ device_id }) => {
          dbg('NOT_READY device=', device_id?.slice(0, 8), 'current=', deviceIdRef.current?.slice(0, 8), 'match=', deviceIdRef.current === device_id);
          readyRef.current = false;
          if (deviceIdRef.current === device_id) deviceIdRef.current = null;
        });
        player.addListener('initialization_error', ({ message }) => { console.error('Spotify init error:', message); setStatus('error'); });
        player.addListener('authentication_error', ({ message }) => { console.error('Spotify auth error:', message); setStatus('error'); });
        player.addListener('account_error', ({ message }) => { console.error('Spotify account error:', message); setStatus('not_premium'); });
        player.addListener('playback_error', ({ message }) => { console.error('🎵 Spotify playback_error:', message); });
        player.addListener('autoplay_failed', () => {
          console.warn('🎵 Spotify autoplay blocked — next interaction (or the unlock pill) recovers it.');
          setStatus('blocked');
        });

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

        playerRef.current = player;
        creatingRef.current = false;
        // connect() is gesture-deferred: Safari only unblocks SDK audio when the connect
        // originates from a user gesture, and Chrome wants playback to start post-gesture
        // anyway. If the gate was already clicked (unlock() before the player existed —
        // slow SDK load), connect immediately; the gate click still counts as engagement.
        if (gestureSeenRef.current) connectNow();
      } catch (e) {
        creatingRef.current = false;
        console.error('Spotify SDK setup failed:', e);
        setStatus('error');
      }
    })();

    return scheduleTeardown;
  }, [shouldInit]); // eslint-disable-line react-hooks/exhaustive-deps

  // 3) Effective SDK volume = local master × broadcast master × Spotify channel level.
  useEffect(() => {
    const v = clamp01((masterVolume ?? 1) * (broadcastMasterVolume ?? 1) * (channelLevel ?? SPOTIFY_DEFAULT_LEVEL));
    volumeRef.current = v;
    if (readyRef.current) playerRef.current?.setVolume(v).catch(() => {});
  }, [masterVolume, broadcastMasterVolume, channelLevel]);

  // 4) While blocked, the next pointerdown anywhere recovers — this is what makes
  //    "interact with the page to unlock" actually true (activation needs a gesture).
  useEffect(() => {
    if (status !== 'blocked') return;
    const onPointerDown = () => { recoverPlayback(); };
    document.addEventListener('pointerdown', onPointerDown, { once: true, capture: true });
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [status, recoverPlayback]);

  return {
    status,
    profile,
    nowPlaying,
    playbackState,
    applySpotifySnapshot,
    activate,
    unlock,
    recoverPlayback,
    getCurrentState,
    // leader controls
    playTrack,
    playContext,
    togglePlay,
    next,
    previous,
    seek,
    setRepeat,
    resumeFromSnapshot,
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
