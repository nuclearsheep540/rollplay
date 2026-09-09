# Implementation — Delivery steps 7+8: News vertical + Pulse v1 (+ presence push)

> Extracted 2026-08-31 from [00-epic.md](../00-epic.md) delivery steps 7–8 and
> [02-live-panels-and-news.md](../02-live-panels-and-news.md), against a fresh code sweep
> (file:line evidence below). **All decisions settled by Matt 2026-08-31** — the whole
> conversation is approved; the table below records outcomes; sections are written to them.
>
> Design contracts:
> - **News editor**: the "News Editor" design canvas
>   (https://claude.ai/code/artifact/4abda06b-6f44-41fd-8c6f-c362657024e2) — four artboards:
>   Index, Editor (EDIT tab), HOME CARD preview, ARTICLE preview. Signed off 2026-08-31.
>   Pixels defer to app tokens; geometry comes from `app/styles/plateGeometry.js`.
> - **Home news card + Pulse line**: [design-mock.html](../design-mock.html) — where prose
>   and mock disagree, the mock wins.
>
> Out of scope (per epic sequencing): scheduling/RSVP (step 4 — the calm pill's next-game
> line and the hero scheduled state wait for it), seat counts ("N at the table" — api-game
> constraint unresolved), the now-playing music line (needs api-site→api-game hot-state
> read), Market beyond the already-shipped visible placeholder, tagline bank (step 6).

## Ground truth from the sweep (2026-08-31, file:line)

1. **Presence is never broadcast today.** `EventConnectionManager.connect()`/`disconnect()`
   (`modules/events/websocket_manager.py:24-54`) mutate the registry and log — nobody is
   notified. `is_online` is computed on-read only at `friendship/api/endpoints.py:61` via
   `is_user_connected`. FE dots update by refetch-on-open: `QueryProvider.js` has 30s
   staleTime and `refetchOnWindowFocus: false`, and the socket bridge
   (`useAuthenticatedEvents.js:41-58`) invalidates `friendships` only on friend-request
   mutations. An open, idle social panel never learns a friend logged in.
2. **The transport already suits presence.** Per-user unicast with silent drop
   (`websocket_manager.py:66,80`) is exactly right for friend-scoped fan-out — offline
   recipients are skipped automatically. No new transport.
3. **The WS endpoint has both hook points**: after `connect` (`websocket_endpoint.py:76`)
   and in the disconnect `finally` (`:117`), with `user_id` resolved. The endpoint
   deliberately never pins a pooled DB connection (`:62` comment — GetUserByEmail pattern);
   any friendship lookup here must follow it.
4. **`FriendshipRepository.get_user_friendships(user_id)`** exists
   (`friendship_repository.py:50`) — accepted friendships = the fan-out list.
   `FriendshipEvents` lives at `modules/friendship/domain/friendship_events.py`.
5. **`session_started` over-persists for the host**: the factory
   (`session/domain/session_events.py:81-113`) sets `save_notification=True` for every
   recipient including the host; `host_id` is already a parameter.
6. **Session lifecycle events already reach the FE bridge** —
   `useAuthenticatedEvents.js:104-121` handles `session_created/started/paused/finished`
   and invalidates the campaigns query. Pulse's live-session signal is push already.
7. **The FE already holds member-scoped live-session state.** `useCampaigns.js:74-95` fans
   out per-campaign sessions — Pulse reads liveness from data in the client, no new
   endpoint, privacy boundary free (only campaigns the user is a member of).
8. **No admin concept exists** (audit §5 stands). `Settings` (`config/settings.py`) is
   pydantic BaseSettings, instantiated at module scope (`main.py:43`, `db.py:10`) — env
   snapshot at boot; compose injects `dev.env`/`prod.env` at container CREATE
   (`docker-compose.dev.yml:40-41`, `docker-compose.yml:43-44`). `is_production` at
   `settings.py` is the property precedent for `admin_email_set`.
9. **The FE fetches the current user already** — `useAuth.js:48` →
   `GET /api/users/get_current_user` (`user/api/endpoints.py:253`, `UserResponse` at
   `user/api/schemas.py:48`). `is_admin` rides this; zero extra hops.
10. **The authenticated layout owns both `auth.user` and `<AppLauncher />`**
    (`(authenticated)/layout.js:25,76`) — wiring the ADMIN launcher section is one prop.
    `AppLauncher.js:12` imports `TOOLS`/`TOOL_ROUTES`; its WORKSHOP section is the pattern
    the ADMIN section copies.
11. **TipTap v3 is in the build** (17 `@tiptap/*` packages, `package.json:25-41`); the
    notes extension family is at `notes/components/NoteEditor.js:9-23`.
    `@tiptap/extension-image` is NOT installed — new dependency (same vendor).
12. **`S3Service`** (`shared/services/s3_service.py`) has presign up/down, delete, exists,
    generate_key — **no list, no server-side put/get**. News needs `list_objects(prefix)`
    and JSON put/get helpers (justified new methods, see PR 2).
13. **`active_sessions` is a dead lie**: hardcoded `0` at `campaign/api/endpoints.py:141,170`
    and `user/application/queries.py:61` (+ `user/api/endpoints.py:628`), declared at
    `campaign/api/schemas.py:88,109`. Zero FE readers (re-verified 2026-08-31).
14. **`middleware.js:10-17` PROTECTED_ROUTES** has `/notes` but not `/news` — add it.
15. **Home placeholders to replace**: `HomePlaceholders.js:23` (`PulseDivider`) and `:53`
    (hardcoded news card); Updates section head at `HomeManager.js:98`.

## Decisions — SETTLED by Matt 2026-08-31

| # | Decision | Outcome |
|---|---|---|
| D1 | Presence | **Push, not poll**: `friend_online`/`friend_offline` emitted on connect/disconnect **transitions** (first connection up, last down — multi-tab must not re-fire), fanned out to accepted friends only |
| D2 | Presence event configs | `friend_online`: `show_toast=True` (someone coming online is nice); `friend_offline`: silent. **Neither persists** (`save_notification=False`) |
| D3 | Refresh flicker | Accepted in v1 — no grace debounce |
| D4 | `session_started` hygiene | Host gets toast-only (`save_notification=False` when `member_id == host_id`); non-owner members keep toast + saved notification |
| D5 | `active_sessions` | **Delete the dead field end-to-end** (supersedes the planned `active_session_id` replacement) |
| D6 | Admin mechanism | `ADMIN_EMAILS` env (runtime files `dev.env`/`prod.env`, never root `.env`) → `Settings` snapshot at boot → parsed-once `admin_email_set` → per-request set-membership in `require_admin`. No DB column, no JWT claim. Change ceremony: edit env + **recreate** container (`up -d`, not `restart`) |
| D7 | FE admin awareness | `is_admin: bool` on `UserResponse` — response-boundary enrichment computed per request, **never stored**; rides the existing `get_current_user` call. FE gating cosmetic; server enforces every write |
| D8 | News storage | **Write-through**: PostgreSQL is runtime source; every save writes the complete post JSON to S3 `news_media/{post_id}.json`; `restore-news` CLI (admin.py style) re-hydrates after a DB wipe. Images live in `news_media/images/`, deliberately shared across posts. News media **bypass MediaAsset** and are excluded from the media-source split |
| D9 | Signing | Same bucket behind the CFD, no special treatment → stored docs hold S3 **keys** only; the read path signs at serve time |
| D10 | Authorship | `author_name` plain string — **no user FK** (posts come from Matt-the-human; also what makes restore clean) |
| D11 | Banners | **FOUR optional keys per post**: home-card top/bottom + article top/bottom — card and article can carry different art |
| D12 | Editor | Standalone `/news/editor`; launcher gains an **ADMIN section** (WORKSHOP pattern), first entry "News editor", visible only when `is_admin`. Index = all posts (drafts first) + NEW POST as the only create door |
| D13 | Editor tabs | **1-up, tabbed**: EDIT / HOME CARD / ARTICLE. Previews render the **REAL** components Home uses, fed the draft — preview can never drift |
| D14 | Banner slots | Each slot carries a HOME CARD / ARTICLE toggle (which surface it edits); the images palette **drags onto slots** (pointer DnD, desktop-first); click-to-insert at cursor for content images |
| D15 | Article surface | No parchment sheet, no dimmed stage — the article reads on the app's natural light ground; parchment stays the Home card's identity. **The article OWNS its header**: H1 → separator → author/meta, same style as the editor title block; in the ARTICLE tab both render (editable block above, article header inside the captioned preview) |
| D16 | Read receipt shape | *(plan-decided, from 02's open pair)* `news_post_reads` per-post receipt table in the news module — news owns its read state, no news column on `users`; NEW! = latest published post has no receipt for this user, flipped when the article opens |
| D17 | Images in v1 | Yes — `@tiptap/extension-image` + presign PUT to `news_media/images/` (NOT the asset-library confirm flow) |

## SHIPPED — all four PRs (2026-08-31)

> Branch `feature-news-and-pulse`, uncommitted in the working tree. Backend suite
> 1062 green; frontend compiles (3290 modules) and lints clean. Nothing above this
> section has been edited to match — the plan records what we intended, this section
> records what shipped. Where they disagree, this is the newer truth.

**Plan assumptions corrected at implementation:**
- **No NGINX change was needed.** Both dev and prod configs already carry a catch-all
  `location /api/ → api-site:8082`; the explicit blocks exist only for api-auth,
  api-game and the internal 404s. Verified live: `/api/news/latest` proxies correctly.
  PR 2's NGINX bullet is wrong and was not actioned.
- **`pytest.ini` needed `testpaths = modules shared`.** The admin-allowlist tests live
  under `shared/tests/` and CI runs a bare `pytest`, so they collected zero tests until
  the path was added.
- **The repo has no `pytest-asyncio`.** Presence transition tests use the existing
  `run_async` helper convention from `test_friendship_flow.py` rather than adding a
  dependency.
- **`@tiptap/extension-image` had to be installed INSIDE the container.** `node_modules`
  is a named volume (`rollplay_node_modules`), so a host `npm install` is invisible to
  the dev server — the JS twin of the stale-deps rule. Pinned to `3.30.2` to match the
  rest of the family (npm defaulted to 3.30.5 and the peer resolution failed).
- **Editor routes live in `app/(authenticated)/news/editor/`**, not `app/news/editor/` —
  the slice/route split the notes feature established, so the pages inherit site chrome.
- **`admin.py`'s model registry needed the three news models**, per its own "same list as
  alembic/env.py" rule.

**Delivered ahead of plan:**
- **`openSocialPanel` on `AuthenticatedContext`.** The plan said "wire an `onOpenSocial`
  up through the layout"; threading a prop through four files would have meant lifting
  `SocialPanel`'s open state and risking its outside-click fix. Instead the layout owns a
  monotonic `socialOpenSignal` counter exposed on the context the group already provides,
  and the panel keeps owning open/close. Extends an existing seam rather than inventing one.
- **`unpublish`** — the editor's PUBLISH button toggles, so a mistake is recoverable.
  Clears `published_at` so an unpublished post cannot silently reappear back-dated.

**Verified end-to-end (live, through nginx):**
- `is_admin: true` for the allowlisted email, `false` otherwise; non-admin gets 403 on
  create/index/delete while `/latest` stays 200; unauthenticated gets 401.
- Full authoring loop: create draft → edit body → publish → `/latest` serves it → like
  toggles 0↔1 → read receipt flips `read`.
- S3 write-through: `news_media/{id}.json` written on every save.
- **Restore proof:** `delete from news_posts` → `admin.py restore-news` → "1 restored";
  re-run → "0 restored, 1 already present".
- **The recreate-not-restart rule proved itself:** after editing `dev.env`, a `restart`
  left `admin_email_set` empty; `up -d api-site` populated it.

**Test proof (TDD):** the `session_started` host-notification test was run against the
reintroduced bug first and failed (`assert True is False`); the sibling member test stayed
green, correctly, since it was never broken.

**Not done / deferred:**
- **Pulse ticker is arrivals-only.** It diffs the online set rather than subscribing to
  the socket directly, so it announces friends who come online but not session starts.
  One source of truth was worth more than the extra pill type.
- **Banner previews show the last SAVED art.** The editor holds S3 keys and only the
  server signs them, so a slot changed but not yet saved previews with its previous image.
  Save-then-preview is the workflow; a sign-on-demand endpoint would remove the caveat.
- **No `image_urls` for unsaved in-content images** — same cause, same workaround.
- Weight table is live-session + online-friend only; the richer activity signals
  ("editing their character") still need their reporting channel (Pulse v2).

## Work phasing — FOUR PRs, dependency order

PR 1 (presence + event hygiene) ships first and alone — immediate value to the social
panel, and Pulse consumes it. PR 2 (admin + news backend) → PR 3 (editor + Home card)
are strictly sequential. PR 4 (Pulse) needs only PR 1 and may run parallel to 2–3.

---

## PR 1 — Presence push + event hygiene (backend-led, small)

### 1A. Transition detection in the manager
`EventConnectionManager` owns the registry, so it reports transitions:
- `connect()` returns `True` when this is the user's FIRST live connection;
- `disconnect()` returns `True` when it removed the LAST.
Multi-tab: second tab connects → `False` → no re-fire; one of two tabs closes → `False`.

### 1B. Event factories
`FriendshipEvents.friend_online(friend_ids, user_id, screen_name)` and `.friend_offline(...)`
→ `List[EventConfig]` (multi-recipient pattern per CLAUDE.md): `event_type`
`'friend_online'`/`'friend_offline'`, `data` `{user_id: str, screen_name}`, configs per D2.
UUIDs stay UUIDs except inside `data` (house rule).

### 1C. WS endpoint wiring
In `websocket_endpoint.py`: after a first-connection `connect` → open a short-lived DB
session (the `:62` pattern), `get_user_friendships`, broadcast each `EventConfig` via the
event manager; in the `finally`, after a last-connection `disconnect` → same with
`friend_offline`. Presence must never break the socket: wrap the fan-out in try/except
with a logged text-tag warning (no emoji prefixes).

### 1D. FE bridge + toast copy
`useAuthenticatedEvents.js`: `friend_online` → `invalidateFriendships()` + toast;
`friend_offline` → `invalidateFriendships()` only. `eventConfig.js`: add `friend_online`
entry (`"{screen_name} is online"` shape, matching neighbours at `:15-43`).

### 1E. `session_started` fix (D4)
In the factory loop (`session_events.py:81-113`): `save_notification=(member_id != host_id)`.
Docstring updated to say the host is toast-only and why.

### 1F. Rider — delete `active_sessions` (D5)
Remove the field from both campaign schemas (`schemas.py:88,109`), both endpoint call
sites (`endpoints.py:141,170`), and the user dashboard query (`queries.py:61-69` +
`endpoints.py:628` dict key). No FE readers exist; wire format loses a field nothing reads.

### PR 1 tests (api-site pytest, isolation rules apply)
- Manager transitions: first/second connect, last/non-last disconnect — each test builds
  its own manager, no shared state.
- Factory configs: `friend_online` toasts + never persists; `friend_offline` silent;
  `session_started` host vs member `save_notification` (TDD: show the host case failing
  against unfixed code first).

---

## PR 2 — Admin infra + news backend

### 2A. Admin access (D6, D7)
- `Settings`: `ADMIN_EMAILS: str = Field(default='', description=...)` — empty default =
  zero admins, safe boot. Property `admin_email_set` (the `is_production` idiom): split on
  commas, strip, lowercase, drop empties, return `set`. Comment the boot-snapshot semantics
  at the property (explicit-library-behavior rule: env is read at `Settings()`
  construction; OS env always outranks the `env_file='.env'` fallback, which is inert in
  the container).
- `require_admin` dependency in `shared/dependencies/auth.py`: `Depends(get_current_user_from_token)`
  → `user.email.lower() in settings.admin_email_set` or raise 403.
- `UserResponse.is_admin: bool = False`; `get_current_user` (`endpoints.py:253`) computes
  it from the same set. Never stored, never on the aggregate.
- `dev.env` + `env.example` documented (`prod.env` is Matt's, on the prod box). Operational
  note in env.example: recreation, not restart, applies changes.

### 2B. News module — `modules/news/`, standard aggregate-centric layout
**Models** (`model/news_post_model.py`, import ALL in `alembic/env.py:22ff` or
autogenerate misses them):
- `news_posts`: `id` UUID PK, `title` str, `author_name` str, `doc` JSONB,
  `banner_home_top` / `banner_home_bottom` / `banner_article_top` / `banner_article_bottom`
  (nullable str S3 keys, D11), `status` (`draft`/`published`), `published_at` nullable,
  `created_at`, `updated_at`.
- `news_post_likes`: (`post_id`, `user_id`) composite PK + `created_at`.
- `news_post_reads`: (`post_id`, `user_id`) composite PK + `read_at` (D16).
`user_id` columns are plain UUIDs, not FKs — likes/reads die with the DB and that is
accepted (D8); no cascade wiring into the user module.

**Domain**: `NewsPostAggregate` — `update_content(...)`, `publish()` (stamps
`published_at`, flips status), `to_document()` → the complete S3 JSON shape (id, title,
author_name, status, published_at, timestamps, four banner keys, doc).

**Application** (CQRS, no Command suffix): `CreateNewsPost`, `UpdateNewsPost`,
`PublishNewsPost`, `DeleteNewsPost`, `ToggleNewsPostLike`, `MarkNewsPostRead`;
queries `GetLatestPublishedPost`, `GetAllPosts`, `GetPostById`. Create/Update/Publish
write through to S3 (`news_media/{post_id}.json`) after the DB commit; an S3 failure logs
loud (text tag) but does not roll back the row — the CLI can re-sync.

**S3Service additions** (justified: first server-side reader/writer):
`list_objects(prefix)`, `put_object_json(key, payload)`, `get_object_json(key)` — named
boto3 exceptions caught per the explicit-library-behavior rule.

**Endpoints** (`/api/news`, reads for any authenticated user, writes behind `require_admin`):
- `GET /api/news/latest` — latest published, enriched: like count, `liked`, `read`, and
  **signed URLs** (D9): four banner URLs + `image_urls` map (S3 key → signed URL) for every
  image node in the doc; stored doc keeps keys (image nodes carry the key as `src`).
- `GET /api/news/` (admin, index: all posts, drafts first) · `GET /api/news/{id}` (published
  for all; drafts admin-only) · `POST /api/news/` (admin, create draft) ·
  `PUT /api/news/{id}` (admin) · `POST /api/news/{id}/publish` (admin) ·
  `DELETE /api/news/{id}` (admin) · `POST /api/news/{id}/like` (toggle) ·
  `POST /api/news/{id}/read` (receipt; idempotent) ·
  `GET /api/news/images` (admin: list `news_media/images/` with signed thumbs) ·
  `POST /api/news/images/upload-url` (admin: presign PUT into `news_media/images/`).
- Enrichment helpers live in `endpoints.py` per the DTO convention; `schemas.py` stays
  declarations-only.

### 2C. Restore CLI (D8)
`admin.py` gains `restore-news`: list `news_media/*.json`, parse via the aggregate's
document shape, upsert rows. Same shell-gated Click pattern as the existing commands.

### 2D. Plumbing
- Alembic: `docker exec api-site-dev alembic revision --autogenerate -m "add news tables"`
  — NEVER hand-written.
- NGINX: `/api/news` location → api-site in BOTH `docker/dev/nginx/nginx.conf` and
  `docker/prod/nginx/nginx.conf`; restart nginx.

### PR 2 tests
`require_admin` (member/non-member/case-insensitivity/empty allowlist), aggregate publish
rules, write-through called with the full document (S3 service faked), like toggle
round-trip, read receipt idempotency, restore upsert (fresh objects per test — no shared
fixtures, no module state).

---

## PR 3 — News editor + Home Updates card (frontend-led)

### 3A. Dependencies + routes
- `npm install @tiptap/extension-image` → **rebuild the rollplay dev image** (deps bake at
  image build; a manual install dies on recreate).
- `middleware.js` PROTECTED_ROUTES += `/news`.
- Routes: `app/news/editor/page.js` (index) + `app/news/editor/[postId]/page.js` (editor).
  NEW POST = create-draft then `router.push` to the new id (the index button is the only
  create door, D12).

### 3B. News slice — `app/news/`
Functional slice with `components/`, `hooks/`, `index.js`. The render components are
SHARED between Home and the editor previews (D13):
- `NewsCard` — the noticeboard: parchment, frame-breaking 21:9 banners (letterbox never
  crop), date row with the like-counter-as-CTA, Metamorphous title, excerpt, READ MORE
  above the bottom banner. Home-banner pair only.
- `NewsArticle` — the full article: **owns its header** (H1 → separator → author/meta,
  D15), article-banner pair, TipTap doc rendered read-only (notes extension family +
  Image), images resolved via the `image_urls` map. Renders on the natural light ground.
- Article opens as a full-screen Headless UI Modal whose surface IS that ground (no
  parchment sheet, no dark scrim per D15); opening fires `POST /{id}/read`.
- Hooks: `useLatestNews`, `useNewsPosts` (admin index), `useNewsPost`, mutations
  (save/publish/delete/like/read/upload) — ALL via `authFetch`.

### 3C. The editor (canvas contract)
- Chrome: crumb to index, status chip, SAVE DRAFT + PUBLISH plate buttons; title +
  author_name fields (editor title block); tab row EDIT / HOME CARD / ARTICLE (1-up, D13).
- EDIT: parchment writing surface — banner slots (21:9, per-slot HOME CARD/ARTICLE toggle,
  REPLACE/REMOVE when filled, drop-target affordance while dragging, D14), TipTap toolbar
  (notes family + image), content area; images rail (carbon level panel): upload tile →
  presign PUT → refresh, thumbnail picker over `news_media/images/`, click-to-insert at
  cursor, drag-onto-slot via pointer events (no touch work — desktop-first).
- HOME CARD / ARTICLE tabs: captioned stages rendering `NewsCard` / `NewsArticle` fed the
  DRAFT state (unsaved edits included) — like count real, receipt state honest.
- Save = `PUT` (draft stays draft); PUBLISH = explicit command; both write through to S3
  server-side.

### 3D. Launcher + Home integration
- `AppLauncher` gains `isAdmin` prop from `(authenticated)/layout.js:76`; ADMIN section
  below WORKSHOP (same h5/pip idiom), entry "News editor". Hidden entirely when false.
- `HomeManager.js:98` Updates column: replace the placeholder card with `NewsCard` over
  `useLatestNews`; NEW! chip in the section header when `read === false` (D16); no post
  yet → keep a quiet placeholder variant (never an error state).
- Delete the superseded news portion of `HomePlaceholders.js` in the same change.

---

## PR 4 — Pulse v1 (the line under the hero)

Replace `PulseDivider` (`HomePlaceholders.js:23`) with `PulseLine`
(`app/dashboard/components/home/`), per the mock's ticker model:
- **Sources, all existing**: `useFriendships` (`is_online`, now push-fresh via PR 1);
  live sessions from `useCampaigns` embedded sessions (member-scoped by construction —
  the privacy boundary is structural). No new endpoints, no polling.
- **Composition**: breathing gold dot clamped left; sticky gold live pill when any owned/
  joined campaign is live ("{campaign} is live") carrying its own JOIN →
  `/game?room_id=`; avatar coins for online friends (width-aware cap ≤4); ticker pills
  from socket events observed client-side (`friend_online`, `session_started`) —
  transient, newest beside the dot, older slide right and dim, none kept (a now-snapshot,
  not history); calm state: lone pill "All quiet in the tavern" (the next-game line
  arrives with scheduling, step 4).
- **Dial v1** (weight table designed now, fed what exists): live session raises the floor
  hard; each online friend adds a little; score interpolates breath period (~4s calm →
  faster) and coin count. No modes — continuous.
- **Actionable everything**: coins/friend pills open the social panel (wire an
  `onOpenSocial` up through the layout — the panel and its open state live in
  `(authenticated)/layout.js`); live pill joins.
- Reduced motion: no breathing, no slide animations (step-1 guard idiom in globals.css).

---

## What we will NOT invent (locks)

- **No new transport** — presence and session events ride the existing per-user socket;
  Pulse polls nothing.
- **No broadcast/topic primitive, no presence registry service** — the in-process
  registry's transition booleans are the whole mechanism (single-replica reality accepted).
- **No admin role column, no JWT admin claim, no admin module** — one env value, one
  dependency, one response field.
- **No MediaAsset involvement for news media** — and no generalisation of the news S3
  helpers into a "document store" abstraction.
- **No debounce/grace infra for presence flicker** (D3).
- **No per-campaign visit tracking** — the killed PR 4 stays killed; `news_post_reads` is
  the only read state.
- **No seat counts, no music line, no non-member session visibility, no in-game activity
  feed** — Pulse stays site-level and member-scoped.
- **No JS test scaffolding** — backend tests only, as ever.
- **No touch/mobile work** — pointer-events DnD, desktop-first.

## Removal opportunities (this work's dead-code dividend)

| What | When |
|---|---|
| `active_sessions` hardcoded ints + schema fields (both modules) | PR 1 rider |
| `HomePlaceholders.js` news card portion | PR 3 |
| `HomePlaceholders.js` `PulseDivider` | PR 4 |

## Execution order — INSTRUCTION, do not reorder

1. PR 1 entire (presence → hygiene → rider), tests green, dev QA on two browsers.
2. PR 2 backend complete incl. migration + NGINX before any FE work starts.
3. PR 3 editor before Home card wiring (the card needs real data to render).
4. PR 4 any time after PR 1 lands.

## Dev QA checklist (acceptance)

- Two browsers, two accounts, friended: B logs in → A's open social panel shows B online
  within a beat (no refetch-by-open), plus a toast; B closes the tab → dot greys, no toast.
  B with two tabs: closing one changes nothing.
- GM starts a session → GM gets the toast only (no saved notification row); players get
  toast + notification. TDD proof recorded for the host case.
- `ADMIN_EMAILS` unset → app boots, nobody is admin, launcher shows no ADMIN section,
  news writes 403 even hand-crafted. Set + container recreated → Matt sees ADMIN → News
  editor; a non-admin never renders the section and still 403s on writes.
- Full authoring loop: create draft → title/author/body/images → set all four banner
  slots via drag from the palette → HOME CARD and ARTICLE tabs render the real components
  with draft content → publish → Home shows the card with NEW! in the section header →
  READ MORE opens the article (owned header: H1/rule/meta), receipt clears NEW! →
  like toggles ±1 and persists.
- S3 truth: the post JSON exists at `news_media/{id}.json`; wipe the dev DB, run
  `restore-news`, posts return (likes/reads gone — accepted).
- Signed URLs: banner and in-content images render from fresh signatures on every read;
  stored doc (DB and S3) contains keys only.
- Pulse: quiet account reads "All quiet in the tavern" and looks alive (breathing dot);
  a friend coming online pops a coin + ticker pill; a live session pins the gold pill
  whose JOIN enters the game; nothing about campaigns the user isn't in ever appears.
- Reduced motion: no breathing, no wiggle, no ticker slide.
- NGINX: `/api/news` proxies in dev; prod config diff reviewed alongside.

## Code style contract (for the implementing session)

Matt's standing rules: readable names, no initialisms, no single-char loop vars; plain
loops when clearer; imports at top; GPL-3.0 headers on every new file; `authFetch` for
every authenticated FE call; text-tag log prefixes, never emoji; explicit library
behaviors at call sites (named boto3/pymongo exceptions, stated defaults); UUIDs stay
UUIDs until serialization boundaries; delete superseded code in the same PR + a deliberate
dead-code sweep before review; tests own their state (create everything touched, touch
nothing not created; prove failing tests against unfixed code); **no git write commands —
Matt runs them** (propose exact commands + messages per PR); Alembic by autogenerate in
the container, never by hand.
