# R&D Audit — Spotify OAuth, Scopes, Dev Mode & 2026 Platform Changes

**Track:** OAuth, scopes, dev-mode mechanics, Feb-2026 platform changes — state as of 2026-08-20.
**Author:** research subagent, 2026-08-20.
**Bug context:** one follower (family-plan member, plan owned by DM) hears no audio; 5/6 users work; dev-mode app, client ID created ~June 2026 (post-Feb-2026 rules apply from birth).

Tags: [DOC] official docs · [COMMUNITY] forum/issue/blog · [INFERRED] deduction. Every claim carries a source URL.

## 1. Authorization Code flow + refresh contract

Source: https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens (fetched 2026-08-20)

- [DOC] Rotation: "Depending on the grant used to get the initial refresh token, a refresh token might not be included in each response. When a refresh token is not returned, continue using the existing token." When a new `refresh_token` IS present in the refresh response, the client must replace the stored one. (URL above)
- [DOC] **Refresh tokens now have a 6-month lifetime**: "Refresh tokens issued to apps registered in the Developer Dashboard have a lifetime of 6 months." Lifetime starts at user authorization; refreshing access tokens does **not** extend it; after expiry the user must re-authorize. (URL above) — this is a change vs. the historical "refresh tokens don't expire" behavior.
- [DOC] Failure contract: "The token endpoint returns `invalid_grant` when a refresh token is expired, revoked, or otherwise invalid." Recommended handling: "Your app should discard the refresh token and start the appropriate authorization code flow instead of retrying the refresh request." (URL above)
- [DOC] Successful refresh = `200 OK` with JSON access token (+ optional new refresh token). (URL above)
- [INFERRED] The docs collapse revocation causes (user removed app at spotify.com/account/apps, password change, Spotify-side token-family revocation) into "revoked, or otherwise invalid" — all surface identically as `invalid_grant`. Historically the HTTP status for `invalid_grant` is **400 Bad Request** with body `{"error":"invalid_grant","error_description":"Refresh token revoked"}` (or "...expired"); the doc page fetched did not print the status explicitly for the error case. Treat any 400 + `invalid_grant` as "re-auth required", regardless of description string.

### Web Playback SDK page (requirements)
Source: https://developer.spotify.com/documentation/web-playback-sdk (fetched 2026-08-20)
- [DOC] "The Web Playback SDK requires a Spotify Premium subscription (mobile only types of premium subscriptions are excluded)."
- [DOC] SDK emits `authentication_error` and `account_error` events (details on triggers not on the landing page — see SDK reference track).
- [DOC] iOS: "The playback does not start automatically after transfering playback. The user must interact with the SDK events to play audio."
- [DOC] Iframes must allow `encrypted-media` and `autoplay`; privacy/ad-block browser extensions may prevent SDK load.

## 2. Scopes — Web Playback SDK + per-endpoint

Source: https://developer.spotify.com/documentation/web-api/concepts/scopes (fetched 2026-08-20)

- [DOC] `streaming`: "Control playback of a Spotify track. This scope is currently available to the Web Playback SDK. The user must have a Spotify Premium account." — the only scope the scopes page ties to the SDK. The classic trio (`streaming` + `user-read-email` + `user-read-private`) is a tutorial convention, not a documented hard requirement; the scopes page "does not specify that Web Playback SDK requires all three scopes together, only that `streaming` is needed."
- [DOC] `user-read-email`: "Read access to user's email address." (GET /me) — but see §5: dev-mode apps post-Feb-2026 no longer receive `email` in /me at all, so this scope is effectively dead weight for us.
- [DOC] `user-read-private`: "Read access to user's subscription details (type of user account)." (Search, GET /me) — likewise, `product` is removed from /me for dev-mode apps, so this no longer yields subscription type for us. Search still requires it (for market resolution via user country).
- [DOC] `user-read-playback-state`: read player state — GET /me/player/devices, GET /me/player, GET /me/player/currently-playing.
- [DOC] `user-modify-playback-state`: write playback — Pause, Seek, Repeat, Volume, Next/Previous, **Start/Resume Playback (PUT /me/player/play)**, Shuffle, **Transfer Playback (PUT /me/player)**, Add to Queue.
- [DOC] `user-read-currently-playing`: currently playing track + queue.
- [DOC] `playlist-read-private`: "Read access to user's private playlists." (GET /me/playlists, Get User's Playlists); `playlist-read-collaborative` adds collaborative ones.
- [INFERRED] For our leader/follower model: followers minimally need `streaming` (SDK) and the leader needs `streaming` + `user-modify-playback-state` (+ `user-read-playback-state` if we ever poll) + `playlist-read-private` if we list the DM's playlists.

## 5a. The 2026-02-06 blog post

Source: https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security (fetched 2026-08-20). (Note: guessed URL `.../2026-02-06-changes-to-the-web-api` is 404 — real slug is "update-on-developer-access-and-platform-security".)

- [DOC] Rationale: "Advances in automation and AI have fundamentally altered the usage patterns and risk profile of developer access."
- [DOC] "Starting Wednesday, 11 February": Development Mode requires owner Premium; "Each Client ID will be limited to up to five authorized users"; "Developers will be limited to one Development Mode Client ID" (raised to 25 in July — see changelog sweep); "API access will be limited to a smaller set of supported endpoints."
- [DOC] **Postponement applies to EXISTING apps only**: "we have decided to postpone endpoint access changes for existing integrations" — but Premium requirement, user cap, and client-ID limit proceeded on Mar 9 for existing apps. **Our June-2026 client ID gets no postponement: endpoint restrictions (incl. /me field removals) are live for us.**
- [DOC] No mention of streaming scope or Web Playback SDK changes.

## 3. Development mode in Aug 2026 — User Management allowlist + user cap

Source: https://developer.spotify.com/documentation/web-api/concepts/quota-modes (fetched 2026-08-20)

- [DOC] **User cap is 5**: "Up to 5 authenticated Spotify users can use an app that is in development mode." (Down from the historical 25.)
- [DOC] Allowlisting is via Developer Dashboard "User Management": you provide "the name and Spotify email address of the user that you want to enable to use your app." — the email must be the **Spotify account email**, not any other email the person uses. No propagation delay documented on this page.
- [DOC] Non-allowlisted behavior: "Users may be able to log into a development mode app without having been allowlisted by the developer. However, API requests with an access token associated to that user and app will receive a 403 status code error." → **OAuth consent + code exchange can complete for a non-allowlisted user; the failure only appears on subsequent API calls as 403.**
- [DOC] **"The app owner must have a Spotify Premium account for apps in development mode to function."** — dev-mode app viability is tied to the OWNER's Premium status.
- [DOC] Cap timeline (see §5): new-app 5-user limit effective 2026-02-11 for apps created after that date; existing apps migrated 2026-03-09. Our client ID (~June 2026) was born under the 5-user cap. (Sources: quota-modes page + february-2026-migration-guide.)

## 6. Extended quota mode in 2026

Source: https://developer.spotify.com/documentation/web-api/concepts/quota-modes (fetched 2026-08-20)

- [DOC] As of 2025-05-15: "Spotify only accepts applications from organizations (not individuals)."
- [DOC] Requirements: legally registered business entity; active, launched service; **minimum 250k MAUs**; availability in key Spotify markets; commercial viability; adherence to Terms. Review can take "up to six weeks."
- [INFERRED] A hobby app like Rollplay cannot obtain extended quota mode — development mode (5-user cap) is effectively permanent for us. (From the requirements above.)
- [DOC] Extended Quota Mode apps are NOT affected by the Feb-2026 changes; all existing endpoints/fields remain for them. (https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide via search snippet — verified below.)

## 4. Non-allowlisted user end-to-end experience

- [DOC] "Users may be able to log into a development mode app without having been allowlisted by the developer. However, API requests with an access token associated to that user and app will receive a 403 status code error." (https://developer.spotify.com/documentation/web-api/concepts/quota-modes)
- [INFERRED] Therefore: OAuth consent screen renders, user approves, the code exchange succeeds, access + refresh tokens are issued. Every downstream Web API call then 403s. From the app's viewpoint the user looks "connected" (tokens exist) but no data call works — this exactly matches our silent `not_connected` collapse.
- [COMMUNITY] The 403 body message is "User not registered in the Developer Dashboard" — a large family of community threads confirms the message string (e.g. https://community.spotify.com/t5/Spotify-for-Developers/403-User-not-registered-in-the-Developer-Dashboard/td-p/5358758, https://community.spotify.com/t5/Spotify-for-Developers/quot-User-not-registered-in-the-Developer-Dashboard-quot-error/td-p/5344902). Canonical wrapper shape for Web API "regular error objects" is `{"error": {"status": 403, "message": "..."}}` [DOC: https://developer.spotify.com/documentation/web-api/concepts/api-calls]. Note: community.spotify.com blocks direct fetches (HTTP 403 to our fetcher), so the exact JSON was not re-verified verbatim today — but the message string is corroborated across many independent threads and GitHub issues (https://github.com/JohnnyCrazy/SpotifyAPI-NET/issues/700).
- [COMMUNITY] The error "typically only affects endpoints like `/me` while other API endpoints may work fine with the same access token" in some historical reports (search summary over the thread family above) — i.e. the 403 can be per-endpoint-inconsistent, which makes single-probe detection unreliable.
- [COMMUNITY] Classic resolution trap: the allowlist entry used "a different email than the one registered with their Spotify account" — the User Management entry must match the **Spotify account email**, not the person's usual/contact email (same thread family). Especially treacherous with Facebook/Google/Apple social-login accounts (see §8).
- [INFERRED] No official propagation-delay figure exists on the quota-modes page; community threads mention needing to log out/in or re-authorize after being added, because the allowlist check happens per-request against the user identity bound to the token — re-consent is a safe reset step but new API calls with the existing token should also start succeeding once the entry is correct.

## 5. Feb-2026 rules for client IDs created after 2026-02-11

Source: https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide (fetched 2026-08-20)

**Timeline** — [DOC] "New Development Mode apps are created with new restrictions" from **2026-02-11**; "Existing Development Mode apps are migrated to new restrictions" on **2026-03-09**. Extended Quota Mode apps: "No migration required." → Our ~June-2026 client ID has ALL restrictions live from birth; no announced-vs-enforced gap applies to us.

**GET /v1/me field removals** — [DOC] Removed from the user object: "country, email, explicit_content, followers, product". **`product` is gone → a dev-mode app can no longer detect Premium vs Free from /v1/me.** `email` is gone too, even with `user-read-email`.

**Removed endpoints** — [DOC]:
- Library writes consolidated: `PUT/DELETE /me/tracks`, `/me/albums`, `/me/episodes`, `/me/shows`, `/me/audiobooks`, `/me/following`, `/playlists/{id}/followers` → replaced by generic `PUT/DELETE /me/library` (URI-based).
- Batch GETs removed: `GET /tracks`, `/albums`, `/artists`, `/episodes`, `/shows`, `/audiobooks`, `/chapters` (use single-item endpoints).
- Browse/artist: `GET /browse/new-releases`, `/browse/categories`, `/browse/categories/{id}`, `/artists/{id}/top-tracks`.
- User data: `GET /users/{id}`, `GET /users/{id}/playlists`, `POST /users/{user_id}/playlists`, `GET /markets`.

**Search restricted** — [DOC] `limit` max 50→**10**, default 20→**5**; paginate with `offset`.

**Playlists renamed** — [DOC] `/playlists/{id}/tracks` → `/playlists/{id}/items`; response field `tracks` → `items`, `tracks.track` → `item`.

**Audio features** — [DOC] no changes documented in this guide (audio-features was already restricted in the Nov-2024 wave — out of scope here).

**Owner-Premium rule** — [DOC] "All Development Mode apps require the app owner to have an active Spotify Premium subscription." … "If the owner's Premium subscription lapses, the app will stop working. It will resume functioning once the owner resubscribes."

**Caps + grandfathering** — [DOC] "Client IDs per developer: 1" (page notes updated to 25 as of July 2026 — verify in §3/changelogs); "Users per app: 5". "Existing apps are grandfathered: If you already have multiple Client IDs or more than 5 users, you will retain them. These limits only restrict what you can create or add going forward." → Grandfathering is for pre-existing apps only; ours (June 2026) is capped at 5 with no grandfathering.

**Streaming scope / Web Playback SDK** — [DOC] the migration guide documents **no changes** to the streaming scope or the SDK.

**Announced vs enforced — /v1/me field removals** — [INFERRED] Our own app is the counter-evidence: `useSpotifyPlayback.js:452` hard-gates on `data.profile?.product === 'premium'`, and 5 of 6 users pass that gate today. If the `product` removal were enforced against our June-2026 client ID, `product` would be absent for ALL users and every user would be stuck at `not_premium`. Conclusion: as of Aug 2026, GET /v1/me still returns `product` (and presumably `email`/`country`) for our post-Feb-2026 dev-mode app — the field removal is documented but not (yet) enforced for us, or enforcement is rolling. Community tracking issues (https://github.com/ramsayleung/rspotify/issues/550, https://github.com/thlucas1/homeassistantcomponent_spotifyplus/issues/218) confirm some enforcement (client-credentials restrictions) but contain no /me field-removal observations. **Treat `product` as a field that can vanish on any deploy day** — never let its absence read as "not premium".

### Post-February official changelog sweep (March–August 2026)

- [DOC] **March 2026** (https://developer.spotify.com/documentation/web-api/references/changes/march-2026): only two reversions — `external_ids` restored on Album and Track objects ("will continue to be available"). Nothing else.
- [DOC] **May 2026** (https://developer.spotify.com/documentation/web-api/references/changes/may-2026): new `account_id` field on the User object — "A public, immutable, pseudoanonymous identifier for the user's account", returned by GET /me; recommended over `id` for linking accounts to external services. No removals, no player/scope/SDK changes.
- [DOC] **July 2026** (https://developer.spotify.com/documentation/web-api/references/changes/july-2026): Client IDs per developer "Increased from 1 to 25"; dev-mode API quotas now counted per developer account (shared pool across client IDs); quota exhaustion returns `429` with body `{"status":429, "message":"Too many requests", "reason":"QUOTA_EXCEEDED"}`. **User cap stays 5 — unchanged.** No allowlist/streaming/SDK/player changes.
- [DOC] No April, June, or August 2026 changelog entries found (WebSearch over developer.spotify.com, 2026-08-20).

## 6. Extended quota mode in 2026
_(pending)_

## 7. Family plan account mechanics

Sources: https://support.spotify.com/us/article/family-plan/ and https://support.spotify.com/us/article/family-address-verification/ (fetched 2026-08-20)

- [DOC] Members are full Premium accounts with their own login: "All plan members have separate accounts, and log in with their own details." A member's Spotify account email is entirely her own, unrelated to the plan owner's.
- [DOC] Residency: "You need to be living with the plan manager"; members "Enter the same home address as the plan manager upon joining the plan."
- [DOC] Re-verification triggers: address is asked for "When they join", "When the manager changes address", "If we can't confirm their address". "We don't track your location. We only check your address to verify."
- [DOC] Failure flow: Spotify emails the member; "They just need to enter their full address within 7 days of getting the email." On failure, "the invited member's account loses access to the plan and switches to the free version of Spotify" — i.e. **an evicted family member silently becomes a Free account** (notice = one email that is easy to miss), and "won't be able to join any other Family or Duo plan for 12 months from the date the verification failed" (they CAN rejoin the same plan).
- [DOC] Plan status check: the plan manager manages members on https://www.spotify.com/account/; a member can check their own plan/subscription on their own spotify.com/account page (the page shows the account's current plan).
- [INFERRED] For our bug: if the affected follower was evicted by address re-verification (manager moved, or verification email ignored for 7 days), her account is now `product: "free"` — SDK `Spotify.Player.connect()` may succeed but playback fails with an **account_error** ("premium required") on the SDK, and PUT /me/player/play returns 403 `PREMIUM_REQUIRED`. Crucially, post-Feb-2026 our dev-mode app **cannot check `product` via /v1/me** (§5), so the only visibility is the SDK's `account_error` event and player-endpoint 403 `reason` fields — the diagnostic layer must capture both. She should verify her plan herself at spotify.com/account.

## 8. Dashboard gotchas [COMMUNITY]

(community.spotify.com blocks direct page fetches — claims below come from search-result snippets over the named threads; URLs given for follow-up in a browser.)

- [COMMUNITY] **Family-member allowlist failure precedent**: a Family Premium plan owner added another member's email to User Management and got "User not approved for app" even after 24 hours; the (staff/solution) reply: the email added "must be the email the user has associated with their Spotify account." (https://community.spotify.com/t5/Spotify-for-Developers/quot-User-not-approved-for-app-quot-for-another-member-in-the/m-p/5229052)
- [COMMUNITY] **Social-login email trap**: a tester who logs into Spotify **with Google** couldn't use a dev-mode app; solution: the user must open their Spotify **account page → "Edit profile"** and use the email shown there — "and note that it's case sensitive." (https://community.spotify.com/t5/Spotify-for-Developers/Development-mode-API-key-User-Management-login-with-Google/td-p/6256979)
- [DOC] Google sign-in "will create a new account on Spotify when the email addresses used on Spotify and Google are not the same" (https://support.spotify.com/ca-en/article/google-login-help/) — so a person can have TWO Spotify accounts (one Premium-family, one fresh Free) and OAuth into our app with the wrong one. Facebook login can no longer be newly added but legacy "Continue with Facebook" still works (https://support.spotify.com/us/article/facebook-login-help/).
- [COMMUNITY] Historical reports that a partially-failing allowlist state 403s `/me` while some other endpoints still work with the same token (thread family under §4) — probe with the endpoint you actually need.
- [COMMUNITY] **Jul-2026 dashboard-misclassifies-family-members thread**: search surfaced adjacent evidence — Premium-Family threads where "family members' accounts still showed up as free accounts" and a member "could see they had Premium in the app but when logging into the web page it showed they had a Free Plan" (https://community.spotify.com/t5/Premium-Family/Members-of-family-plan-account-doesn-t-show-up-as-premium/m-p/5996850), plus a Jul-21-2026 dev thread on severe Player API failures with Premium+PKCE. A specific July-2026 developer-board thread titled about the DASHBOARD misclassifying family members as free, with a staff reply, was **not directly reachable** to confirm; treat as unverified. The Premium-Family evidence alone shows family-member Premium status can be inconsistent across Spotify's own surfaces — i.e. entitlement-service lag/desync for family members is a real, recurring failure class.
- [INFERRED] Combined trap for our bug: the affected follower may (a) be logged into a different Spotify account than the one allowlisted (social-login duplicate), (b) have an allowlist entry with the wrong/mis-cased email, or (c) hold a family membership whose Premium entitlement is desynced/evicted. All three produce "OAuth works, playback dead" with today's silent error collapse; each has a distinct raw signature (403 User-not-registered vs SDK account_error vs invalid_grant), which the diagnostic layer can separate.

## Implications for our code

1. **`rollplay/app/audio_management/hooks/useSpotifyPlayback.js:452`** — `if (data.profile?.product !== 'premium') → 'not_premium'`. Three distinct realities collapse here: (a) genuinely Free account (family eviction, §7); (b) `product` field removed by Feb-2026 rules (§5 — would break ALL users at once); (c) entitlement desync where Spotify's own surfaces disagree about a family member's Premium (§8). Diagnostic layer must log the RAW /me payload (or its absence) — specifically whether `product` is missing vs `"free"` vs `"premium"`.
2. **`api-site/integrations/spotify/endpoints.py:184-189` (profile endpoint catch)** — any `httpx.HTTPStatusError` from refresh OR /me is flattened to `connected: False`. This merges: refresh `invalid_grant` (400 — revoked/6-month-expired, §1), /me 403 "User not registered in the Developer Dashboard" (allowlist miss, §4), 429 QUOTA_EXCEEDED (July-2026 shared per-developer quota, §5 sweep). Diagnostic layer should propagate `{status_code, body}` verbatim; each has a different fix (re-auth vs fix allowlist email vs wait).
3. **`api-site/integrations/spotify/endpoints.py:230-236` (/token endpoint)** — refresh failure becomes a bare 502, so the SDK's `getOAuthToken` silently gets nothing (`useSpotifyPlayback.js:504` only console.errors). A revoked/expired refresh token (6-month lifetime now documented, §1) for the one broken user would look exactly like her current symptom. Log the token-endpoint response body (`invalid_grant` + `error_description`) before mapping to 502.
4. **`api-site/integrations/spotify/client.py:30-40` (SCOPES)** — `user-read-email`/`user-read-private` are kept for the profile card, fine; but the Premium gate they feed is not future-proof (§5). The scope set itself is correct and sufficient per §2; no scope change needed for the SDK (`streaming` is the only SDK-required scope).
5. **Allowlist audit (ops, not code)** — cap is 5 users hard (§3); we have 6 users. **A 6th user cannot be allowlisted at all on a June-2026 app — no grandfathering (§5).** If the broken follower is user #6, she was never allowlisted, OAuth still completed (§4), and every API call 403s → backend flattens to `connected:false`/502 → her exact symptom. CHECK THE DASHBOARD USER COUNT FIRST. Also verify her entry matches her Spotify account email ("Edit profile" email, case-sensitive, §8) — social-login accounts often have unexpected emails.
6. **Owner-Premium coupling (§3/§5)** — the whole app dies if the client-ID owner's Premium lapses. The DM owns the family plan; if the dashboard account is the DM's, a family-plan hiccup takes down all 6 users, not one — current symptom (1/6) argues against this, but the diagnostic layer should still distinguish "app-wide dead" from "one user dead".
7. **SDK listener mapping (`useSpotifyPlayback.js:531-534`)** — `account_error → not_premium`, `authentication_error → error`: keep, but log raw `message` payloads to her console (the diagnostic layer's core ask) since post-Feb-2026 we cannot trust `/me.product` as the premium oracle (§5); the SDK's `account_error` is the *only* premium signal that can't be removed out from under us.

## Open questions

- Is the /v1/me field removal (product/email/country) enforced for ANY dev-mode app yet, or postponed platform-wide? (Our telemetry says not enforced for us as of Aug 2026; no official enforcement date found beyond the migration guide.)
- Exact JSON body of the allowlist 403 (message string corroborated [COMMUNITY], byte-exact body unverified — the diagnostic layer will capture it from the affected user).
- The specific Jul-2026 community thread "dashboard misclassifies family members as free" with a staff reply could not be located/fetched directly — unconfirmed.
- How many users are currently in our dashboard User Management list (5-cap!), and does the broken follower's entry match her account email exactly?

## Unreachable sources

- https://developer.spotify.com/blog/2026-02-06-changes-to-the-web-api — 404 (wrong guessed slug; real post is `2026-02-06-update-on-developer-access-and-platform-security`, which was fetched).
- community.spotify.com thread pages (e.g. td-p/5358758, td-p/6256979, m-p/5229052) — direct fetch returns HTTP 403 (bot-blocked); claims from these threads are sourced via search-result snippets only.
