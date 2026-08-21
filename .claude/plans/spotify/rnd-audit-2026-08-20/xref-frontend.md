# XREF — Frontend Spotify Chain vs Documented Contracts

R&D audit track: FRONTEND cross-reference. 2026-08-20.
Baseline: the five findings files in this directory ([DOC]/[COMMUNITY]/[INFERRED] tags trusted as instructed).
Code audited (all line refs as of HEAD 7387304):

- `rollplay/app/audio_management/hooks/useSpotifyPlayback.js` (full)
- `rollplay/app/game/GameContent.js` (Spotify-relevant: 1118–1152, 1476–1530, 2417–2446, 2580–2618)
- `rollplay/app/game/hooks/useGatePreload.js` (full)
- `rollplay/app/audio_management/hooks/webSocketSpotifyEvents.js` (full — clean; pure WS glue, no contract surface)
- `rollplay/app/audio_management/components/SpotifyBgmPanel.js` (full)
- `rollplay/app/audio_management/components/SpotifyUnsupportedNotice.js` (full — iOS-only, not in scope for this desktop user)
- `rollplay/app/shared/utils/platform.js` (full)

Case-fact weighting applied throughout: her account card says CONNECTED and `/profile` only
returns `connected:true` off a live `GET /v1/me` success → she IS allowlisted under the
OAuth'd account. Allowlist/cap defects are therefore de-weighted; the live branches are
(a) `product == 'free'` → our silent `not_premium` gate, or (b) `product == 'premium'` →
SDK-level failure (DRM/EME, account_error, activation, token starvation).

Classification key per defect: **[VIOLATES-DOC]** = code contradicts a [DOC] contract ·
**[MISSES-MODE]** = code has no handling for a documented failure mode. Style concerns dropped.

---

## D1. Followers have NO status UI at all — every terminal failure status renders nothing

**Class:** [MISSES-MODE] (umbrella — it converts every documented failure mode below into
invisible silence for exactly the population the bug lives in).

**Code:**
- `SpotifyBgmPanel.js:212-226` — the ONLY place `not_connected` / `not_premium` / `error` /
  `connecting` are rendered as human-readable text… and the panel mounts only inside
  `GameContent.js:2417` `{activeRightDrawer === 'audio' && isDM && (<AudioMixerPanel …/>)}`.
- `GameContent.js:2602-2610` — the only follower-visible Spotify UI is the 'blocked' pill.
- `GameContent.js:2615-2618` — the only other follower-visible surface is the iOS
  `unsupported_browser` notice.
- Nothing anywhere renders `connecting`/`error`/`not_premium`/`not_connected` for a non-DM.

**Doc basis:** docs-sdk-contract.md §5/§9 — the SDK's public surface is 8 events whose
`{message}` strings are the only discriminator; docs-web-api-player.md §8 distinguishing
table — every failure class needs its raw signal surfaced. Our follower UI surfaces none of
them.

**Failure narrative:** a follower whose hook lands on `not_premium` (profile gate OR
account_error), `error` (init/auth/connect-false), or is stuck on `connecting`
(token starvation, ready-never-fires) sees a fully normal session — map, party, S3 audio —
and simply never hears Spotify. No pill, no toast, no panel text. This is byte-for-byte the
reported symptom: "one follower hears no Spotify audio," discovered socially rather than
from any UI. The DM cannot see it either (the DM's panel shows the DM's own status).

**Silent-follower relevance:** maximal — whichever underlying branch is hers, this defect is
why nobody could tell. Severity: high.

---

## D2. `product !== 'premium'` gate is silent: no console line, no UI, no event — and it gates on a documented-dead field

**Class:** [VIOLATES-DOC] (gates on a field the Feb-2026 migration guide documents as
removed for dev-mode apps) + [MISSES-MODE] (family eviction/desync arrives here and is
swallowed).

**Code:** `useSpotifyPlayback.js:452`
```js
if (data.profile?.product !== 'premium') { setStatus('not_premium'); return; }
```
No `console.*` of any kind in this branch. Combined with D1, a follower rejected here emits
zero evidence. Also `useSpotifyPlayback.js:447` (`!res.ok → 'not_connected'`) and `:450`
(`!data.connected → 'not_connected'`) collapse backend-visible causes, and the outer catch
at `:455-457` sets `'error'` with **no console output at all** (the only fully log-free
`'error'` path in the hook).

**Doc basis:** docs-oauth-devmode-2026.md §5 — `product` removed from `/v1/me` for post-Feb-2026
dev-mode apps ("handle their absence gracefully"; enforcement empirically not yet bitten for
us but "can vanish on any deploy day"); §7 — family address-verification eviction silently
converts a member to `product:"free"`; docs-web-api-player.md §4 — no documented replacement
for Premium detection. community-known-issues.md §2 — family-member premium misclassification
confirmed in the wild (July 2026).

**Failure narrative (her case, branch a):** her card says CONNECTED (profile call succeeded),
so if her `/v1/me` `product` is `"free"` — family eviction, entitlement desync, or she OAuth'd
a duplicate social-login account — line 452 fires, status = `not_premium`, SDK never
constructed, `gestureReady` resolves instantly (`:604`), the gate opens normally, and she
plays a full session with no Spotify and no trace. The ONLY console evidence would be
`GameContent.js:1481`'s gate-click line printing `spotify.status= not_premium`.
When `product` removal enforcement eventually bites, this same line breaks ALL six users at
once (absence !== 'premium').

**Silent-follower relevance:** prime candidate for branch (a). Severity: high.

---

## D3. Un-activated playback arriving paused is a documented SILENT state — our 'blocked' machinery only arms on the non-guaranteed `autoplay_failed` event, and we never verify playback started

**Class:** [MISSES-MODE].

**Code:**
- `useSpotifyPlayback.js:535-538` — `autoplay_failed` listener is the ONLY thing that sets
  `'blocked'` after a gesture-path connect (`:516`'s `activationMissingRef` branch covers only
  the gate-fallback-timeout path).
- `useSpotifyPlayback.js:408-410` — follower 'playing' apply: `player.seek(...).then(() => player.resume()).catch(() => {})`
  or `playTrackAt(...)`; no post-apply verification.
- `useSpotifyPlayback.js:320-324` — `playBody` treats HTTP 204 as success (`dbg('play OK')`,
  invisible — `SPOTIFY_DEBUG = false` at `:53`); there is no `getCurrentState()` check that
  `paused === false` / position advances after ANY play command anywhere in the hook.

**Doc basis:** docs-drm-autoplay-detection.md §3 ("the docs describe the no-activation
outcome as **paused state, not an error**") and §4 ("two distinct outcomes: (a) play attempt →
`NotAllowedError` → `autoplay_failed`; (b) SDK never attempts play and presents a paused
state — **silent**"); docs-sdk-contract.md §4a [DOC] — commands arriving from Spotify servers
(exactly the follower model: our Web API PUT starts playback on her device) "will be
classified as autoplay behaviour and often gets blocked". community-known-issues.md §1 —
GitHub #42/#75: "state advances/looks right, zero audio, no error listener fires" is a known,
never-resolved SDK shape.

**Failure narrative (her case, branch b):** her SDK connects, `ready` fires, status =
`'ready'`. Snapshot applies via Web API play → 204. Browser autoplay policy (her per-origin
MEI is 0, or Safari per-site "Never Auto-Play", or activation never actually landed — see D9)
blocks the actual sound; the SDK presents the track paused **without firing
`autoplay_failed`**. Our status stays `'ready'`, the pill never appears (it requires
`'blocked'`, `GameContent.js:2602`), the one-shot pointerdown recovery (`:590-595`) never
arms, and every later snapshot with the same sig is deduped away (`:428-430`). Permanent
silence with a green-looking status.

**Silent-follower relevance:** prime candidate for branch (b) with a premium account.
Severity: high.

---

## D4. Phantom `sameTrack`: the paused branch records a track it never loaded, so the following 'playing' snapshot resumes an empty player

**Class:** [VIOLATES-DOC] (misuses `resume()`/`seek()` semantics — [DOC]
`getCurrentState() === null` means this SDK instance is not the active playback device;
seek/resume cannot start fresh playback there).

**Code:** `useSpotifyPlayback.js:400-410`
```js
if (state === 'paused') {
  if (sameTrack) player.seek(positionMs).then(() => player.pause()).catch(() => {});
  else currentTrackRef.current = snap.track_uri;   // ← records WITHOUT loading
  return;
}
// playing
if (sameTrack) player.seek(positionMs).then(() => player.resume()).catch(() => {});  // ← lies
else playTrackAt(snap.track_uri, positionMs);
```

**Doc basis:** docs-sdk-contract.md §8 [DOC] — `getCurrentState()` null = "the user is not
playing music through the Web Playback SDK"; a device that never loaded a context cannot be
seeked/resumed into playback. docs-web-api-player.md §2 — starting playback requires the
PUT /play call with a body; `resume` semantics only apply to an active device with loaded
context.

**Failure narrative:** follower enters (or reconnects) while the DM has track X **paused**.
First snapshot: `state='paused'`, not sameTrack → `currentTrackRef = X`, nothing loaded
(deliberately — the comment explains loading would 404 pre-activation). DM presses play →
snapshot `state='playing'`, track X → `sameTrack === true` → `seek().then(resume())` against
an SDK device with NOTHING loaded → both reject/no-op → `.catch(() => {})` swallows. She
stays silent until the DM changes to a different track (which finally routes through
`playTrackAt`). Five users who entered while music was playing are fine; the one who entered
during a pause is silent. Status is `'ready'` throughout; zero console output.

**Silent-follower relevance:** high — it is a deterministic one-user-silent generator keyed
purely on WHEN she entered relative to DM pause state. Repeats every session with the same
entry pattern. Severity: high.

---

## D5. `getOAuthToken` cb-starvation: token fetch failure never calls `cb` — SDK retries forever, no event, stuck 'connecting'

**Class:** [MISSES-MODE] (the documented-silent case: [DOC] has no behavior for cb-never-called).

**Code:** `useSpotifyPlayback.js:504`
```js
getOAuthToken: (cb) => { fetchAccessToken().then(cb).catch((e) => console.error('Spotify token error', e)); },
```

**Doc basis:** docs-sdk-contract.md §2 [DOC] — "no documented behavior for the case where
`cb` is never invoked — no documented retry, timeout, or error event"; §2a [COMMUNITY] —
the SDK re-invokes the callback in rapid ~10s bursts indefinitely, never emits an error.
docs-oauth-devmode-2026.md §1 — refresh tokens now expire at 6 months / `invalid_grant`
on revocation; Implications #3 — our backend `/api/spotify/token` maps refresh failure to a
bare 502, which lands exactly in this catch.

**Failure narrative:** any persistent failure of `/api/spotify/token` (revoked/6-month-expired
refresh token → backend 502; transient 429 QUOTA_EXCEEDED; auth cookie hiccup) starves the
SDK. `connect()` may resolve true or hang; `ready` never fires; status pins at `'connecting'`
forever — which for a follower renders nothing (D1). Console DOES show repeated
`Spotify token error Error: token 502` lines (one per SDK retry), so this branch is at least
screenshot-visible — the only stuck-state that is.
Weighting: her CONNECTED card implies her refresh worked moments before the report, so a
*persistently* dead refresh token is unlikely — but `/profile` and `/token` are separate
calls; an intermittent failure here still yields whole silent sessions.

**Silent-follower relevance:** plausible for branch (b); the repeated console line makes it
easy to confirm/kill with her screenshot. Severity: high.

---

## D6. No ready-timeout: `connect() === true` then `ready` never firing leaves 'connecting' forever with ZERO console evidence

**Class:** [MISSES-MODE].

**Code:** `useSpotifyPlayback.js:183-204` — after `connect()` resolves `true` (`:188`), the
only forward progress is the `ready` listener (`:508`). There is no timer anywhere that
escalates "connected but never ready". The `dbg('connect ->', ok, …)` at `:189` is dead
(`SPOTIFY_DEBUG = false`, `:53`). Contrast: the gate has an 8s fallback for *player creation*
(`useGatePreload.js:11,128-137`) but nothing covers connect→ready.

**Doc basis:** docs-sdk-contract.md §3/§3a — `connect()` true is "a weak signal"; documented
community causes of true-but-never-ready (invalid token, Spotify 504 on
`/v1/track-playback/v1/devices`, insecure origin); Implications #5 explicitly calls for a
~10s ready-timeout as its own diagnostic state.

**Failure narrative:** her `connect()` resolves true, device registration fails server-side
(504 / entitlement rejection that the SDK swallows — the [COMMUNITY]-documented 2022
account_error-goes-silent regression lands here too), `ready` never fires. Status:
`'connecting'` forever. Console: **nothing at all**. UI: nothing (D1). Of every stuck state
in this hook, this one produces the emptiest screenshot — indistinguishable from "Spotify
not in use".

**Silent-follower relevance:** solid branch-(b) candidate; also the state that most needs a
diagnostic ladder because today it emits zero bytes of evidence. Severity: medium (high
diagnostic cost, moderate likelihood).

---

## D7. Error-event collapse: `initialization_error`/`authentication_error` → one 'error'; `account_error` → the same 'not_premium' as the profile gate

**Class:** [MISSES-MODE] (the `{message}` string is the SDK's only discriminator [DOC]; we
keep it only as an unstructured console line and destroy the event identity in state).

**Code:** `useSpotifyPlayback.js:531-533`
```js
player.addListener('initialization_error', ({ message }) => { console.error('Spotify init error:', message); setStatus('error'); });
player.addListener('authentication_error', ({ message }) => { console.error('Spotify auth error:', message); setStatus('error'); });
player.addListener('account_error',        ({ message }) => { console.error('Spotify account error:', message); setStatus('not_premium'); });
```
Also `connect() === false` → the same `'error'` (`:190-197`), and profile-fetch throw → the
same `'error'` (`:455-457`, no log).

**Doc basis:** docs-sdk-contract.md §5 [DOC] — error payloads are `{message}` only; the three
events have disjoint documented causes (EME/browser vs token vs entitlement). §5a — Premium
Mini/Lite fire `account_error` even when `/me` says premium. docs-drm-autoplay-detection.md
Implications #1.

**Failure narrative:** downstream code (D1's UI, `gestureReady` at `:602-606`, the mixer
enable at `GameContent.js:2592`) cannot distinguish "her browser has no Widevine"
(`initialization_error`) from "her token is bad" (`authentication_error`) from "profile said
free" vs "SDK says not entitled" (`account_error` vs line 452 — both `'not_premium'`). For
this audit specifically: if her session lands `'not_premium'`, we cannot tell from state
whether the profile gate (D2, product='free') or the SDK entitlement check (family desync
with product='premium') rejected her — the two live hypotheses for her — without a console
screenshot containing the one distinguishing line.

**Silent-follower relevance:** directly obstructs discriminating branch (a) from (b).
Severity: medium.

---

## D8. `playback_error` is logged and dropped — per-track failure loops (DRM decode, region) leave status 'ready' and the app pretending all is well

**Class:** [MISSES-MODE].

**Code:** `useSpotifyPlayback.js:534`
```js
player.addListener('playback_error', ({ message }) => { console.error('🎵 Spotify playback_error:', message); });
```
No status change, no counter, no UI, no recovery. (The equivalent Web API-side failure IS at
least logged with body: `playBody` `:320-323`.)

**Doc basis:** docs-sdk-contract.md §5 [DOC] — `playback_error` = "Loading and/or playing
back a track failed". docs-drm-autoplay-detection.md §1 — the Brave enabled-but-broken CDM
class and damaged-CDM class fail at playback time, not init time; §6 — Windows N decode
death. docs-web-api-player.md §6 — market/relinking silent-skip class.

**Failure narrative:** a follower whose CDM is broken-but-present (Brave #56157 class,
damaged component, Windows N edge) passes init, `ready` fires, every track errors at load —
`playback_error` per track, status stays `'ready'`, no pill, no notice. Her console would
show repeated `🎵 Spotify playback_error:` lines; her screen shows nothing.

**Silent-follower relevance:** plausible branch-(b); console-visible, so cheap to test
against her screenshot. Severity: medium.

---

## D9. Activation is structurally shaky: pre-connect `activateElement()` blesses a not-yet-existing element, and the post-connect re-call at :199 runs outside the synchronous gesture path

**Class:** [VIOLATES-DOC] for the `:199` call ([DOC]: activateElement must run
"synchronously from user interaction"); [MISSES-MODE] for the pair's combined gap.

**Code:**
- `useSpotifyPlayback.js:224` — `unlock()` calls `player.activateElement()` synchronously in
  the gate-click gesture, **before** `connect()` — but the SDK's iframe (which owns the media
  element) is only created during connect (docs-drm-autoplay-detection.md §5, shipped-loader
  `setupPlayerEnv`), so there may be nothing to bless yet.
- `useSpotifyPlayback.js:199` — the re-call `await player.activateElement()` runs **after**
  `await player.connect()` resolves — an async hop of network-handshake duration; the
  transient activation window (~seconds, consumed/expiring) may be gone. The code's own
  comment admits "we're **usually** still inside the gesture's transient window".
- `useSpotifyPlayback.js:178` — `activate()` in the leader/recovery paths is
  gesture-synchronous and fine; this defect is specifically the gate-click boot path every
  follower takes.

**Doc basis:** docs-sdk-contract.md §4 [DOC] — "must run synchronously from user
interaction"; §9 [COMMUNITY] — activateElement resumes the AudioContext but does not
`play()` the element (incomplete bless on Safari). docs-drm-autoplay-detection.md §4 [DOC] —
transient activation expires after ~seconds and is what a post-await call would need.

**Failure narrative:** for a follower whose browser actually enforces autoplay (MEI 0 for our
origin — a first-time or rare visitor, unlike the five regulars whose engagement scores may
waive it), BOTH activation attempts can no-op: the first has no element, the second has no
gesture. Whether she then gets `autoplay_failed` (→ recoverable 'blocked') or the silent
paused arrival (D3) is explicitly not guaranteed. This is the mechanism that makes D3 land
on exactly the least-engaged user — a clean fit for "the one follower" being different
without any account difference.

**Silent-follower relevance:** high as D3's enabling mechanism; on its own severity: medium.

---

## D10. No desktop DRM/EME probe anywhere — `platform.js` gates iOS only; desktop Widevine-absent/broken states ride the collapsed 'error' path or pure silence

**Class:** [MISSES-MODE].

**Code:**
- `platform.js:28-32` — `isIOSNonSafari()` is the only DRM-related capability check in the
  frontend, and its `requestMediaKeySystemAccess` presence-test runs only when `isIOS()`.
- `useSpotifyPlayback.js:441` — the hook's only capability gate is `isIOSNonSafari()`.
- grep confirms zero calls to `navigator.requestMediaKeySystemAccess(...)` as a probe
  anywhere in `rollplay/app`.

**Doc basis:** docs-drm-autoplay-detection.md §1 (Widevine desktop matrix: Brave default-off,
Firefox pref, Chrome protected-content setting, Linux no-CDM, Windows N silent decode
death), §2 (probe code + `createMediaKeys()` to catch installed-but-broken), §3 [DOC]
(`initialization_error` "most likely" EME — not guaranteed). docs-sdk-contract.md §6a [DOC] —
privacy/ad-block extensions are an official documented cause of exactly this symptom class.

**Failure narrative:** the affected user is on desktop. If her browser lacks/blocks Widevine
(Brave, hardened Firefox, enterprise Chrome policy, ad-block iframe stripping), best case the
SDK fires `initialization_error` → collapsed `'error'` (D7) → invisible (D1); worst case
(Windows N, broken CDM) everything reports fine and audio silently dies below JS — a state
our code cannot even represent. We have no probe result to distinguish "her environment
can never play this" from account issues, and no equivalent of the iOS
`unsupported_browser` notice for desktop.

**Silent-follower relevance:** strong branch-(b) candidate given "desktop app, one user's
environment"; severity: medium.

---

## Additional defects (below the structured-output cap, still real)

### D11. `connect()` THROW leaves status 'connecting' forever
`useSpotifyPlayback.js:200-203` — the catch releases the guard and logs
`Spotify connect failed:` but does NOT `setStatus('error')` (the resolved-false branch at
`:190-197` does). A throwing connect strands a follower on invisible `'connecting'` with one
console line. [MISSES-MODE]; medium-low.

### D12. Profile-fetch catch is the only fully log-free 'error'
`useSpotifyPlayback.js:455-457` — network failure of `/api/spotify/profile` → `'error'`,
zero console output. Combined with D1: totally evidence-free terminal state. Low-medium.

### D13. `recoverPlayback` optimistically clears 'blocked' before knowing recovery worked
`useSpotifyPlayback.js:240` — `setStatus(readyRef.current ? 'ready' : 'connecting')` runs
before the re-apply; if the re-play is again blocked AND `autoplay_failed` doesn't re-fire
(non-guaranteed, D3), the pill is gone and she's stranded on `'ready'`-but-silent. Also the
one-shot pointerdown (`:590-595`) is consumed by that failed attempt. [MISSES-MODE]; low-medium.

### D14. `playBody` silent abort when no device
`useSpotifyPlayback.js:310` — `if (!deviceId) { dbg('playBody ABORT — no live device'); return; }`
is dbg-gated (`SPOTIFY_DEBUG=false`, `:53`) → when her SDK never registered a device
(D5/D6), every snapshot-driven play attempt exits with zero console output. Same for
`waitForDevice` (`:249-256`) timing out — no log. Low (symptom of D5/D6, but it deletes the
last evidence they'd leave).

### D15. Per-app rolling-30s rate budget: devices calls on every play, and `logDevices` fetch is not debug-gated
`useSpotifyPlayback.js:274-287` — `reconcileDevice` hits `GET /v1/me/player/devices` on
EVERY `playBody` for every one of 6 clients per track change; `:262-269` — `logDevices`
performs its network fetch unconditionally on transfer-404 even with `SPOTIFY_DEBUG=false`
(only the output is gated). docs-web-api-player.md §7 [DOC]: the rolling-30s budget is
per-app across all 6 users. 429s would fail users randomly rather than deterministically one
user — poor fit for this bug (as the findings note) but the budget draw is real and a 429 on
her play call today prints only via the `:320-323` error line. Low.

### D16. `not_ready` clears device but not status
`useSpotifyPlayback.js:526-530` — after `ready`, a `not_ready` ([DOC]: "typically no internet
connection"; also device reaping per docs-web-api-player.md §3) clears `readyRef`/`deviceIdRef`
but leaves status `'ready'` — mixer stays enabled (`GameContent.js:2592`), follower applies
skip at `applyToSDK:393` silently. A mid-session network blip → permanent silence with
status 'ready'. Low-medium (session-scoped, recovers on SDK reconnect if it ever re-fires
`ready`).

### Verified NON-defects (checked against docs, kept for completeness)
- `playBody` 404 → transfer → backoff retry (`:314-319`) and `setRepeat`'s 404-retry
  (`:377-381`) match the documented device-registration race and "order of execution is not
  guaranteed" caveats (docs-web-api-player.md §1/§2/§5, Implications #4/#6). Correct shape;
  its only gap is evidence (D14) and no `reason`-body parse (D7-adjacent).
- `reconcileDevice` matches [DOC] "any cached device_id should periodically be cleared out
  and refetched" (docs-web-api-player.md §3).
- `SpotifyBgmPanel` 1s `getCurrentState()` poll (`:93-107`) is a local SDK call, not a Web
  API request — no rate-budget draw. [DOC] §8.
- Plain `fetch` to `api.spotify.com` (`:264,276,291,311,375`) is correct — authFetch is for
  our backend only (CLAUDE.md exception: not-our-backend).
- `webSocketSpotifyEvents.js` — pure pass-through; no contract surface; clean.
- The gate sequencing itself (`useGatePreload` phase 3 + `gestureReady` + `unlock()` in the
  synchronous click path at `GameContent.js:1482` before any await) is doc-sound; the 8s
  fallback correctly routes to 'blocked' via `activationMissingRef` (`:516`, `:566-570`).

---

## Console-visibility inventory — what a failing follower's screenshot shows TODAY, per terminal state

`SPOTIFY_DEBUG = false` (`useSpotifyPlayback.js:53`) — every `dbg()` line is dead in prod.
Lines that ALWAYS print at entry regardless of Spotify state:

```
🔄 Gate preload: fired batch of N assets (cine: M cached)          (useGatePreload.js:102)
🔊 Gate: audio sync complete — proceeding   (or ⏱️ timeout line)    (useGatePreload.js:118/119)
🔊[t=NNNN][gate] CLICK — isDM= false | spotify.status= <STATUS>     (GameContent.js:1481)  ← the single most diagnostic line we ship today
🔊[t=NNNN][gate] → calling unlockAudio()                            (GameContent.js:1496)
🔊[t=NNNN][gate] ← unlockAudio() returned                           (GameContent.js:1498)
```
`⏱️ Gate: Spotify boot timeout — proceeding; blocked-recovery owns activation`
(`useGatePreload.js:133`) prints ONLY if the SDK player object was never created within 8s of
coreReady — its presence means the boot chain stalled pre-creation; its absence plus a bad
status means the chain ran and gated.

Per terminal state, the COMPLETE set of our own console lines:

| Her state | Console lines from our code | UI she sees |
|---|---|---|
| `not_connected` (profile !ok / !connected) | none from the hook; gate CLICK line shows `spotify.status= not_connected` | nothing |
| `not_premium` via profile gate `:452` | **none**; gate CLICK line shows `not_premium` | nothing |
| `not_premium` via `account_error` `:533` | `Spotify account error: <raw message>`; gate CLICK line likely showed `connecting` | nothing |
| `error` via `initialization_error` `:531` | `Spotify init error: <raw message>` | nothing |
| `error` via `authentication_error` `:532` | `Spotify auth error: <raw message>` | nothing |
| `error` via `connect()===false` `:195` | `Spotify connect refused (resolved false)` | nothing |
| `error` via SDK script/setup throw `:573` | `Spotify SDK setup failed: <e>` | nothing |
| `error` via profile-fetch throw `:455` | **none** (D12) | nothing |
| stuck `connecting` — token starvation `:504` | repeated `Spotify token error Error: token <status>` (burst pattern ≈ SDK retry loop — itself diagnostic) | nothing |
| stuck `connecting` — connect true, ready never (D6) | **none** | nothing |
| stuck `connecting` — connect threw (D11) | `Spotify connect failed: <e>` (once per gesture retry) | nothing |
| `blocked` | `🎵 Spotify autoplay blocked — next interaction (or the unlock pill) recovers it.` (warn, `:536`) | ✅ green pill (`GameContent.js:2602`) |
| `ready` but silent — paused arrival (D3), phantom sameTrack (D4), OS/DRM-below-JS | usually **none**; possibly repeated `🎵 Spotify playback_error: <msg>` (`:534`) and/or `🎵 Spotify play failed: <status> <body ≤200ch>` (`:322`) if the Web API refused (403 PREMIUM_REQUIRED / persistent 404 would appear HERE — the one place an entitlement 403 body ever reaches her console) | nothing |
| `unsupported_browser` (not her — desktop) | none | iOS notice if track playing |
| unlock with no player (gate regression) | `🎵 Spotify unlock: gesture fired with no SDK player — gate sequencing regression` (`:220`) | nothing |

Reading her screenshot: **the gate CLICK line's `spotify.status=` value at click time plus
which (if any) of the above error lines appear discriminates every branch we currently
can** — except the two zero-evidence states (`not_premium`-via-gate shows only the CLICK
line; connect-true-ready-never shows only the CLICK line with `connecting`). Those two are
precisely the live hypotheses (a) and (b) for her, which is why today's console cannot close
the case without new instrumentation.

---

## Priority read for the affected user

1. If her screenshot's CLICK line says `not_premium` and nothing else → D2 (product='free':
   family eviction/desync/wrong account) — confirm with her spotify.com/account plan page.
2. If it says `connecting` with repeated `Spotify token error` → D5. With nothing else → D6.
3. If it says `ready` (or `blocked`-then-gone) and she's still silent → D3/D4/D9, then
   D8/D10's below-JS classes; ask whether the pill ever appeared and whether music from a
   NEW track selection (not un-pause) works — a clean D4 discriminator.
