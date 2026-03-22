# Debrief: Audio Bugs, UI Polish & Nav Architecture

**Plan file:** `.claude-plans/web-bugs.md`
**Branch:** `audio-bugs` (PR #95)
**Period:** 2026-03-22
**Status:** All items complete — audio fixes, gate overlay redesign, nav refactor, spectator mode, dashboard polish

---

## 1. Goals Set

- Address Copilot PR review feedback (dead code, concurrency guard, stale state, visibilitychange deps)
- Fix Audio Gate Overlay ("Click to Enter" card) UI — hero image, layout, description, connected players
- Fix audio not being gated on SPA navigation (audio played before gate overlay click)
- Fix spectator banner not pushing drawers/map controls down
- Fix campaign description width on mobile in CampaignManager
- Remove UI clutter (emojis, redundant headers)

---

## 2. What Was Delivered

### Copilot PR Feedback — All 4 items actioned
- Removed unused `formatTime` from `VerticalChannelStrip.js`
- Added `unlockInProgressRef` concurrency guard to prevent overlapping `unlockAudio` calls
- Added `remaining: null` to PAUSED/STOPPED state updates (4 locations) to clear stale countdown
- Added `remoteTrackStatesRef` and `channelEffectsRef` mirrors; reduced visibilitychange deps to `[isAudioUnlocked]`

### Audio Gate Overlay — Complete redesign
- Solid black background, smoke (`COLORS.smoke`) border and text
- Hero image preloading — `heroImageReady` state gates rendering to prevent fallback flash
- Campaign description with `whiteSpace: 'pre-line'`, container-query-based font scaling (`cqh` units)
- Connected players list (seated + lobby, deduplicated) absolutely positioned at bottom-left
- "Click to Enter" in Metamorphous font, pinned to bottom with `mt-auto`
- Responsive layout: `gate-card` container queries hide description below 350px height
- Card sizing: `width: 'min(90vw, calc(90vh * 16 / 9))'`, `aspectRatio: '16 / 9'`
- **Files:** `game/page.js`, `globals.css`

### SPA Audio Gate — Fixed
- Added `isAudioUnlockedRef` ref alongside `isAudioUnlocked` state
- Gate in `playRemoteTrack`: checks `!isAudioUnlockedRef.current` to prevent audio before overlay click
- Ref set synchronously before `drainPendingOps()` — avoids stale closure where React state hasn't re-rendered
- **File:** `useUnifiedAudio.js`

### Reverb Fade Bug — Fixed (Copilot's 5th comment)
- Fade-in was broken: `fadeRatio = startGain > 0 ? currentGain / startGain : 0` always returned 0 for fade-ins (startGain is 0)
- Fixed by differentiating fade type: fade-out scales `currentGain / startGain`, fade-in scales `currentGain / targetGain`
- Second bug: `reverbWetGainAtStart` is 0 at fade-in start, so `0 * fadeRatio = 0` always. Fixed by using `reverbTargetLevel` (from channel effects state) as the base for fade-ins
- **File:** `useUnifiedAudio.js`

### Nav Architecture Refactor — Holistic spectator mode
- `.top-nav` restructured as flex column: `.top-nav-bar` (original row) + spectator banner (second row)
- Spectator banner moved from separate fixed element into the nav — nav height grows naturally
- `--nav-height` CSS custom property measured via ResizeObserver, set on `.game-interface`
- Drawers use `var(--nav-height)` for `top` positioning — single source of truth
- Removed all `--spectator-offset` hack code (ResizeObserver, querySelectorAll, per-element CSS var)
- Map overlay buttons (HOLD, LOCK MAP) stay in MapSafeArea with `top: 0px` — nav masks their top via higher z-index, so they appear flush below nav bottom regardless of spectator banner
- **Files:** `game/page.js`, `globals.css`, `MapSafeArea.js`, `MapOverlayPanel.js`

### Dashboard CampaignManager — Mobile description width
- Campaign description moved from sibling inside title flex row to direct child of content container
- Width: `max-w-full sm:max-w-[70%]` — full width on mobile, 70% on desktop
- **File:** `CampaignManager.js`

### UI Cleanup
- Removed emojis from Lobby header and Adventure Log header
- Removed PARTY section header and green horizontal line from party drawer
- **Files:** `LobbyPanel.js`, `AdventureLog.js`, `game/page.js`

---

## 3. Challenges

### Stale closure with `isAudioUnlocked` in `playRemoteTrack`
Adding `!isAudioUnlocked` state check to gate audio caused audio to never unlock. `drainPendingOps` called `playRemoteTrack` synchronously after `setIsAudioUnlocked(true)`, but React hadn't re-rendered — the state was still `false` inside the closure. Resolved with `isAudioUnlockedRef` ref set synchronously before drain.

### Container queries vs viewport media queries for gate card
Initial approach used `@media (min-height: 500px)` for the description — but the viewport height is always larger than the card (which is constrained by 16:9 aspect ratio). Switched to CSS container queries: `.gate-card { container-type: size }` with `@container (min-height: 350px)`.

### Spectator banner positioning — three failed approaches
1. `--spectator-offset` applied per-element via `querySelectorAll` — worked but wasn't holistic (missed MapSafeArea, required adding every new element)
2. MapSafeArea `top: var(--nav-height)` — broke map buttons (they appeared with a gap instead of flush)
3. Map buttons inside the nav with `top: 100%` — worked but lost drawer-aware right inset from MapSafeArea

Final approach: spectator banner is a flow child inside `.top-nav` (grows nav height), buttons stay in MapSafeArea at `top: 0` (masked by nav's higher z-index), drawers use `var(--nav-height)`.

### Reverb wet gain — two bugs compounding
The fade ratio calculation and the base gain value were both broken for fade-ins. Fixing only the ratio still produced silence because `reverbWetGainAtStart * correctRatio = 0 * correctRatio = 0`. Required reading the target reverb level from `channelEffectsRef` to use as the base for fade-in scaling.

---

## 4. Decisions & Diversions

### D1: Nav as flex column (unplanned → shipped)

**Plan said:** Nothing — spectator mode wasn't in scope
**Shipped:** `.top-nav` restructured as flex column with `--nav-height` CSS variable

**Rationale:** Spectator banner was a separate fixed element requiring per-element offset hacks. User correctly identified this wasn't holistic — any new element that needed to clear the nav would need the same hack. Moving the banner into the nav and measuring height dynamically means one variable drives all positioning.

**Impact:** Any future element that needs to sit below the nav just uses `var(--nav-height)`. No special-casing needed.

### D2: Map buttons stay behind nav (unplanned investigation)

**Plan said:** Nothing
**Shipped:** Buttons remain at `top: 0` in MapSafeArea, masked by nav's z-index 100 vs MapSafeArea's z-index 30

**Rationale:** The original approach was never explicitly designed — it was an emergent behaviour from z-index layering. When we tried to make it explicit (positioning buttons below nav with `var(--nav-height)`), it created a visible gap. The masking approach is actually the correct one — buttons are full-height tabs with `borderTop: none` and flat top edges, designed to appear flush when something sits above them.

### D3: `isAudioUnlockedRef` added alongside state (unplanned)

**Plan said:** Two-strategy unlock with `isAudioUnlocked` state
**Shipped:** Added `isAudioUnlockedRef` ref that's set synchronously before `drainPendingOps`

**Rationale:** React state updates are asynchronous. Any code that checks `isAudioUnlocked` inside a closure captured before `setIsAudioUnlocked(true)` will see `false`. The ref provides synchronous access to the current value for use in `playRemoteTrack` and the visibilitychange listener.

---

## 5. Open Items

- Reverb not playing on channel play (reported then couldn't reproduce) — monitor for recurrence
- PR #95 ready for re-review after these fixes
