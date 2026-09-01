# Implementation — News media scoping: self-contained article folders + shared library

> Follow-on to [step-02-news-and-pulse.md](step-02-news-and-pulse.md), which shipped news
> with a single flat image directory (D8/D17). QA surfaced the design problem that
> directory creates: **every image is shared with every article whether you meant it or
> not**, so deleting one is never a local act and a post can never own its own art.
>
> Settled with Matt 2026-08-31 (this conversation). Supersedes D8's "images live in
> `news_media/images/`, deliberately shared across posts" and D17's upload target.
>
> Scope: S3 layout, the image endpoints, the editor's image browser, and a new
> move-between-scopes operation. No change to authoring, publishing, likes, reads,
> banners-as-a-concept, or Home.

## Ground truth from the sweep (2026-08-31, file:line)

1. **One flat prefix today.** `NEWS_PREFIX = "news_media"` /
   `NEWS_IMAGE_PREFIX = f"{NEWS_PREFIX}/images"` at
   `modules/news/application/commands.py:21-22`; `post_document_key()` at `:25-27` puts
   the doc at the **root** of `news_media/`. Five call sites total (`endpoints.py:152,208`,
   `commands.py:43,125,171,230,237`).
2. **Delete already scans every post.** `DeleteNewsImage.execute()`
   (`commands.py:161-181`) loops `news_repo.get_all()` and refuses via `ImageInUseError`
   when any post's `uses_image()` matches. That scan is the price of sharing — it stays,
   and becomes the reusable core of the move rules.
3. **The delete guard is one `startswith`** (`commands.py:171`): the only thing stopping
   the image endpoint from deleting arbitrary bucket objects. Under two scopes it must
   accept both shapes **and** keep refusing the article document.
4. **Post delete removes only the JSON.** `DeleteNewsPost.execute()`
   (`commands.py:112-131`) deletes `post_document_key(post_id)`; every image the post ever
   used survives forever, because under a shared directory none can be assumed dead.
5. **Restore filters on "root-level `.json` not under images/"**
   (`commands.py:230-238`). `_document_to_aggregate()` (`:245`) reads the id from
   `document["id"]` — **never from the filename**, so the document's name is free.
6. **The aggregate already answers the read half.** `collect_image_keys(node)` (module
   function) and `uses_image(key)` (method) at
   `modules/news/domain/news_post_aggregate.py:16,209`; `banner_keys()` at `:224`.
   There is no write-side equivalent (nothing rewrites a key).
7. **`S3Service` has no copy.** `generate_upload_url`, `generate_download_url`,
   `delete_object`, `object_exists`, `list_objects`, `put_object_json`, `get_object_json`,
   `generate_key` (`shared/services/s3_service.py`). A move needs `copy_object`.
8. **`list_objects` is a single unpaginated page** (`s3_service.py:190-231`, capped at
   1000 keys, `IsTruncated` unread). Per-article folders raise the key count under
   `news_media/` — noted, not acted on: a hand-authored news feed is orders of magnitude
   below the cap, and the restore listing is the only caller that walks the whole prefix.
9. **Two surfaces list images, both already share the delete control.**
   `NewsImageRail.js` (editor sidebar, click-to-insert + drag-to-banner) and
   `NewsImagePicker.js` (modal, click-to-insert) both render
   `NewsImageDeleteControl.js` — the precedent for factoring shared image-grid behaviour
   rather than duplicating it.
10. **An article always has an id before any upload.** The index creates then routes
    (`(authenticated)/news/editor/page.js:30-35`), so there is no unsaved-new-post state
    and article-scoped uploads always have a folder to land in.
11. **`updated_at` is a tiebreaker in the editor index** (`news_repository.py:46-50`:
    published asc, published_at desc nullslast, updated_at desc) — so whether a move
    bumps it is visible, not cosmetic.
12. **Dev content is exactly three references**, verified against `postgres-dev`:
    `banner_home_top` → `news_media/images/303b707b_banner-top.png`,
    `banner_article_bottom` → `news_media/images/49a4845f_banner-bottom.png`, and one
    inline image node → `news_media/images/63a3704b_Screenshot2026-08-31at13.52.52.png`.
    One post, `45fb72ae-693e-4099-b68d-0e2dadbd7a73`. Nothing in prod.
13. **No frontend test suite** — every test in this plan is api-site pytest.

## Decisions — SETTLED by Matt 2026-08-31

| # | Decision | Outcome |
|---|---|---|
| E1 | Two scopes | An image is **shared** (`news_media/shared_images/`, any article may reference it) or **article-scoped** (loose in `news_media/{article_id}/`, belongs to that article). Scope is chosen at upload, not derived |
| E2 | Article folders | Self-contained: the TipTap document and the article's own images live together under `news_media/{article_id}/` |
| E3 | Document filename | **`article.json`**, not `post.json` — "post" reads as the REST verb. The id lives on the folder; restore reads it from `document["id"]` regardless (GT5), so the name is for humans |
| E4 | Domain vocabulary | Unchanged — `NewsPostAggregate`, `news_posts`, `/api/news`. `article.json` is a storage filename, **not** a rename to chase through the module |
| E5 | Delete safety | The cross-post scan (GT2) runs for **both** scopes. The folder does not get to prove exclusivity — a restored or hand-edited document could reference across folders, and the scan is already written and correct under any input |
| E6 | Article delete | Deletes the whole `news_media/{article_id}/` prefix — document and private art in one act. Correct by construction: the folder IS that article's private storage |
| E7 | Deleting an image ≠ deleting the article | Enforced in **two** places: the browse endpoint excludes `article.json` from the article-scope grid, and the delete guard refuses it. One rule (exclude the document by name), not a second image-extension allowlist — we control everything that enters the folder |
| E8 | Promote (article → shared) | Always legal. Widens access, breaks nothing |
| E9 | Demote (shared → article X) | Legal only when the set of articles referencing the image is **empty or exactly {X}**. Count alone is insufficient: an image used solely by article Y is "one place", but moving it into X's folder while Y renders it is nonsense |
| E10 | Unreferenced shared images | May be moved or deleted freely — claiming an orphan into the article you are editing is the intended tidy-up path |
| E11 | Move ordering | **copy → rewrite references → delete source.** A crash mid-way leaves a duplicate object (litter); delete-first would leave a published article pointing at nothing (a hole) |
| E12 | Move destination key | Same basename at the destination, **refused if `object_exists`**. Keeps keys legible (no `{8hex}_{8hex}_name.png` stacking) and makes the no-overwrite rule explicit rather than leaning on S3's silent-overwrite semantics |
| E13 | Move does not bump `updated_at` | A relocation is not an authorial edit, and `updated_at` sorts the editor index (GT11) |
| E14 | Confirm asymmetry | Delete keeps its two-step confirm (S3 has no undo). Moves are single-click: neither destroys content — promote rewrites references as it goes, demote refuses rather than stranding anyone |
| E15 | Dev cleanup | No migration script. Clear the three references (GT12) so the post survives with its prose; Matt removes the objects from S3 and re-uploads. The orphaned root-level `news_media/{id}.json` is inert under the new restore filter — Matt bins it while he is in the bucket |

## SHIPPED — all three PRs (2026-08-31)

> Branch `feature-news-and-pulse`, uncommitted. Backend suite **1132 green** (was 1098);
> news module alone 77 (was 43). Frontend builds and lints clean. Nothing above this
> section has been edited to match — the plan records what we intended, this section
> records what changed on the way.

**Verified live** against `api-site-dev` and the real bucket, with throwaway posts and
throwaway keys (deleted afterwards; the bucket is back to empty):

- Uploads land in the scope they were sent to, and each scope lists only its own.
- The article listing excludes `article.json`; `DELETE` and `POST /move` both refuse it
  (400) and the post survives.
- Deleting an in-use image → 409 naming the post.
- Promote rewrote the banner reference and moved the object; the article's own scope
  emptied and the shared one gained it.
- Claiming an image another article uses → 409 naming that article. Claiming one THIS
  article uses → 200, reference followed. Claiming an unreferenced shared image → 200.
- Deleting an article emptied its whole folder — document and image — leaving nothing.

**Every rule is covered by a test that fails without it.** Each was run against a
deliberately broken implementation before being kept: a count-based demote rule (instead
of identity-based) fails `test_claiming_an_image_another_article_uses_is_refused`; dropping
the `object_exists` check fails `test_a_taken_destination_is_refused`; deleting before
copying fails `test_a_failed_copy_leaves_everything_where_it_was`; bumping `updated_at` or
mutating the document in place fails three more; and loosening the key guard to a bare
`startswith` fails five.

### Deviations from the plan above

| Change | Why |
|---|---|
| **Default tab is THIS ARTICLE**, not shared | Defaulting to shared is how the flat directory filled with images used once. Making the narrow scope the path of least resistance, and the library something you promote INTO, matches how the two are actually used |
| `is_article_document_key` added beside `is_news_image_key` | The restore filter deserved its own named predicate rather than an inline shape check; both share a `_news_key_segments` helper so the two can never disagree about what a well-formed key is |
| The picker's UPLOAD moved from the modal header into the browser body | The CTA has to sit with the scope it targets — an upload button in the header could not say which tab it was uploading into |
| `news-thumb`/`news-thumb-tile`/`news-thumb-name` deleted | The rail and picker render one grid now, so one class set serves both. `news-picker-tile.is-draggable` carries the grab cursor the rail needs |
| `scrollWithin` prop instead of deriving the grid cap from `columns` | The rail caps its grid and scrolls internally; the modal has its own scroll region and would have nested two. Deriving that from an unrelated prop would have been a coincidence, not a reason |
| Move and delete controls are siblings in the cell, not wrapped together | A positioned wrapper would have become the containing block for the delete confirm, shrinking a full-tile overlay into the corner |
| Dev cleanup cleared 3 references, not 3 objects | Matt had already emptied `news_media/` in S3. His post survives in PostgreSQL with its prose; **it has no S3 backup until it is saved once**, which writes it to the new `news_media/{id}/article.json` |

### Files

**Backend** — `modules/news/application/commands.py` (prefixes, key helpers, both guards,
folder delete, restore filter, `MoveNewsImage`), `domain/news_post_aggregate.py`
(`replace_image_keys` + `replace_image_key`), `api/endpoints.py` (scoped list/upload, move
endpoint), `api/schemas.py`, `shared/services/s3_service.py` (`copy_object`),
`tests/test_news_commands.py`, `tests/test_news_aggregate.py`.

**Frontend** — new `news/components/NewsImageBrowser.js` and `NewsImageMoveControl.js`;
`NewsImageRail.js` and `NewsImagePicker.js` rewritten over the browser; `hooks/useNews.js`
(`useNewsImages(postId)`, `useNewsImageUrlLookup`, `useMoveNewsImage`, scoped upload);
`(authenticated)/news/editor/[postId]/page.js`; `globals.css`.

## PR #170 review round (2026-09-01)

Copilot raised 17 inline findings across this work and step-02. All 17 verified as
technically correct; actioned as below. Suite 1132 → **1139 green**, frontend builds and
lints clean.

| # | Finding | Action |
|---|---|---|
| 1 | `every()` short-circuits in `LineHeight`/`BlockSpacing` — a cursor in a heading makes the paragraph command return false, so the heading update never runs | Fixed. New `shared/tiptap/blockAttribute.js` owns `BLOCK_ATTRIBUTE_TYPES` and `applyToBlockTypes`, which runs every type then aggregates — the shape `@tiptap/extension-text-align` uses (`.map().some()`) for exactly this reason. Both extensions now source their `types` from that one constant |
| 2 | PUBLISH sent only the flag, shipping the last-saved version while the UI reported success | Fixed. `handlePublish` saves `draftPayload()` first and publishes in its `onSuccess`; chained, not parallel, so publishing content that failed to save can't happen |
| 3 | A move rewrote keys server-side but the editor's local doc kept the dead key, breaking the preview and writing it back on the next save | Fixed. `replaceImageKey` (the client twin of the aggregate's method) applied via a new `onMoved` callback threaded control → browser → rail/picker → page. **The move response now also returns a signed `url`** — without it the editor would hold a URL for the object the move just deleted, and the picture would break until a refetch |
| 4 | Both editor pages called `useAuth()` | Fixed — `useAuthenticated()`. This was a documented rule in `AuthenticatedContext.js:22-24`, not a judgment call |
| 5 | Nothing validated submitted `doc` image sources or banner keys; `_to_news_post_response` signs whatever it finds | Fixed. `_validate_image_references` in `UpdateNewsPost` applies `is_news_image_key`; `InvalidImageKeyError` (a `ValueError` subclass) → 400, caught before the not-found 404. **Also closes the TipTap paste hole** — a pasted remote URL becomes a plausible-looking key on save, and now fails loudly instead of rendering broken |
| 6 | Fifth pulse pill computed negative opacity, invisible but occupying the row | Fixed. Quadratic ease-in from 1.0 to 0.2 → `1.00, 0.95, 0.80, 0.55, 0.20`, anchored to `MAX_PULSE_EVENTS` so a pill's opacity means its age rather than its position in a variable-length list |
| 7 | `usePulse` merged hydration by `id`, but the server mints a fresh id per record — so a repeat showed twice | Fixed. One `isSameHappening` predicate (type + payload) used by both the live path and the merge, mirroring `record_pulse_event` |
| 8 | Toolbars read `getAttributes('paragraph')` only, showing Default inside a styled heading | Fixed via `activeBlockAttribute`, in both the news toolbar and `NoteEditor` |
| 9 | `friend_offline` never clears the `friend_online` pulse entry, so it can assert someone is around for 6h after they left | Fixed **by not storing the problem**: `PulseLine` declines to draw a `friend_online` pill whose subject is not in `onlineFriends`. Retracting server-side would be N row writes on every tab close; this is the same principle expiry already uses — nothing is deleted for it to stop being shown, and the entry keeps its timestamp so ordering survives |
| 10 | No alt text on in-content images | Added. `alt` was already in the extension's schema and survives the key↔URL round trip, so the work was a toolbar control (active only on a selected image) plus `NewsAltTextModal`. Scope is in-content images only — the four banners are CSS backgrounds, which assistive tech already ignores, and that is correct for decorative frame art. **Empty alt is stored, not dropped**: `alt=""` is the explicit marker for decoration |
| 11 | `mint.py` crashes on the default empty allowlist | Moot — file deleted. It was a scratch token-minter of mine that leaked into a commit, and `COPY api-site/ .` would have shipped it into the production image |
| 12 | `app/compilecheck/page.js` is a debug artifact | Deleted. Mine, from the `Portal.Group` investigation; it sat at the repo root rather than under `rollplay/app`, so Next never built it — which is why it proved nothing |
| 13 | `list_objects` reads only the first 1000 keys, so a restore could silently omit documents | **Deferred by Matt.** I'd revised my own position to "worth doing" — the likelihood is low but the failure is silent partial data loss on the durability path — and it remains open |
| — | Copilot also flagged the article preview's live `LikeButton` | Fixed. `NewsArticle` takes `interactive`; the editor preview passes false so a draft nobody has read cannot accrue real likes |

Every fix that encodes a rule has a test that fails without it, each run against the broken
version first: 5 tests fail if the key guard is removed, 5 more if `is_news_image_key` is
loosened to a bare `startswith`, and the move ordering, destination check and identity-based
demote rule each have their own. Live-verified against `api-site-dev`: foreign keys and the
article document are refused with 400 naming the offender, valid keys and banner-clearing
still 200, a missing post still 404s, and a move returns a signed URL that loads.

## Storage layout

**Before**
```
news_media/
  {post_id}.json                     ← doc at the root
  images/                            ← every image, shared with everything
    303b707b_banner-top.png
```

**After**
```
news_media/
  shared_images/                     ← cross-article, opt-in at upload
    a1b2c3d4_mascot.png
  {article_id}/                      ← self-contained
    article.json
    e5f6a7b8_hero.png                ← this article's own art
```

A key is a key: banner columns and image nodes store either shape with no marker
distinguishing them. Scope is a property of **where the bytes live**, read back from the
key's own path — nothing in PostgreSQL records it.

## Work phasing — THREE PRs, dependency order

PR A changes the API shape PR B consumes; PR C adds a capability neither needs. Do not
reorder.

---

## PR A — Storage layout (backend only)

### A1. Prefix constants and key helpers (`application/commands.py`)

Replace `NEWS_IMAGE_PREFIX` with the two-scope vocabulary:

```python
NEWS_PREFIX = "news_media"
SHARED_IMAGE_PREFIX = f"{NEWS_PREFIX}/shared_images"
ARTICLE_DOCUMENT_FILENAME = "article.json"

def article_prefix(post_id: UUID) -> str: ...          # news_media/{id}
def article_document_key(post_id: UUID) -> str: ...    # news_media/{id}/article.json
def image_prefix(post_id: Optional[UUID]) -> str: ...  # article folder, or shared
```

`post_document_key` is **renamed** to `article_document_key` (E3) — the old name goes,
it does not linger as an alias.

`is_news_image_key(key) -> bool` is the single guard both delete and move use. It answers
"is this an image this module owns", and its docstring carries the reasoning:

- Never `.../article.json` — the document is not an image and this endpoint must not be a
  way to delete it (E7).
- `news_media/shared_images/{filename}` → yes.
- `news_media/{uuid}/{filename}`, **exactly** two segments deep with a parseable UUID
  first → yes. The UUID parse is what separates an article folder from
  `shared_images`, so the two branches can never be confused.
- Anything else → no. The guard exists so this endpoint can never be a lever for deleting
  library media or another module's objects.

### A2. Endpoints take a scope (`api/endpoints.py`, `api/schemas.py`)

| Endpoint | Change |
|---|---|
| `GET /api/news/images/` | Optional `post_id` query param. Absent → list `shared_images/`. Present → list that article's folder, **excluding `article.json`** (E7) |
| `POST /api/news/images/upload-url` | `NewsImageUploadRequest` gains `post_id: Optional[UUID]`. Absent → shared. The returned key tells the client which scope it got |
| `DELETE /api/news/images/` | Signature unchanged; guard swapped for `is_news_image_key` |

The cross-post scan in `DeleteNewsImage` is untouched (E5) — only its guard widens.

### A3. Article delete takes the folder (`DeleteNewsPost`)

`delete_object(post_document_key(...))` becomes a **prefix delete** of
`article_prefix(post_id)`: list the folder, delete every key. Shared images are untouched
by construction — they are not in the folder.

Needs `S3Service.delete_prefix(prefix)` or a loop over `list_objects` + `delete_object` in
the command. Prefer the loop in the command: `list_objects` already returns exactly what is
needed, and a `delete_prefix` on the shared service is a sharper tool than any caller
currently wants. Failures stay logged-and-swallowed, matching the existing backup-delete
behaviour, but log **each** key that failed — a partial folder delete is worth naming.

### A4. Restore filter (`RestoreNewsFromBackup`)

From "root-level `.json` not under `images/`" to "`.json` exactly one level deep,
excluding `shared_images/`". Concretely: the key ends `/article.json` and its parent
segment parses as a UUID. Old root-level `{id}.json` documents become inert rather than
resurrecting as posts (E15).

### A5. Dev cleanup (one-shot, not committed)

Null the two banner columns and strip the single image node from the one post (GT12), so
the prose survives and Matt re-attaches art after re-uploading. Run against `postgres-dev`
only; nothing to write for prod, which has no news content.

### PR A tests (api-site pytest — isolation rules apply)

Each test builds its own aggregate and its own fake S3; nothing reads a module constant or
another test's leftovers.

- `is_news_image_key`: accepts a shared key; accepts an article-scoped key; **rejects
  `article.json`**; rejects a key outside `news_media/`; rejects a key three levels deep;
  rejects `news_media/loose.png`.
- `article_document_key` shape, and that `_document_to_aggregate` still rebuilds from a
  document read out of the new path (id comes from the body — GT5).
- `DeleteNewsPost` removes every key under the folder and **no** shared key.
- `DeleteNewsImage` still refuses an in-use image in both scopes, naming the posts.
- `RestoreNewsFromBackup` restores a one-level-deep `article.json`, skips a shared image,
  skips a stray root-level `{id}.json`.

---

## PR B — The editor's two-tab image browser (frontend)

### B1. `NewsImageBrowser` — one component, two consumers

The rail and the modal picker (GT9) both grow the same tabs, so the tabs are built once:
scope tabs → upload CTA (targeting the active scope) → grid → per-tile delete. The rail
and picker keep their own chrome and their own placement behaviour (drag-to-banner and
click-to-insert respectively) and consume the browser for everything else — the same
reasoning that already put `NewsImageDeleteControl` in its own file.

Tabs read **SHARED** / **THIS ARTICLE**. Both grids are draggable, so either scope can
supply a banner.

### B2. Hooks (`hooks/useNews.js`)

`useNewsImages(scope)` where scope is `{ postId }` or `{}`; query key becomes
`['news', 'images', postId ?? 'shared']` so the two tabs cache independently and an upload
invalidates only the scope it landed in. `useUploadNewsImage` takes the target scope and
passes `post_id` through to the presign call.

### B3. Copy

The rail's standing note ("Shared across posts…") is no longer true of both tabs — each
tab says what its scope means, so the author knows what they are choosing at the moment
they choose it rather than from a footnote.

---

## PR C — Move between scopes

### C1. `S3Service.copy_object(source_key, destination_key)`

New method (GT7). Explicit about what it leans on: S3's copy **silently overwrites**, so
the caller checks `object_exists` first (E12) and this docstring says so, with a `Raises:`
section for the `ClientError` the caller must not swallow — reporting a move that did not
happen is worse than failing it.

### C2. `replace_image_key(old_key, new_key)` on the aggregate

The write-side counterpart to `uses_image`/`collect_image_keys` (GT6), and it lives in the
same file for the same reason: a module-level pure `replace_image_keys(node, old, new)`
that walks the document, plus the aggregate method that also swaps any matching banner
slot. Does **not** touch `updated_at` (E13).

### C3. `MoveNewsImage` command

`execute(image_key, target_post_id: Optional[UUID]) -> str` — returns the new key. Target
`None` = promote to shared; a UUID = demote into that article.

1. Guard with `is_news_image_key` (A1); refuse a move that is already in the target scope.
2. Scan `get_all()` for referencing posts — the same scan `DeleteNewsImage` runs (E5).
3. **Promote**: always proceeds (E8). **Demote**: proceeds only when the referencing set
   is empty or exactly `{target}` (E9, E10); otherwise raise `ImageInUseError` with the
   titles, reusing the existing exception so both surfaces refuse in the same shape.
4. Destination key = `{target_prefix}/{basename}`; refuse if `object_exists` (E12).
5. `copy_object` → for each referencing post `replace_image_key` + save + write-through →
   `delete_object(source)`. That order is the failure-path decision (E11) and gets a
   comment saying which failure it is choosing.

### C4. Endpoint

`POST /api/news/images/move`, admin-gated, body
`NewsImageMoveRequest { key: str, target_post_id: Optional[UUID] }` → `{ key: new_key }`.
`ImageInUseError` → 409 with the post titles (the existing delete shape);
`ValueError` → 400.

### C5. UI

A move control on the tile beside the delete ✕, in both tabs, arrow pointing the way the
move goes: **shared tab** → "claim for this article"; **article tab** → "share across
articles". Single click, result message (E14). On success the two scope queries invalidate
and the post query refreshes — its references just changed.

### PR C tests

- Promote rewrites banner **and** in-document references, and rewrites them in every
  referencing post rather than assuming one.
- Promote leaves `updated_at` untouched (E13) — asserted on an aggregate the test built.
- Demote into the sole referencing article succeeds; demote of an unreferenced shared
  image succeeds (E10); demote of an image referenced by a different article raises
  `ImageInUseError` naming it (E9).
- Refused when the destination key already exists — and the source is **still there**
  afterwards (E12).
- Copy happens before delete, and a copy failure leaves the source intact and no
  references rewritten (E11).
- `article.json` cannot be moved (E7).

## What we will NOT invent (locks)

- **No scope column, no image table.** News images still have no database row — a post's
  own references remain the only record that an image is in use (E5). The scope is
  readable from the key.
- **No enforcement that an article may only reference its own folder.** The UI shapes it;
  the aggregate stays permissive. Enforcement would break restore and hand-authoring for
  no gain, since the delete/move scans are correct regardless.
- **No rename of the domain.** `NewsPostAggregate` and `news_posts` stay (E4).
- **No `list_objects` pagination work** (GT8) — noted, deliberately unaddressed.
- **No migration script** (E15).
- **No asset-library integration.** News media remain outside `MediaAsset`, as D8 settled.
- **No bulk move UI.** One image at a time; there is no evidence yet of the other need.

## Dev QA checklist (acceptance)

1. Upload to **SHARED** from article A → appears under `news_media/shared_images/` in S3,
   shows in A's shared tab and in article B's shared tab.
2. Upload to **THIS ARTICLE** from A → lands in `news_media/{A}/`, shows in A's article
   tab, **absent** from B's article tab.
3. `article.json` never appears as a tile in the article tab, and a hand-crafted
   `DELETE /api/news/images/?key=news_media/{A}/article.json` is refused (400) — the
   article survives.
4. Insert an article-scoped image into A's body, save, reopen — renders. Confirm the
   stored `src` in PostgreSQL is the **key**, not a signed URL.
5. Delete article A → its whole folder disappears from S3; shared images it referenced are
   still there.
6. Delete a shared image still used by B → refused, naming B.
7. Promote A's private image → moves to `shared_images/`, A still renders it (references
   rewritten), the old key is gone from `news_media/{A}/`.
8. Demote a shared image used only by A, while editing A → moves into A's folder, A still
   renders it. Repeat while editing B → refused, naming A.
9. Demote a shared image nothing references → succeeds (E10).
10. Wipe the dev database, `docker exec -it api-site-dev python admin.py restore-news` →
    the post returns with its banner and in-document keys intact and its images still
    resolving.

## Code style contract (for the implementing session)

- Comments explain the **decision**, not the mechanics. Every non-obvious ordering (E11),
  guard (E7), and non-bump (E13) says why in one line at the point of reliance.
- Library behaviour we depend on is written down: S3 copy's silent overwrite, the
  unhandled `ClientError` on a move, `list_objects`' single page.
- No initialisms, no single-character loop variables — `for image_key, url in …`.
- Delete superseded code in the same change: `NEWS_IMAGE_PREFIX` and `post_document_key`
  go, they do not survive as aliases.
- Tests own their state: each builds its own aggregate and fake S3; no module constant is
  read or mutated.
