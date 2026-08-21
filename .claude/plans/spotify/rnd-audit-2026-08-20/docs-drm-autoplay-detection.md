# R&D Audit Track: DRM/EME Availability & Detection, Autoplay/Activation, Media-Element Observability

**Date:** 2026-08-20
**Audit context:** One follower (family-Premium member) hears no Spotify audio via Web Playback SDK; 5/6 users work. This track catalogs everything a client-side diagnostic layer can probe: Widevine/FairPlay availability, EME probe code, SDK behavior when EME is missing, autoplay/activation semantics, and media-element observability.

**Tags:** [DOC] official docs · [COMMUNITY] forum/issue/blog · [INFERRED] deduction.

## 1. Widevine availability matrix (desktop, 2026)

| Browser / environment | Widevine state | Failure mode when absent/disabled |
|---|---|---|
| **Chrome / Edge** (Win/macOS/Linux official builds) | CDM bundled as an auto-updating component (`chrome://components` → "Widevine Content Decryption Module"). [DOC] https://www.cloudspress.com/how-to-update-widevine-content-decryption-module-component-in-chrome-firefox-microsoft-edge-and-opera/ | Normally present. Can break if the component is damaged, blocked from updating (network/policy), or the **site setting** "Sites can play protected content" (`chrome://settings/content/protectedContent`) is set to *Don't allow* — then `requestMediaKeySystemAccess` rejects (explicit to JS, silent to the user unless the site surfaces it). [COMMUNITY] https://recorder.easeus.com/screen-recording-resource/how-to-turn-on-drm-on-chrome.html |
| **Chrome enterprise/managed** | Protected-content default can be forced off by content-settings policy; component updates can be disabled, leaving a stale/broken CDM. [COMMUNITY] same sources as above | Explicit to JS (probe rejection) but invisible to user. Managed machines are a real-world "user swears they changed nothing" case. |
| **Firefox** | CDM **downloaded on demand**, gated by the *"Play DRM-controlled content"* checkbox (pref `media.eme.enabled`). Enabled by default on release desktop builds; when a site requests EME with it off, Firefox shows a notification bar "You must enable DRM…" with an **Enable DRM** button. [DOC] https://support.mozilla.org/en-US/kb/enable-drm (page timed out for us; behavior corroborated by https://www.vdocipher.com/blog/firefox-drm/ and https://bugzilla.mozilla.org/show_bug.cgi?id=1451762) | With pref off: `requestMediaKeySystemAccess('com.widevine.alpha', …)` **rejects NotSupportedError** → explicit to JS. The notification bar appears *without* user interaction (bug 1451762 complains about exactly this) — so "probe triggered a permission prompt" is a real Firefox side effect. First-ever use can also stall while the CDM downloads. [COMMUNITY] |
| **Brave** | Widevine **disabled by default**; first DRM request triggers an allow/block prompt; toggle lives in `brave://settings/extensions`. [DOC] https://support.brave.app/hc/en-us/articles/360023851591 (403 to our fetcher; summary via search result text) | If blocked: Spotify web player shows "Playback of protected content is not enabled" — explicit. **Worse case:** Brave issue #56157 documents Widevine *enabled* but EME still unsupported until the toggle is cycled + restart — i.e. **enabled-but-broken, silent**. [COMMUNITY] https://github.com/brave/brave-browser/issues/56157 , https://community.brave.app/t/cannot-use-spotify-on-brave-playback-of-protected-content-is-not-enabled/619260 |
| **Opera / Vivaldi / Arc** (Chromium derivatives) | Widevine fetched as a component (Vivaldi: `vivaldi://components` → "Check for updates"). Not always present on first run, esp. Linux. [DOC] https://help.vivaldi.com/desktop/media/widevinecdm-eme-drm-netflix-amazon-spotify/ | Probe rejection (explicit to JS). Vivaldi's own advice when DRM fails is manually updating the component — i.e. broken states happen. |
| **Linux (all browsers)** | Widevine ships **x86_64 proprietary blobs only**; ARM Linux and some distro builds (vanilla Chromium, Solus/FreeBSD Firefox etc.) have no CDM at all. Distro Chromium ≠ Chrome: often no Widevine. [COMMUNITY] https://forum.endeavouros.com/t/widevine-for-chromium-and-firefox/75404 , https://discuss.getsol.us/d/6622-firefox-can-not-play-drm-protected-content-widevine , https://forums.freebsd.org/threads/firefox-stopped-to-support-drm.92809/ | Probe rejects — explicit to JS. |
| **Windows N / KN editions** | Ship **without Media Foundation**; the Media Feature Pack (Settings → Apps → Optional features) must be installed for browser DRM audio to work. Without it "the browser can't decode protected audio streams, and playback **silently dies**". [DOC] https://support.microsoft.com/en-US/Windows/Experience/Platform-variants/media-feature-pack-for-windows-n ; [COMMUNITY] https://windowsnews.ai/article/microsofts-hidden-windows-n-trap-is-breaking-spotifys-web-player-heres-the-fix.439287 | **This is the flagship SILENT case**: the CDM may pass the EME probe but decode produces no audio, or playback stalls with no JS error. Prime suspect class for "connects fine, hears nothing". |
| **Safari (macOS)** | No Widevine ever. FairPlay Streaming via `com.apple.fps` (modern EME) / legacy `WebKitMediaKeys` `com.apple.fps.1_0`. Spotify's SDK lists Safari as supported, so its iframe must carry a FairPlay path. [DOC] https://developer.spotify.com/documentation/web-playback-sdk | Probing `com.widevine.alpha` on Safari always rejects — that alone must NOT be read as "broken"; probe `com.apple.fps` too (§2). |

**Silent vs explicit, summarized:**
- Explicit-to-JS (probe rejects): Firefox pref off, Brave blocked, Linux no-CDM, Chrome protected-content setting off, Vivaldi/Opera missing component.
- **Silent (probe may PASS, audio still dead):** Windows N without Media Feature Pack; Brave enabled-but-broken component state; damaged CDM awaiting update; (plus every non-DRM cause in §6).

## 2. Robust JS EME probe code

Semantics from MDN [DOC] https://developer.mozilla.org/en-US/docs/Web/API/Navigator/requestMediaKeySystemAccess :
- Resolves with `MediaKeySystemAccess` when the keysystem + at least one configuration is supportable.
- Rejects **`NotSupportedError`** → keysystem missing/disabled or no config satisfiable.
- Rejects **`SecurityError`** → blocked by `Permissions-Policy: encrypted-media` (i.e. *our page* is inside an iframe lacking `allow="encrypted-media"`, or a response header disables it) — a distinct diagnosis from "no CDM".
- Throws **`TypeError`** synchronously for empty keySystem / empty config array.
- Secure context (HTTPS) required.
- "May have user-visible effects such as asking for permission" — this is the Firefox notification bar / Brave prompt. **The promise may hang unresolved while a prompt is shown or a CDM downloads → always race the probe against a timeout.** [DOC + INFERRED]

Robustness note: for **audio-only** probing, pass `audioCapabilities` only (spec allows either list empty but not both). Use `robustness: "SW_SECURE_CRYPTO"` (Widevine L3, softest level — what browser CDMs guarantee) and also try `""` (= any). Spotify streams are audio; requiring hardware levels (`HW_SECURE_*`) would false-negative on most desktops. [INFERRED from spec + Widevine robustness conventions, https://developers.google.com/widevine/drm/overview]

```js
// Diagnostic EME probe — safe to run at any time; logs raw results.
async function probeEme() {
  const out = { secureContext: window.isSecureContext, results: {} };
  const audioCaps = [
    { contentType: 'audio/mp4; codecs="mp4a.40.2"', robustness: 'SW_SECURE_CRYPTO' },
    { contentType: 'audio/mp4; codecs="mp4a.40.2"', robustness: '' },
    { contentType: 'audio/webm; codecs="opus"',      robustness: '' },
  ];
  const config = [{
    initDataTypes: ['cenc'],
    audioCapabilities: audioCaps,
    distinctiveIdentifier: 'optional',
    persistentState: 'optional',
    sessionTypes: ['temporary'],
  }];
  const withTimeout = (p, ms) => Promise.race([
    p, new Promise((_, rej) => setTimeout(() => rej(new Error('PROBE_TIMEOUT')), ms)),
  ]);
  for (const ks of ['com.widevine.alpha', 'com.apple.fps', 'com.apple.fps.1_0', 'org.w3.clearkey']) {
    try {
      const access = await withTimeout(
        navigator.requestMediaKeySystemAccess(ks, config), 4000);
      // getConfiguration() shows what the CDM actually granted (robustness may be downgraded)
      out.results[ks] = { ok: true, config: access.getConfiguration() };
      try { await access.createMediaKeys(); out.results[ks].mediaKeys = true; }
      catch (e) { out.results[ks].mediaKeys = false; out.results[ks].mediaKeysError = `${e.name}: ${e.message}`; }
    } catch (e) {
      out.results[ks] = { ok: false, error: `${e.name || 'Error'}: ${e.message}` };
    }
  }
  // Legacy Safari fallback signal (pre-modern-EME):
  out.legacyWebKitMediaKeys = typeof window.WebKitMediaKeys === 'function'
    ? window.WebKitMediaKeys.isTypeSupported?.('com.apple.fps.1_0', 'audio/mp4') : undefined;
  return out;
}
```

**Interpreting results:**
| Signal | Diagnosis |
|---|---|
| `com.widevine.alpha` rejects `NotSupportedError`, Chrome-family browser | CDM missing OR user/policy disabled ("Brave block", Firefox pref, Chrome protected-content off, Linux no-blob). Browser UA + §1 matrix narrows it. |
| Rejects `SecurityError` | Permissions-Policy blocked *for our page* — check whether our app is embedded in an iframe without `allow="encrypted-media"`. |
| `PROBE_TIMEOUT` | A consent prompt is up (Firefox/Brave) or CDM download in progress — tell the user to look for the bar/prompt. |
| Resolves, but `createMediaKeys()` fails | CDM present but broken (Brave #56157 class, damaged component). **This distinguishes "installed" from "working" — always call `createMediaKeys()`.** [INFERRED] |
| Resolves + mediaKeys OK, still no audio | DRM is fine → move to autoplay (§4) or system audio (§6). Windows N caveat: decode path can still fail post-license. |
| Widevine rejects but `com.apple.fps` resolves | Safari — normal. |
| Everything rejects incl. `org.w3.clearkey` | EME wholesale disabled (about:config lockdown / exotic build). ClearKey nuance: old Firefox bug 1136707 had the DRM checkbox disable ClearKey too — treat ClearKey as a weak signal. [COMMUNITY] https://bugzilla.mozilla.org/show_bug.cgi?id=1136707 |

**"User disabled" vs "platform lacks" vs "prompt pending":** JS alone cannot always split disabled-vs-missing (both are `NotSupportedError`); combine rejection + UA/platform matrix (§1) + the timeout branch (prompt pending) to classify. [INFERRED]

## 2. Robust JS EME probe code

_(pending)_

## 3. Spotify Web Playback SDK behavior when EME unavailable/denied

### Official error events [DOC]
Source: https://developer.spotify.com/documentation/web-playback-sdk/reference

- **`initialization_error`** — "Emitted when the `Spotify.Player` fails to instantiate a player capable of playing content in the current environment. **Most likely due to the browser not supporting EME protection.**" This is the documented EME-failure channel.
- **`authentication_error`** — token from `getOAuthToken` invalid.
- **`account_error`** — "the user authenticated does not have a valid Spotify Premium subscription." ← directly relevant to the family-plan follower; if her account is not recognized as Premium the SDK fires THIS, not a playback error.
- **`playback_error`** — loading and/or playing back a track failed.
- **`autoplay_failed`** — "Emitted when playback is prohibited by the browser's autoplay rules." (It exists as a dedicated event; see §4 for whether it's guaranteed.)

- **`activateElement()`** [DOC]: exists to satisfy browser autoplay/user-activation rules. Docs: call it in advance (from a user gesture) so the player keeps the *playing* state when playback is transferred from another device; without it the transferred state arrives *paused*. Note the docs describe the no-activation outcome as **paused state, not an error** — i.e., a documented SILENT-ish failure mode (state says paused; no exception surfaced).

- [DOC] The reference gives **no message text contract** for these errors — only `{ message }` — so a diagnostic layer must log the raw `message` string verbatim.

### Key inference for our bug [INFERRED]
If EME is genuinely unavailable/denied, `Spotify.Player.connect()` typically *fails at initialization* (initialization_error) — the SDK should not appear as a Connect device at all. A follower whose device *appears and receives state but is silent* is more consistent with: (a) autoplay/activation blockage (element paused or muted), (b) EME present but a *keysystem robustness* downgrade, or (c) account/entitlement issue on her token. See §1 Brave nuance where EME can report available yet fail at playback time.

## 4. Autoplay / activation semantics

### Chrome (desktop) [DOC] https://developer.chrome.com/blog/autoplay/
- Audible autoplay allowed only if: (a) user has interacted with the domain (click/tap), (b) desktop **Media Engagement Index** threshold crossed, or (c) installed PWA. Muted autoplay always allowed.
- MEI counts a "significant playback": >7s of playback, audible+unmuted, tab active, video ≥200×140. Inspect at `chrome://media-engagement` — **a diagnostic step for the affected user**: if her MEI for our origin is 0 and she never clicked before playback tried to start, audible play is denied.
- Blocked `play()` rejects with **`NotAllowedError` DOMException**. Web Audio: `AudioContext` created pre-gesture starts `"suspended"` (Chrome 71+).
- Cross-origin iframes need `allow="autoplay"` — the SDK's own iframe sets `allow="encrypted-media; autoplay"` (verified in the shipped loader, §5), so autoplay *delegation* to the SDK iframe is granted by construction… **but delegation only forwards what the parent page itself has** — if our page never received a gesture, the iframe has nothing. [DOC + INFERRED]

### navigator.userActivation [DOC] https://developer.mozilla.org/en-US/docs/Web/API/UserActivation , https://developer.mozilla.org/en-US/docs/Web/Security/User_activation
- `isActive` — **transient** activation: user is interacting *right now*; expires after a browser-specific timeout (spec doesn't fix it; ~seconds — Chrome documented historically at 5s; treat as "a few seconds" [COMMUNITY/INFERRED]); renewed by each qualifying event; **consumed** by some APIs (e.g. `window.open`).
- `hasBeenActive` — **sticky** activation: at least one interaction since page load; never resets, never consumed. **Media autoplay is gated on sticky activation** in the MDN list — one real click on the page satisfies Chrome's gesture arm forever (for that page load).
- Qualifying events (must be `isTrusted`): `keydown` (excl. Esc/shortcut keys), `mousedown`, `pointerdown` (mouse), `pointerup` (non-mouse), `touchend`. **Note `click` is fine because it's preceded by mousedown/pointerup, but a synthetic `.click()` is NOT.**
- Diagnostic value: log `navigator.userActivation.isActive` / `.hasBeenActive` at the exact moment we call `activateElement()` and at the moment a snapshot-apply triggers `resume()` — proves whether the gesture plumbing delivered activation when it mattered.

### Safari (macOS) [DOC] https://webkit.org/blog/7734/auto-play-policy-changes-for-macos/ , https://webkit.org/blog/6784/new-video-policies-for-ios/
- Safari's model is **per-element**: a media element gains a "user gesture" flag when `play()` is called synchronously inside a user-gesture handler; that blessing belongs to *that element*, not the page. An automatic inference engine (plus per-site user settings: Safari → Settings for This Website → Auto-Play) decides default allowance for audible media.
- This is exactly why the SDK ships `activateElement()`: the page cannot bless the iframe's element; the SDK must forward the gesture via postMessage so the *iframe's* element calls play/load within the (propagated) gesture context. Safari's per-site "Never Auto-Play" setting is user-visible and per-user — a per-user silent-failure knob worth adding to the human checklist. [INFERRED]
- `navigator.getAutoplayPolicy()` exists but is **Firefox-only** — useful signal when present: returns `"allowed"`, `"allowed-muted"`, or `"disallowed"` per media type. Feature-detect before calling. [DOC] https://developer.mozilla.org/en-US/docs/Web/API/Navigator/getAutoplayPolicy

### The SDK's autoplay surface
- `autoplay_failed` event: "Emitted when playback is prohibited by the browser's autoplay rules." [DOC] SDK reference.
- In the shipped loader, `AUTOPLAY_FAILED` is a first-class postMessage from the iframe (`Messages.AUTOPLAY_FAILED` → `AnthemEvents.AUTOPLAY_FAILED`), and there is also an `activateElementError` message factory — meaning **activateElement failures are reported cross-frame**, but the public `activateElement()` returns a promise whose rejection path deserves logging. [DOC — from https://sdk.scdn.co/spotify-player.js contents]
- **Is `autoplay_failed` guaranteed when the internal `play()` rejects?** Not documented. The docs' own description of un-activated transfer is that state arrives **paused** (no event). So there are two distinct outcomes: (a) iframe attempts play → `NotAllowedError` → `autoplay_failed` fires; (b) SDK never attempts play and simply presents a paused state — **silent**. A diagnostic must therefore poll `player.getCurrentState()` and log `paused`, `position`, and timestamp deltas rather than trusting the event. [INFERRED from DOC statements]
- Advancing-position check: two `getCurrentState()` calls ~2s apart with `paused === false` and `position` advancing proves the *SDK believes* audio is flowing; if position advances and she still hears nothing, the fault is below JS (DRM decode on Windows N, OS mixer, output device — §6). This is the single most valuable disambiguator we can log. [INFERRED]

## 5. Media-element observability (finding the SDK's element)

### The SDK's DOM footprint — read directly from the shipped loader script [DOC — primary source: https://sdk.scdn.co/spotify-player.js, fetched 2026-08-20]

The loader (`spotify-player.js`, ~25 KB) does **not** create any `<audio>`/`<video>` element in the host page. It creates exactly one element — a hidden **cross-origin iframe** — via `setupPlayerEnv`:

```js
// deminified from https://sdk.scdn.co/spotify-player.js
var r = e.document.createElement("iframe");
r.src = "https://sdk.scdn.co/embedded/index.html";
r.setAttribute("alt", "Audio Playback Container");
r.setAttribute("tabIndex", "-1");
r.style.setProperty("position", "absolute", "important");
r.style.setProperty("left", "-1px", "important");
r.style.setProperty("width", "0", "important");
r.style.setProperty("height", "0", "important");
r.style.setProperty("border", "none", "important");
r.style.setProperty("outline", "none", "important");
r.allow = "encrypted-media; autoplay";
e.document.body.appendChild(r);
return r.contentWindow;
```

**Consequences for a diagnostic layer:**
- FIND it with `document.querySelector('iframe[src^="https://sdk.scdn.co/embedded"]')` or `iframe[alt="Audio Playback Container"]`. Its *presence* proves the SDK reached env setup; its `allow` attribute should read `encrypted-media; autoplay`. [DOC]
- The actual `<audio>/<video>` element, the EME `MediaKeySession`, and all `requestMediaKeySystemAccess` calls live INSIDE `sdk.scdn.co/embedded/index.html` — a **cross-origin document**. `iframe.contentDocument` is `null`; we can NEVER read `.paused/.muted/.volume/.readyState/.error/.srcObject` of the real element, and cannot attach EME event listeners. [INFERRED from same-origin policy + confirmed cross-origin src]
- The loader itself contains **zero** occurrences of `requestMediaKeySystemAccess` or `widevine` (grep of the fetched file) — all EME work is inside the iframe. Community confirmation that widevine-license HTTP calls originate "from inside the player iframe": https://github.com/spotify/web-playback-sdk/issues/117 [COMMUNITY]
- Host page ↔ iframe communicate via `postMessage` (a `MessageDispatcher`); the host waits for a `LOADED` message. A diagnostic layer *can* add its own `window.addEventListener('message', ...)` and log raw message traffic from `https://sdk.scdn.co` origin (event ordering, error payloads) without breaking anything — passive observation of the SDK's internal protocol. [INFERRED — the messages arrive at `window`, so any listener sees them]
- Internal error codes in the loader's `Errors` enum: `INVALID_LISTENER, INVALID_WEBPLAYBACK, NO_BODY, NO_EVENT, INVALID_OAUTH, MISSING_IFRAME, AUTOPLAY_FAILED`. `NO_BODY` fires if `document.body` doesn't exist yet when `connect()` runs; `MISSING_IFRAME` if the iframe got removed (e.g. by an overzealous DOM cleaner or an ad-blocker element-hiding rule). [DOC — from the shipped script]
- The iframe is appended to `document.body` — any ad-blocker/privacy tool that strips hidden cross-origin iframes, or a CSP `frame-src`/`child-src` that doesn't allow `https://sdk.scdn.co`, kills audio while the SDK object may still exist. **CSP violation would surface as a console error + a blank iframe — detectable by a `securitypolicyviolation` event listener.** [INFERRED]

### What IS observable from the page
- Iframe existence, `src`, `allow` attribute, and whether it is still connected to the DOM (`iframe.isConnected`).
- `securitypolicyviolation` events for `frame-src` blocks.
- Raw `message` events from origin `https://sdk.scdn.co`.
- The SDK's own public events (log ALL of them raw, incl. `message` text).
- Our own EME probe (§2) in the host page — near-equivalent environment to the iframe (same browser CDM state; note the iframe adds `allow="encrypted-media"` so host-page probe result can only be *more* permissive, not less... except if OUR page is itself iframed without those allows).

## 6. Beyond-JS silence causes (human checklist)

Causes where the SDK reports playing, position advances, and yet no sound reaches the ear. Marked **[JS-detectable]** where a web API can see it.

| Cause | JS-detectable? | Notes |
|---|---|---|
| Chrome tab mute ("Mute site" on the tab) | **No.** Tab mute is invisible to page JS (element `.muted` stays false; and the SDK's element is cross-origin anyway). | Human check: right-click the tab → look for "Unmute site". [INFERRED] |
| OS per-app volume mixer at 0 (Windows Volume Mixer / macOS per-app via 3rd party) | **No.** | Windows: right-click speaker icon → Volume mixer → the browser's slider. Classic silent killer, persists per app+device pair. |
| Wrong output device (audio routed to a disconnected monitor/HDMI/virtual device) | **Partial.** `navigator.mediaDevices.enumerateDevices()` lists `audiooutput` devices, but labels need mic-permission or `selectAudioOutput()`; and we cannot read which device *the browser* is using, nor `setSinkId` on the SDK's cross-origin element. Enumerating and logging device count + default-device changes (`devicechange` event) is still useful context. [DOC] https://developer.mozilla.org/en-US/docs/Web/Security/User_activation (selectAudioOutput gating) | Human check: Windows sound settings → per-app output; try unplugging HDMI. |
| Bluetooth headset claimed by another app in HFP (call) mode, or connected-but-off | **No.** | Audio "plays" into a dead sink. Human check: disconnect BT, use laptop speakers. |
| Windows audio enhancements / spatial sound misbehaving | **No.** | Disable enhancements on the playback device. |
| Windows N missing Media Feature Pack | **Mostly no** (EME probe may pass; decode dies). `MediaCapabilities.decodingInfo()` *might* report unsupported for the DRM'd type — worth logging: `navigator.mediaCapabilities.decodingInfo({type:'media-source', audio:{contentType:'audio/mp4; codecs="mp4a.40.2"'}, keySystemConfiguration:{keySystem:'com.widevine.alpha'}})` returns `{supported, keySystemAccess}`. [INFERRED — needs empirical test] | `winver` says "Windows 11 N". Fix: install Media Feature Pack, restart. |
| Browser page volume: our own gain/`player.setVolume(0)` | **Yes** — `player.getVolume()` returns the SDK volume; log it. | Also log our UI mixer state. |
| `AudioContext` suspended (for any Web-Audio path we run alongside) | **Yes** — `ctx.state === 'suspended'`. The SDK itself doesn't use our AudioContext, but its state is a proxy for "page had no gesture yet". [DOC] https://developer.chrome.com/blog/autoplay/ | Log `state` + `onstatechange`. |
| Chrome "Sites can play protected content" off | **Yes** — EME probe rejects (§2). | chrome://settings/content/protectedContent |
| Extension blocking `sdk.scdn.co` iframe or script | **Yes** — iframe missing from DOM / script load error / `MISSING_IFRAME`-class failures (§5). | Privacy extensions are called out by Spotify's own docs as an SDK-loading hazard. [DOC] https://developer.spotify.com/documentation/web-playback-sdk |

## Unreachable sources

- https://support.brave.app/hc/en-us/articles/360023851591-How-do-I-view-DRM-protected-content — HTTP 403 to fetcher (bot block). Content recovered from search-result summaries; behavior corroborated by Brave community threads.
- https://support.mozilla.org/en-US/kb/enable-drm — page shell loaded without article content (JS-rendered). Behavior corroborated via vdocipher.com/blog/firefox-drm/ and Bugzilla 1451762 / 1136707.

## Implications for our code

Code refs are to `rollplay/app/audio_management/hooks/useSpotifyPlayback.js` (hook) and `rollplay/app/shared/utils/platform.js`.

1. **Log every SDK error's raw `message` and keep the modes distinct.** Lines 531–536 currently collapse `initialization_error` and `authentication_error` into `status='error'` and reduce `autoplay_failed` to a console.warn. The diagnostic layer should ship a structured log record per event `{event, message, ts, userActivation: {isActive, hasBeenActive}}`. `account_error` (line 533 → `not_premium`) is the family-plan-relevant channel — capture its exact message text; also note [DOC] "mobile only types of premium subscriptions are excluded", worth cross-checking her plan type server-side via `/v1/me` `product` field (backend track).
2. **Add the EME probe (§2) to the diagnostic layer** — nothing in the hook or `platform.js` probes `requestMediaKeySystemAccess` today (grep confirms). Run it before `new Spotify.Player(...)` and log the full result object. Include the `createMediaKeys()` step to catch installed-but-broken CDMs, and the 4s timeout branch to catch Firefox/Brave consent prompts.
3. **Log `navigator.userActivation` at the moments that matter** — inside `activateElement()` call sites (lines 176–178, 199, 224, 238) and whenever we auto-resume on snapshot apply. This turns "was the gesture real & timely?" from a guess into data. Note `activateElement()` at line 199 runs post-`connect()` *outside* any gesture — per §4 that call cannot bless anything; only the gesture-path calls (224, 238) count.
4. **Poll-and-compare `getCurrentState()`** ~2s apart after every play/resume: log `{paused, position, duration, track uri}`. Position advancing while she hears silence proves a below-JS cause (§6, esp. Windows N / OS mixer); position frozen with `paused:false` suggests license/decode stall (Brave #56157 class); `paused:true` with no `autoplay_failed` event is the documented silent un-activated-transfer state.
5. **Verify the SDK iframe exists and log it**: `document.querySelector('iframe[src^="https://sdk.scdn.co/embedded"]')` — log presence, `allow` attribute, `isConnected`. Add a `securitypolicyviolation` listener and a `message`-event tap for origin `https://sdk.scdn.co` (passive, log-only).
6. **Serve the human checklist (§6)** in the diagnostic UI for the cases JS cannot see: tab mute, OS volume mixer, output device, Bluetooth, Windows N (ask her `winver`). Given 5/6 users work and hers is the odd one out, Windows N edition and Brave/Firefox DRM settings are the highest-prior desktop candidates that match "no error anywhere, just silence".
7. **`platform.js`**: current iOS/DRM detection does not cover desktop DRM states; fold the §2 probe in as `probeDrm()` alongside, don't fork a new module.
