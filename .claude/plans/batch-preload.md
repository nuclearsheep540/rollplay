# Plan: Batch Asset Preloading for Loading Gate

## Context

Currently, the 4 types of game assets (map, image, hero, audio) trickle into the download queue at different times because they're triggered by different async events (REST calls, WebSocket, component mounts). This causes the progress percentage to jump around — e.g., map starts downloading at 50%, then audio URLs arrive and the total changes, dropping the percentage back to 20%.

**Goal**: Collect all asset URLs first, then fire them all in a single batch through `AssetDownloadManager.download()`. The component-level `useAssetDownload` hooks (MapDisplay, ImageDisplay) and `loadRemoteAudioBuffer` in syncAudioState will then get instant cache hits.

---

## Current Flow (trickle)

```
T0: onLoad() REST returns → setActiveMap → MapDisplay mounts → useAssetDownload (map starts)
T1: loadActiveImage() REST returns → setActiveImage → ImageDisplay mounts → useAssetDownload (image starts, total changes)
T2: Campaign metadata REST returns → setCampaignMeta → useAssetDownload in GameContent (hero starts, total changes again)
T3: WebSocket initial_state → syncAudioState → loadRemoteAudioBuffer per channel (audio starts, total changes again)
```

Each arrival adds to the download queue, changing `totalBytes` and making the percentage jump.

## New Flow (batch)

```
T0: onLoad() REST returns → setActiveMap, loadActiveImage completes → setInitialDataLoaded
T1: Campaign metadata REST returns → setCampaignMeta
T2: WebSocket initial_state → store raw audio state → setWsInitialStateReceived
    ↕ (all 3 data sources now ready)
T3: useGatePreload fetches all /public/cine/ assets (browser cache priming, not tracked)
T4: useGatePreload builds S3 manifest from activeMap + activeImage + heroImageAsset + rawAudioState
T5: Single batch: assetManager.download() for ALL S3 assets simultaneously
T6: Progress bar starts from 0% with stable totalBytes — no jumps
T7: Components mount, their useAssetDownload calls → instant cache hits (S3 + cine)
```

---

## Changes

### 0. `rollplay-shared-contracts/shared_contracts/audio.py` — Add `file_size` to AudioChannelState

**Why**: Maps and images already carry `file_size` through their contracts (`MapConfig.file_size`, `ImageConfig.file_size`), so the batch manifest knows exact byte totals upfront. Audio is missing this — `AudioChannelState` has no `file_size` field, so the plan's manifest would have to pass `undefined` and rely on `Content-Length` headers arriving later. Adding it gives the progress bar accurate `totalBytes` from the start.

- Add `file_size: Optional[int] = None` field to `AudioChannelState`

### 0b. `api-site/modules/library/domain/music_asset_aggregate.py` — Include file_size in ETL

- In `build_channel_state_for_game()`, add `"file_size": self.file_size` to the kwargs dict

### 0c. `api-site/modules/library/domain/sfx_asset_aggregate.py` — Include file_size in ETL

- Same change: add `"file_size": self.file_size` to `build_channel_state_for_game()` kwargs

### 1. `rollplay/app/game/hooks/webSocketEvent.js` — Capture raw audio state

Add `setRawAudioState(audio_state)` call in `handleInitialState`, alongside the existing `syncAudioState` and `setWsInitialStateReceived` calls. This gives GameContent access to the audio URLs for the manifest.

### 2. `rollplay/app/game/GameContent.js` — New state + pass to useGatePreload

- Add `const [rawAudioState, setRawAudioState] = useState(null)`
- Pass `setRawAudioState` to the WebSocket handler context (same place as `setWsInitialStateReceived`)
- Pass `activeMap`, `activeImage`, `rawAudioState` to `useGatePreload`

### 3. `rollplay/app/game/hooks/useGatePreload.js` — Build manifest + batch download

Replace the 500ms manifest settle timer with deterministic logic:

```javascript
export function useGatePreload({ 
  campaignMeta, initialDataLoaded, wsInitialStateReceived, isAudioUnlocked,
  activeMap, activeImage, rawAudioState 
}) {
  const progress = useAssetProgress()
  const assetManager = useAssetManager()
  const [batchFired, setBatchFired] = useState(false)
  const [ctaReady, setCtaReady] = useState(false)

  const dataSourcesReady = !!campaignMeta && initialDataLoaded && wsInitialStateReceived

  // Build manifest and fire single batch when all data sources are ready
  useEffect(() => {
    if (!dataSourcesReady || batchFired) return
    setBatchFired(true)

    const manifest = []

    // Map
    const mc = activeMap?.map_config
    if (mc?.file_path) manifest.push({ url: mc.file_path, fileSize: mc.file_size, assetId: mc.asset_id })

    // Image
    const ic = activeImage?.image_config
    if (ic?.file_path) manifest.push({ url: ic.file_path, fileSize: ic.file_size, assetId: ic.asset_id })

    // Hero image (S3-backed)
    const hero = campaignMeta?.heroImageAsset
    if (hero?.s3_url) manifest.push({ url: hero.s3_url, fileSize: hero.file_size, assetId: hero.asset_id })

    // Audio tracks (BGM + SFX slots — all have s3_url, file_size now flows through AudioChannelState)
    if (rawAudioState) {
      for (const [channelId, state] of Object.entries(rawAudioState)) {
        if (channelId === '__master_volume') continue
        if (state?.s3_url) manifest.push({ url: state.s3_url, fileSize: state.file_size, assetId: state.asset_id })
      }
    }

    // Fire all downloads simultaneously — AssetDownloadManager deduplicates by assetId
    for (const asset of manifest) {
      assetManager.download(asset.url, asset.fileSize, asset.assetId)
    }

    console.log(`🔄 Gate preload: fired batch of ${manifest.length} assets`)
  }, [dataSourcesReady, batchFired, ...])

  const downloadsComplete = batchFired && !progress.loading

  // CTA hold — 500ms at 100% before enabling click
  useEffect(() => { ... same as current ... }, [downloadsComplete, ctaReady])

  return {
    ready: downloadsComplete,
    ctaReady,
    batchFired,  // replaces manifestSettled — true = batch is fired, progress is stable
    ...progress,
  }
}
```

**Key**: `batchFired` replaces `manifestSettled`. Once the batch fires, `totalBytes` is established from the full set of downloads. No more jumps.

**Cache hit guarantee**: `AssetDownloadManager.download()` caches by `assetId` (line 112). When components mount later and call `useAssetDownload` or `loadRemoteAudioBuffer`, they hit the cache instantly — no double downloads. SFX slots referencing the same underlying S3 file are also satisfied by a single cached blob.

### 4. `rollplay/app/game/GameContent.js` — Update useGatePreload call

```javascript
const gatePreload = useGatePreload({
  campaignMeta, initialDataLoaded, wsInitialStateReceived, isAudioUnlocked,
  activeMap, activeImage, rawAudioState
})
```

### 5. `rollplay/app/game/GameContent.js` — Update progress display

Replace `gatePreload.manifestSettled` references with `gatePreload.batchFired` (same purpose — "is the total known?").

---

### 6. Cine folder preload — gate before the S3 batch

**Why**: The `/public/cine/` folder contains assets needed for CINE display mode (currently film grain GIFs, will later include web fonts and other rendering resources). Today these are preloaded by ImageDisplay *after* the gate lifts, causing a visual pop-in. By fetching the entire cine folder *before* the S3 batch fires, everything is warm in the browser cache when components mount.

**Approach**: We can't `readdir` from the browser, so we maintain a static manifest of cine assets. Plain `fetch()` primes the browser HTTP cache — when ImageDisplay (or future cine components) later reference these via `<img src>`, CSS `url()`, or `new FontFace()`, they resolve instantly.

**Cine assets are NOT tracked in the progress bar** — they're small local files, not S3 downloads. They act as a prerequisite gate: cine preload completes → *then* the S3 batch fires → progress bar runs 0→100%.

#### New file: `rollplay/app/game/cineManifest.js`

Static manifest of everything in `/public/cine/`. Single source of truth — extend this array as the folder grows (fonts, shaders, etc.).

```javascript
export const CINE_ASSETS = [
  '/cine/overlay/film-grain.gif',
  '/cine/overlay/grain_noisy.gif',
];
```

#### Updated flow in `useGatePreload.js`

The batch effect becomes async — it awaits the cine preload before firing S3 downloads:

```javascript
useEffect(() => {
  if (!dataSourcesReady || batchFired) return
  setBatchFired(true)

  const run = async () => {
    // Phase 1: Warm browser cache with local cine assets (not tracked in progress)
    await Promise.all(CINE_ASSETS.map(url =>
      fetch(url).catch(() => {})  // best-effort — don't block gate on a missing local file
    ))

    // Phase 2: Build S3 manifest and fire batch (tracked in progress bar)
    const manifest = [ /* ... same as current ... */ ]
    for (const asset of manifest) {
      assetManager.download(asset.url, asset.fileSize, asset.assetId)
    }
    console.log(`🔄 Gate preload: fired batch of ${manifest.length} assets`)
  }
  run()
}, [dataSourcesReady, batchFired])
```

#### ImageDisplay.js — future cleanup (not in scope)

ImageDisplay currently hardcodes `GRAIN_STYLE_ASSETS` and does its own `new Image()` preload (lines 33-35, 101-119). After this change, those GIFs will already be browser-cached from the gate preload, so the `new Image()` calls will resolve instantly. A future cleanup could import from `cineManifest.js` and remove the redundant preload logic, but that's not needed for correctness now.

---

## What stays the same

- `useAssetDownload` in MapDisplay, ImageDisplay, and GameContent (hero) — still mount and call the hook, but get instant cache hits from the batch
- `syncAudioState` in useUnifiedAudio — still calls `assetManager.download()` per track, gets instant cache hits
- `useAssetProgress` — still tracks byte-level progress, but now from a single stable batch
- The 500ms CTA hold at 100% — stays
- All gate UI/JSX — unchanged

## Files Changed

| File | Changes |
|------|---------|
| `rollplay-shared-contracts/shared_contracts/audio.py` | Add `file_size: Optional[int] = None` to `AudioChannelState` |
| `api-site/modules/library/domain/music_asset_aggregate.py` | Add `file_size` to `build_channel_state_for_game()` kwargs |
| `api-site/modules/library/domain/sfx_asset_aggregate.py` | Add `file_size` to `build_channel_state_for_game()` kwargs |
| `rollplay/app/game/hooks/webSocketEvent.js` | Add `setRawAudioState(audio_state)` in handleInitialState |
| `rollplay/app/game/GameContent.js` | Add `rawAudioState` state, pass to WS handlers and useGatePreload, update `manifestSettled` → `batchFired` |
| `rollplay/app/game/cineManifest.js` | **New file** — static manifest of `/public/cine/` assets |
| `rollplay/app/game/hooks/useGatePreload.js` | Replace settle timer with cine preload → manifest builder → batch download |

## Execution Order

1. **Backend first** (steps 0, 0b, 0c) — contract + aggregate changes. These are backwards-compatible (new optional field, defaults to None). Existing MongoDB documents without `file_size` still work — the manifest builder treats missing values as `undefined`, and `AssetDownloadManager` falls back to `Content-Length`.
2. **WebSocket capture** (step 1) — one line in webSocketEvent.js
3. **GameContent plumbing** (steps 2, 4, 5) — state + props + display references
4. **Cine manifest** (step 6) — new file, static array of `/public/cine/` paths
5. **useGatePreload rewrite** (step 3 + 6) — cine preload gate + batch download

## Verification

1. Throttle network (Slow 3G) — verify progress bar starts at 0% and increases smoothly to 100% with no jumps backward
2. Check console for `Gate preload: fired batch of N assets` — N should match the total active assets
3. Verify MapDisplay, ImageDisplay, and audio all still render correctly after gate dismissal (cache hits)
4. Empty session (no assets) — batch fires with 0 assets, gate shows ready immediately
5. Late joiner with full session (map + image + 4 audio channels) — all 6 assets in single batch
