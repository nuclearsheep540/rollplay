/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useState, useEffect, useRef, useCallback } from 'react';
import { authFetch } from '@/app/shared/utils/authFetch';
import { isIOSNonSafari } from '@/app/shared/utils/platform';
import {
  diagVerbose,
  spotifyDxLog,
  logBootReport,
  classifyPlayFailure,
  verifyPlaybackProgress,
  installSdkEnvironmentTaps,
  activationState,
  findSdkIframe,
} from './spotifyDiagnostics';

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
    s.onerror = () => {
      // Reset the module cache so a later mount (SPA re-entry) can retry the load —
      // otherwise a transient CDN failure is fatal until a hard refresh.
      sdkPromise = null;
      s.remove();
      reject(new Error('Failed to load Spotify Web Playback SDK'));
    };
    document.body.appendChild(s);
  });
  return sdkPromise;
}

async function fetchAccessToken() {
  const r = await authFetch('/api/spotify/token', { credentials: 'include' });
  if (!r.ok) {
    // Surface the backend's error body — it carries the discriminator (e.g. an
    // upstream invalid_grant vs a transient 5xx) that a bare status hides.
    const bodyText = await r.text().catch(() => '');
    throw new Error(`token ${r.status} ${bodyText.slice(0, 200)}`);
  }
  const j = await r.json();
  return j.access_token;
}

// Verbose timing/event stream — runtime-enableable on ANY client (production
// included) via localStorage.setItem('tt_spotify_debug', '1'); no deploy needed.
// Failure evidence does NOT go through this: spotifyDxLog lines are always on.
// (Replaces the old compile-time SPOTIFY_DEBUG const, which no real user could flip.)
const dbg = diagVerbose;

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
 * Gate sequencing: the boot chain (profile → SDK script → player construction) is driven by
 * `enabled` — GameContent flips it on as the gate's LAST loading phase, and the gate CTA waits
 * on the exported `gestureReady` so the Enter click always finds a player to activate. If the
 * gate's liveness fallback opens the CTA before the player exists, the late-created player
 * connects with `activationMissingRef` set and surfaces as 'blocked' (recoverable) instead of
 * pretending the spent gesture covered it. See .claude/plans/spotify/03-gate-gesture-race.md.
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
  // Last raw SDK error event — {event, message, ts}. The message string is the
  // ONLY discriminator the SDK provides (no error codes), so keep it verbatim.
  const [lastError, setLastError] = useState(null);
  // Spotify.Player object constructed (NOT yet connected — connect is gesture-deferred).
  // "sdkPlayer", never "player", outside this hook: in Rollplay "player" means a human.
  const [sdkPlayerCreated, setSdkPlayerCreated] = useState(false);

  const playerRef = useRef(null);
  const creatingRef = useRef(false);        // guards against creating a 2nd player (StrictMode double-invoke)
  const gestureSeenRef = useRef(false);     // the gate (or another gesture) has fired unlock()
  const activationMissingRef = useRef(false); // connect() ran without a live gesture — 'ready' must land as 'blocked'
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
  // --- Diagnostics plumbing (see spotifyDiagnostics.js + the 2026-08-20 audit) ---
  const statusRef = useRef('idle');           // status mirror for async diagnostics callbacks
  const tokenRequestSeqRef = useRef(0);       // getOAuthToken invocation counter (retry bursts are diagnostic)
  const tokenFailStreakRef = useRef(0);       // consecutive token-fetch failures
  const lastGoodTokenRef = useRef(null);      // starvation fallback: last token we successfully handed the SDK
  const readyTimeoutRef = useRef(null);       // connect()→'ready' watchdog
  const envTapsUninstallRef = useRef(null);   // CSP-violation / SDK-message taps teardown
  const verifyRunningRef = useRef(false);     // one playback verification at a time
  const verifyTimeoutRef = useRef(null);      // pending verification timer — cleared on teardown
  const silentSessionReportedRef = useRef(false); // one-shot "session plays but you can't" breadcrumb

  useEffect(() => { statusRef.current = status; }, [status]);
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
    dbg('activateElement CALLED, player=', !!playerRef.current,
      'activation=', typeof navigator !== 'undefined' && navigator.userActivation?.isActive);
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
      dbg('connect ->', ok, 'activation=', activationState());
      if (!ok) {
        // connect() resolves false instead of throwing (auth/network/token failures) —
        // release the guard so a later gesture can retry, and surface the failure
        // instead of sitting on 'connecting' forever.
        connectStartedRef.current = false;
        spotifyDxLog('error', 'Spotify connect refused (resolved false) — bad token, blocked SDK script, or non-HTTPS origin.',
          { iframe: findSdkIframe() });
        setStatus('error');
        return;
      }
      // Watchdog: connect()===true only means the SDK bootstrapped — device
      // registration can still fail with NO event (Spotify 5xx, entitlement
      // rejection the SDK swallows). Without this, a follower pins on
      // 'connecting' forever with zero console evidence.
      if (readyTimeoutRef.current) clearTimeout(readyTimeoutRef.current);
      readyTimeoutRef.current = setTimeout(() => {
        readyTimeoutRef.current = null;
        if (readyRef.current) return;
        spotifyDxLog('error', 'Spotify connect() succeeded but no ready event arrived within 10s — the device never registered with Spotify Connect.',
          { iframe: findSdkIframe(), activation: activationState() });
        setStatus('error');
      }, 10000);
      try { await player.activateElement(); } catch { /* activation retried on next gesture */ }
    } catch (e) {
      connectStartedRef.current = false;
      spotifyDxLog('error', 'Spotify connect failed:', String(e));
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
    dbg('unlock CALLED, player=', !!player, 'connectStarted=', connectStartedRef.current,
      'activation=', typeof navigator !== 'undefined' && navigator.userActivation?.isActive);
    if (!player) {
      // The gate CTA waits for player creation (gestureReady), so this branch should be
      // unreachable. If it ever logs in the wild, the gate/boot sequencing has regressed
      // (see .claude/plans/spotify/03-gate-gesture-race.md) — the gesture was spent on nothing.
      console.warn('🎵 Spotify unlock: gesture fired with no SDK player — gate sequencing regression');
      return;
    }
    activationMissingRef.current = false;
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
    activationMissingRef.current = false; // this ran from a real gesture — activation is live again
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
        const bodyText = await resp.text().catch(() => '');
        // The raw body is the discriminator: PREMIUM_REQUIRED vs allowlist 403
        // vs device 404 vs 429 each mean a different fix — classify it inline.
        const failure = classifyPlayFailure(resp.status, bodyText);
        spotifyDxLog('error', `Spotify play failed: HTTP ${resp.status}`, bodyText.slice(0, 200),
          `→ ${failure.code}: ${failure.explanation}`);
      } else {
        dbg('play OK');
      }
    } catch (e) {
      spotifyDxLog('error', 'Spotify play failed:', String(e));
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

  // After commanding playback, verify the SDK actually plays. The docs describe
  // a SILENT failure mode: un-activated playback arrives in PAUSED state with no
  // autoplay_failed event — status would stay 'ready' while the user hears
  // nothing, forever (the snapshot dedup swallows identical re-broadcasts).
  // Sampling getCurrentState() twice is the one decisive disambiguator: paused →
  // arm the existing 'blocked' recovery; frozen playhead → license/decode stall
  // (DRM-broken class); advancing → the SDK is fine and silence is below JS.
  const scheduleVerifyPlayback = useCallback(() => {
    if (verifyRunningRef.current) return;
    verifyRunningRef.current = true;
    // Initial delay covers playBody's transfer/404 retry ladder on cold starts.
    // Timer handle kept in a ref so teardown can cancel a pending verification
    // (otherwise it could fire against a torn-down player and arm a ghost pill).
    verifyTimeoutRef.current = setTimeout(async () => {
      verifyTimeoutRef.current = null;
      try {
        const outcome = await verifyPlaybackProgress(() => playerRef.current?.getCurrentState?.() ?? Promise.resolve(null));
        // The sample gap awaits ~2s — the player can be torn down mid-flight.
        if (!playerRef.current) { dbg('playback verify skipped — player torn down'); return; }
        if (nowPlayingRef.current?.playback_state !== 'playing') { dbg('playback verify skipped — snapshot no longer playing'); return; }
        if (outcome.verdict === 'advancing') { dbg('playback verified:', outcome.detail); return; }
        spotifyDxLog('warn', `Playback verification: ${outcome.verdict} — ${outcome.detail}`, {
          first: outcome.first ? { paused: outcome.first.paused, position: outcome.first.position } : null,
          second: outcome.second ? { paused: outcome.second.paused, position: outcome.second.position } : null,
        });
        if ((outcome.verdict === 'paused' || outcome.verdict === 'no-state')
          && statusRef.current === 'ready' && !isLeaderRef.current) {
          spotifyDxLog('warn', 'Arming blocked-recovery: playback was commanded but never started (silent autoplay block — no autoplay_failed event fired).');
          lastPlaybackSigRef.current = null; // let recovery re-apply the same snapshot
          setStatus('blocked');
        }
      } finally {
        verifyRunningRef.current = false;
      }
    }, 2500);
  }, []);

  // Follower: reconcile the SDK to a broadcast anchor snapshot.
  const applyToSDK = useCallback((snap) => {
    const player = playerRef.current;
    if (!snap || !snap.track_uri || !player || !readyRef.current) { dbg('applyToSDK SKIP player=', !!player, 'ready=', readyRef.current, 'track=', !!snap?.track_uri); return; }
    const durationMs = snap.track_meta?.duration_ms || null;
    const state = snap.playback_state;
    const sameTrack = currentTrackRef.current === snap.track_uri;
    dbg('applyToSDK state=', state, 'sameTrack=', sameTrack);
    if (state === 'stopped') { player.pause().catch(() => {}); return; }
    if (state === 'paused') {
      // DON'T load audio just to pause it: on a fresh entry there's been no user
      // gesture, so the device isn't activated and the load 404s "Device not
      // found". Record the track; it loads when it actually plays.
      if (!sameTrack) { currentTrackRef.current = snap.track_uri; return; }
      // Same track → seek + pause, but only if something is ACTUALLY loaded:
      // currentTrackRef alone doesn't prove it (the record-without-load path
      // above). getCurrentState() null = nothing loaded on this device.
      player.getCurrentState().then((liveState) => {
        if (liveState) player.seek(computePositionMs(snap, durationMs)).then(() => player.pause()).catch(() => {});
      }).catch(() => {});
      return;
    }
    // playing — PHANTOM-RESUME GUARD: a follower who joined during a pause has
    // currentTrackRef recorded but NOTHING loaded; seek/resume on an empty
    // player silently no-ops (seek/resume are transport commands — only the
    // Web-API play body actually loads a track). Probe the SDK instead of
    // trusting the ref: null state → full load path.
    player.getCurrentState().then((liveState) => {
      const positionMs = computePositionMs(snap, durationMs); // recompute post-await: wall-clock anchored
      if (sameTrack && liveState) {
        player.seek(positionMs).then(() => player.resume()).catch((resumeError) => {
          // A rejected resume here is almost always NotAllowedError (autoplay) —
          // don't swallow it: arm the existing blocked-recovery machinery.
          spotifyDxLog('warn', 'Spotify resume rejected:', String(resumeError), '— arming blocked-recovery.');
          lastPlaybackSigRef.current = null;
          setStatus('blocked');
        });
      } else {
        if (sameTrack && !liveState) {
          spotifyDxLog('log', 'Phantom-resume guard: track was recorded during a pause but never loaded on this device — issuing a full play command instead of resume.');
        }
        playTrackAt(snap.track_uri, positionMs);
      }
      scheduleVerifyPlayback();
    }).catch(() => {});
  }, [playTrackAt, scheduleVerifyPlayback]);
  useEffect(() => { applyToSDKRef.current = applyToSDK; }, [applyToSDK]);

  // Called for every `spotify_state` broadcast + the initial_state snapshot.
  const applySpotifySnapshot = useCallback((snap) => {
    dbg('applySnapshot isLeader=', isLeaderRef.current, 'track=', snap?.track_uri?.slice(14, 26), 'state=', snap?.playback_state, 'ready=', readyRef.current);
    setNowPlaying(snap || null);
    nowPlayingRef.current = snap || null;
    // Decisive breadcrumb for silent followers: the session is actively playing
    // Spotify but this client is in a state that can never produce audio. One
    // shot per page load — the boot report above it carries the raw evidence.
    if (!isLeaderRef.current && snap?.playback_state === 'playing'
      && !silentSessionReportedRef.current
      && ['not_connected', 'not_premium', 'unsupported_browser', 'error'].includes(statusRef.current)) {
      silentSessionReportedRef.current = true;
      spotifyDxLog('warn', `This session is playing Spotify but this client cannot hear it: status "${statusRef.current}" — see the Spotify boot report above for the raw reason.`);
    }
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
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        // Always-on boot report: raw profile response + DRM/EME probe + environment.
        // Fire-and-forget — the EME probe can take seconds and must not delay boot.
        logBootReport({ status: 'profile-checked', profileHttpStatus: res.status, profileBody: data }).catch(() => {});
        if (!res.ok || !data || !data.connected) { setStatus('not_connected'); return; }
        setProfile(data.profile || null);
        const product = data.profile?.product;
        if (product == null) {
          // Feb-2026 dev-mode rules document this field as REMOVED, with no
          // replacement for premium detection. When enforcement reaches our
          // client ID, gating on it would silently disable every user at once —
          // so proceed and let the SDK's account_error (the authoritative
          // entitlement verdict) reject non-Premium accounts instead.
          spotifyDxLog('warn', 'Spotify /v1/me returned NO product field (Feb-2026 dev-mode removal) — skipping the profile premium gate; the SDK account_error event is now the entitlement authority.');
        } else if (product !== 'premium') {
          setStatus('not_premium');
          return;
        }
        setStatus('connecting');
        setShouldInit(true);
      } catch (profileError) {
        if (!cancelled) {
          spotifyDxLog('error', 'Spotify profile check failed before reaching Spotify:', String(profileError));
          setStatus('error');
        }
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

    // Passive diagnostics: catch CSP blocks of sdk.scdn.co (fatal, otherwise
    // invisible to us) and mirror SDK iframe messages on the verbose stream.
    if (!envTapsUninstallRef.current) envTapsUninstallRef.current = installSdkEnvironmentTaps();

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
        activationMissingRef.current = false;
        if (readyTimeoutRef.current) { clearTimeout(readyTimeoutRef.current); readyTimeoutRef.current = null; }
        if (verifyTimeoutRef.current) { clearTimeout(verifyTimeoutRef.current); verifyTimeoutRef.current = null; }
        verifyRunningRef.current = false;
        envTapsUninstallRef.current?.();
        envTapsUninstallRef.current = null;
        setSdkPlayerCreated(false);
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
          // STARVATION GUARD: if cb is never invoked the SDK emits NO event and
          // no timeout — it silently re-invokes this callback forever while the
          // user pins on 'connecting'. So cb is ALWAYS eventually answered:
          // with the fresh token, with the last good one (may still be valid),
          // or — after repeated failures — with '' to force the SDK's VISIBLE
          // authentication_error instead of an invisible hang.
          getOAuthToken: (cb) => {
            tokenRequestSeqRef.current += 1;
            const seq = tokenRequestSeqRef.current;
            dbg('getOAuthToken #', seq);
            fetchAccessToken()
              .then((token) => {
                tokenFailStreakRef.current = 0;
                lastGoodTokenRef.current = token;
                cb(token);
              })
              .catch((tokenError) => {
                tokenFailStreakRef.current += 1;
                spotifyDxLog('error', `getOAuthToken #${seq} FAILED (consecutive: ${tokenFailStreakRef.current}):`, String(tokenError),
                  '— repeated bursts of this line mean the SDK is starving for a token.');
                if (lastGoodTokenRef.current) {
                  cb(lastGoodTokenRef.current);
                } else if (tokenFailStreakRef.current >= 3) {
                  cb('');
                }
              });
          },
          volume: volumeRef.current,
        });

        player.addListener('ready', ({ device_id }) => {
          dbg('READY device=', device_id?.slice(0, 8), 'isLeader=', isLeaderRef.current, 'pending=', !!pendingSnapshotRef.current, 'activationMissing=', activationMissingRef.current);
          if (readyTimeoutRef.current) { clearTimeout(readyTimeoutRef.current); readyTimeoutRef.current = null; }
          deviceIdRef.current = device_id;
          readyRef.current = true;
          // 'ready' means the DEVICE registered — it says nothing about audio activation. If
          // connect() ran outside a gesture (fallback-timeout path), land as 'blocked' so the
          // pointerdown/pill recovery re-activates in a real gesture, instead of sitting
          // silently un-activated until the first play attempt fails minutes later.
          setStatus(activationMissingRef.current ? 'blocked' : 'ready');
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
        // Error events carry ONLY a {message} string (no codes) — log each one
        // verbatim with the event name; that pair is the SDK's whole diagnosis.
        player.addListener('initialization_error', ({ message }) => {
          setLastError({ event: 'initialization_error', message, ts: Date.now() });
          spotifyDxLog('error', 'SDK initialization_error:', message,
            '— the environment cannot instantiate a player (most likely missing/disabled DRM; see the DRM probe in the boot report).',
            { iframe: findSdkIframe() });
          setStatus('error');
        });
        player.addListener('authentication_error', ({ message }) => {
          setLastError({ event: 'authentication_error', message, ts: Date.now() });
          spotifyDxLog('error', 'SDK authentication_error:', message, '— the token handed to the SDK was rejected (expired/invalid/scope).');
          setStatus('error');
        });
        player.addListener('account_error', ({ message }) => {
          setLastError({ event: 'account_error', message, ts: Date.now() });
          spotifyDxLog('error', 'SDK account_error:', message,
            '— Spotify says this account is NOT Premium-entitled for streaming. This is the authoritative verdict and overrides whatever the profile product field said.');
          setStatus('not_premium');
        });
        player.addListener('playback_error', ({ message }) => {
          setLastError({ event: 'playback_error', message, ts: Date.now() });
          spotifyDxLog('error', 'SDK playback_error:', message, '— loading/playing the current track failed (status stays as-is; repeated lines here with silence = decode/DRM/track problem).');
        });
        player.addListener('autoplay_failed', () => {
          setLastError({ event: 'autoplay_failed', message: null, ts: Date.now() });
          spotifyDxLog('warn', 'SDK autoplay_failed — the browser blocked audio; next interaction (or the unlock pill) recovers it.',
            { activation: activationState() });
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
        setSdkPlayerCreated(true);
        // connect() is gesture-deferred: Safari only unblocks SDK audio when the connect
        // originates from a user gesture. Normally the gate CTA waits for this player to exist
        // (gestureReady), so unlock() drives the connect from inside the click. This branch is
        // the fallback-timeout path: the gate opened without us, the gesture is already spent.
        // connect() itself is fine outside a gesture (network handshake) — but audio activation
        // is not, so record whether a gesture is live; 'ready' then lands as 'blocked' and the
        // pointerdown/pill recovery re-activates in a real gesture. No silent hoping.
        if (gestureSeenRef.current) {
          activationMissingRef.current = !(typeof navigator !== 'undefined' && navigator.userActivation?.isActive);
          dbg('late create with gesture seen — activationMissing=', activationMissingRef.current);
          connectNow();
        }
      } catch (e) {
        creatingRef.current = false;
        spotifyDxLog('error', 'Spotify SDK setup failed:', String(e),
          '— the SDK script did not load or the player could not be constructed.', { iframe: findSdkIframe() });
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

  // The gate's final loading phase resolves on this: either the SDK player object exists (one
  // gate click can now activate + connect it) or Spotify is never going to boot for this user
  // (terminal statuses) so the gate must not wait. Deliberately NOT 'ready'/'connected' — those
  // can only happen AFTER the gate click (connect is gesture-deferred); waiting on them would
  // deadlock the gate against the click it's blocking.
  const gestureReady = sdkPlayerCreated
    || status === 'not_connected'
    || status === 'not_premium'
    || status === 'unsupported_browser'
    || status === 'error';

  return {
    status,
    profile,
    nowPlaying,
    playbackState,
    lastError, // last raw SDK error event {event, message, ts} — verbatim, for UI/diagnosis
    gestureReady,
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
