# Runtime perf investigation — game runtime is laggy, workshop isn't

## Context

The fog rendering pipeline (workshop's `MapConfigTool` + game runtime's `GameContent`) shares the same `MapDisplay` / `FogRegionStack` / `FogHideLayer` / `FogSharedTextureLayer` components, the same `useFogRegions` hook, the same animated GIF + SVG-filter texture layer.

**Workshop is smooth (60fps). Runtime is laggy (13–15fps sustained, dt ≈ 75ms).**

This file is the investigation log: what we tested, what we ruled out, what we found, what we fixed, what's still open. Designed so the work can be resumed without re-running the same diagnostics.

## Tools built during this investigation

These are durable artefacts — keep them around, they're the eyes for any future round of work.

### `app/shared/utils/renderTracker.js`
- `useRenderTracker(name)` hook: drop into any component body, increments a per-name timestamp log on every commit (via `useEffect`).
- `readRenderStats()`: returns `{ name: { count1s, count10s, perSec10s } }`. **Trims on read** (this was a bug fix — see below).
- `resetRenderStats()`: clears arrays but **keeps keys** so components stay visible in the overlay with `0/0` after reset (also a bug fix).
- Production-tree-shaken: `bump()` no-ops in production.

### `app/shared/components/PerfOverlay.js`
- Floating debug overlay with:
  - **fps 1s** (count of frames within last 1 second)
  - **10s avg** (frames in 10s window / actual elapsed)
  - **1% low** (avg fps across the worst 1% of frame intervals over 10s — gaming-benchmark definition; settles after ~1.6s of data)
  - **dt** (last frame interval ms)
  - **dom nodes** (total `<element>` count)
  - **composited ~** (approx GPU-promoted element count — counts elements with `transform`, `filter`, `mix-blend-mode`, `will-change`. Real layer count via DevTools → More Tools → Layers; this is a lower-bound estimate)
  - **Render-count table**: `1s` and `10s` columns per tracked component, color-coded (green/amber/red).
- Runs an internal rAF for FPS measurement; refreshes the React display only 4×/sec (so the overlay's own renders don't pollute the counts).
- DOM scan runs 1×/sec.
- `useState`-tick triggers React updates on the interval; refs hold the live values.

### Toggle in top nav (DM runtime)
- `faGauge` icon button in `GameContent.js` top nav, next to fullscreen.
- State persists via `localStorage['rollplay.perfOverlay']`.
- Hidden entirely in production (`process.env.NODE_ENV !== 'production'` gate around the button).

### Components currently instrumented with `useRenderTracker`
- `GameContent`
- `MapDisplay`
- `FogRegionStack`
- `FogHideLayer`
- `FogSharedTextureLayer`
- `AudioTrack`
- `VerticalChannelStrip`
- `AudioMixerPanel`
- `MixerStrips`
- `BottomMixerDrawer`

Add `useRenderTracker('Foo')` to any new suspect component to surface its render frequency in the overlay.

## Hypotheses tested

| # | Hypothesis | Verdict | Evidence |
|---|---|---|---|
| 1 | Fog GIF + SVG filter pipeline is too expensive | **Ruled out as primary** | Workshop renders same fog at 60fps. Same component code, same tile count. Cost is real but not unique to runtime. |
| 2 | React render thrash from GameContent's ~58 `useState` hooks cascading into children | **Ruled out** | At true idle (post-init), perf overlay shows **0 commits / 10s** for `GameContent` + every child. Verified with React DevTools Profiler: only audio-gate unlock cascade fires, not ongoing. |
| 3 | Compositing layer explosion (>125 layers triggers software fallback) | **Ruled out** | DevTools → Layers panel: **18 actual layers, 70.8 MB**. Well under Chrome's threshold. Our `composited ~` overlay metric reported 68–82, but that's an over-counter — Chrome collapses many composited candidates into shared layers. |
| 4 | Sentry instrumentation overhead (`sentryWrapped` wrapping every `setTimeout`/`setInterval`/`rAF`/`fetch`) | **CONFIRMED contributor** | Performance Bottom-Up at idle: `Function call helpers.js:96:34 sentryWrapped` consumed **25.4% Self Time** (12.6ms self time). `tracesSampleRate: 1.0` was sampling 100% of transactions. Reducing the rate doesn't help — wrapper runs regardless. **Disabled entirely in dev.** |
| 5 | Sentry session replay recording every DOM mutation | **CONFIRMED contributor** | `replayIntegration` was active. With audio meters writing `textContent` ~10×/sec across multiple strips, replay was capturing all of it. **Disabled in dev alongside tracing.** |
| 6 | Continuous CSS animations (`animate-pulse` on initiative tracker, modals) | **Initially mis-flagged**, then ruled out | Performance trace's "Animations" row showed continuous purple bar — turned out to be the **loading-gate progress bar** + `gate-cta-enter`. Both transient, end with the gate. Not runtime cost. |
| 7 | Layout shifts ticking constantly | **Ruled out (loading artefact)** | Layout-shift cluster at 2.158s was the loading gate's `flex-shrink-0 flex justify-between items-end pb-10` reveal. Transient. |
| 8 | Audio meter rAF loops in DM-only `BottomMixerDrawer` | **CONFIRMED big contributor** | See "Smoking gun" below. |
| 9 | `AudioChannel` engine rAF (time tracking) | **Ruled out** | Inspected `_startTimeTracking()`: gated on play state via `_startTimeTracking()` / `_stopTimeTracking()` calls in `play()` / `pause()` / `stop()` / `endStroke`. Idle = no rAF. |
| 10 | Volume fade rAF in `useUnifiedAudio` | **Ruled out** | Exits cleanly when `progress >= 1.0`. Active only during transitions. |
| 11 | `setProgress` from `AssetDownloadManager` ticking continuously | **Ruled out** | rAF-throttled, only fires while bytes flow. At idle (post-load) it's silent. |
| 12 | `fog.engine` dep in GameContent's hydration `useEffect` causing rehydration loop | **CONFIRMED bug, fixed** | When DM clicked "+ Add region", `setActiveId(newId)` flipped `activeEngine` identity → `fog.engine` dep changed → hydration effect re-fired → overwrote local state with stale `activeMap.fog_config` → just-added region wiped. **Fix: drop `fog.engine` and `fog_config?.version` from deps; mirror workshop's `[asset_id]` pattern.** |
| 13 | Auto-fill fog mask on load | **Ruled out** | No such code. The only `fillAll()` is the manual button. Default region's engine starts transparent. The "always-fogged on load" the user observed was actually saved data from earlier sessions. |
| 14 | SVG SMIL `<animate>` recomputing filter every frame | **Already fixed pre-investigation** | SMIL animation was deleted as part of the prior shared-texture refactor. Not present in current code. |
| 15 | Workshop has fewer compositing layers / smaller DOM | **Likely true, contributing** | Workshop's `MapConfigTool` doesn't mount: any audio components, dice tray, combat tracker, chat, presence list, drawers, initiative tracker. Runtime mounts ALL of these regardless of whether they're visible. DOM nodes ≈ 2465 in runtime (workshop unmeasured but visibly leaner). |

## The smoking gun (so far)

**`BottomMixerDrawer` mounts `MixerStrips` → `VerticalChannelStrip` instances unconditionally for DMs**, sliding the drawer off-screen via `transform: translateY(100%)` when closed. The strips remain in the DOM and continue running their **stereo RMS meter rAF loops** at ~60Hz — analyser reads, RMS computation, and **inline `style.background = 'linear-gradient(...)'` writes** that force paint of meter elements that are translated off-screen but still painted by the browser.

**Why this kills runtime but not workshop**: workshop has no audio mixer mounted. Same fog, no audio meters → 60fps. Same fog + audio meters → fps drop.

**Confirmed via**:
- Perf overlay showed `VerticalChannelStrip: 7 in 1s, 105 in 10s` → ~10 commits/sec (clip detection in master strip causing setState).
- Performance Bottom-Up: "set textContent" appeared twice in top entries (the dB readouts in each strip), plus heavy `requestAnimationFrame` / `Animation frame fired` time.
- The drawer is mounted via `{isDM && <BottomMixerDrawer ... />}` in `GameContent.js`. Always present for DMs.

## Fixes applied

| File | Change | Reason |
|---|---|---|
| [GameContent.js](rollplay/app/game/GameContent.js) hydration `useEffect` | Deps reduced from `[asset_id, fog_config.version, fog.engine]` to `[asset_id]`. Removed `if (!fog.engine) return` guard. | `fog.engine` identity changed on local state changes (e.g. `setActiveId`), retriggering hydration that wiped local edits. Mirrors workshop's `[selectedAssetId]` pattern. `loadFromConfig` creates engines on demand so the readiness guard is unnecessary. |
| [GameContent.js](rollplay/app/game/GameContent.js) fitToMap `useEffect` | Dep `fog` → `fog.fitToMap` | The whole `fog` hook return is a fresh object each render → effect was running every render. `fog.fitToMap` is a stable `useCallback` with empty deps. |
| [sentry.client.config.js](rollplay/sentry.client.config.js) | `enabled: isProd` + `tracesSampleRate: 0` + `replaysSessionSampleRate: 0` + empty `integrations` array in dev. | 25.4% Self Time at idle was `sentryWrapped`. Replay integration was recording every DOM mutation. In dev we don't need either — `Sentry.captureException` still works if explicitly called. |
| [BottomMixerDrawer.js](rollplay/app/audio_management/components/BottomMixerDrawer.js) + [VerticalChannelStrip.js](rollplay/app/audio_management/components/VerticalChannelStrip.js) | Threaded `isOpen` from `BottomMixerDrawer` → `MixerStrips` → each `VerticalChannelStrip`. Meter `useEffect` now bails on `!isOpen`. | Stops the per-strip analyser-read + DOM-paint rAF loop when the drawer is closed. Audio engine, looping, reverb, routing, time-tracking are all unaffected — only the visual feedback pauses. **Trade-off**: master clip indicator won't latch while drawer is closed — accepted as fine since the indicator is only meaningful when visible. |
| [renderTracker.js](rollplay/app/shared/utils/renderTracker.js) | Trim moved from `bump()` to `readRenderStats()`; `resetRenderStats()` empties arrays but keeps keys. | Original bug 1: stale entries for components that render once then sit quiet → 10s column lied indefinitely. Bug 2: reset cleared the Map → tracked components disappeared from the overlay until they next rendered. |

## Things confirmed already-fine (do not re-investigate)

- **SMIL animation on `<feTurbulence>`**: removed in the earlier shared-texture refactor. Filter only recomputes when its inputs change.
- **`FogRegionStack` mount gating**: parent `ready = imgDims.w > 0 && imgDims.h > 0`; texture layer mounts only when at least one enabled engine exists. No transitional null-DOM states with un-attached refs.
- **Per-region engine size mismatch**: `useFogRegions.createEngine` reads from `maskDimsRef`, so newly-added regions match map dimensions. `fitToMap` resizes ALL engines, not just active.
- **Pan override (spacebar)**: works correctly — gated on `paintingRef.current` for mid-stroke skip, drops focus from sliders on paint click.
- **Multi-region WS hydration**: `handleRemoteFogUpdate` defers to `loadFromConfig` (multi-region), not the old `regions[0]`-only path.
- **DM region UI in `MapControlsPanel`**: `RegionListPanel` + `RegionParamsEditor` mounted same as workshop.

## Where we are right now

After all fixes above, at true post-init idle:

- **0 React commits in 10 seconds** (every tracked component shows `0/0`).
- **fps ≈ 13–15 sustained** (1% low ≈ 11 — close to average, so it's NOT spiky stutter, it's CONSTANT slow framerate).
- **dt ≈ 75ms per frame**.
- DOM nodes ≈ 2465.
- 18 actual GPU layers (Chrome Layers panel).

Conclusion: **75ms/frame of pure browser-side work** with NO JS running. That's GPU/compositor/paint/image-decode territory. The remaining cost is something the browser does on every frame regardless of React.

## Open hypotheses for the next round

These haven't been tested yet because we ran out of session time. Each could be the remaining 75ms/frame:

1. **Animated GIF decoding cost** — 88 fog tiles each cycling `fog_loop_2.gif` independently. Even with the SVG filter inputs static, the GIF source pixels change every frame, forcing the filter chain (`feTurbulence → feDisplacementMap → feGaussianBlur`) to recompute. Workshop pays the same cost but on a smaller view area / fewer overlapping GPU layers. **Test**: replace GIF tiles with a static PNG and measure fps delta.
2. **Reverb convolution background threads** — earlier Performance trace showed ~25 "Reverb convolution background thread" rows. Each `ConvolverNode` processes silence through its impulse response continuously, even with no audio playing. Worker-thread cost shouldn't directly hit main-thread frame timing, but they're a CPU consumer. **Test**: temporarily disable reverb instances, measure fps.
3. **Large DOM tree (2465 nodes) interacting with paints** — every paint pass walks subsets of this tree. The base cost compounds when other things demand paint. **Test**: collapse some always-mounted-but-hidden subtrees (the BottomMixerDrawer's `MixerStrips` content is the obvious candidate — switch from `transform: translateY` to conditional mount). See "open architectural question" below.

## Things we did NOT memoize / where memoization could help (fact-checked)

The user asked me to be careful about memoization claims. Here's the verified state:

- `MapDisplay` is wrapped in `React.memo` (verified — `export default React.memo(MapDisplay)`). React DevTools shows it correctly skipping re-renders during the audio-gate cascade.
- `GridOverlay` is wrapped in `React.memo` (verified by Profiler flamegraph showing it as Memo).
- `BottomMixerDrawer` is **NOT memoized**.
- `MixerStrips` is **NOT memoized**.
- `VerticalChannelStrip` is **NOT memoized**.
- `AudioTrack` is **NOT memoized**.

The user explicitly **declined memoization** during this session — preferring to find the root cause first rather than mask symptoms. **If perf still falls short after the open-hypothesis tests, memoizing the audio components is a safe quick win** because:
- They have many props (some `useState`-driven, some inline arrow callbacks from `GameContent`).
- Inline arrow callbacks defeat naïve `React.memo` (always-new identity); would need to also stabilise those callbacks via `useCallback` in `GameContent`.

## Open architectural question

`BottomMixerDrawer` uses `transform: translateY(100%)` to slide off-screen. This keeps `<MixerStrips>` mounted permanently. After the rAF gate fix, the strips are functionally inert when closed (no analyser reads, no DOM writes), but they still:
- Contribute ~hundreds of DOM nodes to the tree.
- Have effect/state hooks running on every prop change from GameContent.

Alternative: `{isOpen && <MixerStrips ... />}` — fully unmount when closed. Trade-off: opening the drawer takes one render cycle to mount strips (could be a 50–100ms hitch on open).

Depending on whether the drawer-open hitch is acceptable, this could be the cleanest remaining win. **Decision deferred** until we've tested the GIF / reverb hypotheses — if either of those is the dominant cost, this DOM-node optimization may be moot.

## How to resume this investigation

If you're a future iteration of me coming back to this with cleared context:

1. Start by reading this file end-to-end. Don't re-test ruled-out hypotheses.
2. Toggle the perf overlay (gauge icon in DM runtime top nav). Reset, sit idle 10s, screenshot. Confirm we're still at the "0 React renders, ~75ms/frame" baseline.
3. Pick from "Open hypotheses" — start with #1 (GIF) since it's the most likely and easiest to test (drop GIF for static PNG, measure delta).
4. If GIF is exonerated, test reverb (#2). If reverb is exonerated, test DOM size (#3).
5. After identifying the cause, decide on the fix. The "open architectural question" is the obvious follow-up if DOM size matters.

## Update — 2026-05-06 session

### Definitive isolation: the map IS the cause

User tested with no map loaded: **fps 97 sustained**. With map loaded: **fps 13 sustained**. Same runtime, same audio engine, same DOM tree minus the map area. The fog rendering pipeline (or something exclusive to the map's mounted state) is the bottleneck.

DOM node delta: ~775 (no map) → ~2465 (map loaded). The map adds ~1700 nodes, mostly fog tile divs + grid overlay + region labels.

### NEW finding: audio time-tracking cascade (separate issue, also bad)

When **any audio is playing** with the mixer drawer **closed**, GameContent renders at 9–10/sec, cascading into all unmemoized audio components:

- `GameContent`: 9 in 1s, 104 in 10s
- `BottomMixerDrawer`: 9 in 1s, 104 in 10s
- `MixerStrips`: 9 in 1s, 104 in 10s
- `VerticalChannelStrip`: **90 in 1s, 1040 in 10s** (9–10 instances × 10/sec)

**Root cause**: [useUnifiedAudio.js:734](rollplay/app/audio_management/hooks/useUnifiedAudio.js#L734) — the `_startTimeTracking` rAF loop emits `setRemoteTrackStates` every 100ms while audio plays. The state flows into `GameContent.remoteTrackStates`, propagates through `BottomMixerDrawer` → `MixerStrips` → all `VerticalChannelStrip` instances.

**Why it didn't show up in earlier "true idle" tests**: those tests had no audio playing → time-tracking rAF inactive.

**Fix candidates** (deferred — focus is on the map):
1. Memoize the audio subtree (`React.memo` on `BottomMixerDrawer`, `MixerStrips`, `VerticalChannelStrip`) — but `GameContent` passes inline arrow callbacks that defeat naïve memo. Need `useCallback`-stabilising those too.
2. Bypass React for time-update DOM. Write `currentTime` to a ref via the same rAF, update displays imperatively, only sync to React state on transport changes (play/pause/stop). Cleaner; follows the same pattern we use for fog masks.

This audio cascade contributed to the earlier 1% low (19fps) even with map UP — main thread hitches every 100ms during audio playback.

### NEW Performance Bottom-Up findings

Recording: ~5s, with map loaded, audio playing, drawer closed. Top entries by Self time:

| Self % | Self time | Activity | Notes |
|---|---|---|---|
| 17.6% | 33.8ms | **Major GC** | Heavy allocation pressure — likely from the audio time-tracking spreads creating new objects every 100ms across all strips |
| 16.9% | 32.4ms | **createTask** | React scheduler / browser task queue |
| **9.7%** | **18.6ms** | **`PerfOverlay.useEffect.domScan` (PerfOverlay.js:99)** | **OUR OWN OVERLAY was the 4th-largest cost.** The `getComputedStyle()` walk over 2465 nodes once per second was contributing 9.7% Self Time. **FIXED** — see "Fixes applied" addendum below. |
| 8.5% | 16.3ms | run | task runner |
| 7.8% | 15.0ms | Run console task | DevTools task wrapper |
| 6.2% / **63.7% total** | 11.9ms / 122.1ms | **`Function call` at `use-websocket.js:113:38`** | WebSocket message dispatch. Total time is huge (63.7%) — handler chain dominates wall-clock cost. Likely audio-sync messages flowing in alongside the time-tracking emissions. |
| 5.8% | 11.1ms | C++ GC | More GC |
| 4.7% | 9.1ms | Layout (`installHook.js:1:94228` — React DevTools) | React DevTools instrumentation cost |
| 2.1% | 4.1ms | Minor GC | More GC |

Combined GC: ~25.5% of total Self Time. That's a lot of allocation pressure for "idle" state.

### 2.5s heartbeat / ping-pong observation

User noticed Network → WS frames showing ping/pong every ~2.5s. **No explicit ping/pong code in either `useWebSocket.js` (client) or `api-game/` (server).** The 2.5s is happening at the **WebSocket protocol level** — almost certainly from one of:

- `nginx` proxy (default `proxy_read_timeout` 60s, but if explicitly configured for ws keepalive can be set lower)
- FastAPI / Starlette default `ping_interval` (Starlette default is 20s, not 2.5s)
- `uvicorn` `--ws-ping-interval` flag

**2.5s is unusually aggressive** — production systems typically use 25–30s for keepalive. **Worth investigating where this is configured.** Could be contributing to the WS dispatch cost.

### Fixes applied (addendum 2026-05-06)

| File | Change | Reason |
|---|---|---|
| [PerfOverlay.js](rollplay/app/shared/components/PerfOverlay.js) | Removed per-second `getComputedStyle()` walk. DOM count still updates every 2s (cheap). GPU-promoted scan exposed via `window.__rollplayScanGpuLayers()` for manual on-demand use. UI label changed from `composited ~` to `gpu (manual)`. | The auto-scan was costing 9.7% Self Time and polluting our own measurements. |

### Refined open hypotheses for next round

The "75ms/frame at idle with map up" baseline was MEASURED WITH PerfOverlay's own DOM scan polluting the data. The TRUE baseline should now be cleaner. Hypotheses ranked by likelihood:

1. **Animated GIF `fog_loop_2.gif` × 88 tiles** — every GIF frame advance forces the SVG filter chain to recompute (`feTurbulence` is static but `feDisplacementMap` reads `SourceGraphic` which is the masked tiles, so any tile pixel change → filter recompute). **Test**: swap `backgroundImage: url(/ui/fog_loop_2.gif)` for a static PNG (same first frame) and measure fps delta.
2. **SVG filter chain (`feTurbulence` + `feDisplacementMap` + `feGaussianBlur`)** — even with static input, if the filter is applied over a large area the per-frame cost may be high. **Test**: temporarily set `filter: 'none'` on the texture wrapper, measure fps.
3. **`mix-blend-mode: screen`** on texture tiles + masked div — forces compositing layers and per-frame composition. **Test**: set `mixBlendMode: 'normal'` (visual will look wrong but fps tells the story).
4. **88 tiles is over-spec'd** for current viewport — `FOG_TILE_SIZE_PX = 960` and `FOG_OVERLAP_FRACTION = 0.7` produces dense overlap. Maybe drop to overlap 0.5 (≈ 1/4 the tile count). **Test**: lower the overlap fraction, measure fps.

These tests are cheap to run (one-line code changes, revert if no improvement). Best to do them in order — first one to recover fps is the cause.

### How to resume — addendum

If you're returning fresh:

1. Read this file end-to-end. The "Update — 2026-05-06" section is the most recent state.
2. The audio cascade fix is **deferred** — known issue, scoped fix candidates listed. Tackle only if map fix doesn't recover budget.
3. Map perf is the focus. Run the 4 tests in "Refined open hypotheses" in order. Each test is a one-line change. Toggle the perf overlay (gauge icon, top nav) and watch fps before/after.
4. **Do not** re-investigate ruled-out hypotheses. Do not re-introduce the per-second DOM scan in PerfOverlay (`composited ~` is now manual via `window.__rollplayScanGpuLayers()` for a reason).

## File touch summary (this session)

- New: `app/shared/utils/renderTracker.js`
- New: `app/shared/components/PerfOverlay.js`
- New: `.claude-plans/runtime-perf-investigation.md` (this file)
- Modified: `app/game/GameContent.js` (hydration deps fix, fitToMap deps fix, perf overlay state + button + mount, useRenderTracker)
- Modified: `app/map_management/components/MapDisplay.js` (useRenderTracker)
- Modified: `app/fog_management/components/FogRegionStack.js` (useRenderTracker)
- Modified: `app/fog_management/components/FogHideLayer.js` (useRenderTracker)
- Modified: `app/fog_management/components/FogSharedTextureLayer.js` (useRenderTracker)
- Modified: `app/audio_management/components/AudioTrack.js` (useRenderTracker)
- Modified: `app/audio_management/components/VerticalChannelStrip.js` (useRenderTracker, isOpen-gated meter rAF)
- Modified: `app/audio_management/components/AudioMixerPanel.js` (useRenderTracker)
- Modified: `app/audio_management/components/BottomMixerDrawer.js` (useRenderTracker, threading isOpen)
- Modified: `sentry.client.config.js` (env-gated; disabled in dev)
