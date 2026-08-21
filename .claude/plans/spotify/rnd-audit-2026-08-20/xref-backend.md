# XREF — Backend Spotify Integration vs Documented Contracts

R&D audit track: BACKEND cross-reference. 2026-08-20.
Code base: `api-site/integrations/spotify/` (endpoints.py, client.py, models.py, repository.py, schemas.py, dependencies.py), `rollplay-shared-contracts/shared_contracts/spotify.py`, plus a skim of the api-game relay.
Doc baseline: the five findings files in this directory ([DOC]/[COMMUNITY]/[INFERRED] tags trusted as labeled).

Case-fact constraint applied throughout: the affected follower's account card says **CONNECTED**, and `/profile` only returns `connected:true` after a live `GET /v1/me` succeeds (endpoints.py:183-191), and the OAuth callback itself calls `get_me` before storing anything (endpoints.py:151-156). So if her report is fresh she is allowlisted under the account she actually OAuth'd; allowlist/cap hypotheses are dead FOR HER. Live hypotheses: `product` = "free" (eviction/desync/wrong account → silent not_premium gate) or `product` = "premium" with an SDK-level failure (DRM/EME, account_error, activation, **token starvation**). Defects below are weighted accordingly.

---

## D1 — `/token` mints SDK tokens without ever checking the stored grant's scope (Phase-1 links stream-dead forever)

**Class:** misses a documented contract requirement ([DOC]: SDK requires the `streaming` scope).
**Severity: HIGH. Top silent-follower candidate that survives every established case fact.**

**Code:**
- `client.py:29-39` — the Phase 2 `SCOPES` string, with this comment at line 34:
  ```
  # NOTE: users who linked under Phase 1 (identity-only) must re-connect once to grant these.
  ```
- `endpoints.py:220-243` — `/token` resolves the account and calls `_ensure_access_token`; **no code anywhere reads `account.scope`**.
- `endpoints.py:72-92` — `_ensure_access_token` refreshes on expiry; refresh **cannot upgrade scope** (OAuth refresh preserves the original grant), and `repository.py:54-70` faithfully re-stores whatever (old) scope the refresh response echoes.
- `models.py:36` — the `scope` column exists and holds exactly the information needed; it is written (endpoints.py:161, repository.py:66-67) and never read.
- Grep confirmation: `scope` appears in endpoints.py only at lines 150, 161 (writes) and in `_ensure_access_token`'s kwarg (line 90) — zero validation reads.

**Doc basis:**
- docs-oauth-devmode-2026.md §2 [DOC]: `streaming` — "This scope is currently available to the Web Playback SDK" — the one scope the SDK needs; transfer/control additionally need `user-modify-playback-state`.
- docs-sdk-contract.md §2a [COMMUNITY]: a token missing SDK scopes produces `authentication_error` "Invalid token scopes." / "Token does not satisfy scope".
- docs-sdk-contract.md §5a [COMMUNITY]: the SDK has historically also **silently stopped emitting** entitlement errors — "no event at all" is a known SDK behavior, so the failure may show nothing.

**Failure narrative (fits the affected user exactly):**
A user who linked during Phase 1 (identity-only scopes: enough for `GET /v1/me`, `display_name`, `email`, `country`, `product`) and never re-linked:
1. Account card: `/profile` → `get_me` succeeds → **connected:true, CONNECTED** ✓ (matches her report).
2. Game gate: `profile.product === 'premium'` passes (user-read-private was a Phase-1 scope) → SDK boots ✓.
3. SDK `getOAuthToken` → `/token` → 200 with a perfectly valid access token **that lacks `streaming`** → SDK `authentication_error` ("Invalid token scopes") → frontend collapses it to generic `status='error'` (useSpotifyPlayback.js:532) — or, per the documented SDK regression, possibly no event at all.
4. Nothing anywhere tells her to re-link; the backend acknowledges the requirement only in a code comment (client.py:34).

Every backend surface reports her as healthy while streaming is impossible by construction. **Instant check, zero code:** `SELECT scope FROM spotify_accounts WHERE user_id = <hers>` — if `streaming` is absent, this is the bug. Fix shape: `/profile` (and/or `/token`) compares `account.scope` against the current required set and returns a `needs_relink`/`scope_stale` signal instead of `connected:true`.

---

## D2 — `/token` maps every refresh failure to a bare 502, which starves the SDK's `getOAuthToken` into a documented silent hang

**Class:** misses a documented failure mode (invalid_grant contract) + produces the documented silent-hang path.
**Severity: HIGH.**

**Code:** `endpoints.py:232-236`:
```python
try:
    access_token = await _ensure_access_token(account, repo, client)
except httpx.HTTPStatusError as e:
    logger.warning("Spotify token refresh failed for user %s: %s", user_id, e)
    raise HTTPException(status_code=502, detail="Could not obtain a Spotify token")
```

**Doc basis:**
- docs-oauth-devmode-2026.md §1 [DOC]: token endpoint returns `invalid_grant` when a refresh token is "expired, revoked, or otherwise invalid"; recommended handling is "**discard the refresh token and start the appropriate authorization code flow** instead of retrying". We do neither — the row is kept, the 502 says nothing, and the client retries forever.
- docs-sdk-contract.md §2 [DOC]: there is **no documented SDK behavior** for `getOAuthToken`'s callback never being invoked — no timeout, no error event. §2a [COMMUNITY]: the SDK just re-invokes the callback "rapidly for about 10 seconds then... keep[s] retrying" — **no error event ever fires**.
- Frontend cross-reference: `useSpotifyPlayback.js:504` — `fetchAccessToken().then(cb).catch(e => console.error(...))` — on any non-2xx (this 502 included) `cb` is never called. `fetchAccessToken` (line 44-49) throws on `!r.ok`.

**Failure narrative:** her refresh token dies (revocation via password change / removing the app at spotify.com/account/apps / rotation race D7 / eventually the 6-month expiry D6) **after** the join-time `/profile` gate passed → the first mid-session token expiry (≤60 min in) hits `/token` → 502 → SDK enters its silent retry loop → player never re-authenticates, `ready` never re-fires, no status change → she sits in the room hearing nothing with zero error surfaced. This is one of the two case-fact-sanctioned hypothesis classes ("token starvation"). The 502 also carries no `invalid_grant`/`error_description` detail (the response body is logged only as the exception repr), so even server logs can't distinguish "expired" from "revoked" from "Spotify outage".

**What's needed:** on 400+`invalid_grant`, return a distinct, frontend-actionable status (e.g. 409/410 `reauth_required`), log the token-endpoint response body verbatim, and delete or flag the dead row; frontend must call `cb` or surface a terminal status either way (frontend track's finding).

---

## D3 — `/profile` flattens every distinct upstream failure into `connected: false`

**Class:** misses documented failure modes (allowlist 403, invalid_grant, QUOTA_EXCEEDED 429 all have documented, distinguishable signatures).
**Severity: HIGH (primary diagnosis-obscurer for the whole incident, even though her current CONNECTED means it is not actively firing for her).**

**Code:** `endpoints.py:182-189`:
```python
try:
    access_token = await _ensure_access_token(account, repo, client)
    me = await client.get_me(access_token)
except httpx.HTTPStatusError as e:
    # Token likely revoked or unrecoverable — surface as disconnected so the
    # UI offers a reconnect rather than erroring.
    logger.warning("Spotify profile fetch failed for user %s: %s", user_id, e)
    return SpotifyProfileResponse(connected=False)
```
The `logger.warning` prints the exception repr (httpx includes the status line but **not the response body** — the body string is the only discriminator for the 403s).

**Distinct upstream failures collapsed here** (each with its doc signature):

| Upstream event | Signature ([tag]) | What this handler does | What the user sees |
|---|---|---|---|
| Refresh 400 `invalid_grant` (revoked / 6-month-expired) | docs-oauth-devmode-2026.md §1 [DOC] | connected:false | Account card "Not connected"; in-game `status='not_connected'` (useSpotifyPlayback.js:450) |
| `GET /v1/me` 403 "User not registered in the Developer Dashboard" (allowlist miss / over 5-cap) | docs-web-api-player.md §8 [DOC status]+[COMMUNITY body] | connected:false | "Not connected" — user is told to reconnect, which cannot fix an allowlist problem |
| `GET /v1/me` 429 `QUOTA_EXCEEDED` (July-2026 per-developer quota) | docs-oauth-devmode-2026.md §5 sweep [DOC] | connected:false | Card flips to "Not connected" intermittently, self-heals — phantom disconnects |
| `GET /v1/me` 403 geo/premium-shaped errors (HA #165116 class) | community-known-issues.md §4 [COMMUNITY] | connected:false | "Not connected" |
| Any other 4xx/5xx from either call | — | connected:false | "Not connected" |

All five have different fixes (re-auth vs fix dashboard email vs wait vs investigate), and the one string that separates them — the response **body** — is dropped. This is why the team spent an audit unable to tell allowlist from entitlement from token death. Minimum fix: log `e.response.status_code` + `e.response.text`, and extend `SpotifyProfileResponse` with a machine-readable `reason` (`reauth_required` / `not_registered` / `rate_limited` / `upstream_error`) instead of a bare boolean.

---

## D4 — Non-HTTP errors (timeouts, connect failures, malformed token JSON) are uncaught → raw 500s

**Class:** misses a failure mode; converts transient upstream trouble into the same silent paths as D2/D3.
**Severity: MEDIUM.**

**Code:**
- `client.py:135` and `client.py:146` — every call runs on `httpx.AsyncClient(timeout=10.0)`. Timeouts raise `httpx.TimeoutException`; DNS/conn failures raise `httpx.ConnectError` — both are `httpx.RequestError`, **not** `httpx.HTTPStatusError`.
- `endpoints.py:185` (`/profile`) and `endpoints.py:234` (`/token`) catch **only** `httpx.HTTPStatusError`. `/callback` (endpoints.py:152) catches `(httpx.HTTPStatusError, KeyError)` — still not `RequestError`.
- `endpoints.py:84-89` — `_ensure_access_token` indexes `token_data["access_token"]` / `["expires_in"]`; a 200 with an unexpected body raises `KeyError`, uncaught in `/profile` and `/token`.

**Failure narrative:**
- `/profile` 500 → frontend `!res.ok` → `status='not_connected'` (useSpotifyPlayback.js:447): a Spotify hiccup is misreported to the user as "you are not connected".
- `/token` 500 → `fetchAccessToken` throws → `cb` never called → the exact D2 silent SDK starvation, now triggered by a mere 10-second Spotify slowdown. The 10s httpx timeout is also mis-tuned against the SDK's cadence: [COMMUNITY] the SDK's expired-token recovery hammers `getOAuthToken` in ~10s bursts, so one slow refresh can overlap the next burst (see also D7).

---

## D5 — `product` passthrough: absence, "free", and "premium" are undifferentiated and unlogged, feeding a doc-doomed frontend gate

**Class:** violates [DOC] guidance ("handle their absence gracefully") + misses the family-eviction/desync failure mode that is one of the two live hypotheses for her.
**Severity: MEDIUM (HIGH diagnostic value).**

**Code:**
- `endpoints.py:65` — `product=me.get("product")` → `None` when absent.
- `schemas.py:17` — `product: Optional[str] = None  # "premium" | "free"` — tolerates absence at the schema layer (good) but transmits no "absent vs free" distinction.
- No server-side log of the per-user `product`/`country` values or the raw `/v1/me` payload exists anywhere in the module.
- Frontend consumer: `useSpotifyPlayback.js:452` — `if (data.profile?.product !== 'premium') { setStatus('not_premium'); return; }` — **absent and "free" both silently gate**; SDK is never created, so no SDK error listener can ever fire.

**Doc basis:**
- docs-web-api-player.md §4 [DOC]: Feb-2026 migration guide removes `country`, `email`, `product` from `/v1/me` for dev-mode apps; "handle their absence gracefully"; **no documented replacement for premium detection**. Our June-2026 client ID is subject from birth; empirically the field still arrives (5 users pass), i.e. enforcement can land any day and would flip **all six users** to `not_premium` simultaneously.
- docs-oauth-devmode-2026.md §7 [DOC]: family address-verification failure silently converts a member to Free ("switches to the free version"); community-known-issues.md §2 [COMMUNITY]: Spotify's premium-classification has proven false-negatives for family members.

**Failure narrative for her (live hypothesis A):** she was evicted/desynced (or OAuth'd a Google-created duplicate Free account — community-known-issues §3b). Her `/v1/me` succeeds (CONNECTED ✓) with `product:"free"`; the backend passes it through without logging; the frontend silently gates `not_premium`. Support has no server-side record to check — the single highest-value diagnostic datum (docs-sdk-contract.md Implications #3: "Logging her raw /me.product is the single highest-value diagnostic datum") is discarded. Note the backend *does* durably store `spotify_user_id` + `display_name` at link time (endpoints.py:156-164) — that is enough to answer "WHICH account did she actually OAuth" today; `product` should be logged (or stored per fetch) next to it.

---

## D6 — The 6-month refresh-token lifetime and `invalid_grant` are handled nowhere: dead rows live forever, users are never told to re-link

**Class:** violates the [DOC] refresh contract's prescribed handling.
**Severity: MEDIUM (a ticking fleet-wide failure from ~Dec 2026; not her current state if her report is fresh).**

**Code trace of the documented death:**
1. `models.py:46-57` — `is_expired()` true (access token stale).
2. `endpoints.py:83` — `client.refresh_tokens(account.refresh_token)` → Spotify 400 `invalid_grant` ([DOC]: refresh tokens now live 6 months from authorization; refreshing access tokens does **not** extend the lifetime).
3. `client.py:153` — `raise_for_status()` → `httpx.HTTPStatusError`.
4. `/profile` → `connected:false` (D3); `/token` → 502 (D2). **In both paths the row with the dead refresh token is kept forever**, `repository.py` has no delete/flag-on-invalid-grant, and no response ever says "re-link Spotify".

**Doc basis:** docs-oauth-devmode-2026.md §1 [DOC]: "Refresh tokens issued to apps registered in the Developer Dashboard have a lifetime of 6 months... after expiry the user must re-authorize"; on `invalid_grant`: "Your app should discard the refresh token and start the appropriate authorization code flow."

**Failure narrative:** all six users linked ~June-July 2026 → from ~December 2026 they will roll, one by one (staggered by link date), into exactly the affected user's symptom: account card silently flips to "Not connected", in-game `/token` 502s starve the SDK mid-session (D2). The account-page copy will offer reconnect (accidentally adequate); the in-game path has no recovery at all. One-user-at-a-time staggered failure will look like a reappearance of this very incident.

---

## D7 — Concurrent `/token` calls race the refresh: rotated refresh tokens can be clobbered by a stale write

**Class:** misses a documented behavior (refresh-token rotation) — no single-flight/lock around refresh.
**Severity: MEDIUM.**

**Code:**
- `endpoints.py:72-92` — `_ensure_access_token` does read→refresh→persist with no per-account serialization.
- `repository.py:54-70` — `update_tokens` blindly persists `refresh_token=token_data.get("refresh_token") or account.refresh_token`, where `account` is the row **as read at request start** in that request's own DB session.
- Concurrency is real, not theoretical: at connect time the frontend fires `fetchAccessToken` from `getOAuthToken` (useSpotifyPlayback.js:504) and again in the `ready` handler for the leader (line 520) and play paths (lines 306, 373); [COMMUNITY] the SDK's expired-token recovery invokes `getOAuthToken` "rapidly for about 10 seconds".

**Doc basis:** docs-oauth-devmode-2026.md §1 [DOC]: "a refresh token might not be included in each response. When a refresh token is not returned, continue using the existing token" — i.e. Spotify DOES sometimes rotate, and when it does the client must replace the stored one.

**Failure narrative (one-user-killer shape):** requests A and B both read the row holding RT1 while the access token is expired. A refreshes → Spotify rotates → A persists RT2. B refreshes with RT1 (may still succeed), gets no new refresh token, and persists `refresh_token = RT1` — **overwriting RT2 with the possibly-invalidated RT1**. Next expiry: `invalid_grant` → D2/D6 spiral for that one user, while the other five (who happened not to race) stay healthy. Consistent with "exactly one user broken"; inconsistent with her *currently* fresh CONNECTED (her row refreshes fine today), so ranked medium — but it can also fire intermittently and self-obscure. Fix shape: per-user lock (or `SELECT ... FOR UPDATE` + re-check `is_expired` inside the lock) so only one refresh flight per account.

---

## D8 — Callback conflates every failure — including the allowlist 403 — into `?spotify=error`

**Class:** misses a documented failure mode (dev-mode allowlist rejection at link time).
**Severity: LOW for her (case facts prove she is linked+allowlisted); real for the 6th-user/cap scenario.**

**Code:** `endpoints.py:145-154` — `exchange_code` + `get_me` in one try; any `httpx.HTTPStatusError` or `KeyError` → `_finish("error")` → redirect `/account?spotify=error`.

**Doc basis:** docs-oauth-devmode-2026.md §3/§4 [DOC]: a non-allowlisted user **can complete OAuth** (consent + code exchange succeed) and only fails on the first API call — which here is our callback's own `get_me` — with 403, body [COMMUNITY] "User not registered in the Developer Dashboard". Post-Feb-2026 cap: 5 users, no grandfathering for a June-2026 app.

**Failure narrative:** the correct behavior (not storing a half-linked account — the callback's get_me-before-upsert ordering is genuinely good, and is exactly what makes her CONNECTED report probative) is undermined by the message: a 6th user over the cap, or a mis-allowlisted email, gets an undifferentiated "error" with no hint that the dashboard — not their password or our server — is the problem. They will retry forever. The 403 body string should be detected here and surfaced as `?spotify=not_registered`.

---

## Lower-priority observations (kept out of the structured list)

- **O1 — Token-expiry slack.** `models.py:46` uses a 60s buffer; `/token` (endpoints.py:238-242) can legally hand the SDK a token with only ~60s of life (`expires_in` floor-clamped at 0). The SDK has no way to know (it receives only the bare token, `getOAuthToken` takes no expiry), so it will hold the token until Spotify rejects it, then enter its retry loop — a routine churn window every ~55 minutes. Widening the refresh margin to ~5 minutes for the `/token` path removes it. Not a per-user discriminator.
- **O2 — Scope string sufficiency: CONFIRMED OK.** `client.py:35-39` includes `streaming` ([DOC] the only SDK-required scope) plus `user-read-playback-state`/`user-modify-playback-state` for transfer/control and playlist reads. The Phase 2 scope set itself needs no change — D1 is about *stored old grants*, not the current string.
- **O3 — Schema absence-tolerance: partially OK.** All `SpotifyProfile` fields are Optional (schemas.py:11-21), so the [DOC] dev-mode field removals (`email`, `country`, `product`, `followers`) will not crash the backend — the damage is downstream semantic (D5), not a validation error.
- **O4 — `/token` never touches api.spotify.com.** It only hits accounts.spotify.com (refresh) — so QUOTA_EXCEEDED/allowlist 403s cannot fire there; those surface only via `/profile`, `/search`, `/playlists*`. Diagnostically: a user can successfully pull SDK tokens **while being fully 403-blocked from the Web API** ([DOC] refresh is not gated by allowlisting) — another reason `connected` must not be inferred from token-mint success anywhere in future code.
- **O5 — api-game relay (skim only).** `websocket_events.py:1006-1122` (`spotify_control`) is DM-gated, validates via the `SpotifyState` contract (shared_contracts/spotify.py:24-36), and broadcasts full snapshots (`spotify_state`, gameservice.py:427-445, app.py:561-586/784-808 restore paths). No token/entitlement logic lives there — correct per service boundaries. One design note: there is **no follower→server failure feedback channel**; a follower whose SDK is dead cannot report it, so room state claims "playing" for everyone — the reason this incident was discovered by a human ear rather than telemetry.
- **O6 — `/playlists` special-cases 403 → "reconnect to grant scope" (endpoints.py:281-285).** Reasonable, but the same 403 status also means the allowlist rejection [DOC §8] — a not-registered DM would be told to reconnect, which cannot help. Same body-string discrimination fix as D3 applies.
- **O7 — `disconnect` (endpoints.py:194-201) deletes the row without revoking the grant at Spotify.** Cosmetic; the grant lingers in the user's spotify.com/account/apps list. No user-visible failure in this incident.

---

## Master table — every distinct upstream Spotify failure → current user-visible outcome

| # | Upstream failure (signature) | Enters at | Backend result | User-visible outcome |
|---|---|---|---|---|
| 1 | Refresh 400 `invalid_grant` — revoked/6-month-expired [DOC] | `/profile` via `_ensure_access_token` | `connected:false` (D3, D6) | Account card "Not connected"; game gate `not_connected`. Never told to re-link; dead row kept |
| 2 | Same, at `/token` | `/token` | 502, no detail (D2) | SDK `getOAuthToken` starved → silent infinite retry, player stuck, **no error shown** |
| 3 | `GET /v1/me` 403 "User not registered in the Developer Dashboard" [DOC+COMMUNITY] | `/profile` | `connected:false` (D3) | "Not connected"; reconnect loops back to the same 403 at callback |
| 4 | Same, at `/callback` (first API call post-consent) | `/callback` | no row stored; redirect `?spotify=error` (D8) | Generic "error" on account page; retrying can never succeed while unlisted/over-cap |
| 5 | `GET /v1/me` 429 `QUOTA_EXCEEDED` (July-2026 per-developer quota) [DOC] | `/profile` | `connected:false` (D3) | Phantom "Not connected" that self-heals — trust-eroding flicker |
| 6 | `GET /v1/me` 200 with `product` absent (dev-mode removal enforced) [DOC] | `/profile` | `product=None` passthrough (D5) | **All** users hit frontend `not_premium` gate; SDK never constructed |
| 7 | `GET /v1/me` 200 with `product:"free"` (family eviction/desync/wrong account) [DOC §7 + COMMUNITY] | `/profile` | passthrough, unlogged (D5) | Silent `not_premium`; no server-side trace for support |
| 8 | httpx timeout / connect error (10s cap) anywhere | `/profile` | uncaught → 500 (D4) | Frontend maps to `not_connected` — transient hiccup shown as "not connected" |
| 9 | Same, at `/token` | `/token` | uncaught → 500 (D4) | Same silent SDK starvation as row 2 |
| 10 | Token 200 with malformed body (missing keys) | either | `KeyError` → 500 (D4) | As rows 8/9 |
| 11 | Stored grant lacks `streaming` (Phase-1 link) | `/token` (unchecked) | 200 with unscoped token (D1) | SDK `authentication_error` "Invalid token scopes" → generic `error` status; possibly **no event at all** per SDK regression [COMMUNITY] |
| 12 | Playlist 403 (missing playlist scope OR allowlist 403) | `/playlists` | 403 "reconnect" (O6) | DM told to reconnect — wrong advice in the allowlist case |
| 13 | search/playlist other 4xx/5xx | those endpoints | 502 generic | DM picker error toast, cause invisible |

## Priority read for the incident

Given the case facts (her card = CONNECTED, so refresh + allowlist + `/v1/me` all work for her **at account-page time**), the backend defects that can still be her root cause, in order: **D1** (unscoped Phase-1 token — checkable this minute in Postgres), **D2/D4** (mid-session token starvation — matches "no audio, no error"), **D5** (product:"free" passthrough — the other sanctioned hypothesis, currently unlogged server-side), **D7** (intermittent rotation-race row death). D3 is the meta-defect that kept all hypotheses alive by erasing the discriminating evidence at the first hop.
