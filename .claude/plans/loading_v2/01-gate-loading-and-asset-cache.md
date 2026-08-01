# Loading v2 — Gate Preload Scope + Asset Storage Architecture

**Goal:** Decide (and then build) what the game gate's "loading" actually covers, and where asset
bytes live (RAM vs disk) across a session's lifetime. Split out of
`.claude/plans/spotify/03-gate-gesture-race.md` (2026-08-01) — that plan ships the Spotify
gesture fix on its own; this one owns everything discovered in the loading audit.

**Origin:** Matt's realisation that "session-scoped assets" was never a real concept — the gate
was built while that misconception was live, and what shipped is "active-at-join-scoped".

---

## Audit — what the gate downloads today, and where every byte lives

The manifest (`useGatePreload.js` batch builder) is derived from the Mongo `active_session`'s
*current* state at join time:

| Asset | Gate downloads? | Compressed bytes | Decoded/big form | Held until |
|---|---|---|---|---|
| CINE transition assets (local `/public`) | warmed via plain `fetch` | browser HTTP cache (**disk**) | browser-managed | browser's call |
| Active map (S3) | yes | blob cache (**RAM**) | decoded bitmap — **browser-managed**, evictable, re-decoded on demand | page close (blob) |
| Active scene image (S3) | yes | blob cache (**RAM**) | same | page close (blob) |
| Campaign hero image (S3) | yes (gate card itself) | blob cache (**RAM**) | same | page close (blob) |
| Slotted BGM tracks (S3) | yes | blob cache (**RAM**) | PCM in engine buffer Map (**app-held RAM**, ~21MB/min stereo; ~85MB per 4-min track) — decoded at gate only if playing/paused | page close — **never evicted on track swap** |
| SFX slot tracks (S3) | yes | blob cache (**RAM**) | PCM, always pre-decoded | slot clear |
| Everything else in the campaign library | **no** | — | — | — |

Consumption paths: images/maps → `useAssetDownload` → `URL.createObjectURL(blob)` → `<img>`
(`AssetDownloadManager.js:234-276`); audio → `loadRemoteAudioBuffer` → `blob.arrayBuffer()` →
`decodeAudioData` → engine buffer Map (`useUnifiedAudio.js:356-377`). `decodeAudioData` is
all-or-nothing by spec — no progressive decode exists in Web Audio; streamed alternatives
(`<audio>`/MSE/MediaElementSource) can't do sample-accurate offsets, loop regions, or the effect
chain, which is why the engine is buffer-based on purpose (the library tab's previews DO stream).

### Key asymmetry (drives every decision below)

For **images**, the expensive form (decoded bitmap, w×h×4 — a 4096² map ≈ 67MB) is
*browser-managed*: decoded at render, discarded under pressure, silently re-decoded from our
blob. We durably hold only the compressed file. Hoarding all campaign images ≈ sum of file
sizes, bounded.

For **audio**, *both* forms are app-held: the compressed blob AND the decoded PCM. Preloading
never decodes (blob cache only), so preload cost = compressed size, but every track *slotted*
during the session adds ~85MB PCM that today is never freed.

### Confirmed problems

1. **PCM buffer leak (pre-existing):** the engine's buffer Map (`AudioEngine.js:47`) has NO
   eviction on BGM track swap — only `clearSfxSlot` prunes (`useUnifiedAudio.js:1619-1628`).
   Strong refs → GC can't collect. A DM churning music accumulates ~85MB/track for the session.
2. **Blob cache never evicts** during page life (plain Map, add-only).
3. **Reload/tab-close = full re-download.** Blob cache is JS memory; presigned URLs are unique
   per request (signature query params) so the browser HTTP cache never hits. 1GB campaign →
   1GB re-download on every F5.
4. **The progress bar is blind to non-manifest downloads** (observed during 03 QA, 2026-08-01):
   - **Character/token avatar images** — live against `character.avatar`, NOT as
     campaign-taggable library assets, so no campaign-asset query returns them. Tokens v2 added
     them after the gate was designed; `TokenAvatarDisc` downloads them behind the gate,
     untracked. Fix: separate lookup via `GET /api/characters/party/{campaign_id}` (already
     returns presigned `avatar_url` per character) merged into the manifest. Wrinkle: avatars
     have **no assetId**, and the download manager's cache key falls back to the URL — which
     rotates per presign, so caching/dedup silently never hits. Needs a synthetic stable key
     (e.g. `character:{id}:avatar`).
   - **CORS-fallback assets lose tracking AND double-download**: a `fetch` that fails CORS falls
     back to direct `<img>` embedding — no byte progress, no blob cache, and the asset transfers
     twice. **Root-caused + FIXED 2026-08-01**: the July SimpleCORS fix was partial —
     SimpleCORS never overrides an origin-supplied ACAO, S3's origin-list config echoed the
     requester's origin, and CloudFront cached that echo with no `Vary: Origin` → whoever
     requested first poisoned the edge copy for everyone (Origin-less `<img>` requests poisoned
     it with no ACAO at all). Custom override policies are Business-plan-gated, so the fix was
     at the origin: prod bucket CORS `AllowedOrigins: ["*"]` (S3 answers a constant `ACAO: *`,
     cache-safe; security unaffected — signed URLs are the boundary, verified by probe:
     stripped/tampered/direct-S3 all 403) + `/*` invalidation. Verified: `ACAO: *` on image +
     audio for localhost / 127.0.0.1 / prod / no-Origin, hits and misses. SimpleCORS stays
     attached as backstop. **Dev bucket needs the same wildcard CORS when the separation lands.**
   - CINE warmup is untracked by design (browser HTTP cache).
5. **Mid-gate/mid-session changes are correct but cold** (no dynamic warm-up):
   - DM loads a BGM track → follower's `loadAssetIntoChannel` updates state/effects only —
     **no download** (`useUnifiedAudio.js:1447-1511`).
   - DM *plays* a track pre-unlock → `playRemoteTrack` queues the pending op **before** any
     download (`useUnifiedAudio.js:504-526`) — the download+decode cost lands after the user
     clicks Enter (audible late start).
   - SFX slot loads are the exception: `loadSfxSlot` pre-fetches immediately
     (`useUnifiedAudio.js:1530-1533`).
   The on-demand layer guarantees *correctness* (dedup by assetId, downloads when needed), not
   *readiness*.

---

## Design space

### 1. Preload shape (what blocks the CTA) — DECISION PENDING

- **(a) Block everything** — gate downloads the full campaign library
  (`GET /api/library/?campaign_id=` has signed url + size + id per asset; the metadata endpoint
  `GET /api/library/campaigns/{id}/metadata` gives count + total bytes for honest bar totals).
  Marginal RAM = compressed library size only (preload never decodes). Also **dissolves most of
  the mid-gate race surface**: any library asset the DM swaps to is already in the blob cache —
  load-on-play becomes decode-only. Only brand-new mid-session uploads stay cold. Cost: gate
  time and RAM scale with library size; re-download per join/refresh until the disk tier lands.
- **(b) Tiered** — block on [active audio + all images/maps] (correct entry + cheap wins),
  background the un-slotted audio tail through the same manager (dedup makes a mid-download
  request a piggyback). Faster gate; adds a background-sync presentation concept.
- **(c) Size-guard hybrid (the boring middle)** — metadata endpoint returns total bytes before
  the gate fires: under threshold → (a); over → (b). One `if`, not a clever system.

Matt leans (a); his only concern is time/size, which (c) bounds. RAM concern is bounded by the
preload-never-decodes fact + the disk tier below.

### 2. Persistence tier — AGREED direction (Matt, 2026-08-01): IndexedDB

- **IndexedDB over Cache API**: IDB stores Blobs keyed naturally by `assetId`; Cache API keys by
  URL and fights the rotating presigned signatures.
- Read-through inside `AssetDownloadManager`: RAM Map → IDB → network. Write-through on
  download completion. RAM layer can then be bounded/LRU'd since IDB backstops it.
- **Performance reality (the question that mattered):** playback NEVER runs from disk — the
  mixer always plays decoded PCM from RAM; that is untouched. IDB replaces only the network hop:
  disk read ~10–50ms for a typical 5–15MB track (~100–300ms even for 100MB) vs seconds of
  network; `decodeAudioData` (~100–500ms, async) dominates the load path either way. Warm-feel
  is preserved; cold-feel improves dramatically across reloads.
- Caveats: best-effort storage (quota, browser eviction, private windows) → network remains the
  fallback; request `navigator.storage.persist()`; add our own eviction policy (LRU, per-campaign
  grouping) so we're a good citizen.

### 3. Hygiene (independent, cheap, do regardless)

- **Evict decoded PCM on BGM track swap**: `loadAssetIntoChannel` already detects
  `prevAssetId !== newAssetId` — call `engine.clearBuffer` for the outgoing key there (mirror of
  the `clearSfxSlot` pattern). Bounds the leak to "currently slotted tracks".
- Consider a soft cap/LRU on the engine buffer Map as a second seatbelt.

### 4. Manifest completeness (do with whichever preload shape wins)

- Add **character avatars** to the manifest: fetch `GET /api/characters/party/{campaign_id}`
  alongside the campaign asset list, push each `avatar_url` with a synthetic stable cache key
  (`character:{id}:avatar`) since there's no assetId and presigned URLs rotate.
- Root-cause the **localhost CORS failure** so the `<img>` fallback (untracked, double
  transfer) becomes the exception it was designed to be, not a silent steady state.

## Open decisions

1. Preload shape (a)/(b)/(c) — and threshold value if (c).
2. IDB eviction policy (LRU bytes cap? per-campaign purge on campaign leave?).
3. Does the gate bar acknowledge background tier-2 sync if (b)/(c)?

## Out of scope

- The Spotify gesture/boot sequencing — shipped separately via
  `.claude/plans/spotify/03-gate-gesture-race.md`.
- Progressive/streaming audio decode (WebCodecs) — rejected; the buffer-based engine is a
  deliberate trade for sample-accuracy, loops, and effects.
