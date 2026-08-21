# Web Playback SDK — Complete Contract (R&D Audit 2026-08-20)

Track: SDK reference deep-read for the one-silent-follower bug. Tags: [DOC] official docs, [COMMUNITY] forum/issue/blog, [INFERRED] deduction.

## 1. Constructor options — `new Spotify.Player(options)`

Source: https://developer.spotify.com/documentation/web-playback-sdk/reference

- [DOC] `name` (String, **required**) — "The name of the Spotify Connect player. It will be visible in other Spotify apps."
- [DOC] `getOAuthToken` (Function, **required**) — called at connection time and "when a user's access token has expired (maximum of 60 minutes)". Developer must invoke the provided callback `cb` with a valid access token **for a Spotify Premium user**.
- [DOC] `volume` (Float, optional) — default playback volume 0–1, defaults to 1.
- [DOC] `enableMediaSession` (Boolean, optional) — activates Media Session API with metadata/handlers when true; defaults to false.
- [DOC] No other constructor options are documented. (No debug/verbose flag exists in the reference.)

## 2. getOAuthToken contract

- [DOC] Invoked (1) when `connect()` is called and (2) whenever the access token expires — token lifetime max 60 minutes. (reference page)
- [DOC] The docs say only that the developer "must execute the callback with a valid access_token". There is **no documented behavior** for the case where `cb` is never invoked — no documented retry, timeout, or error event.
- [INFERRED] Because `connect()` waits on token acquisition to establish the connection, never calling `cb` most plausibly leaves `connect()`'s promise pending or resolving false with **no error event fired** — a silent hang. This matches our observed "silent indistinguishable" failure mode. (Community verification below, §2a.)
- [DOC] Passing an expired/invalid token → `authentication_error` ("Failed to instantiate valid Spotify connection from access token"). Passing a valid token for a non-Premium account → `account_error`.

### 2a. Community findings on cb-never-called / bad token

- [COMMUNITY] Token-expiry retry behavior: when the token expires, "the callback will be called rapidly for about 10 seconds then it will pause and keep retrying until it gets a valid token" (community thread "Spotify SDK Player Refreshing Token", https://community.spotify.com/t5/Spotify-for-Developers/Spotify-SDK-Player-Refreshing-Token/td-p/5234721, via search summary). So the SDK's recovery loop is: keep calling `getOAuthToken` — meaning if our `fetchAccessToken` fails and never calls `cb`, the SDK just keeps asking, **never emits an error event**, and the player sits silent. This matches our silent-failure symptom exactly.
- [COMMUNITY] Required scopes for the SDK token: `streaming`, `user-read-email`, `user-read-private`. Missing scopes produce `authentication_error` with messages like "Invalid token scopes." / "Token does not satisfy scope" (https://community.spotify.com/t5/Spotify-for-Developers/Authentication-error-Invalid-token-scopes/td-p/6596898 and https://community.spotify.com/t5/Spotify-for-Developers/Web-Playback-SDK-error-quot-Token-does-not-satisfy-scope-quot/td-p/5422642).
- [COMMUNITY] GitHub issue #20 (spotify/web-playback-sdk) — expired-token handling was a long-standing gap; getOAuthToken is the only refresh hook (https://github.com/spotify/web-playback-sdk/issues/20).
- [INFERRED] Combined with [DOC] silence on the never-invoked-cb case: our follower would see NO event at all if her token fetch 4xx's and we swallow it — the SDK gives us nothing to observe except the absence of `ready`. The diagnostic layer must log our own token-fetch failures; the SDK will not.

## 3. connect() semantics

- [DOC] `connect()` returns `Promise<Boolean>`. `true` = successfully connected to Spotify; `false` = connection failure. **The docs do not enumerate what failures produce `false`.**
- [DOC] `disconnect()` closes the session, returns void.
- [DOC] `ready` fires when "SDK successfully connected, ready to stream" and carries the `device_id` — this is a **separate, later** milestone than `connect()` resolving true.
- [INFERRED] `connect()` resolving true means the WebSocket/session handshake succeeded; `ready` requires device registration with Spotify Connect. Community reports (§3a) confirm `connect() === true` with `ready` never firing is a real state (typically auth/account/DRM problems surface as error events, or nothing at all).
- User-gesture question: the reference does NOT document calling `connect()` outside a user gesture as an error; the autoplay concern is handled via `activateElement()` and the `autoplay_failed` event. (See §4.)

### 3a. Community findings on connect()/ready divergence

- [COMMUNITY] `connect()` can resolve true while `ready` never fires. Documented community causes: page served over **http not https** (`ready` requires secure context — GitHub issue #38, https://github.com/spotify/web-playback-sdk/issues/38); invalid access token (ready never fires or is very delayed); Spotify backend 504 on `/v1/track-playback/v1/devices` (GitHub issue #120, https://github.com/spotify/web-playback-sdk/issues/120).
- [COMMUNITY] Race condition after `ready`: device registration lags; calling the Web API play/transfer endpoint immediately after `ready` can 404/502 ("Player not ready", https://community.spotify.com/t5/Spotify-for-Developers/Spotify-Web-Playback-SDK-Initial-playback-not-working-Player-not/td-p/5464378). A ~1s delay after `ready` is a common mitigation.
- [INFERRED] `connect() === true` is therefore a weak signal: it confirms the SDK bootstrapped, not that the device registered. A diagnostic layer must independently timestamp `connect()` resolution and `ready`, and flag a `ready` timeout (e.g. >10s) as its own failure state.

## 4. activateElement()

- [DOC] Purpose: "Some browsers prevent autoplay of media by ensuring that all playback is triggered by synchronous event-paths originating from user interaction." Calling `activateElement()` inside a user-interaction handler (e.g. button click) preserves playing state when transferring the device from another Spotify app.
- [DOC] Returns an **empty Promise**. No documented rejection cases, no documented return value indicating success/failure.
- [DOC] No specific browser list is given ("browsers enforcing autoplay restrictions" — in practice Safari/iOS and mobile browsers).
- [DOC] Docs do not state it must run before/after `connect()`; the constraint stated is that it must run synchronously from user interaction.
- (Repeatability, what it does to the media element: not documented on the reference page — community findings in §9.)

## 5. Events — payloads and trigger conditions

Source: https://developer.spotify.com/documentation/web-playback-sdk/reference

| Event | Payload | [DOC] Trigger condition |
|-------|---------|--------------------------|
| `ready` | `WebPlaybackPlayer` = `{ device_id }` | SDK connected and ready to stream |
| `not_ready` | `{ device_id }` | SDK unavailable, "typically no internet connection" |
| `player_state_changed` | `WebPlaybackState` | local playback state changed; "may be also executed in random intervals" |
| `autoplay_failed` | **null** (no payload) | "Playback is prohibited by the browser's autoplay rules" |
| `initialization_error` | `WebPlaybackError` `{ message }` | "Player fails to instantiate… Most likely due to the browser not supporting EME protection" |
| `authentication_error` | `{ message }` | "Failed to instantiate valid Spotify connection from access token" |
| `account_error` | `{ message }` | "User authenticated does not have a valid Spotify Premium subscription" |
| `playback_error` | `{ message }` | "Loading and/or playing back a track failed" |

- [DOC] Error payloads are documented as **only** `{ message: String }` — no error codes. Distinguishing sub-causes requires parsing the message string and correlating with surrounding behavior.
- [DOC] `account_error` is defined solely as "no valid Premium subscription". The docs do NOT distinguish free vs. family-member vs. country/market causes. Whether a family-plan member fires `account_error` or fails some other way is **undocumented** → community section §5a.
- [INFERRED] `authentication_error` = token-level failure (invalid/expired/missing-scope token); `initialization_error` = environment-level failure (EME/DRM, browser support); `account_error` = the token is valid but the account behind it is not entitled to stream.

### 5a. Community findings on account_error specifics (family plans, Premium tiers)

- [COMMUNITY] **Spotify Lite / Premium Mini (mobile-only Premium tiers) fail the SDK** with `account_error` message "This functionality is restricted to premium users only." — solved thread: https://community.spotify.com/t5/Spotify-for-Developers/Web-Playback-SDK-not-working-with-Spotify-Lite-Premium-Mini/td-p/7269497. Consistent with the [DOC] landing-page carve-out "mobile only types of premium subscriptions are excluded".
- [COMMUNITY] **The SDK has previously (2022) silently stopped emitting `account_error` for non-Premium users** — no code change on the developer side; suspected SDK release regression; SDK always self-loads the newest version so pinning is impossible. Spotify staff acknowledged the report. https://community.spotify.com/t5/Spotify-for-Developers/WebPlayback-SDK-stopped-emitting-account-error-for-non-Premium/td-p/5380189. → "no event at all for a non-entitled account" is a **known historical SDK behavior**, not necessarily our bug.
- [COMMUNITY] Family-plan members have had *API-level* entitlement anomalies before (e.g. family account not returning current track: https://github.com/spotify/web-api/issues/1361; family/student threads reporting "Premium required" 403s on play endpoints: https://community.spotify.com/t5/Spotify-for-Developers/Premium-Required-quot-When-Attempting-to-Play-Track-via-API/td-p/6263971, https://community.spotify.com/t5/Spotify-for-Developers/API-403-Studen-Premium-Premium-required/td-p/5064266). Common resolution theme: the account's `product` field (GET /me → `product: "premium"` vs `"free"`/`"open"`) is the ground truth the SDK entitlement check uses.
- [INFERRED] For our failing follower: a family **member** account should report `product: "premium"` from GET /me (requires `user-read-private` scope). If her `/me` says anything else ("free", "open", "premium_mini"), the SDK will treat her as non-Premium — and per the regression above, possibly **without firing `account_error` at all**. Logging her raw `/me.product` is the single highest-value diagnostic datum.
- [INFERRED] Alternative cause unique to her: she may not be correctly on the Dev-Mode allowlist (5-user cap, §10). Token issuance would still succeed in some flows, but API/SDK calls fail with 403s that the SDK may surface as `authentication_error` or swallow.

## 6. EME/DRM unavailability behavior

- [DOC] The only documented DRM-related behavior: `initialization_error` "most likely due to the browser not supporting EME protection". No further browser/OS matrix is given on the reference page.
- (Getting-started / supported-browsers page findings pending — §6a.)

### 6a. Supported browsers / DRM details

Source: https://developer.spotify.com/documentation/web-playback-sdk (landing page)

- [DOC] Supported browsers: "Chrome, Firefox, Safari and Microsoft Edge" across mobile (Android and iOS) and desktop (macOS, Windows, Linux).
- [DOC] **Premium requirement wording (landing page)**: "The Web Playback SDK requires a Spotify Premium subscription (**mobile only types of premium subscriptions are excluded**)." → certain Premium tiers (mobile-only, e.g. Premium Mini in some markets) are explicitly NOT entitled to SDK streaming even though they are "Premium". Highly relevant to §5a: an account can be genuinely Premium yet still fire `account_error`.
- [DOC] Cross-origin iframes: the SDK "require[s] iframes to allow encrypted-media and autoplay in cases of cross origin iframes" — i.e. if our app were embedded in an iframe without `allow="encrypted-media; autoplay"` the DRM path breaks. (Rollplay is a top-level app, not iframed → not our bug, but worth noting the SDK itself creates an iframe: §9.)
- [DOC] iOS: "The playback does not start automatically after transferring playback. The user must interact with the SDK events to play audio."
- [DOC] Landing page troubleshooting: privacy/ad-blocking browser extensions can break the SDK; docs suggest temporarily disabling them. **This is a documented, official cause of exactly our symptom class** (one user's environment failing while identical code works for others).

## 7. Volume semantics + platform limitations

- [DOC] `getVolume()` → `Promise<Float>` 0–1. `setVolume(v)` takes Float 0–1, returns empty Promise.
- [DOC] Constructor `volume` option sets the default volume (default 1).
- [DOC] iOS limitation (quoted in reference): "On iOS devices, the audio level is always under the user's physical control. The volume property is not settable in JavaScript. Reading the volume property always returns 1." — i.e. `setVolume` is a **silent no-op** on iOS and `getVolume` always reports 1.

## 8. getCurrentState() / WebPlaybackState

- [DOC] `getCurrentState()` → `Promise<WebPlaybackState | null>`. `null` means "the user is not playing music through the Web Playback SDK" — i.e. this SDK instance is not the active playback device (or nothing loaded). It does NOT distinguish "never became active" from "was transferred away".
- [DOC] `WebPlaybackState` shape:
  - `context: { uri, metadata }`
  - `disallows: { pausing, peeking_next, peeking_prev, resuming, seeking, skipping_next, skipping_prev }` (booleans)
  - `paused: Boolean`, `position: Integer(ms)`, `repeat_mode: 0|1|2`, `shuffle: Boolean`
  - `track_window: { current_track, previous_tracks[], next_tracks[] }`
- [DOC] `WebPlaybackTrack`: `{ uri, id (nullable), type: "track"|"episode"|"ad", media_type: "audio"|"video", name, is_playable, album {uri, name, images[{url}]}, artists [{uri, name}] }`
- [DOC] `WebPlaybackError`: `{ message: String }` — that is the entire documented shape.

### 4a. Getting-started tutorial on activateElement / autoplay (remote-initiated playback)

Source: https://developer.spotify.com/documentation/web-playback-sdk/tutorials/getting-started

- [DOC] "the `activateElement()` function needs to be called in advance" (on mobile) to preserve playing state during device transfer.
- [DOC] "Safari on iOS and other mobile browsers have restrictions for autoplay behaviour."
- [DOC] Playback commands arriving **from Spotify servers** (i.e. remote control / transfer, exactly our follower model where the backend or leader starts playback on the follower's device) "will be classified as autoplay behaviour and often gets blocked". → For a follower who never clicked play locally, blocked autoplay is a first-class documented failure mode; the SDK signal for it is `autoplay_failed` (payload null).
- [DOC] Tutorial's canonical listener set: `ready`, `not_ready`, `initialization_error`, `authentication_error`, `account_error` (each logging `{message}`). Notably the tutorial itself omits `playback_error` and `autoplay_failed` — apps following it verbatim are blind to those.
- [DOC] Tutorial does not enumerate OAuth scopes (no explicit `streaming` scope listing on this page).

## 9. Observability / debugging techniques

- [DOC] There is **no documented debug/verbose mode**, no constructor flag for logging, and no documented way to observe the SDK's media element or activation state. The public surface is exactly: methods + the 8 events.
- [COMMUNITY] The SDK plays audio inside an **iframe it injects into the page** ("everything is wrapped in a neat iframe to prevent music theft" — visualizer feature request, https://github.com/spotify/web-playback-sdk/issues/25; landing page confirms the iframe needs `encrypted-media; autoplay` allow when cross-origin). The iframe is same-page but its internals are intentionally opaque; there is no supported handle to the underlying `<audio>`/`<video>` element.
- [COMMUNITY] `activateElement()` internals: it "calls `resume()` on the AudioContext but does not call `play()` on the HTMLMediaElement" — and some browser autoplay policies need both (iOS playback thread, https://community.spotify.com/t5/Spotify-for-Developers/Web-Playback-SDK-Playing-song-directly-in-browser-issues-IOS/td-p/5538195). This is why iOS still needs a real user-gesture-driven `resume()`/`togglePlay()` even after `activateElement()`.
- [INFERRED] Practical undocumented probes for a diagnostic layer (all read-only, browser-side):
  - `document.querySelectorAll('iframe')` — the SDK iframe is identifiable (src about:blank / spotify sdk-injected); its presence confirms SDK bootstrap.
  - `navigator.requestMediaKeySystemAccess('com.widevine.alpha', ...)` — probe Widevine availability directly, independent of the SDK, to distinguish "DRM unavailable" from "account not entitled". On a machine where EME/Widevine is disabled, the SDK path would end in `initialization_error` — but our probe gives raw evidence.
  - Timestamp ladder: script loaded → `window.onSpotifyWebPlaybackSDKReady` → `connect()` resolved (true/false) → each `getOAuthToken` invocation (count them; a rapid-retry burst indicates rejected tokens) → `ready`/`not_ready` → first `player_state_changed` → `getCurrentState()` null/non-null. Divergence points map to distinct causes per §2/§3/§5.
  - Log the raw `{message}` of every error event verbatim — messages are the only discriminator the SDK provides.

## 10. 2026 platform changes (Feb-2026 announcement and later)

Sources:
- https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security
- https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide
- https://developer.spotify.com/documentation/web-api/references/changes/february-2026

- [DOC] From **Feb 11, 2026**, newly created Development Mode Client IDs (ours was created ~June 2026 → fully subject): app owner must have **active Spotify Premium** ("If the owner's Premium subscription lapses, the app will stop working"), **one** Dev Mode Client ID per developer, **up to 5 authorized users** per Client ID, and API access limited to a smaller supported endpoint set. Existing apps migrated **March 9, 2026** (endpoint restrictions postponed for existing apps, but Premium/5-user/one-app caps kept).
- [DOC] The blog post and migration guide make **no mention of the Web Playback SDK or the `streaming` scope** — neither restricted nor guaranteed. Player endpoints (playback state, transfer, devices, start/resume, pause, seek, volume, queue) remain listed as available in Dev Mode.
- [DOC] Migration guide does NOT state whether authorized users (non-owner) need Premium, and does NOT document what error a non-authorized user sees.
- [INFERRED] **Head-count risk for us**: DM + 5 followers = 6 users total. The cap is "up to five authorized users per Client ID". If the owner counts separately, 6 total may fit; if not, our 6th user is over cap. Exactly one follower failing is consistent with a 6th user being silently rejected at the API/token level. This must be checked in the dashboard (user management list) — the failing user may not be successfully allowlisted.
- (Changelog endpoint list detail: §10a.)

### 10a. Feb-2026 changelog endpoint list / later 2026 updates

- [DOC] Feb-2026 changelog (https://developer.spotify.com/documentation/web-api/references/changes/february-2026): **all 14 player endpoints remain available** in Dev Mode (playback state, transfer, devices, currently playing, start/resume, pause, skip, seek, repeat, volume, shuffle, queue). Removed endpoints are catalog/browse ones (`/artists/{id}/top-tracks`, `/markets`, `/browse/new-releases`, batch gets, other-user profiles). The `streaming` scope and Web Playback SDK are not mentioned anywhere in the changelog, blog, or migration guide — no documented change to SDK availability for Dev Mode apps.
- [COMMUNITY] Owner vs. authorized users: "only the main account needs to be on Premium; the authorized accounts used for testing do not need to have a subscription" (Feb-2026 press coverage/community summary, e.g. https://techcrunch.com/2026/02/06/spotify-changes-developer-mode-api-to-require-premium-accounts-limits-test-users/ and https://community.spotify.com/t5/Spotify-for-Developers/February-2026-Spotify-for-Developers-update-thread/td-p/7330564). That is an **API-access** statement — SDK *streaming* still requires each user to be Premium per the SDK docs (§6a). Both constraints apply simultaneously to our users.
- [DOC] Migration guide wording is "Users per app: 5" — it does not say whether the owner consumes a slot. [INFERRED] With 6 humans (DM owner + 5 followers) we are at or over the boundary depending on whether the owner counts. If the failing follower was added 6th and rejected (or never saved) in the dashboard allowlist, her OAuth would fail or her tokens would be issued but API-rejected — check the dashboard's user-management list length and her exact email spelling there.
- No later-2026 blog posts affecting the Web Playback SDK were found through August 2026 (searches covered the Feb announcement, March rollout update, and post-March coverage).

## Unreachable sources

- https://community.spotify.com/t5/Spotify-for-Developers/Web-Playback-SDK-not-working-with-Spotify-Lite-Premium-Mini/td-p/7269497 — WebFetch 403 (Cloudflare); content recovered via search snippets only.
- (All community.spotify.com URLs 403 on direct fetch; every [COMMUNITY] claim above sourced via search-result summaries, so exact-quote fidelity is lower than for [DOC] claims.)

## Implications for our code

All references: `rollplay/app/audio_management/hooks/useSpotifyPlayback.js` (line numbers as of 2026-08-20).

1. **Line 504 — `getOAuthToken` swallow is a proven silent-hang path.** `fetchAccessToken().then(cb).catch(e => console.error(...))` never calls `cb` on failure. [DOC] gives no SDK timeout/error for this; [COMMUNITY] says the SDK just re-invokes the callback in a rapid retry loop (~10s bursts) indefinitely. If her token endpoint 4xx's (expired refresh token, revoked link, allowlist rejection), she gets: no event, no `ready`, status stuck 'connecting'. The diagnostic layer must (a) log every `getOAuthToken` invocation with a counter + timestamp (a retry burst is itself a diagnostic signal), (b) log the raw fetch failure (HTTP status + body) from `fetchAccessToken` (line 44), and (c) consider calling `cb` with the stale/empty token anyway to force a visible `authentication_error` instead of a silent hang.
2. **Lines 531-533 — error collapse.** `initialization_error` and `authentication_error` both → `setStatus('error')`; only console.error keeps the message. Per [DOC], `{message}` is the ONLY discriminator the SDK gives. The diagnostic layer must persist/ship the verbatim message strings, and split status into distinct values (`error_init_drm`, `error_auth`, `not_premium`) — they have disjoint documented causes (EME/browser vs token vs entitlement).
3. **`account_error` may simply not fire for her.** [COMMUNITY] documented 2022 regression: SDK stopped emitting `account_error` for non-Premium accounts entirely. Do not treat "no account_error" as "account is fine". Instead fetch `GET /me` and log the raw `product` field ([COMMUNITY]: `premium` vs `open`/`free`/mobile-only tiers) — that is the entitlement ground truth. Backend touchpoint: `api-site/integrations/spotify/client.py` profile call — check whether we already capture `product` and surface it.
4. **Mobile-only Premium tiers are excluded even though "Premium".** [DOC] landing page: "mobile only types of premium subscriptions are excluded"; [COMMUNITY]: Premium Mini/Lite → `account_error` "This functionality is restricted to premium users only." A family *member* seat should be full Premium, but her actual `product` value must be verified, not assumed from the plan owner's word.
5. **Line 188 — `connect() === true` is weak; add a `ready` timeout.** [COMMUNITY]: true-but-never-ready happens (http origin, bad token, Spotify 504 on device registration). Log timestamps for connect-resolve and ready; alarm after ~10s with a distinct diagnostic state instead of indefinite 'connecting'.
6. **Follower playback is server-initiated → autoplay-blocked by design risk.** [DOC] getting-started: commands from Spotify servers "will be classified as autoplay behaviour and often gets blocked"; SDK signal is `autoplay_failed` (payload null, line 535 — we do handle it, but log it to the diagnostic ledger too, with whether a gesture had occurred and whether `activateElement` had been called; note [COMMUNITY]: `activateElement()` resumes the AudioContext but does NOT `play()` the media element, so it is not a complete unlock on iOS/Safari).
7. **DRM probe independent of the SDK.** [DOC]: EME-unsupported → `initialization_error` only ("most likely" wording — not guaranteed). Diagnostic layer should call `navigator.requestMediaKeySystemAccess('com.widevine.alpha', ...)` directly and log the result, separating "her browser/extension blocks Widevine" (documented cause: privacy/ad-block extensions, [DOC] landing page troubleshooting) from account issues. `rollplay/app/shared/utils/platform.js` DRM detection should be cross-checked against this.
8. **Dev-Mode 5-user cap head-count (org-level, not code).** 6 humans on a post-Feb-2026 client ID may exceed "Users per app: 5". Verify her exact email is present and saved in the dashboard user list; an allowlist miss produces auth-side failures indistinguishable (to us today) from SDK failures.
9. **Volume no-op on iOS.** [DOC] `setVolume` unsettable / `getVolume` always 1 on iOS — if she is on an iPad/iPhone browser, volume-based muting logic (line 585) behaves differently; log platform + getVolume readback in diagnostics.
10. **`getCurrentState()` null (line 148/388)** means only "this SDK instance is not the active playback device" [DOC] — never treat as an error by itself; log it alongside the Web API `GET /me/player/devices` view (leader/backend side) to see whether her device_id ever registered.
