# TODO — Spotify follower gesture-unlock (desktop) + iOS/DRM strategy

> Output of the regression R&D on 2026-07-09 (iPad Chrome silent for all users; desktop followers
> intermittently silent, self-healing after refreshes). Supersedes nothing — note that #144's
> device-race hardening (`reconcileDevice`, 404 retries, StrictMode teardown deferral, DM resume
> button) fixed "Device not found" on first entry, but **no follower gesture-unlock has shipped**.
> The desktop silence is still live.

## Verdict up front

1. **Desktop follower silence is our bug, deterministic, masked by Chrome's Media Engagement
   Index.** No follower gesture ever calls `activateElement()` — the Enter Session gate click
   deliberately unlocks only the S3 Web Audio engine (`GameContent.js:1377` — "S3 only — no
   spotify.activate here"), and the only gesture-driven Spotify path ("Resume where you left off",
   `SpotifyBgmPanel.js:319`) lives inside `AudioMixerPanel`, which renders only for the DM
   (`GameContent.js:2228`). Whether an un-activated player audibly plays is then decided by
   Chrome's per-origin MEI score (`chrome://media-engagement`) — which is why it "fixed itself"
   after refreshes on Matt's machine (score crossed the threshold) and can't be reproduced there
   since. Fresh users start at score zero and get silence every time.
2. **iPad Chrome is unfixable as built** — all non-Safari iOS browsers are WebKit with no DRM
   exposure (no Widevine anywhere on iOS; FairPlay is Safari-only). The SDK can register a Connect
   device (network handshake) while being incapable of audio, which is why it looked half-working.
3. **iPad Safari is the only in-browser iOS candidate**: FairPlay EME exists there and Spotify's
   docs claim support, but community reports are littered with "connects but silent" failures.
   The one consistently-reported fix is calling `player.connect()` itself inside the first user
   gesture. Treat as a spike with uncertain outcome, not a committed feature.
4. **Connect-API fallback (remote-control the user's Spotify app) is shelved by decision** — it
   breaks the one-roof principle (external app dependency, no install feedback loop, audio outside
   our mixer). Documented here as the fallback if the Safari spike fails. Note the platform
   reality: in-process Spotify playback exists *only* in desktop browsers — native iOS/Android
   SDKs and stock Electron are all remote-control-only (no Widevine without castLabs+VMP), so no
   re-platforming (React Native included) buys in-process Spotify on iPad.

## Key research facts (sources in session notes)

- `activateElement()` must be called **synchronously inside a user-gesture handler**; it
  pre-authorises the SDK's media element so transferred playback keeps its playing state.
  It does not survive reload or player re-creation.
- Chrome allows gesture-less audible playback only with prior interaction in the same navigation,
  MEI above threshold, or an installed PWA (PWAs are exempt from autoplay policy entirely —
  cheap future win).
- The SDK emits **`autoplay_failed`** when blocked. Our handler is a bare `console.warn`
  (`useSpotifyPlayback.js:415`) telling the user to "click a control" — a control that doesn't
  exist for followers. Nothing retries; the snapshot dedup (`lastPlaybackSigRef`,
  `useSpotifyPlayback.js:319-321`) prevents the same snapshot from re-applying even if activation
  later succeeds.
- Cross-browser best practice (solved community threads): defer `player.connect()` into the first
  gesture (connect-on-load + activate-on-click fixes Chrome but **not Safari**); transfer with
  `play: false`; resume after activation.
- **iOS ignores programmatic media volume** — SDK `setVolume()` is a documented no-op on iOS, and
  the DRM'd element can't be routed through Web Audio gain. So even a successful iPad Safari
  player plays at hardware volume, outside the DM's mix. This is true of every iOS path.
- Chrome-on-iOS identifies as `CriOS`; iPad Safari masquerades as macOS (detect via Mac UA +
  `navigator.maxTouchPoints > 1`). No supported way to launch Safari from Chrome-iOS; the
  undocumented `x-safari-https://` scheme works on recent iOS as a progressive enhancement,
  baseline is an instruction interstitial + copy-link.

## Work plan

> **Status 2026-07-09: Phases 1–2 implemented** (gate-click `unlock()` = activate + gesture-deferred
> `connect()`; `autoplay_failed` → `blocked` status + one-shot pointerdown auto-recovery + follower
> recovery pill; DM panel/mixer strip treat 'blocked' as operational). Desktop Chrome/Firefox
> passed QA 2026-07-09.
>
> **Phase 3 implemented same day**: `shared/utils/platform.js` (isIOS / isIOSNonSafari via UA
> markers + `requestMediaKeySystemAccess` probe; `tryOpenInSafari` via `x-safari-https://`);
> hook short-circuits to status `'unsupported_browser'` on non-Safari iOS (no SDK init, snapshots
> still populate nowPlaying); dismissible `SpotifyUnsupportedNotice` renders when such a client
> is in a session actively playing Spotify (Open in Safari + copy-link); BGM panel message added.
> Follower volume stance resolved: mixer drawer is DM-only, so no follower fader exists to hide.
> **Remaining: the iPad Safari spike itself** — real-hardware test (2 Premium accounts) decides
> whether iPad Safari is supported or the notice extends to all iOS.

### Phase 1 — Desktop follower unlock (fixes the live regression)

1. **Gate click activates Spotify.** In `handleEnterSession`, call the Spotify activation in the
   synchronous click path (before any `await`). Handle the cold-load ordering trap: the player
   often doesn't exist yet at gate-click time (profile fetch → SDK script load → connect), and
   `activate()` silently no-ops on a null player. Approach: record "gesture pending" and either
   (a) defer `player.connect()` itself to the gate gesture (preferred — also the Safari
   prerequisite, see Phase 2), or (b) register a one-shot `pointerdown` listener that activates
   once the player exists.
2. **Make `autoplay_failed` recoverable.** On the event: set a visible status (e.g.
   `status: 'blocked'`), surface a small follower-side "🔊 enable session audio" affordance; its
   click handler calls `activateElement()`, clears `lastPlaybackSigRef`, and re-applies the last
   `nowPlaying` snapshot.
3. **Join followers via transfer `play:false` → resume** after activation instead of cold-starting
   playback server-side (the server-initiated play is what gets classified as autoplay).

### Phase 2 — Connect-on-gesture refactor (Safari prerequisite, benefits all browsers)

Move `player.connect()` (`useSpotifyPlayback.js:433`) out of the mount effect and into the gate
gesture. The existing machinery makes this cheap: snapshots already queue in `pendingSnapshotRef`
until `ready`, and `waitForDevice`/`playBody` already tolerate a late device. Player *creation*
can stay on mount; only `connect()` moves.

### Phase 3 — iOS

1. **Platform detection**: non-Safari iOS browsers (CriOS etc.) → interstitial on
   Spotify-enabled sessions: "Spotify audio needs Safari on iPad" + `x-safari-https://` attempt +
   copy-link. Gate only the Spotify feature, not the whole app (Chrome-iPad users still play, with
   a "no Spotify audio here" notice).
2. **iPad Safari spike** (timeboxed): with Phases 1–2 in place, test on real hardware. Needs a
   second Premium account for the leader seat. Outcome decides whether iPad Safari is supported
   or the interstitial extends to all iOS.
3. **Volume stance**: hide/disable the follower Spotify fader on iOS (it cannot work); DM-side
   note that iPad players self-mix via hardware buttons.

### Verification notes

- Simulate a zero-MEI user: fresh Chrome profile, or launch with
  `--autoplay-policy=user-gesture-required` semantics via clean profile; check state at
  `chrome://media-engagement`. Matt's daily profile is over-threshold and will mask the bug.
- Follower repro needs two Premium accounts (leader playing + follower joining).

## Open questions

- Does iPad Safari actually produce audio with connect-on-gesture? (The spike's whole purpose.)
- iPad screen-lock/tab-background behaviour during long sessions — does Safari suspend the SDK
  and does it recover on wake?
- If the spike fails: accept "no Spotify on iPad" or revisit the shelved Connect fallback?
