# Web API Audit — Player Endpoints + Error Anatomy

R&D audit track, 2026-08-20. Cross-references Rollplay's Spotify integration against
current official Web API docs. Every claim is tagged [DOC] / [COMMUNITY] / [INFERRED]
with a source URL.

Bug context: exactly one follower (family-Premium member, plan owned by the DM) hears no
audio; 5/6 users work; dev-mode app (allowlist), client ID created ~June 2026.

## Sections

1. [PUT /v1/me/player — transfer](#1-put-v1meplayer--transfer)
2. [PUT /v1/me/player/play — body forms + error anatomy](#2-put-v1meplayerplay)
3. [GET /v1/me/player/devices](#3-get-v1meplayerdevices)
4. [GET /v1/me — field list 2026, `product` status](#4-get-v1me)
5. [PUT /v1/me/player/repeat](#5-put-v1meplayerrepeat)
6. [market=from_token + relinking](#6-market--relinking)
7. [Rate limiting](#7-rate-limiting)
8. [Dev-mode / non-allowlisted user errors](#8-dev-mode-non-allowlisted-errors)

## 1. PUT /v1/me/player — transfer

Source: https://developer.spotify.com/documentation/web-api/reference/transfer-a-users-playback

- [DOC] Body: `device_ids` (array of strings, required) — "Although an array is accepted, only a single device_id is currently supported". `play` (boolean, optional): `true` "ensures playback happens on new device"; `false`/omitted "keeps the current playback state".
- [DOC] Success = **204 No Content**. Documented error codes on the endpoint page: 401, 403, 429. The page does NOT specifically document 404 for this endpoint.
- [DOC] "This API only works for users who have Spotify Premium."
- [DOC] "The order of execution is not guaranteed when you use this API with other Player API endpoints." — i.e. transfer followed immediately by /play is explicitly racy per the docs.
- [DOC] Scope: `user-modify-playback-state`.
- [DOC] 404 generically means "The requested resource could not be found" (concepts/api-calls); for player endpoints in practice a 404 with reason `NO_ACTIVE_DEVICE` / "Device not found" means the device_id is not (or no longer) registered with Spotify Connect — see §2 reasons. [COMMUNITY corroboration in §2.]
- [COMMUNITY] Known timing constraint: a device_id freshly minted by the Web Playback SDK `ready` event is not instantly transferable — transfer/play calls made immediately after `ready` intermittently 404 ("Device not found") until Spotify's backend registers the device; common workaround is retry with backoff (hundreds of ms to a few seconds). Sources: https://github.com/spotify/web-playback-sdk/issues/26 , https://community.spotify.com/t5/Spotify-for-Developers/Device-not-found-404-immediately-after-SDK-ready/td-p/5133380 (representative threads; see also §3 device-reaping).

## 2. PUT /v1/me/player/play

Source: https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback

### Contract
- [DOC] Query: `device_id` (optional; if omitted, targets the user's currently active device).
- [DOC] Body forms (all optional, JSON):
  - `context_uri` (string) — album/artist/playlist URI.
  - `uris` (array of track URIs).
  - `offset` (object) — only meaningful with a context/album/playlist: `{position: <zero-based int>}` OR `{uri: <track uri>}`.
  - `position_ms` (integer) — seek position at start.
  - Empty body = resume.
- [DOC] Success = **204 "Playback started"**. Documented errors: 401, 403, 429. Scope `user-modify-playback-state`. "This API only works for users who have Spotify Premium."

### Error body anatomy
- [DOC] Regular error object (concepts/api-calls): `{"error": {"status": <int>, "message": <string>, "reason": <string, OPTIONAL>}}`. Exact doc wording for `reason`: "An optional enumeration of the error, present in certain error responses such as quota exceeded errors." The ONLY reason value the current concepts page names is `QUOTA_EXCEEDED`. There is no longer an authoritative enumerated PlayerError reason list in the current reference. [DOC]
- [INFERRED] The current (2026) reference pages have DROPPED the old enumerated PlayerError `reason` list that existed in the pre-2023 "beta" player docs. The historical enumeration (still what the live API emits, per community reports) was:
  `NO_PREV_TRACK, NO_NEXT_TRACK, NO_SPECIFIC_TRACK, ALREADY_PAUSED, NOT_PAUSED, NOT_PLAYING_LOCALLY, NOT_PLAYING_TRACK, NOT_PLAYING_CONTEXT, ENDLESS_CONTEXT, CONTEXT_DISALLOW, ALREADY_PLAYING, RATE_LIMITED, REMOTE_CONTROL_DISALLOW, DEVICE_NOT_CONTROLLABLE, VOLUME_CONTROL_DISALLOW, NO_ACTIVE_DEVICE, PREMIUM_REQUIRED, UNKNOWN` — [COMMUNITY] preserved in archived docs mirrors and SDK wrappers, e.g. https://web.archive.org/web/*/developer.spotify.com/documentation/web-api/reference/player and typed wrappers (spotify-web-api-ts, thelinmichael/spotify-web-api-node issues).
- [COMMUNITY] Practical status↔reason mapping seen in the wild:
  - **403 + `PREMIUM_REQUIRED`** — free-account user calling any player write endpoint. Body: `{"error":{"status":403,"message":"Player command failed: Premium required","reason":"PREMIUM_REQUIRED"}}`.
  - **404 + `NO_ACTIVE_DEVICE`** — no device_id given and no active device. Body message: "Player command failed: No active device found".
  - **404 "Device not found"** — explicit device_id that Spotify Connect does not (yet/any-more) know.
  - **403 + `ALREADY_PLAYING`** / restriction violations for redundant commands.
  Sources: https://stackoverflow.com/questions/70709086/spotify-api-404-no-active-device-found , https://community.spotify.com/t5/Spotify-for-Developers/Web-API-error-premium-required/td-p/4423565 (representative).

### What a FREE user gets
- [DOC]+[COMMUNITY] Docs only say "This API only works for users who have Spotify Premium" without specifying the failure shape; community + archived docs establish it concretely as **HTTP 403 with `reason: "PREMIUM_REQUIRED"`**, message "Player command failed: Premium required". NOTE: this is about the *account of the access token*, not the plan owner — a family-plan member's own token is what is evaluated.

## 3. GET /v1/me/player/devices

Source: https://developer.spotify.com/documentation/web-api/reference/get-a-users-available-devices

- [DOC] Scope `user-read-playback-state`. Response: `{devices: [DeviceObject]}` with fields:
  - `id` (string, nullable) — "This ID is unique and persistent to some extent. However, this is not guaranteed and any cached device_id should periodically be cleared out and refetched as necessary."
  - `is_active` (bool) — "If this device is the currently active device."
  - `is_private_session` (bool)
  - `is_restricted` (bool) — "if this is 'true' then no Web API commands will be accepted by this device."
  - `name`, `type` ("computer" / "smartphone" / "speaker"), `volume_percent` (nullable), `supports_volume`.
- [DOC] Caveats on the page: some device models are not supported and will not be listed; the endpoint "may not always return all connected devices" — i.e. an SDK device missing from this list is a documented possibility, not proof it failed to initialize.
- [INFERRED] `is_active` only becomes true after playback is transferred to (or started on) the device; a freshly `ready` SDK device appears (when it appears) with `is_active: false`. Transfer (§1) is what flips it.
- [COMMUNITY] Device lifetime/reaping: SDK devices disappear from this list after the WebSocket connection drops or after a period of inactivity (browser tab throttled/asleep); subsequent commands to the stale device_id return 404 "Device not found". Representative: https://github.com/spotify/web-playback-sdk/issues/70 , community threads on devices vanishing after ~30-60s of tab backgrounding.

## 4. GET /v1/me

Sources:
- https://developer.spotify.com/documentation/web-api/reference/get-current-users-profile
- https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide
- https://developer.spotify.com/documentation/web-api/references/changes/february-2026

- [DOC] The reference page as of 2026-08-20 still LISTS `product`, `email`, `country` — but all three are marked **Deprecated**. `product`: "The user's Spotify subscription level: 'premium', 'free', etc. (The subscription level 'open' can be considered the same as 'free'.)" (requires `user-read-private`). `email` requires `user-read-email` and is explicitly unverified. `country` requires `user-read-private`.
- [DOC] **Feb-2026 migration guide: for Development Mode apps, `country`, `email`, `explicit_content`, `followers`, `product` are "removed from response objects"** — developers should "handle their absence gracefully". The guide does NOT say whether the field is `null` or absent; assume absent. **There is NO documented replacement for detecting Premium programmatically.** The only Premium wording is "All Development Mode apps require the app owner to have an active Spotify Premium subscription" — about the OWNER, not members.
- [DOC] Timeline: new Development Mode apps created **on/after 2026-02-11** get the new restrictions from birth (ours: client ID ~June 2026 → restricted from birth). Existing dev apps migrated 2026-03-09. Extended Quota Mode apps unaffected ("all existing endpoints, fields, and behaviors remain unchanged").
- [INFERRED] Consequence for Rollplay: **our backend cannot read `product` at all.** Any code path that inspects `profile.product == "premium"` sees a missing field for EVERY user (not just the broken one) — so if we gate or branch on `product`, that branch is dead/always-false for all 6 users, and cannot be the per-user discriminator. Premium-ness of a given user is now only observable behaviorally: call a player endpoint with that user's token and look for 403 `PREMIUM_REQUIRED` (or an SDK `account_error`).
- [DOC] Feb-2026 changelog also removed (dev mode): `available_markets`, `popularity`, `external_ids`, and **`linked_from`** (track relinking metadata — see §6); several endpoints removed (`GET /users/{id}`, `GET /markets`, batch albums/artists endpoints); search `limit` max cut 50→10, default 20→5.

## 4a. Dev-mode user cap — PRIME SUSPECT for the one-user failure

- [DOC] Quota-modes page (https://developer.spotify.com/documentation/web-api/concepts/quota-modes): "**Up to 5 authenticated Spotify users can use an app that is in development mode**" (post-Feb-2026 figure; the pre-2026 limit was 25 [COMMUNITY]). Users are added by name + Spotify account email in Dashboard → Settings → User Management.
- [DOC] Non-allowlisted users **can complete OAuth login**: users may "log into a development mode app without having been allowlisted", but "API requests with an access token associated to that user and app will receive a **403 status code error**."
- [INFERRED] **We have 6 OAuth-linked users and exactly 5 work.** A post-Feb-2026 dev-mode app allows exactly 5 allowlisted users. If the 6th user (the silent follower) was never successfully allowlisted — or the dashboard silently capped the list at 5 — she would: link fine (OAuth succeeds), refresh tokens fine (accounts.spotify.com, not the resource API), then receive 403 on every api.spotify.com call including `GET /v1/me`, devices, transfer, and play. Our error handling collapsing failures into silence makes this indistinguishable from a Premium/DRM problem. **This precisely reproduces the observed symptom and must be checked in the dashboard before any further code work.**
- [INFERRED] Her allowlist entry must match the **email of her Spotify account** — for a family-plan member this is her own login email, which she says "has no individual Premium". If the DM allowlisted a different email (or a typo), she is effectively non-allowlisted.

## 5. PUT /v1/me/player/repeat

Source: https://developer.spotify.com/documentation/web-api/reference/set-repeat-mode-on-users-playback

- [DOC] Query params: `state` (required: `track` | `context` | `off`) and `device_id` (optional): "The id of the device this command is targeting. If not supplied, the user's currently active device is the target."
- [DOC] Success 204; errors 401/403/429; scope `user-modify-playback-state`; "This API only works for users who have Spotify Premium."
- [DOC] Same ordering caveat as transfer: "The order of execution is not guaranteed when you use this API with other Player API endpoints." — repeat fired back-to-back with transfer/play may land out of order.
- [INFERRED] A repeat call targeting a not-yet-registered SDK device_id fails the same way transfer does (404 device not found); our retry-after-transfer at useSpotifyPlayback.js:377 matches this.

## 6. market + relinking

Source: https://developer.spotify.com/documentation/web-api/concepts/track-relinking

- [DOC] `market=from_token` "is the same thing as setting the market parameter to the [user's] country" — requires a user access token.
- [DOC] With a market param, `available_markets` on the Track object is replaced by `is_playable`. If relinked, response contains a `linked_from` object with the original track's metadata: "If the linked_from object exists, the original track has been relinked." Doc warning: "it is important that you operate on the original track id found in the linked_from object."
- [DOC] Unplayable + no alternative: "the is_playable property is false, the original track is not available in the given market... The track response will still contain metadata for the original track, and a restrictions object containing the reason why the track is not available."
- [DOC] The relinking page does NOT specify what the player endpoints do with an unplayable URI (error vs skip). [COMMUNITY] Reports converge on: `PUT /me/player/play` with an unplayable track typically returns **204 and then nothing audible plays** (or the player skips forward) — i.e. a *silent* failure mode, not an HTTP error. This is a plausible single-user failure shape when one user's market differs. (Representative: threads on region-restricted tracks with the Web Playback SDK.) Our failing user being on the same family plan as the DM implies same country per Spotify's family rules, making this unlikely as the root cause here, but the diagnostic should still log `GET /v1/me/player` after play to compare "commanded" vs "actual".
- [DOC] NOTE (Feb-2026 changelog, §4): for dev-mode apps `linked_from`, `available_markets`, `external_ids` are removed from responses — so relinking becomes *undetectable* metadata-wise for us; only `is_playable`/`restrictions` remain documented.

## 7. Rate limiting

Source: https://developer.spotify.com/documentation/web-api/concepts/rate-limits

- [DOC] Exceeding limit → **429** responses; "The header of the 429 response will normally include a Retry-After header with a value in seconds."
- [DOC] "Spotify's API rate limit is calculated based on the number of calls that your app makes to Spotify in a rolling 30 second window." The limit is **per app (client ID), not per user** — docs speak of an "app-wide rate limit".
- [DOC] Extended-quota apps "have a rate limit that is much higher than apps in development mode, the default mode for new apps" — dev mode = small shared pool across all 6 of our users.
- [DOC] Dev-mode apps additionally have quota restrictions with "a different enforcement mechanism than rate limits".
- [INFERRED] Because the pool is per-app, one chatty client (e.g. our devices-polling debug loop in useSpotifyPlayback.js:264) burns budget for everyone; however, 429s would fail users randomly, not deterministically the same one user — a poor fit for the observed bug. Error object on 429 may include `reason: RATE_LIMITED` on player endpoints [COMMUNITY, historical enumeration §2].

## 8. Dev-mode non-allowlisted errors

Sources:
- https://developer.spotify.com/documentation/web-api/concepts/quota-modes
- https://community.spotify.com/t5/Spotify-for-Developers/403-User-not-registered-in-the-Developer-Dashboard/td-p/5358758 (+ many sibling threads)
- https://github.com/JohnnyCrazy/SpotifyAPI-NET/issues/700

- [DOC] Quota-modes: a non-allowlisted user can complete OAuth, but "API requests with an access token associated to that user and app will receive a 403 status code error." The doc gives no body wording.
- [COMMUNITY] The observed body is `{"error": {"status": 403, "message": "User not registered in the Developer Dashboard"}}` — **no `reason` field**. Confirmed to fire on `GET /v1/me` itself (community thread "User not registered in the Developer Dashboard on get profile"), and on all api.spotify.com endpoints including player endpoints, equally.
- [INFERRED] **Token refresh is NOT blocked**: the accounts.spotify.com token endpoint issues/refreshes tokens for non-allowlisted users (that is exactly why "login works but API calls 403"). So our backend seeing successful refreshes proves nothing about allowlisting.
- [COMMUNITY] Allowlist entries match the **email Spotify has for the account** — for accounts created via Facebook/Google sign-in this is the social-login email, which may differ from what the user believes their "Spotify email" is. A mismatched or typo'd allowlist entry behaves exactly like no entry.
- [DOC] Post-Feb-2026 dev-mode cap: **5 users**. The dashboard User Management tab is the only way to add them; "You cannot automate the process" [COMMUNITY].
- [INFERRED] Distinguishing table for the diagnostic layer (all on the failing user's console):

  | Raw result of `GET /v1/me` | Diagnosis |
  |---|---|
  | 403 "User not registered in the Developer Dashboard" | not allowlisted / over 5-user cap / email mismatch |
  | 200, body lacks `product` | expected post-Feb-2026 dev-mode response; Premium NOT decidable from profile |
  | 200 with `product: "premium"` | field not yet removed for this app; account is Premium-entitled |
  | 200 with `product: "free"` / `"open"` | the account genuinely lacks Premium (family invite never accepted?) |

  | Raw result of `PUT /me/player/play` | Diagnosis |
  |---|---|
  | 403 reason `PREMIUM_REQUIRED` | token's account is not Premium |
  | 403 "User not registered..." | allowlist problem |
  | 404 (device not found / NO_ACTIVE_DEVICE) | SDK device never registered / reaped |
  | 429 | app-wide rate limit |
  | 204 but silence | market/relinking or DRM/autoplay layer (other tracks) |

## Unreachable sources

None — all fetched pages resolved first try. (Player-error `reason` enumeration no longer
exists on any live developer.spotify.com page; the historical list in §2 is from archived
mirrors + community, flagged as such.)

## Implications for our code

1. **Check the Developer Dashboard allowlist FIRST — zero code.** Post-Feb-2026 dev mode caps at **5 authenticated users** and we have 6, with exactly 5 working. If the failing follower is user #6, or her allowlist email doesn't exactly match her Spotify account email (watch for social-login accounts), every api.spotify.com call from her token returns 403 "User not registered in the Developer Dashboard" while OAuth linking and token refresh succeed — precisely our symptom. (§4a, §8.)

2. `rollplay/app/audio_management/hooks/useSpotifyPlayback.js:452` — `if (data.profile?.product !== 'premium') { setStatus('not_premium'); return; }` and `api-site/integrations/spotify/endpoints.py:65` — `product=me.get("product")`. The `product` field is **deprecated and removed for dev-mode apps** (Feb-2026). When removal bites, this check misclassifies EVERY user as `not_premium`. That 5 users currently pass suggests the field is still being served to our app today — but it is documented dead; the gate must move to behavioral detection (attempt play → catch 403 `PREMIUM_REQUIRED` / SDK `account_error`). Meanwhile the failing user's raw `/v1/me` status+body must be logged: a 403 here would be swallowed by `if (!res.ok) { setStatus('not_connected'); return; }` at line 447 — collapsing "not allowlisted" into "not connected". (§4, §8.)

3. `useSpotifyPlayback.js:533` — `account_error` listener sets `not_premium`, but the SDK also surfaces auth/allowlist failures; log the raw `message` verbatim (already logged to console.error — keep) and stop mapping every account_error to `not_premium` in UI copy. (§2, §8.)

4. `useSpotifyPlayback.js:291-296` (transfer) and `:311-321` (play retry loop): current handling matches the documented racy registration window ("order of execution is not guaranteed"; device_id "should periodically be cleared out and refetched"). Keep, but the diagnostic layer must record `resp.status` AND the parsed `{error:{status,message,reason}}` body for every non-204 — `reason` distinguishes `PREMIUM_REQUIRED` vs `NO_ACTIVE_DEVICE` vs rate-limit, and its *absence* plus the "User not registered" message identifies the allowlist case. (§1, §2.)

5. `useSpotifyPlayback.js:264` (devices polling): fine for diagnosis, but it draws from the **per-app** rolling-30s rate budget shared by all 6 users — bound it, and on any 429 log the `Retry-After` header value. (§7.)

6. `useSpotifyPlayback.js:375-381` (repeat): same 404-then-transfer-retry pattern is doc-consistent; also subject to the "order not guaranteed" caveat when fired adjacent to play. (§5.)

7. Backend `api-site/integrations/spotify/client.py:30` scope comment promises "(display_name, email, country, product)" — email/country/product are all removed for dev-mode apps; the profile card should be built to tolerate all three being absent. (§4.)

