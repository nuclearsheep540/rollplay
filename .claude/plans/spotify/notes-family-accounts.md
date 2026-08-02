# R&D Notes — Spotify Family Accounts, the SDK, and Dev-Mode Allowlisting

**Date:** 2026-08-01. Research question: a user on a family plan (own email allowlisted on our dev
dashboard; says their email "is not a premium user — I link my email to my partner's family
subscription") hears no Spotify audio. Are family accounts unsupported by the SDK/API?

## Verdict: family accounts are NOT categorically unsupported

- Official SDK requirement: "a Spotify Premium subscription (mobile only types excluded)." No
  official doc anywhere distinguishes individual Premium from family-member Premium.
  [developer.spotify.com/documentation/web-playback-sdk]
- Official family-plan docs: **every invited member gets their own full Premium account** — own
  email, own login, separate account. There is no shared/child/linked-account arrangement.
  [support.spotify.com/us/article/family-plan/]
- `product` from `GET /v1/me` has a closed value set: `premium` / `free` / `open` (== free). There
  is no `premium_family` value. An accepted family member reads plain `"premium"`.
- No confirmed community report exists of an adult family member failing the Web Playback SDK
  *because of* family membership. (One July 2026 thread — 3 reporters, no staff reply — shows the
  *developer dashboard's app-creation* premium check misclassifying member accounts as free; a
  watch-item, but it's about creating dev apps, not SDK playback.)

## The user's own phrasing is the tell

"My email is not a premium user, I link my email to my partner's family subscription" is
**self-contradictory for genuine plan membership** — if the account under their email were truly a
family member, that exact account would BE Premium. So one of these is true:

1. **They share the partner's login** (their own-email account is Free). Whatever account they
   OAuth'd to us determines everything: if they authorized their own free account →
   `product: "free"` → our `not_premium` path (correct behavior, no audio by design).
2. **Their membership is on a different Spotify account** than the email Matt allowlisted
   (social-login accounts are the classic trap — Facebook/Google/Apple-created accounts carry the
   provider's email, which often isn't the address the person thinks of as "their email").
3. **They were silently evicted**: Spotify re-verifies family members' home address; a missed
   7-day reverification window drops the member "to the free version" with only an easy-to-miss
   email as notice. [support.spotify.com/us/article/family-address-verification/] Community
   threads (2023–2025) show this happening unexpectedly. They may genuinely be Free right now
   while believing they're on the plan.

## The likeliest failure chain in OUR code (allowlist mismatch)

Dev-mode mechanics, officially documented [quota-modes]:
- A non-allowlisted / email-mismatched user **completes OAuth normally** — failure comes later:
  every API call *including `GET /v1/me`* returns **403 "User not registered in the Developer
  Dashboard"**. The allowlist entry must exactly match the email on the Spotify account they
  actually authorize (checkable at spotify.com/account). ~5–15 min propagation after adding.
- Our backend maps ANY `HTTPStatusError` from `/v1/me` → `connected: false` silently
  (`integrations/spotify/endpoints.py` profile handler). So allowlist mismatch, revoked token,
  country restriction, and genuine not-premium are **indistinguishable** — the user just looks
  "not connected" with zero console errors. (Home Assistant shipped the identical conflation and
  got burned: their "user not premium" repairs were actually registration/country 403s.)

**Disambiguator for THIS user:** what does their game console show?
- **No Spotify errors at all + panel says not connected** → they never got past the profile check
  → allowlist mismatch / wrong account / genuinely free. The gate-gesture fix (03) is irrelevant
  to them.
- **SDK not-activated / not-ready errors** → they passed the profile check (connected + Premium!)
  → family plan is fine and they're a victim of the gate-gesture race (03 fixes them).

## ⚠️ Feb 2026 platform changes — three things to check regardless

Announced 2026-02-06; effective 2026-02-11 for client IDs created on/after that date, 2026-03-09
for existing apps (endpoint/field restrictions for existing apps postponed by the Mar 9 blog
update; owner-premium + user caps went ahead). **Our client ID was created ~June 2026 — the new
rules apply to us from birth.**

1. **5-user allowlist cap** (down from 25). If User Management has >5 entries or refused the add,
   the newest users 403 exactly like a mismatch. Check the dashboard count.
2. **App owner must hold Premium** — if the owner account's Premium ever lapses, the whole app
   stops working for everyone. (Fine today; know the failure mode.)
3. **`product` is deprecated and documented as REMOVED from `/v1/me` for dev-mode apps.** Our
   premium gate (`profile?.product !== 'premium'`) empirically still works (playback functions for
   owner + DM), so enforcement evidently hasn't hit our client ID — but the gate is living on
   borrowed time and Spotify documents **no replacement** for programmatic Premium detection.
   Also: `product === "premium"` was never sufficient anyway (Spotify Lite / Premium Mini return
   `"premium"` yet the SDK rejects them with `account_error`). Long-term posture: treat the
   profile gate as a *hint*, and treat the SDK's own `account_error` event as the authoritative
   premium signal.
   Extended quota mode is effectively unreachable for us now (orgs only since May 2025; ~250k MAU
   baseline since Mar 2025) — dev-mode constraints are the permanent operating environment.

## Diagnostic checklist (in order)

1. **User-side (2 min):** have them open spotify.com/account and report (a) the exact email shown,
   (b) what "Your plan" says. This resolves arrangements 1–3 in one screenshot.
2. **Dashboard-side:** exact-match their reported email against User Management; count entries
   vs the 5-cap; note client-ID creation date.
3. **Code-side (small follow-up, do with or after plan 03):** stop swallowing the `/v1/me` error
   in the profile endpoint — log status + response body, and distinguish 403
   "not registered" (surface as a distinct status, e.g. `not_authorized`, so the UI can say "ask
   the DM to check your allowlist email") from token-revoked (`connected: false` is right there).
4. **Verify the gate's lifespan:** log what `/v1/me` actually returns for a working account today
   (is `product` present?) — one log line answers whether the Feb-2026 field removal has reached
   our client ID.

## Sources (primary)

- https://developer.spotify.com/documentation/web-playback-sdk (SDK premium requirement)
- https://developer.spotify.com/documentation/web-api/concepts/quota-modes (dev-mode 403, 5-user cap)
- https://developer.spotify.com/documentation/web-api/reference/get-current-users-profile (product enum, deprecation)
- https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security (+ Mar 9 postponement note)
- https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide
- https://support.spotify.com/us/article/family-plan/ · /family-address-verification/ · /invite-remove-family-member/
- https://community.spotify.com/t5/Spotify-for-Developers/Web-Playback-SDK-not-working-with-Spotify-Lite-Premium-Mini/td-p/7269497 (premium-not-sufficient)
- https://community.spotify.com/t5/Spotify-for-Developers/Premium-Family-Plan-does-not-allow-for-creating-apps-for-member/td-p/7503003 (Jul 2026 watch-item)
- https://github.com/home-assistant/core/issues/165116 (the identical 403-conflation elsewhere)
