# Spotify Integration — Phase 3: Gate/Gesture Race Fix

**Goal:** The "Click to Enter" gate click is the one guaranteed user gesture, and the whole Spotify
unlock model depends on spending it inside `unlock()` (activate the SDK media element + originate
`connect()` from the gesture). Today that contract silently breaks whenever the gate becomes
clickable before the SDK player object exists. Fix: the gate's loading phases become
**[download assets, audio engine sync, Spotify player creation]** — the CTA only appears when the
click can actually be spent. Plus defense-in-depth for any residual wasted-gesture path.

Builds on `02-game-runtime-sync.md` and the R&D in
`.claude/plans/TODO-spotify-gesture-unlock-and-ios-drm.md` (Phases 1–3 shipped in PR #146).

---

## The bug (attempt #3 — why the first two didn't close it)

Two independent readiness tracks race:

- **CTA readiness** (`useGatePreload.js`): campaign meta + WS state + S3 downloads + audio sync
  (+500ms settle). With warm caches this goes green in well under a second.
- **Spotify readiness** (`useSpotifyPlayback.js`): `/api/spotify/profile` fetch → premium check →
  `setShouldInit` → SDK `<script>` load from `sdk.scdn.co` → `new Spotify.Player()` →
  `playerRef.current` set. Several network hops; routinely 1–3+ seconds.

`ctaReady` knows nothing about the second track. Click while `playerRef.current === null` and
`unlock()` (`useSpotifyPlayback.js:193-200`) sets `gestureSeenRef = true` and **returns** — the
gesture is spent on nothing. The create effect later calls `connectNow()`
(`useSpotifyPlayback.js:529`) in an async continuation, **outside any gesture**. Whether audio
then works is decided by Chrome's per-origin Media Engagement Index — which is why dev machines
(engagement history) can't reproduce what fresh users hit every time.

- **#144** hardened device races (StrictMode teardown deferral, `reconcileDevice`, 404
  transfer-retry) — downstream of activation.
- **#146** got gesture semantics right (gesture-deferred `connect()`, `autoplay_failed` →
  `'blocked'` + pill + one-shot pointerdown) — but only when the player already exists at click
  time. The null-player branch degrades to "hope MEI covers us."
- Confounders that hid it: the DM self-heals (every leader control calls `activate()` first —
  `useSpotifyPlayback.js:311-319`), and followers without a linked Premium account never init the
  SDK at all. The exposed population is exactly **linked-Premium followers who click promptly** —
  i.e. real players, not the developer.

**Explicit non-goal:** no timing-window patches. The fix must be event-driven — the gate waits for
a state, not a delay. (The one bounded timeout below is a liveness escape hatch consistent with the
gate's existing 3s audio-sync fallback, and it fails *safe into the recovery path*, not into
silence.)

---

## Design

### A. Hook exposes a gesture-readiness signal (`useSpotifyPlayback.js`)

The gate must wait for "**player object exists**", NOT `status === 'ready'` — `ready` can only
happen *after* the gate click (connect is gesture-deferred). Waiting on `ready` would deadlock.

- New state `sdkPlayerCreated` — set `true` immediately after `playerRef.current = player;` in the
  create effect; reset in the real-teardown path alongside the other refs. (Named `sdkPlayer…`,
  not `player…`: "player" is a loaded domain word in Rollplay — this is Spotify's
  `new Spotify.Player()` media object, nothing to do with humans or characters.)
- Derived boolean returned by the hook:

  ```
  gestureReady = sdkPlayerCreated
    || ['not_connected', 'not_premium', 'unsupported_browser', 'error'].includes(status)
  ```

  The terminal statuses are the "Spotify will never arrive for this user" states — the gate must
  resolve instantly for them (unlinked players are the majority; **do not** hold their gate).
  Only the in-flight states (profile fetching, script loading, player constructing) hold it.

### B. Gate grows a third, **sequenced-last** phase (`useGatePreload.js`, `GameContent.js`)

**Decision (Matt, 2026-08-01): the Spotify boot chain (profile fetch → SDK script → player
construction) must run as the very last set of loading tasks** — not in parallel with asset
downloads. Rationale: S3 downloads get uncontested bandwidth, and the loading narrative is honest
([assets] → [audio engine] → [Spotify poised] → CTA). Cost: ~0.5–1s of serialized boot after
downloads finish; zero added time for non-Spotify users (the profile check is the first step and
short-circuits to a terminal status in one round-trip).

- `useSpotifyPlayback`'s `enabled` stops being hard-`true`: it's driven by gate core-readiness.
  Hook-ordering wrinkle: `useSpotifyPlayback` is called before `useGatePreload` in `GameContent`,
  and each needs a signal from the other (spotify needs core-ready to start; gate needs
  `gestureReady` to finish). Not circular in dataflow — break the render-time knot with a small
  `spotifyBootEnabled` state in `GameContent`, set by an effect when the gate reports
  `coreReady` (one render of lag, harmless).
- `useGatePreload` exposes `coreReady = downloadsComplete && audioReady` (new) and accepts
  `spotifyGestureReady`. Final readiness: `ready = coreReady && spotifyReady`, where
  `spotifyReady = spotifyGestureReady || spotifyFallbackFired`.
- **Bounded liveness fallback:** timer starts when the Spotify phase *starts* (i.e. at
  `coreReady`), mirroring the existing `AUDIO_SYNC_TIMEOUT_MS` pattern and its "users are never
  permanently blocked" rationale. Suggested `SPOTIFY_GESTURE_TIMEOUT_MS = 8000`. If it fires, the
  gate opens and the wasted-gesture hardening (C) owns recovery — no silent pretending.
- Progress mapping: downloads 0–85%, audio sync 85–95%, Spotify 95–100% (was 0–90/90–100).
  Keep the 500ms CTA settle. Keep the `isAudioUnlocked` early-return unchanged.
- Optional polish: progress label "Connecting Spotify…" for the last segment.

### C. Wasted-gesture hardening (defense in depth, `useSpotifyPlayback.js`)

For any residual path where the player is created *after* the gesture was spent (fallback fired,
or a future regression):

1. Create-effect `connectNow()` still runs (device registration needs no gesture), but we stop
   assuming activation happened. Record whether a gesture was live during connect via
   `navigator.userActivation.isActive`.
2. If connect completed **without** live activation → set `status = 'blocked'` proactively
   instead of waiting for a play attempt to fail. That arms the existing one-shot pointerdown
   auto-recovery + follower pill (`GameContent.js:2533`) — the user's next click anywhere
   re-activates inside a real gesture and heals. Leader-side `recoverPlayback`'s `resume()` no-ops
   harmlessly when nothing is playing (already `.catch`ed).
   - Rationale for proactive over reactive: a follower's first play attempt may be minutes after
     entry (`autoplay_failed` only fires when playback is tried) — by then they're mid-session and
     the silence reads as "broken", not "blocked".
3. `unlock()`'s null-player branch gets a `console.warn` breadcrumb — post-fix it should be
   near-unreachable; if it ever logs in the wild, we want to know, not guess.

### D. Instrumentation

- Add `navigator.userActivation.isActive` / `.hasBeenActive` to the `dbg()` lines in `unlock`,
  `activate`, and `connectNow` — definitive answer to "was the gesture window live when this ran?"
- `SPOTIFY_DEBUG` stays off in the commit; flipped on locally during QA.

---

## Deterministic repro / QA (no timing luck, no second account needed)

The activation machinery is **role-independent** — leader/follower diverge only after activation
(controls vs snapshot-apply). So the race is validated leader-side on one account:

**Repro procedure (must fail pre-fix, pass post-fix):**
1. Zero-MEI Chrome. **NOT incognito** — MEI persists into incognito from the parent profile, and
   `chrome://media-engagement` can't be opened there to notice. Use the official
   "first-time visitor" launch (fresh temp profile + MEI bypass disabled; the temp
   `--user-data-dir` also forces a new process so the flags actually apply):
   ```bash
   open -na "Google Chrome" --args \
     --user-data-dir=$(mktemp -d) \
     --disable-features=PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies
   ```
   (Alternative: a fresh named profile, verified empty at `chrome://media-engagement` — but it
   accumulates MEI across QA runs; the flag launch stays zero every run.)
2. DevTools → Network → block `sdk.scdn.co/spotify-player.js`, load the game page.
3. Pre-fix: CTA appears while blocked → click → release block → player created outside gesture →
   silent/blocked Spotify. Post-fix: CTA withheld; release block → player created → CTA appears →
   click → audio activates.

**QA matrix:**

| # | Scenario | Expected |
|---|---|---|
| 1 | Linked Premium, script delayed (blocked then released) | Gate holds through "Connecting Spotify", CTA only after player exists, audio works first try |
| 2 | Linked Premium, normal load, immediate click | Works (player exists by CTA time) |
| 3 | **No Spotify linked** | Gate does NOT wait — `not_connected` resolves the phase instantly (critical regression check) |
| 4 | `not_premium` / `unsupported_browser` (iPad-Chrome UA) | Same — instant resolve |
| 5 | Script fully hung | 8s fallback opens gate; player never exists; no crash; if it appears later → `'blocked'` armed → next click recovers |
| 6 | Fallback fired, player created late | Proactive `'blocked'` → pill visible → any pointerdown heals |
| 7 | Dev StrictMode double-mount | `sdkPlayerCreated` survives remount (deferred-teardown path resets it only on real unmount) |
| 8 | Zero-MEI profile, whole flow end-to-end | Audio on first entry with no recovery pill needed |

**Residual risk (accepted, single-account constraint):** true follower-side snapshot-apply under
`'blocked'` can't be locally verified with one Premium account. Mitigation: the shared activation
path is verified leader-side + scenario 6 exercises the follower recovery surface; confirm with a
real user post-deploy (their console now carries the userActivation breadcrumbs if it recurs).

---

## Split out: gate loading scope + asset storage (2026-08-01)

The "what does loading actually download / where do bytes live" audit outgrew this plan and now
lives in `.claude/plans/loading_v2/01-gate-loading-and-asset-cache.md` (preload shape decision,
IndexedDB persistence tier, PCM eviction hygiene). This plan ships the Spotify gesture fix on
its own — the only coupling is that `useGatePreload` gains the `coreReady` seam here, which
loading_v2 will build on.

## Files touched

- `rollplay/app/audio_management/hooks/useSpotifyPlayback.js` — `sdkPlayerCreated` state,
  `gestureReady` derived export, proactive `'blocked'` on gestureless connect, breadcrumbs.
- `rollplay/app/game/hooks/useGatePreload.js` — third (sequenced-last) phase, `coreReady`
  export, fallback timer, progress remap; campaign-wide manifest change once shape (a)/(b) is
  decided.
- `rollplay/app/game/GameContent.js` — `spotifyBootEnabled` state driven by `coreReady` (feeds
  the spotify hook's `enabled`), pass `spotify.gestureReady` into `useGatePreload`; optional
  progress label.

## Out of scope

- Family-account / `product`-value R&D (separate note: `notes-family-accounts.md`).
- iPad Safari spike, Connect-API fallback (unchanged status from the TODO doc).
- Any change to the S3 engine unlock path (`unlockAudio`) — untouched.
