# Session Notes — in-game rich-text notes (v1)

> **Status: planned 2026-08-19, not built.** R&D + decisions agreed with Matt in one session.
> v1 is the in-game drawer only. The dashboard surface is v2 and deliberately has no dependency
> on this plan shipping first — see §11.

## Scope

A **NOTES** tab in the game runtime's right drawer. Any seated user — player, DM, spectator —
writes free-text notes with light formatting during play. Notes are **private to their author**,
**scoped to the campaign** (not the session, not the character), autosave without a save button,
and persist independently of session lifecycle.

**Not in v1:** reading/writing notes outside a live session, sharing notes with the table, search,
tags, folders, templates, per-session pages, export.

## Decisions (locked in discussion, 2026-08-19)

1. **Ownership key is `(user_id, campaign_id)`** — one continuous notebook per campaign, per user.
   Sessions are *where* you write, never *what* you write against. Rejected: per-session notebooks
   (fresh each session) and session-stamped rows.
2. **Notes survive campaign deletion.** `campaign_id` is nullable with `ON DELETE SET NULL`;
   `campaign_name` is stamped on the row at creation so an orphan is still nameable.
3. **Authorisation is ownership, not membership.** `note.user_id == current_user.id`, full stop.
   A campaign-membership check cannot work for orphaned notes, and would revoke a user's own
   writing when they leave a campaign. Ownership is both simpler and more correct.
4. **Multi-file schema from day one, multi-file UI in v1 too.** Row-per-note. (Originally "schema
   now, UI later"; the UI came back in once the picker turned out to be a `Dropdown`, which is
   cheap.)
5. **100 notes per user per campaign**, enforced server-side. Per campaign, not per account —
   that is the unit the user experiences.
6. **The cap is visible from note one.** "12 / 100" always shown in the picker header. Matt's call,
   and the right one: discovering a cap at 99 reads as a trap. Hiding it until ~80 was rejected.
7. **Nothing is auto-created.** No note per session, no get-or-create on open. An empty account
   returns `[]` and shows an empty state with a "New note" button. 100% user-initiated.
8. **Titles derive from the first line when unset.** `title` is nullable; null renders as the
   document's first line. Renaming sets the column. No "name your note before you can type" gate.
9. **Editor is TipTap**, hand-picked extensions — never StarterKit. See §4.
10. **Autosave is debounce + ceiling, no save button, no local mirror.** See §7.
11. **api-game, MongoDB, the ETL, WebSocket events and `shared_contracts` are all uninvolved.**
    See §2.
12. **The install list is the feature list.** Formatting shipped: headings (H2/H3), bold, italic,
    strike, highlight, bullet + numbered lists, font family, hard break. Excluded on purpose:
    **images** (storage cost) and **links** (malicious-URL risk, no real payoff), plus
    subscript/superscript as toolbar bloat. See §4.

## 2. Why this never touches the game service

The CLAUDE.md server-authoritative and atomic-update principles are scoped to **active game
sessions in MongoDB**. Notes are not game state:

- **Private and single-writer.** Nobody else reads them, so there is nothing to broadcast and no
  recipient filtering to get wrong.
- **Non-diegetic** (Matt's framing). Nothing at the table reacts to a note being typed. It lives
  *above* the session.
- **Born cold.** They go straight to PostgreSQL, so they survive pause → resume → finish for free
  and add nothing to the ETL, which already carries risk (`_extract_and_sync_game_state`,
  `api-site/modules/session/application/commands.py:809`, has a documented failure path that
  preserves the Mongo doc for manual retry).

Direct precedent for calling api-site from inside a live session:
`rollplay/app/game/hooks/useCharacterRuntime.js` — TanStack + `authFetch` →
`PATCH /api/characters/{id}/runtime`, mid-game, no Mongo involvement.

`shared_contracts` exists for the api-site↔api-game HTTP boundary. Notes never cross it, so no
contract is added and the contracts CI gate is not engaged.

> **Related but separate:** the same trace turned up a real bug in how *character* runtime state
> is split across both stores. Recorded in
> `.claude/plans/TODO-runtime-character-state-authority.md`. The distinction that keeps notes out
> of it: that defect is **two stores holding the same value**, and notes only ever exist in one.

## 3. Data model

New module `api-site/modules/notes/` — a genuinely new domain slice, so a new aggregate module is
the expected shape.

```
notes
  id             uuid   pk
  user_id        uuid   fk users(id) ON DELETE CASCADE   not null   -- owner; this IS the auth rule
  campaign_id    uuid   fk campaigns(id) ON DELETE SET NULL  null
  campaign_name  text   not null      -- stamped at creation; names orphans after campaign deletion
  title          text   null          -- null = derive from first line at render
  content_delta  jsonb  not null      -- ProseMirror document JSON (editor.getJSON())
  content_text   text   not null      -- flat projection (editor.getText()), for search later
  rev            int    not null default 0
  created_at     timestamptz not null
  updated_at     timestamptz not null

  index (user_id, campaign_id, updated_at desc)
```

Notes on the columns:

- **`campaign_name`** is stamped once at creation and never refreshed. The UI prefers the *live*
  campaign name while `campaign_id` is set and falls back to the stamped one when it is null — so
  campaign renames are never stale, and orphans are never nameless. No delete-time hook needed.
- **`content_delta` is `jsonb`** for consistency with the rest of the codebase (`audio_config`,
  `map_config`, `adventure_log` are all JSONB). It is never queried by content; `text` would be
  marginally cheaper, and that is not worth the inconsistency.
- **`content_text`** costs one column now and saves a backfill later. Once notes accumulate across
  sessions, "search my notes" is an obvious ask and a `tsvector` index over this is trivial. **No
  search endpoint in v1** — the column is groundwork, not a feature.
- **`rev`** is bumped server-side on every write. The client sends the rev it loaded; a mismatch
  returns 409. Two browser tabs on the same game is a real scenario and last-write-wins silently
  eats one of them. No merge logic — the client shows "edited elsewhere, reload".

Registration checklist (all four are required, all four are easy to forget):
1. Router in `api-site/main.py` alongside the others (`main.py:87-96`).
2. `from modules.notes.model.note_model import Note` in `api-site/alembic/env.py` (`:22-50`) —
   autogenerate will not see the table otherwise.
3. **The same import again in `api-site/conftest.py`** — it keeps its own explicit model-import
   block (`:40-60`, each line `# noqa: F401`) so `Base.metadata.create_all` sees the table in the
   SQLite harness. Miss this and every notes test fails on a missing table, with no hint that the
   cause is an import.
4. `api-site/modules/notes/tests/` — every other module has one.

The test harness handles our column types already: `conftest.py:148` rewrites `JSONB` → `JSON` for
SQLite, and `PostgreSQL_UUID` → a `GUID` TypeDecorator. No harness work needed for this table.

Migration via `docker exec api-site-dev alembic revision --autogenerate -m "add notes table"`.
Never hand-written.

## 4. Editor — TipTap, hand-picked

`@tiptap/react` **3.30.2**, MIT, peer `react ^17 || ^18 || ^19` (we are on React 18.2). Verified
against the npm registry 2026-08-19.

### Extension set (final, agreed 2026-08-19)

TipTap is **opt-in**: every capability is a separate package that must be installed *and*
registered. There is no feature to "turn off" — an extension we never install simply does not
exist. And because ProseMirror parses pasted content against the registered schema, **anything
with no matching node or mark is silently dropped on paste**. Pasting an image yields nothing
because no image node exists to hold it. That is a structural guarantee, not a sanitiser we
maintain.

```
npm packages:
  @tiptap/react @tiptap/core @tiptap/pm
  @tiptap/extension-document @tiptap/extension-paragraph @tiptap/extension-text
  @tiptap/extension-bold @tiptap/extension-italic @tiptap/extension-strike
  @tiptap/extension-highlight @tiptap/extension-heading @tiptap/extension-hard-break
  @tiptap/extension-list @tiptap/extension-text-style @tiptap/extensions

extensions: [
  Document, Paragraph, Text, HardBreak,             // skeleton — not user-facing
  Bold, Italic, Strike, Highlight,                  // marks
  Heading.configure({ levels: [2, 3] }),            // blocks
  BulletList, OrderedList, ListItem,                // from @tiptap/extension-list
  TextStyle, FontFamily,                            // font dropdown (TextStyle is its carrier)
  UndoRedo, Placeholder, CharacterCount,            // from @tiptap/extensions
]
```

Toolbar is nine controls: H2, H3, bold, italic, strike, highlight, bullet list, numbered list,
font family. That is about the ceiling for a 280px column.

`FontFamily` ships inside `@tiptap/extension-text-style` (verified in its type definitions).
`UndoRedo`, `Placeholder` and `CharacterCount` all ship inside `@tiptap/extensions` (verified
against the monorepo). `CharacterCount` is not decoration — it enforces the per-note size cap in
the editor so the user is stopped before the server has to 422 them.

**Deliberately excluded, with reasons** (decision 12):
- **Images / audio / youtube / twitch / file-handler** — five separate packages, all uninstalled.
  This is the storage-cost surface and none of it can reach us.
- **Link** — the href-protocol sanitisation burden and malicious-URL sharing risk are real; the
  payoff is a clickable URL nobody needs. URLs written as plain text cost nothing and cannot be
  weaponised.
- **Subscript / superscript** — redundant for prose notes and they only widen the toolbar.
- Also out: tables, mentions, emoji, code/code blocks, blockquote, horizontal rule, details,
  text-align, color, typography, find-and-replace, drag handles, collaboration (paid).

**Do not use `@tiptap/starter-kit`** — measured at 125.8 KB gzip vs 95.4 KB for a hand-picked set.
Verified against the registry, it bundles 20 extensions including **Link**, Underline, Code,
CodeBlock, Blockquote and HorizontalRule. Explicit installs are noisier but they are the whole
point: the install list *is* the feature list.

**Why TipTap over Quill**, having measured both: Quill is smaller (58.8 KB + 3.8 KB CSS vs 95.4 KB
gzip), but the editor is lazy-loaded behind a drawer tab and off the initial route, so 36 KB is not
a real cost. What decided it was maintenance and durability — Quill's last release was 2024-11-30
and slowing, TipTap ships continuously; and ProseMirror validates the document against the schema
on load, so changing the extension set later strips unknown nodes rather than corrupting saved
notes. Quill has no equivalent. (Quill remains a fine fallback if TipTap disappoints; Delta is a
better-designed format than ProseMirror JSON in isolation.)

**Licence:** MIT, GPL-3.0 compatible. TipTap's paid tiers ($59/mo Start and up) buy **cloud
documents, collaboration, comments, version history and AI** — none of which we use. Their own
words: *"The Tiptap Editor is open source (MIT) and free… Only platform features and cloud
documents are priced."* Self-hosted with our own Postgres costs nothing.

**SSR:** TipTap is DOM-based. Load it via `dynamic(() => import('./NoteEditor'), { ssr: false })`
and set `immediatelyRender: false` on the editor as belt-and-braces against hydration mismatch.

### Undo/redo — two build requirements

`UndoRedo` wraps ProseMirror's `history` plugin (a real document-level stack, not the browser's
contenteditable undo). Registering it binds `Mod-Z` / `Shift-Mod-Z` / `Mod-Y` automatically, with
`depth: 100` and `newGroupDelay: 500` (a burst of typing collapses into one undo step). Commands
are `editor.commands.undo()/.redo()`, gated by `editor.can().undo()` for toolbar buttons.

1. **⚠️ Hydrate at creation, never after — this is a data-loss path.** If the editor is created
   empty and the fetched note is pushed in afterwards, that insertion lands on the undo stack. One
   Ctrl+Z blanks the note and **autosave then persists the blank**. Gate rendering the editor on
   the note having been fetched and pass it as the `content` option at creation. Costs nothing
   (the editor is lazy-loaded anyway) but must be deliberate — it looks fine in dev against a fast
   local API.
2. **Undo history dies on unmount — accepted.** The stack is in-memory per editor instance, so
   switching drawer tabs or closing the drawer loses it while the text stays saved. Keeping the
   editor mounted-but-hidden would preserve it; **we are taking the hit for now** (Matt's call). A
   reopened note reasonably reads as a fresh session.

One known leak: `TextStyle`/`FontFamily` parse `style="font-family: …"` off pasted HTML, so a paste
from Google Docs can carry in a font outside our dropdown. Cosmetic only. Configure a strict
whitelist if it ever grates.

## 5. API

Routes live on the notes module (`/api/notes`), not nested under `/api/campaigns/…` — nesting
would put notes endpoints in the campaign module and break aggregate ownership. **No nginx change
needed**: `docker/dev/nginx/nginx.conf:148` already catch-alls `/api/` to api-site.

```
GET    /api/notes?campaign_id={uuid}   → [{id, title, updated_at}]  (no bodies; list is a picker)
GET    /api/notes/{note_id}            → full note incl. content_delta + rev
POST   /api/notes                      → create {campaign_id}       (422 at the 100 cap)
PUT    /api/notes/{note_id}            → {content_delta, content_text, rev}  (409 on rev mismatch)
PATCH  /api/notes/{note_id}            → {title}   (rename only)
DELETE /api/notes/{note_id}
```

Every handler loads the note and asserts `note.user_id == current_user.id` before anything else.
`GET` with no notes returns `[]` — it never creates.

Server-side guards: the 100-note cap (422 with *"100 note limit reached — delete a note to make
room."*), and a per-note size cap (~256KB on `content_delta`) so a runaway client cannot write
unbounded rows.

Per CLAUDE.md's DTO rules: if the response maps field-for-field off the aggregate, use
`from_attributes = True` + `model_validate(aggregate)` and write no helper. Declare `id` as `UUID`
rather than `str` so Pydantic serialises it without a manual mapper.

## 6. Frontend

New slice `rollplay/app/notes/` — components + hooks, exported through `index.js`, consumed by the
game drawer. Putting it in its own slice (rather than `app/game/components/`) costs nothing now and
means the v2 dashboard surface imports the same components instead of lifting them out later.

```
app/notes/
  components/NotesPanel.js     # picker header + editor + status
  components/NoteEditor.js     # TipTap; dynamic({ ssr: false })
  components/NotePicker.js     # Dropdown of titles + "12 / 100" + New note
  hooks/useNotes.js            # TanStack list/get/create/rename/delete
  hooks/useNoteAutosave.js     # debounce + ceiling + flush (see §7)
  index.js
```

**Tab wiring.** Add `{ id: 'notes', label: 'NOTES' }` to `RIGHT_DRAWER_TABS`
(`rollplay/app/game/GameContent.js:61-73`) with no `dmOnly` flag — it would be only the second
non-DM tab on that side, after `MOD`.

> ⚠️ The right drawer does **not** use the reusable `Drawer` component. `app/game/components/Drawer.js`
> exists and the *left* drawer uses it; the right drawer is hand-rolled duplicate markup inline in
> `GameContent.js` (~:2258 onward). Adding the tab means editing that inline block. Migrating the
> right drawer onto `Drawer.js` is a worthwhile cleanup and is **out of scope here** — do not let
> this feature turn into that refactor.

**Layout constraints.** `.right-drawer` is `calc(380px + var(--panel-width-addition))`, which
resolves to **280–560px** across the UI-scale settings (`globals.css:754`, `:355-370`). That is a
narrow column for prose and there is no existing expand/fullscreen pattern in any drawer panel to
copy. v1 accepts the narrow column. `.drawer-content` is `overflow-y: auto`; the editor needs its
own bounded height rather than inheriting that scroll, or the picker header scrolls away.

**Reused, not rebuilt:** `Dropdown` (picker), `EmptyState` (no notes yet), `ConfirmDialog` (delete),
`authFetch` (every call), TanStack for list/get. `Combobox` is the upgrade path for the picker if
anyone accumulates enough notes to need filtering — same single-select semantics, so it is a
component swap, not a rework. Do not pre-emptively build it.

Note that `Dropdown` is an **action menu**, not a value-select: its API is
`items: [{label, onClick, icon?, variant?, disabled?}]` (`Dropdown.js:32`) with no concept of a
selected item. That is fine — each item's `onClick` selects that note — but marking the *current*
note needs the `icon` prop; it will not happen for free. `EmptyState({icon, title, description,
action})` has the `action` slot the "New note" button needs.

## 7. Autosave

No save button — the runtime is fluid and a button is a thing to forget. The status indicator
("Saving… / Saved") is the user's trust model in its place, so it is not optional.

- **Dirty detection:** TipTap `onUpdate`. Skip entirely if the serialised content is unchanged.
- **Two timers.** ~1.5s idle debounce *plus* a ~10s max-wait ceiling. Debounce alone means someone
  who types for four minutes straight never saves — the exact failure being prevented. The ceiling
  is the actual safety property.
- **Whole-document snapshots, not incremental deltas.** ProseMirror/Quill both expose change
  steps, but delta-only persistence needs a revision counter, strictly ordered application and a
  stale-rejection path or it corrupts *silently*. That is a distributed-systems problem for zero
  benefit on a few-KB document.
- **Flush on every exit path:** tab change, drawer close, unmount, `visibilitychange → hidden`,
  `pagehide`. `PlayerTokenSizeControl.js:47` has the flush-on-unmount pattern and a comment on why
  it matters; `useWorkshopMixEngine.js:79` has the merged-pending-queue shape.
- **The `pagehide` flush cannot use `authFetch`** — its 401-refresh-retry cannot run during unload,
  and `keepalive` caps bodies at 64KB. Best-effort `fetch(..., { keepalive: true })`, accepting the
  loss, since a normal save happened ≤10s earlier.
- **No local mirror.** Considered and rejected: IndexedDB-per-keystroke buys crash resilience at
  the cost of a conflict-resolution problem. Revisit only if someone actually loses work.

**Traffic.** The debounce is the rate limit — a higher rate is unreachable by construction, not
policed. Continuous typing caps at ~6 requests/min/user; six players is ~36/min per table, a few KB
each. There is no rate limiting anywhere in the stack (no `limit_req` in either nginx config, no
middleware in api-site), which is acceptable at current scale (~7 production users) but means the
client-side guards are load-bearing. A "minimum 2s since last request" backstop is three lines and
worth having. Note that a client-side cap is **self-restraint, not enforcement** — it does nothing
against a modified client.

## 8. What we will NOT invent

- **No new drawer/panel abstraction.** `Dropdown`, `EmptyState`, `ConfirmDialog` already exist.
- **No shared `useDebouncedSave` hook.** Four hand-rolled debounces exist across the app
  (`PlayerTokenSizeControl`, `useWorkshopMixEngine`, `AudioWorkstationTool`, `ColorPicker`).
  Extracting a generic is a legitimate cleanup and is **not this feature's job**.
- **No right-drawer refactor** onto `Drawer.js` (see §6).
- **No soft-delete on campaigns.** An "archived campaigns" section would need `deleted_at`
  threaded through every campaign query, membership check and session guard — a large change to a
  core aggregate to serve a notes feature. `SET NULL` + stamped `campaign_name` gets the same UX.
- **No session stamping on note rows.** Deliberately rejected (decision 1). If "notes from session
  4" is ever wanted, it is an additive column, not a re-model.
- **No Mongo, no ETL, no WebSocket, no shared contract, no `EventConfig`.**

## 9. Implementation steps

**PR 1 — backend (`api-site/modules/notes/`)**
1. `model/note_model.py`; import it in `alembic/env.py`; autogenerate the migration in Docker.
2. `domain/note_aggregate.py` — `NoteAggregate` with `rename`, `update_content` (bumps `rev`),
   and the derived-title rule.
3. `application/commands.py` (`CreateNote`, `UpdateNoteContent`, `RenameNote`, `DeleteNote`) and
   `queries.py` (`GetNotesForCampaign`, `GetNoteById`). The 100-cap lives in `CreateNote`.
   `CreateNote` injects `CampaignRepository` to read the name it stamps — allowed cross-aggregate
   injection, and the only place notes touch campaigns.
4. `repositories/note_repository.py`, `dependencies/providers.py`, `api/{endpoints,schemas}.py`.
5. Router into `main.py`. Tests in `modules/notes/tests/`.

**PR 2 — frontend (`rollplay/app/notes/` + drawer tab)**
1. Install the editor. ⚠️ **A host-side `npm i` will not reach the dev container.**
   `docker-compose.dev.yml` mounts a named volume `rollplay_node_modules:/app/node_modules` over
   the `./rollplay:/app` bind mount, so host-installed packages are masked inside the container.
   Install in the container (`docker exec rollplay-dev npm i @tiptap/react @tiptap/core @tiptap/pm
   @tiptap/extension-text-style`) **and** on the host so `package.json` / lockfile are committed —
   or rebuild the image and recreate the volume. Also note HMR is unreliable in this container; a
   `.next` clear + restart may be needed to see changes.
2. `NoteEditor` (dynamic, `ssr: false`, `immediatelyRender: false`), extension set per §4, toolbar:
   H2, H3, bold, italic, strike, highlight, bullet list, numbered list, font-family (one
   proportional, one monospace). Editor renders only once the note is fetched (see §4 undo).
3. `useNotes` (TanStack) + `useNoteAutosave` (§7) + save-status indicator.
4. `NotePicker` — Dropdown of titles, "n / 100", New note, rename, delete via `ConfirmDialog`.
5. `NotesPanel` composition; `EmptyState` when the list is empty.
6. Wire the tab into `GameContent.js`'s inline right-drawer block.

## 10. Testing

- **Backend:** ownership rejection (another user's note → 404/403, never a leak); the 100 cap;
  `rev` mismatch → 409; size cap; `campaign_name` stamped at create; **campaign deletion leaves
  the note with `campaign_id IS NULL` and its name intact** — the one behaviour most likely to
  regress silently.
- **Frontend: manual only.** There is no JS test runner in this repo — `package.json` scripts are
  `dev` / `build` / `start` / `lint`, with no jest or vitest. So the following are QA steps, not a
  suite: the autosave ceiling actually fires during sustained typing (not just the idle debounce);
  flush on drawer close does not lose the last edit; StrictMode double-mount does not duplicate the
  editor or its toolbar.
- **Manual:** two tabs on the same note → second save 409s and prompts rather than clobbering.

## 11. v2 and out of scope

**v2 — notes outside the game.** A notes button in the campaign drawer on the dashboard. The
backend above already supports it unchanged (campaign-scoped, ownership-gated, no session
involvement) — v2 is purely frontend. Orphaned notes need a home that is not inside a campaign, and
the intended answer is the parked **Home** landing page
(`.claude/plans/TODO-home-landing-page.md`). **v2 must not depend on Home shipping**: worst case it
lands in the campaign drawer alone and the archive waits. At ~7 production users, the interim
answer for an orphaned note is a direct PostgreSQL query.

**Open / deferred:**
- Full-text search over `content_text` (column exists, endpoint does not).
- Expand/fullscreen affordance for the drawer — the 280–560px column may prove too narrow in real
  use. Decide from QA, not in advance.
- Export (markdown/PDF).
- Whether the picker outgrows `Dropdown` and needs `Combobox`. Let usage decide.
