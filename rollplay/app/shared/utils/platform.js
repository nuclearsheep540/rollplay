/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

/**
 * Platform detection for capability gating (currently: Spotify Web Playback SDK on iOS).
 *
 * Every iOS/iPadOS browser is WebKit under the hood, but Apple exposes FairPlay DRM
 * ONLY to Safari proper — third-party shells (Chrome = CriOS, Firefox = FxiOS,
 * Edge = EdgiOS, ...) have no content-decryption module at all, so EME-dependent
 * playback (the Spotify SDK) can never produce audio in them. Not degraded — impossible.
 */

// iPadOS 13+ Safari masquerades as macOS: Mac UA + real multi-touch is the tell.
export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

// Third-party iOS browsers self-identify in the UA even though the engine is WebKit.
const IOS_NON_SAFARI_UA = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|YaBrowser|DuckDuckGo/;

/**
 * iOS browser that can NEVER play DRM (EME/FairPlay) media — i.e. any iOS browser
 * except Safari itself. Belt-and-braces: known UA markers, plus the capability probe
 * (Safari exposes requestMediaKeySystemAccess; the shells don't).
 */
export function isIOSNonSafari() {
  if (!isIOS()) return false;
  if (IOS_NON_SAFARI_UA.test(navigator.userAgent)) return true;
  return typeof navigator.requestMediaKeySystemAccess !== 'function';
}

export function isIOSSafari() {
  return isIOS() && !isIOSNonSafari();
}

/**
 * Best-effort bounce of the current URL into Safari. `x-safari-https://` is an
 * undocumented scheme that recent iOS versions honour; when it doesn't, nothing
 * happens — callers must offer a copy-link fallback alongside.
 */
export function tryOpenInSafari() {
  if (typeof window === 'undefined') return;
  const { host, pathname, search } = window.location;
  window.location.href = `x-safari-https://${host}${pathname}${search}`;
}
