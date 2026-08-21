# Spotify Silent-Follower R&D Audit — 2026-08-20

**Problem:** One follower (of six users) hears no Spotify audio. She reports being a member of a
family Premium plan whose owner is the DM (who hears audio fine). Prior R&D
(`../notes-family-accounts.md`, 2026-08-01) proved family membership per se is SDK-capable, and
identified that our own error handling collapses distinct failure modes into indistinguishable
silent states. Spotify support blames "implementation or user error."

**Goal of this audit:**
1. Cross-reference our implementation (frontend hook chain + `api-site/integrations/spotify/`)
   against current Spotify developer documentation — find deviations / missed pieces.
2. Design + implement a runtime-enableable diagnostic layer that makes the affected user's next
   console screenshot *decisive* (raw SDK events, raw HTTP statuses/bodies, DRM probe,
   activation state) — no deploy-per-experiment, no need for her credentials.
3. Fix any missed pieces found (brownie points).

## Live user facts (updated as Matt reports them)

- **2026-08-20:** The affected user reports her account page Spotify card says **connected**.
  Implication: `/api/spotify/profile` returned `connected: true`, meaning `GET /v1/me` with her
  token **succeeded** — she completed OAuth and (assuming dev-mode 403s apply to `/v1/me`, to be
  confirmed by the docs research) she IS on the allowlist under the right account. This
  **largely rules out bucket A's allowlist-mismatch variant** and shifts weight onto:
  - the **product value** on that card (badge under her name: `FREE` → evicted from family plan
    or OAuth'd the wrong account, our `not_premium` path correctly silences her;
    `PREMIUM` → bucket B/C, an SDK-level failure — DRM/browser, account_error, activation), or
  - the badge being **absent** (no `product` field → Feb-2026 field removal reached her… but the
    DM works, so unlikely).
  **Single highest-value question for her: what does the badge say — FREE or PREMIUM?**
  (Second: which browser does she use? Brave/Firefox have DRM off/opt-in by default.)

**Hypothesis buckets** (from pre-flight review):
- **A** — never passes the profile gate: allowlist mismatch (dev-mode 403), wrong-account OAuth,
  5-user cap, silently evicted from family plan → all currently collapse to silent
  `not_connected` / `not_premium` with zero console output.
- **B** — passes the gate, SDK fails: DRM/EME unavailable (Brave/Firefox/policy), `account_error`,
  `authentication_error`, `connect()` false.
- **C** — plays but silently: residual activation/autoplay path, per-track `playback_error`.

## File index

| File | Agent track | Status |
|---|---|---|
| `docs-sdk-contract.md` | Web Playback SDK full contract (options, events, payloads, DRM behavior) | **done** |
| `docs-web-api-player.md` | Web API player endpoints + error bodies (`reason` values, 403/404 semantics) | **done** |
| `docs-oauth-devmode-2026.md` | OAuth, scopes, dev-mode/allowlist mechanics, Feb-2026 platform changes as of Aug 2026 | **done** |
| `docs-drm-autoplay-detection.md` | Widevine/FairPlay availability + detection probes, autoplay/activation, media-element observability | **done** |
| `community-known-issues.md` | GitHub/community/OSS sweep for matching failure reports | **done** |
| `xref-frontend.md` | Code cross-reference: frontend chain vs. doc contracts | **done** (18 defects total w/ backend) |
| `xref-backend.md` | Code cross-reference: backend integration vs. doc contracts | **done** |
| `verified-findings.md` | Adversarially verified defect/deviation list | **done** — 11 CONFIRMED / 1 REFUTED |
| `WRITEUP.md` | Final uncompressed write-up | **done** — includes shipped fixes + runbook |

**Convention:** every claim in the docs/community files is tagged `[DOC]`, `[COMMUNITY]`, or
`[INFERRED]`, with a source URL. Files are written incrementally — a partially filled file is
valid state for a successor agent to resume from.

## Key code under audit

- `rollplay/app/audio_management/hooks/useSpotifyPlayback.js` — the SDK hook (leader/follower)
- `rollplay/app/game/GameContent.js` — gate wiring, unlock, recovery pill
- `rollplay/app/game/hooks/useGatePreload.js` — Spotify boot as last gate phase
- `rollplay/app/shared/utils/platform.js` — iOS/DRM platform detection
- `api-site/integrations/spotify/endpoints.py` + `client.py` — OAuth, profile, token, playlists
- Known-swallowed error: `endpoints.py` `/profile` maps ANY `/v1/me` HTTPStatusError → `connected: false`
