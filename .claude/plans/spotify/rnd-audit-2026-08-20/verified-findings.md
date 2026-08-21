# Verified Findings — Spotify Silent-Follower Audit (2026-08-20)

18 candidate defects came out of the two cross-reference agents (`xref-frontend.md`,
`xref-backend.md`). The 12 highest-severity were each handed to an independent adversarial
verifier instructed to REFUTE by tracing the real code. Result: **11 CONFIRMED, 1 REFUTED**.
The 6 unverified remainder (lower severity) live in the xref files.

Full verbatim verdicts (with complete code traces): workflow output preserved at the
session task file; the substance is compiled here. "Shipped" = implemented in this session.

| # | id | Verdict | Severity (verified) | Relevance to affected user | Shipped |
|---|---|---|---|---|---|
| 1 | `silent-product-gate` | CONFIRMED | high | **plausible root cause** (branch a) | ✅ diagnostics + null-product future-proofing |
| 2 | `phantom-same-track-resume` | CONFIRMED | high | **plausible root cause** (branch b) | ✅ fixed |
| 3 | `paused-arrival-not-blocked` | CONFIRMED | high | **plausible root cause** (branch b) | ✅ fixed |
| 4 | `follower-no-status-ui` | CONFIRMED | high | obscures diagnosis | ◐ console breadcrumb + `lastError` export; UI pill = follow-up |
| 5 | `token-cb-starvation` | CONFIRMED | medium (downgraded from high) | obscures; mid-session killer | ✅ fixed |
| 6 | `token-refresh-failure-bare-502` | CONFIRMED | medium | obscures | ✅ logging/passthrough; reauth-status = follow-up |
| 7 | `profile-flattens-all-upstream-failures` | CONFIRMED | medium | obscures (the meta-defect) | ✅ fixed |
| 8 | `no-ready-timeout` | CONFIRMED | medium | obscures | ✅ fixed |
| 9 | `error-event-collapse` | CONFIRMED | medium | obscures | ◐ verbatim logging + `lastError`; distinct statuses = follow-up |
| 10 | `playback-error-dropped` | CONFIRMED | medium | obscures | ◐ verbatim logging; degraded-flag = follow-up |
| 11 | `token-endpoint-ignores-stored-scope` | CONFIRMED | low (downgraded from high) | unrelated-but-real (trigger population empty in prod) | ✗ follow-up |
| 12 | `activation-outside-gesture` | **REFUTED** | — | not-a-defect | n/a |

---

## 1. `silent-product-gate` — CONFIRMED, plausible root cause (branch a)

**Claim:** `useSpotifyPlayback.js:452` gated SDK init on `data.profile?.product !== 'premium'`
with zero console output and zero follower UI. A family member whose account reads
`product: "free"` (plan eviction via missed address re-verification, entitlement desync, or
having OAuth'd a different account than the one on the plan) exits here invisibly. When the
documented Feb-2026 `product` field removal is enforced for our client ID, the same line
would have silently disabled all six users at once (`undefined !== 'premium'`).

**Verification highlights:** traced her exact case — the account card saying CONNECTED proves
`/v1/me` succeeds, so if it returns `free`, this line is her exit and the *only* trace in the
entire app was the gate-click line printing `spotify.status= not_premium`. The verifier also
confirmed our diagnostics module existed but was unwired at trace time ("written, not wired").

**Shipped:** boot report logs the raw profile response + a classification line
(`free` vs `premium` vs missing are three different diagnoses, spelled out); `product == null`
now **proceeds to SDK init** relying on `account_error` (the entitlement authority Spotify
cannot remove from us) instead of silently killing everyone when field removal lands.

## 2. `phantom-same-track-resume` — CONFIRMED, plausible root cause (branch b)

**Claim:** a follower who **enters the session while the DM's track is paused** records
`currentTrackRef` without loading audio (deliberate: no gesture yet, load would 404). When
the DM un-pauses, `sameTrack=true` routed to `seek().then(resume())` — transport commands
that cannot load a track — on an SDK device with **nothing loaded**, swallowed by
`.catch(() => {})`. Silent until the DM selects a *different* track. Deterministic
one-user-silent generator keyed purely on entry timing; repeats every session with the same
entry pattern; requires a fully working Premium account.

**Verification highlights:** full trace through `initial_state` → `applySpotifySnapshot` →
`applyToSDK` paused branch (line 405 records without loading; the comment's "it loads when it
actually plays" promise was never fulfilled) → un-pause broadcast passes the sig check (new
`started_at`) → line 409 seek/resume on empty player. No rescue path existed: transfer is
leader-only, `recoverPlayback` needs `'blocked'` which needs `autoplay_failed` which cannot
fire since no play command ever reached the SDK element. One correction accepted: "zero
console output" is probable, not guaranteed (a `playback_error` *might* fire).

**Shipped:** the playing branch now probes `player.getCurrentState()` — non-null → seek+resume
(unchanged UX for everyone mid-playback), null → full `playTrackAt` load path with an
always-on "Phantom-resume guard" console line. Same guard on the paused same-track branch.

**Discriminator for the affected user:** before the fix — did a *fresh track selection* reach
her when an *un-pause* didn't? If yes, this was her bug.

## 3. `paused-arrival-not-blocked` — CONFIRMED, plausible root cause (branch b)

**Claim:** follower playback is server-initiated (Web API PUT), which Spotify's own docs
classify as autoplay. When blocked, the SDK may present a **paused state without firing
`autoplay_failed`** (documented outcome: "paused state, not an error"). Our `'blocked'`
status — and therefore the recovery pill and the one-shot pointerdown recovery — armed only
on that non-guaranteed event. Status stayed `'ready'`, identical snapshots were deduped, and
the user was permanently silent with a green-looking client.

**Verification highlights:** confirmed a 204 from `PUT /play` proves only that Spotify's
backend accepted the command, not that her browser produced audio; confirmed
`getCurrentState` was used nowhere in the production follower path; confirmed the resume
rejection at line 409 swallowed `NotAllowedError`. Tag correction: "not guaranteed" is
[INFERRED from DOC statements] + community (GitHub #42/#75), not pure [DOC] — accepted, the
docs themselves describe the paused-arrival-no-event outcome.

**Shipped:** `scheduleVerifyPlayback()` — after every follower play command, two
`getCurrentState()` samples ~2s apart classify the outcome: `advancing` (verbose log only),
`frozen` (license/decode stall — always-on evidence), `paused`/`no-state` while a playing
snapshot is expected → always-on warn + **arm `'blocked'`** (clearing the snapshot sig) so
the existing pill/pointerdown machinery recovers it. The swallowed resume rejection now also
arms `'blocked'`.

## 4. `follower-no-status-ui` — CONFIRMED, obscures diagnosis

**Claim:** `'connecting'`, `'error'`, `'not_premium'`, `'not_connected'` render only inside
the DM-only audio drawer; a follower in any of them sees a fully normal session.

**Verification highlights:** every mount point traced; the only follower surfaces are the
`'blocked'` pill and the iOS notice. The gate deliberately treats terminal statuses as
gate-passing, so the session looks entirely healthy.

**Shipped (partial):** one-shot always-on console breadcrumb when the session is actively
playing Spotify while this client is in a terminal status ("this session is playing Spotify
but this client cannot hear it: status X — see the boot report above"), plus the hook now
exports `lastError` (verbatim SDK event + message) so a future notice has its content ready.
**Follow-up:** an actual follower-visible pill (verifier's sketch: render alongside the
blocked pill, gated on `nowPlaying` actively playing, reusing the panel's message map).

## 5. `token-cb-starvation` — CONFIRMED (downgraded high→medium), obscures

**Claim:** `getOAuthToken`'s failure path never invoked `cb`; per the SDK contract there is
no timeout and no event — the SDK re-invokes the callback forever while the client pins on
`'connecting'` (or dies mid-session at the ~60-min token expiry).

**Verification highlights (important narrowing):** the verifier proved the *session-start*
window is effectively closed for her — the profile gate runs the same refresh seconds
earlier, so `/token` serves the stored token without touching Spotify. Starvation realistically
bites **mid-session at the token-expiry boundary**: audio dies ~an hour in and never recovers,
silently. (Worth asking: does her audio work at first and die later? Nobody has asked that
question yet.)

**Shipped:** invocation counter + always-on failure logs (with the backend's error body, which
`fetchAccessToken` now reads); last-good-token fallback (may still be valid); after 3
consecutive failures `cb('')` forces the SDK's **visible** `authentication_error` instead of
an invisible hang.

## 6. `token-refresh-failure-bare-502` — CONFIRMED, obscures

**Claim:** `/token` mapped every refresh failure — including `invalid_grant` from a
revoked/6-month-expired refresh token — to a detail-free 502, whose body the frontend never
read. The httpx exception repr omits the response body, so even server logs lacked the
discriminator.

**Verification highlights:** confirmed end-to-end including the httpx message-format check
(no body in the repr). Narrowed blast radius honestly: transient failures self-heal via SDK
re-invocation; a page reload converts a dead refresh token into a visible `not_connected`.

**Shipped:** backend logs upstream status + body verbatim and embeds them in the 502 detail;
frontend `fetchAccessToken` reads and throws the body so the starvation log line carries it.
**Follow-up:** distinct `reauth_required` status + row flagging so the UI can prompt a
re-link instead of a generic failure (deliberately not shipped — destructive row handling
deserves its own change).

## 7. `profile-flattens-all-upstream-failures` — CONFIRMED, obscures (the meta-defect)

**Claim:** `/profile` collapsed allowlist 403 ("User not registered in the Developer
Dashboard"), refresh `invalid_grant`, quota 429, geo/premium 403s into `connected: false` —
telling users to reconnect even when reconnecting cannot help. This is the defect that made
this incident undiagnosable for weeks and the exact conflation Home Assistant shipped
(their issue #165116).

**Verification highlights:** confirmed; correction accepted that the httpx repr does include
status+URL (so server logs could distinguish *some* classes) but never the body — and the
body is the only discriminator among the three 403 classes. The verifier independently
noticed the drafted `classifyProfileOutcome` consumed `upstream_status`/`upstream_error`
fields the backend didn't yet provide — "this backend change is the missing half of an
already-drafted contract."

**Shipped:** `SpotifyProfileResponse.upstream_status`/`upstream_error` (declarations in
schemas.py per convention), populated in the except branch with full server-side logging;
consumed by `classifyProfileOutcome` in the boot report; also logged on the account page
console so *that* screenshot is diagnostic too.

## 8. `no-ready-timeout` — CONFIRMED, obscures

**Claim:** `connect()===true` with `'ready'` never firing (Spotify 5xx on device
registration, entitlement rejection the SDK swallows — a real, community-documented state)
left `'connecting'` forever with literally zero console evidence — the emptiest possible
screenshot.

**Shipped:** 10-second watchdog armed when `connect()` resolves true; on expiry with no
`'ready'`: always-on error line (with iframe presence + activation state) + status `'error'`.
Cleared on `'ready'` and on teardown.

## 9. `error-event-collapse` — CONFIRMED, obscures

**Claim:** `initialization_error`/`authentication_error` → one `'error'`;
`account_error` → the same `'not_premium'` as the profile gate. The event identity — the
SDK's only discriminator — was destroyed in state, blocking exactly the branch (a) vs (b)
distinction this incident needs.

**Shipped (partial):** every error event now logs `event name + verbatim message` always-on,
with tailored context lines; `lastError = {event, message, ts}` exported from the hook, so
gate-rejection vs `account_error` is now machine-distinguishable (`lastError` present ⇒ SDK
path). Status *values* deliberately unchanged (the `gestureReady` terminal-status enumeration
and panel copy depend on them — the verifier flagged that ripple risk explicitly).
**Follow-up:** distinct status values with a coordinated `gestureReady`/panel update.

## 10. `playback-error-dropped` — CONFIRMED, obscures

**Claim:** `playback_error` was console-logged and otherwise ignored — a present-but-broken
CDM (Brave class), Windows N decode failure, or region/relinking failure loops per-track
while status stays `'ready'`.

**Verification highlights:** correction accepted — these environment classes do *not*
reliably fire `playback_error` at all (worst case is silent one level deeper); the event
handler is the best-case manifestation. This is precisely why the poll-pair verification
(finding 3) exists — it catches the classes that never reach this handler.

**Shipped (partial):** verbatim always-on logging + `lastError`. **Follow-up:** consecutive-
failure counter → non-terminal degraded flag + follower notice.

## 11. `token-endpoint-ignores-stored-scope` — CONFIRMED but LOW (excellent refutation work)

**Claim:** `/token` never checks the stored grant contains `streaming`; a Phase-1
(identity-only) linker would be fully "connected" yet stream-dead forever.

**Verification highlights — why it's low:** the verifier dug through git history and proved
the identity-only scope string existed only for ~12 overnight hours on a feature branch with
a localhost redirect URI, is not an ancestor of main, and no release contains it — **the
trigger population in production is empty**. Spotify consent is all-or-nothing, so no prod
row can lack `streaming`. Cheap definitive kill available anyway:
`SELECT scope FROM spotify_accounts` for her user id.

**Follow-up (not shipped):** a scope guard in `/token` mirroring the existing 403-reconnect
pattern in `/playlists` — worth doing for hygiene, irrelevant to this incident.

## 12. `activation-outside-gesture` — REFUTED

**Claim:** pre-connect `activateElement()` blesses a not-yet-existing element (iframe created
during `connect()`), and the post-connect re-call runs outside the gesture.

**Refutation:** the verifier fetched the shipped loader from `sdk.scdn.co/spotify-player.js`
and proved the iframe is created **synchronously at script-load time** (inside
`setupPlayerEnv`, before `onSpotifyWebPlaybackSDKReady` fires) — and since the gate CTA waits
for `sdkPlayerCreated`, the iframe provably exists when `unlock()` activates. The post-connect
re-call is documented-harmless redundancy. The claim also contradicted its own doc basis.
No change made (activation state is now logged at the relevant call sites anyway, turning any
residual doubt into observable data).

---

## The 6 unverified candidates

Lower-severity items still listed in `xref-frontend.md` / `xref-backend.md`, unranked and
unverified — treat as leads, not findings: devices-poll rate-budget usage, `client.py` 10s
httpx timeout vs SDK token cadence, callback partial-state handling, schemas field-absence
tolerance notes, `is_expired` clock-skew margin commentary, api-game relay observations.
