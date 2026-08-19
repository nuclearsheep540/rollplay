# Avatar Asset Caching + Signed URL Stability

> **Status (2026-08-19):** **PR 1 (C) IMPLEMENTED AND QA-PASSED — the reported bug is fixed.** PR 2 (A) is **PARKED** by Matt's decision; see the note at the end of §6. Risks §9.1 and §9.6 are **resolved**. `MapImageEditor.js` was dead code and has been deleted. What was actually built is listed in §7b.
> **Trigger:** avatars in the campaign drawer's party list visibly reload when a session is started or paused.
> **Written for a fresh context window** — everything needed is in this file. No other plan is a prerequisite.

---

## 0. TL;DR for a clean context

Two independent pieces of work.

**C — bring character avatars onto the app's existing media pattern.** This is the fix for the reported bug. Avatars are the *only* S3-backed media type in the app that does not go through `AssetDownloadManager`; every other type (maps, scene images, hero images, audio, library thumbnails) already does. Four surfaces to convert. **This is conformance, not a new pattern** — that was the decisive finding.

**A — make signed URLs stable so the browser HTTP cache works.** An app-wide performance improvement in one function. It is *not* the fix for the reported bug (see §4.2). Do it because it makes page reloads cheap for every media surface including the game's preload.

Do **C** to fix the bug. Do **A** because it is a broad win. Neither depends on the other.

---

## 1. The reported bug

Matt, on the dashboard:

> "when pausing/starting campaigns the custom avatar images look like theyre re-mounting ... starting a session shouldn't recall the character data for the campaign drawer"

**It is not a remount.** `PartyMemberCard` has `key={member.user_id}`, so React reconciles and the DOM node survives. The *browser* is discarding and re-fetching an image it can no longer recognise, because the URL string changed.

### Root cause chain (verified 2026-08-19)

1. Session start / pause / finish / create / delete each call `queryClient.invalidateQueries({ queryKey: ['campaigns'] })` — five sites in `rollplay/app/dashboard/hooks/mutations/useSessionMutations.js`.
2. The campaigns query refetches. That response embeds `members[]`, each carrying `character_avatar_url`.
3. `_resolve_member_avatar_urls` (`api-site/modules/campaign/api/endpoints.py:91-102`) re-signs every member avatar on every request.
4. `S3Service.generate_download_url` (`api-site/shared/services/s3_service.py:115-148`) computes `expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl)` — **a fresh timestamp per call**. CloudFront's `Expires` and `Signature` live in the query string.
5. The same unchanged image therefore returns under a **different URL string on every fetch**. The card puts it straight into `backgroundImage`; the browser sees an unfamiliar URL and re-downloads it.

### The compounding second flicker

`useImageFocalPosition` (`rollplay/app/shared/hooks/useImageFocalPosition.js`) has `url` in its effect deps and calls `setNaturalDims(null)` at the top of the effect. A new URL therefore resets the probe → the hook returns `undefined` → the card falls back to `bg-center` → the probe resolves → the framing jumps back to the focal point.

So each session action makes the avatar **reload and re-frame**.

**This needs no separate fix.** It is downstream of the URL churn. Feed the hook the same stable URL the CSS uses and it stops — see §5.2. Do *not* add "keep the last dims" state to the hook; its reset is correct behaviour for a genuinely new image, and the problem was only that a re-signed URL *looked* new.

### Matt's architectural observation, and why it isn't the fix

> "starting a session shouldn't recall the character data for the campaign drawer"

Fair, but the campaign response legitimately embeds both `members[]` and `sessions[]` in one payload, so there is no way to invalidate the session part alone without splitting the query. **Matt explicitly rejected splitting it** (large blast radius; sessions belong with the campaign). More importantly the invalidation is the *trigger*, not the *cause* — a legitimate refetch should not cause a visible reload of an image that has not changed.

---

## 2. The decisive finding — an app-wide media audit

This is the section that settled the design. Every S3-backed media surface in the frontend, classified:

| Surface | Media type | Pattern |
|---|---|---|
| `map_management/components/MapDisplay.js:82` | map images | `useAssetDownload` ✅ |
| `map_management/components/ImageDisplay.js` | scene images | `useAssetDownload` ✅ |
| `game/GameContent.js:361` | game hero image | `useAssetDownload` ✅ |
| `dashboard/components/HeroBackground.js:17` | campaign hero | `useHeroImage` → `useAssetDownload` ✅ |
| `audio_management/components/VerticalChannelStrip.js` | audio | `useAssetDownload` ✅ |
| `game/hooks/useGatePreload.js` | preload | `useAssetManager` ✅ |
| `workshop/hooks/useWorkshopMixEngine.js` | audio | `useAssetManager` ✅ |
| `game/components/MapSelectionModal.js` | thumbnails | `S3Image` ✅ |
| `game/components/ImageSelectionSection.js` | thumbnails | `S3Image` ✅ |
| `dashboard/components/CampaignManager.js:2176` | asset thumbnail | `S3Image` ✅ |
| **`dashboard/components/CampaignManager.js`** party wedge | **avatar** | **raw signed URL ❌** |
| **`dashboard/components/CharacterManager.js`** strip card | **avatar** | **raw signed URL ❌** |
| **`dashboard/components/CharacterSelectionModal.js`** choice card | **avatar** | **raw signed URL ❌** |
| **`(authenticated)/character/components/CharacterAvatarPane.js`** | **avatar** | **raw signed URL ❌** |

**Four non-conforming surfaces, and they are all the same media type: character avatars.**

*Verified 2026-08-19.* Two footnotes on the table's completeness, neither of which weakens it:

- `MapImageEditor.js` was checked as a possible fifth entry (§9.1) and turned out to be **dead code** — deleted. It is not in the table because it never rendered.
- The table covers *rendering* surfaces. One **probe-style** raw-URL usage exists outside it: `ImageDimensions` in `game/components/MapControlsPanel.js:42` sets `img.src = activeMap.map_config.file_path` to read natural dimensions. It does not have the churn problem (`file_path` comes from game state, stable within a page session) and it renders nothing. **Out of scope — noted so the next audit doesn't rediscover it as a finding.**

Note also that **`CharacterManager.js` hosts two of the four surfaces** — the strip card wedge (`:82`, `:90`) and the expanded `CharacterAvatarPane` (`:587`). Convenient for PR 1: one file, two conversions.

Avatars shipped in release 0.61.0 (tokens v3, "Character Token Avatars"), days before this investigation. Every earlier media type was wired through the manager. Avatars skipped it because they were new and the payloads were shaped before avatars existed — the campaign drawer originally rendered `/heroes.png` for everyone, with a code comment saying *"Swap `/heroes.png` for a per-character portrait once character image uploads exist."*

### The precedent that proves this is conformance

`rollplay/app/dashboard/hooks/useHeroImage.js` — **in the dashboard**, uses `useAssetDownload`, keyed by `asset_id`, and its docstring states:

> *"Returns a background-image-ready URL for a campaign's hero image … `url` is suitable for CSS `backgroundImage: url(${url})`"*

This answers the obvious objection that `S3Image` renders an `<img>` and a clip-path wedge needs `background-image`. That is precisely why `useHeroImage` exists as a **hook** rather than a component. The pattern for "S3-backed CSS background, blob-cached by asset id, with a not-ready state" is already established, already in the dashboard, and already in use.

**Conclusion: C is bringing the last media type into line. It is not a new pattern and it is not dashboard-specific** — two of the four surfaces are in the character slice.

---

## 3. Verified facts

Established by reading code on 2026-08-19. A fresh context can trust these without re-deriving, but should spot-check anything it intends to depend on.

**Signing / caching**
- `PRESIGNED_URL_EXPIRY=86400` (24h) — `env.example:67`, `dev.env:61`.
- Uploads set `CacheControl: 'public, max-age=31536000, immutable'` (`s3_service.py:105`). **The bytes are already declared cacheable for a year; only the changing query string defeats the browser cache.**
- `generate_download_url` has **seven call sites** outside `s3_service.py`: `library/api/endpoints.py:91`, `:1165`; `campaign/api/endpoints.py:79`, `:100`; `characters/api/endpoints.py:159`; `session/application/commands.py:325`, `:429`.

**AssetDownloadManager** (`rollplay/app/shared/providers/AssetDownloadManager.js`)
- Cache key is `assetId || url`; `useAssetDownload`'s effect deps are `[stableKey, manager]`. Its own comment: *"Use assetId as the stable dependency when available — the URL changes (presigned signature) but the asset doesn't, so we don't re-download."*
- `AssetDownloadProvider` is mounted in **root `layout.js`**, so the dashboard is already inside it. No provider move needed.
- **No eviction.** Only `cacheRef.current.set` — no delete, no clear. The cache grows for the page session and dies on reload.
- **`fileSize` is optional.** Falls back to `Content-Length`, then `blob.size`.
- Downloads with a plain `await fetch(url)`, so it **respects the browser HTTP cache**.
- On failure it falls back to the raw URL: `setBlobUrl(url); setReady(true)`. The comment names CDN CORS as the typical cause — *"which fetch() is subject to but `<img>` embedding is not."*
- `useAssetProgress` is consumed **only in the game slice** (`GameContent`, `useGatePreload`), so routing dashboard avatars through the manager lights up no dashboard UI.

**Query config** (`rollplay/app/shared/providers/QueryProvider.js`)
- `staleTime: 30s`, `gcTime: 5min`, `refetchOnWindowFocus: **false**`, `retry: 1`.
- So window focus is *not* a refetch trigger. Refetches come from mount and from explicit invalidation only.

**Payload shapes**
- `CampaignMemberResponse` (`api-site/modules/campaign/api/schemas.py:48-64`) carries `character_avatar_url` and `character_avatar_focal_area` — **no asset id**. `_resolve_member_avatar_urls` pops `character_avatar_s3_key` and replaces it with the signed URL.
- `CharacterResponse` **does** carry `avatar_asset_id` (added in tokens v3). So `CharacterManager`, `CharacterSelectionModal` and `CharacterAvatarPane` need **no backend change**.

---

## 4. Deciding factors

Recorded because the reasoning moved several times and a fresh context should not re-tread it.

### 4.1 Why the invalidation is not the thing to fix

Rejected: splitting sessions out of the campaigns query. Matt's call — large blast radius, and the campaign payload legitimately owns its sessions. It would also only reduce refetch *frequency*, not stop an unchanged image from reloading when a refetch does happen.

### 4.2 Why A does not fix the reported bug — and the wrong turn taken

**A was proposed, rejected, revived, and demoted again.** The sequence matters:

1. Proposed as "bucket the expiry to 5 minutes so repeated signings inside the window are identical".
2. **Matt rejected it correctly:** *"a user might easily leave their dashboard open for more than 5 minutes before starting a session, so we're only moving the problem not fixing it."*
3. Revived on discovering the `immutable, max-age=1yr` header — a stable URL gets a browser cache hit with zero network, **and survives page reloads**, which the blob cache cannot.
4. **Demoted again on Matt's challenge** (*"does A fundamentally change how this request works in comparison to the rest of our app?"*), which is what prompted the §2 audit.

**Settled position: any wall-clock-derived signing scheme has a boundary.** Bucket to the hour and the flicker returns once per hour, on whichever action happens to land first after a boundary — appearing uncorrelated with what the user did, which is arguably *worse to live with* than a reproducible bug. Only a cache key that is not time-derived (`assetId`) removes it.

A remains worth doing. It is simply a **performance improvement, not this bug's fix.**

### 4.3 Why C is conformance rather than special-casing

See §2. The audit is the argument. An intermediate claim that "C is borrowing a game preloader for surfaces that need no preloading" **was wrong** and should not be revived — `useHeroImage` disproves it: the dashboard adopted this exact pattern independently, for background images specifically.

### 4.4 Why the shared unit is a hook, not a component

Matt favoured a reusable `AvatarWedge`. With four surfaces the extraction is justified, **but the wedge geometry is not shared**: `CharacterAvatarPane` uses `WEDGE_INNER_SHADOW` and a different shape from the three card wedges.

So the reusable unit is a **hook** mirroring `useHeroImage` — blob URL + focal position + ready state — used by all four. An `AvatarWedge` component can sit on top for the card surfaces that genuinely share geometry. Decide the component's exact shape with the code in front of you; the hook is the part that is certain.

**RESOLVED at implementation, 2026-08-19 — it is two surfaces, not three.** With the code side by side:

- `PartyMemberCard` and `CharacterChoiceCard` were **byte-identical**, explanatory comments included (`width: 42%`, `polygon(33% 0, 100% 0, 100% 100%, 0 100%)`, the same 105° scrim). The modal's own comment already said *"same diagonal as the campaign party cards"*. Extracted → `dashboard/components/shared/AvatarWedge.js`.
- `CharacterStripCard` does **not** share it — it is a parallelogram (`STRIP_SLANT_CLIP` / `STRIP_FIRST_CLIP`) clipped on the *button*, with a flat two-stop overlay rather than the diagonal scrim, plus greyscale-at-rest, hover-zoom, and an `isResizing` transition guard. It uses the hook directly.
- `CharacterAvatarPane` likewise keeps its own `WEDGE_CLIP` / `WEDGE_INNER_SHADOW` full-pane shape.

So the split is exactly as §4.4 predicted in kind — hook is the shared unit, component sits on top only where the shape repeats — just across **2 of 4** surfaces rather than 3.

---

## 5. Design

### 5.1 — C: bring avatars onto the blob manager

**Backend (campaign drawer only).** Add `character_avatar_asset_id` to the member dict in `GetCampaignMembers` (`api-site/modules/campaign/application/queries.py`) and to `CampaignMemberResponse`. Read it off the already-loaded `avatar_asset` (`lazy="joined"`), exactly as `character_avatar_focal_area` does — no extra query, no migration, and **no shared-contract change** (these are api-site schemas, not `shared_contracts`), so no version bump and no api-game rebuild.

**Frontend — a shared hook mirroring `useHeroImage`:**

```js
// Sketch. Mirrors dashboard/hooks/useHeroImage.js deliberately.
export function useAvatarImage(avatarUrl, avatarAssetId, focalArea) {
  const { blobUrl, ready } = useAssetDownload(avatarUrl, undefined, avatarAssetId);
  const stableUrl = ready && blobUrl ? blobUrl : null;
  // Feed the focal probe the STABLE url — this is what stops the re-framing.
  const focalPosition = useImageFocalPosition(stableUrl, focalArea);
  return { imageUrl: stableUrl || DEFAULT_AVATAR, focalPosition, ready };
}
```

Two things this must get right, both load-bearing:

- **Feed `useImageFocalPosition` the blob URL, not the presigned one.** That is what stops the re-framing jump (§1). Passing the raw URL leaves the image pinned while the framing still moves — a confusing half-fix that looks like the work did not land.
- **Fall back to `/heroes.png` while `!ready`.** The blob manager is all-or-nothing, so without a fallback the wedge renders blank until the download completes. Today it streams in progressively; this is a **real first-paint behaviour change** and the placeholder is what makes it acceptable.

**Four consumers:**

| Surface | Asset id source | Backend change |
|---|---|---|
| `PartyMemberCard` (CampaignManager) | new `character_avatar_asset_id` | **yes** |
| `CharacterStripCard` (CharacterManager) | `char.avatar_asset_id` | no |
| `CharacterChoiceCard` (CharacterSelectionModal) | `char.avatar_asset_id` | no |
| `CharacterAvatarPane` | `avatar_asset_id` passed in by its **three** callers (enumerated below) | no (already on `CharacterResponse`) |

`CharacterAvatarPane` currently receives only `avatarUrl` as a prop; its call sites need to pass the asset id through. **Audited 2026-08-19 — there are exactly three, and all three already have `avatar_asset_id` on the wire:**

| # | Call site | Data source | Threading |
|---|---|---|---|
| 1 | `CharacterWizard.js:435` → `WizardChrome.js:211` → pane | `draft` (draft / finalize routes) | **2 hops** — needs a new prop on `WizardChrome` |
| 2 | `(authenticated)/character/[id]/page.js:70` | `useCharacterDraft(id)` → `GET /api/characters/{id}` | 1 hop — direct |
| 3 | `dashboard/components/CharacterManager.js:587` | `useCharacters` → `GET /api/characters/me` | 1 hop — direct |

Every character route declares `response_model=CharacterResponse`, and `_to_character_response` populates the field at `characters/api/endpoints.py:250` (`avatar_asset_id=character.avatar_asset_id`). **So no backend change for any of the three.**

The wizard is the only one needing real threading, and it is the easy case: `CharacterWizard` already reads `draft?.avatar_asset_id` at `:337` and `:440` for the crop flow, so it is a one-line prop add in the same JSX block that already passes `avatarUrl`.

### 5.2 — A: bucketed expiry (api-site only, separate PR)

`S3Service.generate_download_url` rounds `expires_at` **down to a fixed interval**, so every call inside that interval produces a byte-identical URL:

```python
# Sketch, not final
ttl = expiry or self.expiry
now = datetime.now(timezone.utc)
bucket_seconds = self.url_bucket_seconds          # config, suggest 6h
bucket_start = datetime.fromtimestamp(
    (now.timestamp() // bucket_seconds) * bucket_seconds,
    tz=timezone.utc,
)
expires_at = bucket_start + timedelta(seconds=ttl)
```

- **Bucket size is config.** Suggested default 6h: at most four boundaries a day, and effective validity stays 18–24h.
- **The bucket must stay well under the TTL.** A URL signed just before a boundary loses up to one bucket of life. With a 24h TTL and 6h buckets the worst case is 18h — fine. Bucketing *at* the TTL would produce already-expired URLs.
- Applies to all seven call sites automatically.
- **Bonus:** the manager's `assetId || url` fallback starts working for consumers that pass no asset id, since `url` becomes a stable key. And its plain `fetch()` starts hitting the browser disk cache — **the game's preload gets faster on repeat visits**, which is a bigger win than the dashboard fix that prompted this.

**Needs Matt's sign-off before building:** with bucketing, every user fetching the same asset in the same window receives an **identical URL**, rather than a per-request unique one. These are bearer tokens either way and authorisation already happened at the API layer, so the delta looks immaterial — but it is a deliberate change from the current behaviour and should be agreed, not discovered.

---

## 6. PR sequence

| PR | Contents | Notes |
|---|---|---|
| **1 — Avatar asset caching (C)** | §5.1: `character_avatar_asset_id` on the member payload; `useAvatarImage` hook; four surfaces converted; `AvatarWedge` for the two identical card wedges. **Fixes the reported bug.** ✅ **IMPLEMENTED 2026-08-19 — awaiting QA.** | api-site + frontend. No migration, no shared-contract change. |
| **2 — Bucketed signed URLs (A)** | §5.2: bucketed expiry + config knob. **Performance, not a bug fix.** ⏸️ **PARKED 2026-08-19 — Matt's call, see below.** | api-site only, but touches every media surface in the app. Needs the §5.2 sign-off. |

No ordering dependency — either can go first.

**Already landed on the `avatar-asset-cache` branch, ahead of PR 1:** deletion of the dead `map_management/components/MapImageEditor.js` (§9.1). Unrelated to the fix itself — it rode along because the audit is what proved it dead.

### PR 2 parked (2026-08-19)

PR 1 shipped and **passed QA — the reported bug is fixed.** Matt's call to park A there.

The reasoning, so it is not re-litigated a fourth time (§4.2 already records three swings):

- **A is not conformance, and this was verified, not assumed.** `generate_download_url` is the app's *only* download-signing path, and nothing anywhere buckets expiry today. So A would be a genuinely new behaviour on that path — it does **not** inherit the "every other media surface already does this" argument that justified C. Applying uniformly to all seven call sites is a property of the change, not evidence of precedent.
- **A's win is speculative; C's was reported.** The avatar reload came from actual use. Nobody has complained about reload-time cost, and with C shipped the observed symptom is gone.
- **A carries its own costs:** a per-window boundary where the flicker briefly returns (uncorrelated with user action, hence arguably worse to live with than a reproducible bug), and identical URLs across users inside a window.

**Revisit when there is something concrete to measure** — most likely repeat-visit cost in the game's gate preload, not the dashboard. The §5.2 design and the §8 seven-call-site test plan stand as written; only the trigger is missing. The §5.2 sign-off has **not** been given.

---

## 7. What we will NOT build

- **No change to `useImageFocalPosition`.** Its reset is correct for a genuinely new image; the fix is to stop handing it URLs that only *look* new (§1).
- **No splitting sessions out of the campaigns query** (§4.1) — Matt's explicit call.
- **No server-side signed-URL cache.** Same wall-clock boundary as bucketing, with added state to manage.
- **No eviction policy for the blob cache.** It has none today; adding one for this feature alone is scope creep. Logged as a risk in §9 instead.
- **No `S3Image` adoption on these surfaces** — it renders an `<img>` and the wedges need `background-image`. `useHeroImage` is the right precedent, not `S3Image`.

---

## 7b. What was actually built (PR 1, 2026-08-19)

| File | Change |
|---|---|
| `campaign/application/queries.py` | `character_avatar_asset_id` on the member dict, guarded on `avatar_asset` so it stays in lockstep with the s3-key and focal-area fields |
| `campaign/api/schemas.py` | same field on `CampaignMemberResponse` |
| `shared/hooks/useAvatarImage.js` | **new** — the shared unit; also the single home for `DEFAULT_AVATAR` |
| `dashboard/components/shared/AvatarWedge.js` | **new** — the wedge shared by the two identical card surfaces |
| `dashboard/components/CampaignManager.js` | `PartyMemberCard` → `AvatarWedge` |
| `dashboard/components/CharacterSelectionModal.js` | `CharacterChoiceCard` → `AvatarWedge` |
| `dashboard/components/CharacterManager.js` | `CharacterStripCard` → hook directly; pane call site threads the id |
| `character/components/CharacterAvatarPane.js` | new `avatarAssetId` prop; uses the hook |
| `character/components/CharacterWizard.js` + `wizard/WizardChrome.js` | id threaded through the one intermediate component |
| `character/[id]/page.js` | pane call site threads the id |

**Pre-QA verification already done:**
- `next lint` on all ten touched files — no new warnings (the ones it reports are pre-existing `exhaustive-deps` in unrelated code).
- Backend probed in `api-site-dev` against real data: a character with an avatar returns `asset_id`, `focal_area` and a signed `url` together, and the dict validates cleanly through `CampaignMemberResponse`.
- **Dev CDN CORS probed** (`d3prsa4h53bww8`): `ACAO: *` for localhost, 127.0.0.1 and no-Origin, on both cache hits and misses. This is the §9.3 risk — it is clear on dev, so the blob fetch will succeed and caching will genuinely engage rather than silently falling back to raw URLs.

`/heroes.png` had been duplicated as a literal across all four surfaces; it now exists once, in the hook.

## 8. Verification

**PR 1 (C)**
- Start, pause and finish a session with the campaign drawer open → party avatars neither reload nor re-frame.
- Same for every other campaigns invalidation: invite accept/decline, remove player, release character, create/delete session.
- Dashboard character strip, character-selection modal, and the character avatar pane (wizard, drawer, sheet) likewise.
- A player with no avatar still shows `/heroes.png`.
- Changing an avatar (new `avatar_asset_id`) still swaps the image — the cache must not stale-lock.
- First load shows `/heroes.png` then the avatar, with no blank wedge.
- Focal-cropped avatars hold their framing throughout, with no centre-then-jump.

**PR 2 (A)**
- Two consecutive campaigns fetches inside one bucket return byte-identical avatar URLs.
- Fetches either side of a boundary differ, and both work.
- **All seven call sites exercised:** library assets, campaign hero images, member avatars, character avatars, and both session-ETL signing paths — i.e. maps, audio, scene images and hero images all still load in-game.
- Devtools shows a disk-cache hit on the second page load of an unchanged asset.

---

## 9. Open items / risks

1. ~~**`MapImageEditor.js` may be a fifth non-conforming surface.**~~ **RESOLVED 2026-08-19 — it was dead code, and has been deleted.** Repo-wide grep found only its own `const MapImageEditor = ...` and `export default` — no import anywhere, no `next/dynamic` or `React.lazy` in the slice, and it was absent from `map_management/index.js`. It imported nothing but React, so the deletion orphans nothing. Last touched in `94efec6` (#124). `.claude/plans/tokens/01-token-system.md:60` had already recorded it as dead; this confirms it. **It is not a fifth surface — the §2 conclusion stands unweakened.**

2. **Blob cache growth.** No eviction, so every avatar viewed is retained for the page session. Small individually, unbounded across heavy dashboard browsing. It shares the pool the game preloader uses, so it inflates `cachedCount`/`cachedSize` — invisible on the dashboard, but the same budget.

3. **CORS fallback degrades silently.** If `fetch()` fails — the manager's own comment names CDN CORS, and this project has hit exactly that on CloudFront before — it falls back to the raw URL. The flicker does **not** return (the effect still does not re-run), but blob caching is lost for that asset. **If PR 1 appears not to work, check this first** rather than re-investigating the URL churn.

4. **Unmount/remount mints a new object URL.** The cleanup revokes it, so collapsing and re-expanding the drawer re-creates it from the cached blob. **No network**, just a re-decode from memory — almost certainly imperceptible, but it is why C is "no flicker within a page session" rather than literally never.

5. **Page reload is unaffected by C.** The blob cache is in-memory. That gap is exactly what A closes — the argument for eventually doing both.

6. ~~**`CharacterAvatarPane` call sites** need auditing to pass the asset id through.~~ **RESOLVED 2026-08-19 — audited; three call sites, enumerated in §5.1.** All three already carry `avatar_asset_id` (every character route returns `CharacterResponse`, which populates it), so **no backend change**. Only the wizard needs prop-threading, through one intermediate component. Nothing hidden, no dynamic call sites.
