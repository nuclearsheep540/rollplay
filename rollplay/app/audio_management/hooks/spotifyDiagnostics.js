/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

/**
 * Spotify playback diagnostics — the "why can't this user hear audio?" layer.
 *
 * Motivated by the 2026-08-20 silent-follower R&D audit
 * (.claude/plans/spotify/rnd-audit-2026-08-20/): every distinct Spotify failure
 * mode (allowlist 403, dead refresh token, non-Premium account, missing DRM,
 * autoplay block, device reaping) used to collapse into one of two silent UI
 * states. This module gives useSpotifyPlayback the primitives to log RAW
 * evidence — SDK event payloads, HTTP statuses/bodies, EME probe results,
 * activation state — so a single console screenshot from an affected user is
 * decisive.
 *
 * Two output channels:
 *  - diagReport(): ALWAYS ON. Failure evidence + one-line boot summaries. Low
 *    volume by design — it only speaks when something is wrong or once at boot.
 *  - diagVerbose(): gated by localStorage('tt_spotify_debug' = '1'). The full
 *    event/timing stream (successor of the old compile-time SPOTIFY_DEBUG
 *    const, which no real user's client could ever enable). Flip it from any
 *    production console:  localStorage.setItem('tt_spotify_debug', '1')
 *
 * All claims about SDK internals / error shapes are sourced in the audit files
 * (docs-sdk-contract.md, docs-web-api-player.md, docs-drm-autoplay-detection.md).
 */

const DIAG_FLAG_KEY = 'tt_spotify_debug';
const PREFIX = 'SPOTIFYDX';

const _timeOrigin = (typeof performance !== 'undefined') ? performance.now() : 0;

function stamp() {
  const elapsed = (typeof performance !== 'undefined' ? performance.now() : 0) - _timeOrigin;
  return `[+${elapsed.toFixed(0)}ms]`;
}

/** Runtime-enableable verbose flag — checked live so no reload is needed. */
export function isDiagEnabled() {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(DIAG_FLAG_KEY) === '1';
  } catch {
    return false; // storage blocked (private mode/policy) — verbose stays off
  }
}

/** Verbose stream — only when the localStorage flag is set. */
export function diagVerbose(...args) {
  if (!isDiagEnabled()) return;
  // eslint-disable-next-line no-console
  console.log(PREFIX, stamp(), ...args);
}

/**
 * Always-on report line. `level` is 'log' | 'warn' | 'error'.
 * Reserved for failure evidence and one-shot summaries — keep it quiet.
 */
export function diagReport(level, ...args) {
  // eslint-disable-next-line no-console
  const emit = console[level] || console.log;
  emit(PREFIX, stamp(), ...args);
}

/** navigator.userActivation snapshot — proves whether a gesture was live at a call site. */
export function activationState() {
  if (typeof navigator === 'undefined' || !navigator.userActivation) return { isActive: null, hasBeenActive: null };
  return {
    isActive: navigator.userActivation.isActive,
    hasBeenActive: navigator.userActivation.hasBeenActive,
  };
}

/** Firefox-only autoplay policy readout ('allowed' | 'allowed-muted' | 'disallowed'), null elsewhere. */
export function autoplayPolicy() {
  if (typeof navigator === 'undefined' || typeof navigator.getAutoplayPolicy !== 'function') return null;
  try {
    return navigator.getAutoplayPolicy('mediaelement');
  } catch {
    return null;
  }
}

/**
 * Locate the SDK's playback iframe (its ONLY DOM footprint — the real media
 * element lives cross-origin inside it and is unreadable forever). Presence
 * proves the SDK reached environment setup; absence after connect() means an
 * extension/CSP stripped it (a documented failure cause — the SDK's internal
 * MISSING_IFRAME error).
 */
export function findSdkIframe() {
  if (typeof document === 'undefined') return { present: false };
  const iframe = document.querySelector('iframe[src^="https://sdk.scdn.co/embedded"]')
    || document.querySelector('iframe[alt="Audio Playback Container"]');
  if (!iframe) return { present: false };
  return {
    present: true,
    allow: iframe.getAttribute('allow'),
    isConnected: iframe.isConnected,
    src: iframe.getAttribute('src'),
  };
}

/**
 * EME/DRM capability probe. Audio-only configs at the softest robustness level
 * (SW_SECURE_CRYPTO / any) so a capable desktop never false-negatives; each
 * keysystem raced against a timeout because Firefox/Brave may park the promise
 * behind a consent prompt. createMediaKeys() is called on success to separate
 * "CDM installed" from "CDM actually works" (the Brave enabled-but-broken class).
 */
export async function probeEme(timeoutMs = 4000) {
  const outcome = {
    supported: typeof navigator !== 'undefined' && typeof navigator.requestMediaKeySystemAccess === 'function',
    secureContext: typeof window !== 'undefined' ? window.isSecureContext : null,
    results: {},
  };
  if (!outcome.supported) return outcome;

  const audioCapabilities = [
    { contentType: 'audio/mp4; codecs="mp4a.40.2"', robustness: 'SW_SECURE_CRYPTO' },
    { contentType: 'audio/mp4; codecs="mp4a.40.2"', robustness: '' },
    { contentType: 'audio/webm; codecs="opus"', robustness: '' },
  ];
  const config = [{
    // 'cenc' matches Widevine; 'sinf' matches Safari's FairPlay — the spec only
    // requires ONE listed type to be supported, so one config serves both.
    initDataTypes: ['cenc', 'sinf'],
    audioCapabilities,
    distinctiveIdentifier: 'optional',
    persistentState: 'optional',
    sessionTypes: ['temporary'],
  }];
  const withTimeout = (promise, ms) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('PROBE_TIMEOUT')), ms)),
  ]);

  const keySystems = ['com.widevine.alpha', 'com.apple.fps', 'com.apple.fps.1_0', 'org.w3.clearkey'];
  for (const keySystem of keySystems) {
    try {
      const access = await withTimeout(navigator.requestMediaKeySystemAccess(keySystem, config), timeoutMs);
      outcome.results[keySystem] = { ok: true, granted: access.getConfiguration() };
      try {
        await access.createMediaKeys();
        outcome.results[keySystem].mediaKeys = true;
      } catch (creationError) {
        outcome.results[keySystem].mediaKeys = false;
        outcome.results[keySystem].mediaKeysError = `${creationError.name}: ${creationError.message}`;
      }
    } catch (probeError) {
      outcome.results[keySystem] = { ok: false, error: `${probeError.name || 'Error'}: ${probeError.message}` };
    }
  }
  return outcome;
}

/**
 * Human verdict on a probeEme() outcome. `{ ok, headline }` where ok=true means
 * a working DRM path exists for the Spotify SDK in this browser.
 */
export function summarizeEmeProbe(probe) {
  if (!probe.supported) {
    return { ok: false, headline: 'EME API missing entirely — this browser cannot run the Spotify SDK' };
  }
  const widevine = probe.results['com.widevine.alpha'];
  const fairplay = probe.results['com.apple.fps'] || probe.results['com.apple.fps.1_0'];
  if (widevine?.ok && widevine.mediaKeys) {
    return { ok: true, headline: 'Widevine OK (CDM present and working)' };
  }
  if (fairplay?.ok && fairplay.mediaKeys) {
    return { ok: true, headline: 'FairPlay OK (Safari DRM path working)' };
  }
  if (widevine?.ok && widevine.mediaKeys === false) {
    return { ok: false, headline: `Widevine INSTALLED BUT BROKEN — createMediaKeys failed (${widevine.mediaKeysError}). Known Brave failure class: toggle Widevine off/on + restart.` };
  }
  if (widevine?.error?.includes('PROBE_TIMEOUT')) {
    return { ok: false, headline: 'DRM probe TIMED OUT — a browser consent prompt is likely showing (Firefox notification bar / Brave Widevine prompt). Look for it and allow DRM.' };
  }
  if (widevine?.error?.startsWith('SecurityError')) {
    return { ok: false, headline: 'DRM blocked by Permissions-Policy — the app appears to be embedded without allow="encrypted-media".' };
  }
  return {
    ok: false,
    headline: 'No working DRM keysystem — Widevine is missing or disabled (Brave shield, Firefox "Play DRM content" off, Chrome protected-content setting, or Windows N without the Media Feature Pack). Spotify SDK audio is impossible until enabled.',
  };
}

/**
 * Classify OUR /api/spotify/profile response into a diagnosis. Input is the
 * parsed JSON body (which may carry upstream_status/upstream_error passthrough
 * from the backend) plus the HTTP status of our own endpoint.
 */
export function classifyProfileOutcome(httpStatus, body) {
  if (httpStatus !== 200 || !body) {
    return { code: 'backend_error', explanation: `our /api/spotify/profile endpoint failed (HTTP ${httpStatus}) — backend or auth problem, not a Spotify account problem` };
  }
  if (!body.connected) {
    const upstreamStatus = body.upstream_status ?? null;
    const upstreamError = body.upstream_error || '';
    if (upstreamStatus === 403 && /not registered/i.test(upstreamError)) {
      return { code: 'not_allowlisted', explanation: 'Spotify rejected this account: 403 "User not registered in the Developer Dashboard" — the account is NOT on the app allowlist (5-user dev-mode cap / email mismatch). Ask the app owner to check User Management.' };
    }
    if (upstreamStatus === 403) {
      return { code: 'forbidden', explanation: `Spotify returned 403: ${upstreamError || '(no body)'} — allowlist, region, or entitlement rejection` };
    }
    if (upstreamStatus === 400 || /invalid_grant/i.test(upstreamError)) {
      return { code: 'refresh_dead', explanation: 'the stored refresh token is dead (revoked or >6 months old) — the user must disconnect and re-link Spotify on the Account page' };
    }
    if (upstreamStatus === 429) {
      return { code: 'rate_limited', explanation: 'app-wide Spotify rate limit hit (shared by every linked user) — transient' };
    }
    if (upstreamStatus != null) {
      return { code: 'upstream_error', explanation: `Spotify API error ${upstreamStatus}: ${upstreamError || '(no body)'}` };
    }
    return { code: 'not_linked', explanation: 'no Spotify account linked for this user' };
  }
  const product = body.profile?.product;
  if (product == null) {
    return { code: 'product_missing', explanation: 'connected, but /v1/me returned NO product field (Feb-2026 dev-mode field removal has reached this app) — the premium gate can no longer work and must move to behavioral detection' };
  }
  if (product !== 'premium') {
    return { code: 'not_premium', explanation: `connected, but this Spotify account's product is "${product}" — not Premium. For a family-plan member this means: evicted from the plan (missed address re-verification), the invite was never accepted, or a DIFFERENT account was linked than the one on the plan (check the email on the card).` };
  }
  return { code: 'premium', explanation: 'connected with product "premium" — profile gate passes' };
}

/**
 * Classify a raw failed Spotify player call (transfer/play/repeat, made
 * directly from the browser). `bodyText` is the raw response text.
 */
export function classifyPlayFailure(httpStatus, bodyText) {
  const text = bodyText || '';
  if (httpStatus === 403 && /PREMIUM_REQUIRED|Premium required/i.test(text)) {
    return { code: 'premium_required', explanation: 'Spotify refused playback: this token\'s account is not Premium-entitled for streaming (the definitive entitlement verdict — overrides whatever /v1/me product said)' };
  }
  if (httpStatus === 403 && /not registered/i.test(text)) {
    return { code: 'not_allowlisted', explanation: 'Spotify refused the call: account not on the app allowlist' };
  }
  if (httpStatus === 404) {
    return { code: 'device_gone', explanation: 'device not found — the SDK device never registered with Spotify Connect or was reaped (tab backgrounded / socket dropped)' };
  }
  if (httpStatus === 429) {
    return { code: 'rate_limited', explanation: 'app-wide rate limit (rolling 30s window shared by all linked users)' };
  }
  if (httpStatus === 401) {
    return { code: 'token_invalid', explanation: 'access token expired/invalid at Spotify — token refresh path is failing' };
  }
  return { code: 'unknown', explanation: `unclassified player failure (HTTP ${httpStatus})` };
}

/**
 * The single best silent-failure disambiguator: sample getCurrentState() twice
 * ~2s apart and judge what the SDK itself believes is happening.
 *
 * Verdicts:
 *  - 'advancing'  SDK is playing and the playhead moves → if the user hears
 *                 nothing, the cause is BELOW JS (OS mixer, output device,
 *                 muted tab, Windows N decode) — not our code, not the SDK.
 *  - 'frozen'     claims to be playing but the playhead is stuck → DRM
 *                 license/decode stall (Brave-class) or track load failure.
 *  - 'paused'     arrived/stayed paused with no autoplay_failed event → the
 *                 documented silent un-activated state; needs a user gesture.
 *  - 'no-state'   SDK isn't the active playing device → transfer/play never
 *                 landed here or the device was reaped.
 */
export async function verifyPlaybackProgress(getCurrentState, sampleGapMs = 2000) {
  const first = await Promise.resolve(getCurrentState()).catch(() => null);
  await new Promise((resolve) => setTimeout(resolve, sampleGapMs));
  const second = await Promise.resolve(getCurrentState()).catch(() => null);

  if (!second) {
    return { verdict: 'no-state', first, second, detail: 'getCurrentState() is null — this SDK device is not the active playback device' };
  }
  if (second.paused) {
    return { verdict: 'paused', first, second, detail: `paused at ${second.position}ms — if playback was commanded and no autoplay_failed fired, this is the documented silent un-activated state` };
  }
  const startPosition = first?.position ?? null;
  const movedMs = startPosition != null ? (second.position - startPosition) : null;
  if (movedMs != null && movedMs < 300) {
    return { verdict: 'frozen', first, second, detail: `playing but playhead moved only ${movedMs}ms in ${sampleGapMs}ms — license/decode stall` };
  }
  return { verdict: 'advancing', first, second, detail: `playing, playhead advanced ${movedMs ?? '?'}ms — SDK believes audio is flowing; silence now means OS/output/decode, below JavaScript` };
}

/**
 * Passive environment taps: report CSP violations that hit the SDK's iframe or
 * script, and (verbose only) mirror the SDK's cross-frame message traffic.
 * Returns an uninstall function.
 */
export function installSdkEnvironmentTaps() {
  if (typeof window === 'undefined') return () => {};

  const onCspViolation = (event) => {
    if (typeof event.blockedURI === 'string' && event.blockedURI.includes('sdk.scdn.co')) {
      diagReport('error', 'CSP blocked a Spotify SDK resource:', {
        blockedURI: event.blockedURI,
        directive: event.effectiveDirective,
      }, '— the SDK iframe/script cannot load; audio is impossible until the policy allows sdk.scdn.co');
    }
  };
  const onMessage = (event) => {
    if (event.origin === 'https://sdk.scdn.co') {
      diagVerbose('SDK iframe message:', typeof event.data === 'string' ? event.data.slice(0, 200) : event.data);
    }
  };

  window.addEventListener('securitypolicyviolation', onCspViolation);
  window.addEventListener('message', onMessage);
  return () => {
    window.removeEventListener('securitypolicyviolation', onCspViolation);
    window.removeEventListener('message', onMessage);
  };
}

/**
 * One-shot boot report (always-on, collapsed): everything about this client
 * that decides whether Spotify audio CAN work, logged before the SDK starts.
 */
export async function logBootReport({ status, profileHttpStatus, profileBody }) {
  const activation = activationState();
  const iframe = findSdkIframe();
  const profileDiagnosis = classifyProfileOutcome(profileHttpStatus, profileBody);
  const emeProbe = await probeEme();
  const emeSummary = summarizeEmeProbe(emeProbe);

  // eslint-disable-next-line no-console
  console.groupCollapsed(`${PREFIX} Spotify boot report — status: ${status} | profile: ${profileDiagnosis.code} | DRM: ${emeSummary.ok ? 'OK' : 'PROBLEM'}`);
  diagReport('log', 'userAgent:', typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a');
  diagReport('log', 'secureContext:', typeof window !== 'undefined' ? window.isSecureContext : 'n/a', '| userActivation:', activation, '| autoplayPolicy(FF):', autoplayPolicy());
  diagReport('log', 'profile diagnosis:', profileDiagnosis.code, '—', profileDiagnosis.explanation);
  diagReport('log', 'raw profile response:', profileHttpStatus, profileBody);
  diagReport(emeSummary.ok ? 'log' : 'error', 'DRM probe:', emeSummary.headline);
  if (!emeSummary.ok || isDiagEnabled()) diagReport('log', 'raw DRM probe:', emeProbe);
  diagReport('log', 'SDK iframe:', iframe);
  // Self-documenting toggle — so nobody has to remember the flag commands.
  diagReport('log', "type localStorage.setItem('tt_spotify_debug', '1') to turn on advanced spotify logging\ntype localStorage.removeItem('tt_spotify_debug') to turn off advanced spotify logging");
  // eslint-disable-next-line no-console
  console.groupEnd();

  return { profileDiagnosis, emeSummary, emeProbe };
}
