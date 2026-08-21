# Spotify Silent-Follower R&D — Full Write-up (2026-08-20)

One player of six hears no Spotify audio. Spotify support said "implementation or user
error." This audit set out to (1) cross-reference our entire Spotify implementation against
current Spotify developer documentation, (2) ship a diagnostic layer that makes her next
console screenshot *decisive*, and (3) fix any genuinely missing pieces found on the way.

**Outcome in one paragraph:** we found and fixed two real, verified bugs either of which can
produce *exactly* "one silent follower with a fully working Premium account" — a
phantom-resume path (join during a pause → un-pause resumes an empty player forever) and a
documented silent autoplay-block state our recovery machinery never armed on — plus a token-
starvation hang, a connect-watchdog gap, and the error-conflation that made all of this
undiagnosable for weeks. A runtime diagnostic layer now logs raw SDK events, raw HTTP
bodies, a DRM probe, and a playback-progress verdict on every client, always-on for
failures, with a verbose stream any production user can enable from their console. If her
account is instead genuinely Free right now (family-plan eviction or wrong-account OAuth —
the "user error" branch), the boot report will say so in one line, with the raw evidence
beside it.

---

## 1. The case

- Six users. The DM (leader; family-plan owner) drives playback; everyone else's client
  applies broadcast snapshots to its own SDK player. Five hear audio; one follower never does.
- The affected user's email has no individual Premium; she reports being a member of the
  DM's family plan. Prior R&D (2026-08-01, `../notes-family-accounts.md`) established that
  genuine family members hold full Premium accounts and are fully SDK-capable — "family
  account" per se is not a cause.
- Dev-mode Spotify app, client ID created ~June 2026 → the Feb-2026 platform rules apply
  from birth: hard 5-user allowlist cap, `product`/`email`/`country` documented-as-removed
  from `/v1/me` (empirically still returned for our app), owner-must-be-Premium.
- **Live user fact (2026-08-20, from Matt):** her account page's Spotify card says
  **connected**. This is load-bearing: our `/profile` only returns `connected: true` after a
  live successful `GET /v1/me` with *her* token, and the OAuth callback itself calls
  `get_me` before storing anything. A non-allowlisted or over-cap user 403s on that exact
  call and can never look connected. So (if her look was fresh) she is allowlisted, under
  the cap, under the right account — **the entire allowlist branch is dead for her**.
- What nobody has checked yet: the **product badge** on that card (`FREE` vs `PREMIUM`),
  and **which browser she uses**.

## 2. Method

Three multi-agent phases, all findings written to files in this directory so every claim is
auditable and resumable:

1. **Docs research** — 5 parallel agents deep-reading the Web Playback SDK reference, Web
   API player endpoints + error anatomy, OAuth/dev-mode/Feb-2026 platform rules, DRM/EME +
   autoplay semantics, and community/OSS known issues. Every claim tagged
   `[DOC]`/`[COMMUNITY]`/`[INFERRED]` with source URLs. One agent fetched and de-minified
   the *shipped SDK loader itself* to establish ground truth about its DOM footprint.
   → `docs-sdk-contract.md`, `docs-web-api-player.md`, `docs-oauth-devmode-2026.md`,
   `docs-drm-autoplay-detection.md`, `community-known-issues.md`
2. **Cross-reference** — 2 agents auditing frontend and backend line-by-line against those
   contracts. 18 candidate defects. → `xref-frontend.md`, `xref-backend.md`
3. **Adversarial verification** — the top 12 defects each handed to an independent verifier
   instructed to *refute* by tracing the real code (one fetched the live SDK loader to kill
   a claim). **11 confirmed, 1 refuted**, several severities corrected in both directions.
   → `verified-findings.md` (full per-finding detail)

## 3. What the research established (the decision-relevant facts)

**Platform rules (Aug 2026 state):**
- Dev-mode cap is **5 authorized users**, live from 2026-02-11 for new apps, no
  grandfathering for ours. Non-allowlisted users complete OAuth fine; every
  `api.spotify.com` call then 403s with body `"User not registered in the Developer
  Dashboard"` — including `/v1/me`. [DOC/COMMUNITY]
- `product`/`email`/`country` are **documented as removed** from `/v1/me` for dev-mode
  apps, with **no documented replacement for Premium detection**. Enforcement is
  inconsistent in the wild; our app still receives `product` (working users pass the gate).
  The SDK's `account_error` event is the entitlement signal Spotify cannot take away. [DOC]
- **Refresh tokens now expire 6 months after authorization** (not extended by use);
  `invalid_grant` means dead-token, only a re-link fixes it. Our earliest links (~July 2026)
  hit this wall around **January 2027** — a scheduled future incident for all six users if
  no re-auth UX exists. [DOC]
- Rate limits are **per-app** over a rolling 30s window — all six users share one dev-mode
  budget. [DOC]
- Family members are full Premium accounts; a missed 7-day address re-verification silently
  drops a member to Free (email notice only, easy to miss). A July-2026 community thread
  shows Spotify's entitlement checks misclassifying family-member accounts as free on at
  least one surface (dashboard app creation). [DOC/COMMUNITY]

**SDK contract:**
- Error events carry **only `{message}`** — the verbatim string is the entire diagnosis.
  `initialization_error` ≈ EME/DRM missing; `authentication_error` = token-level;
  `account_error` = "not a valid Spotify Premium subscription" (fires for genuinely-paying
  Lite/Mini tiers too — stricter than `product`). [DOC]
- If `getOAuthToken`'s callback is never invoked, the SDK emits **no event, no timeout** —
  it re-invokes the callback indefinitely. Our failure path never invoked it. [DOC/COMMUNITY]
- `connect()===true` only means bootstrap; **ready can silently never fire** (backend 5xx on
  device registration, historical silent `account_error` regressions). [COMMUNITY]
- Server-initiated playback (our entire follower model) is **classified as autoplay** by
  the browser; the documented no-activation outcome is **"paused state, not an error"**, and
  `autoplay_failed` is **not guaranteed** to fire. Polling `getCurrentState()` for paused/
  position-advance is the only reliable verdict. [DOC/INFERRED]
- The SDK's sole DOM footprint is a hidden **cross-origin iframe** (`sdk.scdn.co/embedded`,
  `allow="encrypted-media; autoplay"`) created at script load; the real media element and
  all EME calls live inside it and are unreadable forever. Detectable: iframe presence/
  `allow`/`isConnected`, CSP violations, its postMessage traffic. Privacy/ad-block
  extensions are an *officially documented* cause of SDK failure. [DOC]
- iOS: `setVolume()` no-op; un-activated behavior as above; per-element Safari activation
  model is why `activateElement()` exists.

**DRM landscape (the per-user environmental suspects):**
- Brave ships Widevine **off by default** (and has a known enabled-but-broken state
  requiring a toggle-cycle + restart); Firefox gates DRM behind a prompt/pref; Chrome has a
  protected-content setting + enterprise policies; **Windows N** editions lack Media
  Foundation — decode can die silently *after* a successful EME probe. A robust audio-only
  probe (`com.widevine.alpha` at `SW_SECURE_CRYPTO`, plus FairPlay, with `createMediaKeys()`
  and a timeout race) distinguishes most classes. [DOC/COMMUNITY]

## 4. Verified defects

See `verified-findings.md` for full claims, verification traces, and corrections. Summary:

**Root-cause candidates (all CONFIRMED high):**
1. **`phantom-same-track-resume`** — follower joins during a pause → track recorded but
   never loaded → DM un-pauses → `seek+resume` on an *empty* player, swallowed, silent until
   a different track is selected. Deterministic; keyed purely on entry timing; needs a fully
   working Premium account. *Fixed.*
2. **`paused-arrival-not-blocked`** — autoplay-blocked follower playback can arrive
   **paused with no event**; `'blocked'` recovery never armed; dedup made it permanent.
   *Fixed (poll-pair verification + arming).*
3. **`silent-product-gate`** — `product !== 'premium'` exit with zero console/UI; also a
   future app-wide killswitch when field removal is enforced. *Diagnosed loudly now; null
   product proceeds to the SDK's own entitlement verdict.*

**Diagnosis-obscuring defects (CONFIRMED):** follower-invisible terminal statuses; token-
callback starvation (mid-session death at token expiry — silent); `/token` bare-502 hiding
`invalid_grant`; `/profile` flattening allowlist-403/dead-token/429 into "not connected"
(the meta-defect — Home Assistant shipped the identical conflation as issue #165116);
no connect→ready watchdog; error-event collapse; `playback_error` dropped.

**Refuted (1):** "activation blesses a not-yet-existing element" — the verifier fetched the
shipped loader and proved the iframe exists at script-load time; our activation ordering is
Spotify's own documented pattern.

**Downgraded (1):** the missing-`streaming`-scope hole is real code but its trigger
population in production is empty (git-history proof: identity-only scopes existed ~12
overnight hours on a feature branch that never reached main).

## 5. Root-cause analysis for the affected user

Her card says **connected** ⇒ `/v1/me` works ⇒ the fork is her `product` value, and the DM
passing the gate proves the field still flows for our app, so it is either `free` or
`premium` — "missing" is ruled out.

**Branch A — badge says `FREE`:** she is genuinely Free *on the account she OAuth'd*, right
now. Sub-cases: silently evicted from the family plan (missed address re-verification), the
family invite was never actually accepted, or she OAuth'd a different account than the one
on the plan (social-login accounts silently carry a different email — check the email line
on her card against the plan member list). Our app then *correctly* refuses to start the
SDK — the failure was that it refused **silently**. This is Spotify's "user error" branch,
now reported in one always-on console line with the raw profile JSON beside it.

**Branch B — badge says `PREMIUM`:** the gate passes and the SDK boots; her silence lives in
the SDK/environment layer, and the two fixed bugs are the prime suspects:
- If her habit is joining the session **before the DM starts music** (or while paused) —
  the phantom-resume bug reproduces her symptom deterministically, every session, with
  everything genuinely healthy. Historical discriminator: fresh track selections reached
  her, un-pauses didn't.
- If her browser blocks autoplay for our origin (fresh profile, zero engagement score,
  strict settings) — the silent paused-arrival did it; the pill never appeared because
  `autoplay_failed` never fired. Now the poll-pair arms it.
- Environment: Brave/Firefox DRM off → now caught by the boot-report probe;
  privacy/ad-block extension stripping the SDK iframe → now caught by iframe check + CSP
  tap; Windows N → probe passes but the playback verdict reads `frozen`/`advancing`-with-
  silence, which the write-out lines call out explicitly.
- Mid-session death (worked at first, died ~an hour in): token starvation at the expiry
  boundary — now logged loudly and self-recovering via last-good-token/forced-error.

**What we could NOT determine remotely:** which branch she is actually in. That was always
the point of the diagnostic layer — it converts her next session into the answer.

## 6. What shipped (this session)

**New: `rollplay/app/audio_management/hooks/spotifyDiagnostics.js`**
- `spotifyDxLog` (always-on failure evidence) / `diagVerbose` (runtime flag:
  `localStorage.setItem('tt_spotify_debug', '1')` — works on any production client, no
  deploy; replaces the compile-time `SPOTIFY_DEBUG` const nobody could flip).
- `probeEme()` — Widevine/FairPlay/ClearKey audio-only probe with `createMediaKeys()`
  confirmation and timeout race; `summarizeEmeProbe()` maps results to human verdicts
  (missing vs disabled vs installed-but-broken vs prompt-pending).
- `classifyProfileOutcome()` / `classifyPlayFailure()` — the research's diagnosis tables as
  code: allowlist-403 vs dead-refresh vs free-account vs premium vs device-gone vs 429.
- `verifyPlaybackProgress()` — the poll-pair verdict: `advancing` / `frozen` / `paused` /
  `no-state`.
- `findSdkIframe()`, `activationState()`, `autoplayPolicy()` (Firefox),
  `installSdkEnvironmentTaps()` (CSP violations + SDK postMessage mirror),
  `logBootReport()` — one collapsed console group per boot: UA, secure context, activation,
  raw profile response + classification, DRM verdict, iframe state.

**Changed: `useSpotifyPlayback.js`**
- Boot report fired on every profile check; every terminal status now leaves decisive
  console evidence; profile-fetch catch no longer log-free.
- `product == null` proceeds (SDK `account_error` = entitlement authority) instead of
  becoming a future app-wide silent kill.
- Phantom-resume guard: playing/paused same-track branches probe `getCurrentState()` before
  trusting `currentTrackRef`; null state → real load path (+ always-on guard line).
- Post-play verification arms the existing `'blocked'` pill/pointerdown recovery on silent
  paused-arrival; rejected resumes no longer swallowed.
- `getOAuthToken` starvation guard: invocation counter, always-on failure lines (with the
  backend's error body), last-good-token fallback, forced visible `authentication_error`
  after 3 consecutive failures.
- 10s connect→ready watchdog (status `'error'` + evidence instead of eternal
  `'connecting'`).
- All five SDK error events logged verbatim (event name + message + context);
  `lastError = {event, message, ts}` exported; environment taps installed for the player's
  lifetime; play failures classified inline; one-shot "session is playing Spotify but this
  client cannot hear it" breadcrumb for followers in terminal states.

**Changed: backend `integrations/spotify/`**
- `schemas.py`: `SpotifyProfileResponse` + `upstream_status`/`upstream_error`.
- `endpoints.py` `/profile`: upstream Spotify status + body logged server-side and passed
  through (still `connected: false` — the UI contract is unchanged, the evidence survives).
- `endpoints.py` `/token`: refresh failures log upstream status + body and embed them in
  the 502 detail (which the frontend now reads and prints).

**Changed: `ProfileManager.js`** — account page logs the upstream rejection when a linked
account shows "not connected", so that screenshot is diagnostic too.

**Verified:** `npm run build` passes (after `npm install` for the pre-existing missing
TipTap deps from the notes feature — unrelated to this work); `py_compile` passes on both
backend files. **Not runtime-QA'd** — see §8.

## 7. The runbook (Matt)

Fastest path to closure, in order:

1. **Ask her two questions** (zero setup): what does the badge under her name on the
   account page's Spotify card say — `FREE` or `PREMIUM`? And which browser does she use?
   `FREE` closes the case as branch A (then: check the email on the card against the plan,
   check her plan at spotify.com/account, re-link if it's the wrong account).
2. **Deploy this change**, then have her simply join a session and send a console
   screenshot. She does not need to enable anything. What it will show:
   - The collapsed **"SPOTIFYDX Spotify boot report"** header alone answers branch A vs B
     (`profile: not_premium` vs `premium` | `DRM: OK` vs `PROBLEM`).
   - Branch B failures produce the specific always-on lines: `account_error` verbatim /
     DRM verdict / `getOAuthToken FAILED` streaks / watchdog / `Playback verification:
     paused|frozen|no-state` / play-failure classification.
   - If everything reads healthy and playback verifies `advancing` while she still hears
     nothing → the cause is below JavaScript: OS mixer per-app volume, output device,
     muted tab, Windows N Media Feature Pack — the human checklist in
     `docs-drm-autoplay-detection.md` §6.
3. **For deep timing data**, have her run `localStorage.setItem('tt_spotify_debug', '1')`
   and reload — the full verbose stream (the old dbg lines, now runtime-enableable).
4. **Dashboard check** (independent): User Management — entry count vs the 5 cap, and her
   entry's email exactly matching her Spotify account email (spotify.com/account →
   the *account* email, not what she assumes; social logins lie).
5. **Ask the un-asked question:** did her audio *ever* work mid-session and die later?
   (Token-expiry starvation has a distinct signature and is now logged.)
6. If the phantom-resume bug was her cause, the historical tell: fresh track selections
   reached her, un-pauses didn't. Post-fix, both should work — worth one live test with her.

## 8. Honesty section — QA status and residual risk

- All changes compile (build + py_compile) but are **not runtime-tested**; the known
  single-Premium-account constraint (see `03-gate-gesture-race.md` §residual-risk) still
  applies to follower-side paths. The phantom-resume and verification-arming fixes reuse
  the existing recovery machinery precisely to minimize novel behavior.
- `scheduleVerifyPlayback` samples at ~2.5s and ~4.5s after a play command; an unusually
  slow cold-start device registration could arm `'blocked'` spuriously — the cost is a
  visible pill whose click re-applies the snapshot (benign, self-healing), accepted
  deliberately over silence.
- `cb('')` after 3 token failures converts a silent hang into a terminal-but-visible
  `authentication_error`; if the outage was transient, a reload recovers. Chosen
  deliberately: visible beats silent.
- The EME probe can surface a browser DRM consent prompt (Firefox) on boot for users who
  never granted it — that prompt *is itself the fix* for those users, but it is a new
  user-visible effect.
- Backend `upstream_error` passes Spotify's error body (bounded, 300 chars) to the
  authenticated account owner — deemed safe (it is their own account's error).

## 9. Not shipped — recommended follow-ups

1. **Follower-visible status pill** for `not_premium`/`not_connected`/`error` when the
   session is actively playing (verifier's sketch in `verified-findings.md` #4;
   `lastError` is already exported for its content). The audit's biggest UX gap.
2. **`reauth_required` flow**: distinct status from `/token` on `invalid_grant` + account
   row flagging + a re-link prompt. Becomes load-bearing **~Jan 2027** when the first
   6-month refresh tokens die.
3. Distinct frontend statuses (`error_init`/`error_auth`/…) with coordinated
   `gestureReady` + panel updates (#9).
4. `playback_error` consecutive-failure degraded flag + notice (#10).
5. `/token` scope guard mirroring `/playlists`' 403-reconnect pattern (#11 — hygiene).
6. Bound the devices-poll debug call and log Retry-After on 429 (unverified lead).

## 10. Open questions

- Her `product` value and browser (the two-question shortcut).
- Whether the dashboard's 5-user cap counts the owner (undocumented; check empirically —
  we may not even have 6 *linked* users; "5/6 users fine" was never confirmed to mean six
  linked accounts).
- Whether the 2026 SDK reliably fires `account_error` for family-member accounts Spotify's
  entitlement backend misclassifies (our diagnostic log may be the first public evidence
  either way).
- When `product` removal will actually be enforced for our client ID (the boot report will
  announce it: "returned NO product field").

## 11. Provenance

Research files (every claim tagged + sourced): `docs-sdk-contract.md`,
`docs-web-api-player.md`, `docs-oauth-devmode-2026.md`, `docs-drm-autoplay-detection.md`,
`community-known-issues.md`. Cross-reference: `xref-frontend.md`, `xref-backend.md`.
Verification: `verified-findings.md`. Index + live user facts: `README.md`.
Agent totals: 21 subagents across three workflows (~1.5M subagent tokens), 338 tool calls,
zero failures/timeouts; community.spotify.com blocks bots — those claims are search-snippet
sourced and flagged `[COMMUNITY]` with URLs for manual confirmation.
