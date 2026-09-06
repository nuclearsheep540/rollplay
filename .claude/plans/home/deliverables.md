# Deliverables — what `feature/home-page` is shipping

> Written 2026-09-06 from the [epic](00-epic.md), [01](01-home-shell-and-ranked-campaigns.md),
> [02](02-live-panels-and-news.md), [03](03-scheduling.md) and [06](06-game-lifecycle.md),
> BEFORE the code deep-dive. This is the *intended* behaviour list, phrased as behaviours a
> user or the system exhibits — the contract we QA against. Where the plans' shipped notes
> already record a deviation it is called out inline as **KNOWN DEVIATION**; everything else
> is to be verified in code and then by hand.
>
> Tags: **NEW** (did not exist before this branch), **CHANGED** (existed, behaves
> differently), **REMOVED** (existed, gone). [05](05-campaign-create-and-publish.md) is
> parked — nothing from it ships here.
>
> PRs on the branch: #168 (shell + launcher), #170 (news + pulse + presence), #175
> (lifecycle + scheduling). Base: main at 0.64.6.

---

## A. Landing and chrome (stage 1)

| # | Tag | Behaviour |
|---|---|---|
| A1 | CHANGED | **Given** a signed-in user opens `/dashboard` (or any bare `/dashboard` navigator: login return, game exit, wordmark) **then** they land on Home — not on the Campaigns tab. No forced `?tab=campaigns` redirect. |
| A2 | CHANGED | **Given** any existing `?tab=campaigns|characters|library|…` URL (deep links, notification routing, workshop back-links) **then** it still opens that index view unchanged. |
| A3 | REMOVED | The tab bar (`TabNav`/`SubNav`) is gone. No tab is ever "underlined"; Home has no tab of its own. |
| A4 | NEW | **App-select launcher** (9-dot button in the top bar): a 2×2 grid [Campaigns, Characters, Library, Market] plus a WORKSHOP section listing the real tools (Map Config, Image Config, Audio Workstation; NPC Barracks / Scene Builder disabled with "Soon"). Entries navigate to the same `?tab=` views. The surface you are on is marked but not disabled. The workshop index remains reachable via the section header. |
| A5 | NEW | **ADMIN launcher section** (first entry "News editor") is visible only when the current user is an admin (see D1). |
| A6 | CHANGED | The wordmark/logo is a link to `/dashboard` (Home). There is no house icon. |
| A7 | REMOVED | The standalone logout icon in the header is gone. |
| A8 | NEW | **User chip** (avatar capsule + screen name) opens a menu [Account, Sign out] — sign-out is now a deliberate two-step. |
| A9 | CHANGED | `tab=account` notification links route to `/account` instead of an empty dashboard content area. |
| A10 | CHANGED | Social panel closes on outside click (long-standing bug fixed as a rider of the chrome work). |
| A11 | CHANGED | Account page restructured in the 8° plate language (profile capsule, identity colour swatches). No behaviour change beyond layout. |
| A12 | CHANGED | `screen_name` is capped at 30 characters at the API and in all three inputs, with live counters. |

## B. Home page content (stage 1)

| # | Tag | Behaviour |
|---|---|---|
| B1 | NEW | **Greeting**: "Welcome back, {screen_name}" + a flavor tagline sharing a line with a live client-side clock (date · time, blinking colon). The greeting never carries status. *(Tagline template bank is epic step 6 — still a placeholder line; verify what renders.)* |
| B2 | NEW | **Hero card** = the single ranked campaign, full width, campaign art (preset or signed asset; painted gradient base when no art), title, role chip ("Game Master" / "Player"), state line, role-conditional actions. Only ONE hero — no rank-2/3 cards, no "N more" link. |
| B3 | NEW | **Ranking** (client-side over the campaigns query): live game first → soonest *future* `scheduled_at` → most recent `last_played_at`. A past schedule counts as none. Eligibility = every campaign the user is a member of (every campaign has a session — see F). |
| B4 | NEW | **GM hero actions**: NOTES (→ `/notes?campaign_id=`), INVITE PLAYER, and the game button: START GAME when idle, ENTER GAME when live (glow ring). Never "Resume". STARTING/STOPPING render as non-interactive in-flight states. |
| B5 | NEW | **Player hero actions**: MANAGE CHARACTER, JOIN GAME (enabled only when live, with the glow); otherwise WAITING FOR GM. |
| B6 | NEW | **Hero state line** (one shared rule): live → "Started {relative}"; idle with a future schedule → "Next game · {local date/time}"; otherwise the last-played line. |
| B7 | NEW | **Working-on card** ("Continue building"): the most recently edited *owned* campaign, with ASSETS / WORKSHOP / CAMPAIGN EDITOR actions and last-edited meta. May show the same campaign as the hero. With zero owned campaigns it renders the **create-campaign template** — Home's only create affordance — whose CTA opens the existing create modal via `?create_campaign=1`. With any owned campaign there is no create/switch affordance on Home. |
| B8 | NEW | **Invite deck**: a pending campaign invite tucks UNDER the hero's bottom-right with a wiggling "!" on the exposed corner; clicking swaps the two cards exactly (switcheroo), the hero staying live in the tuck slot; the tuck space is always reserved so nothing shifts. Accept = one tap. Decline = two-step in-card confirm, nothing sent until confirmed. Multiple invites stack under, one promoted at a time. |
| B9 | NEW | **"Your characters" hand**: overlapping rounded-parallelogram cards of the user's characters with real portraits (default art when none); hover lifts (Home only). Zero characters → ghost create card. |
| B10 | NEW | **Empty state** (no campaigns at all): the hero becomes the invite-centric onboarding card (no create push — "invites from your GM arrive right here"); the working-on slot shows the create template. |
| B11 | NEW | **Featured from the Market** renders as a VISIBLE placeholder card (mock-style content, cover-forward, pinned to the right column foot). No real feed. |
| B12 | NEW | **Layout**: greeting → hero (+ tuck slot) → Pulse divider → two columns (news noticeboard 2/5 left; working-on over featured 3/5 right) → characters hand → footer. |
| B13 | REMOVED | **Demo campaign auto-grant** is gone (`has_received_demo` column dropped). New users get the onboarding hero, never a demo campaign. |
| B14 | REMOVED | `CampaignSummaryResponse.active_sessions` (always hardcoded 0, nothing read it) is deleted. |
| B15 | REMOVED | `SessionsManager.js` (orphaned Sessions tab) deleted. There is no Sessions surface. |

## C. Campaign truth data (stage 1 truth PRs)

| # | Tag | Behaviour |
|---|---|---|
| C1 | NEW | `campaigns.last_played_at` exists, is stamped when a game goes live, is exposed on both campaign responses, and is **backfilled** from `MAX(sessions.started_at)` for existing data. |
| C2 | CHANGED | The Campaigns tab "Last played" no longer shows "Never" for every campaign (was a shipped defect). |
| C3 | CHANGED | `campaigns.updated_at` is stamped by commands, not by the ORM `onupdate`; session create/delete no longer touch the campaign row, so lifecycle actions do not move the "last edited" meta on the working-on card. |
| C4 | CHANGED | `active_game_id` is retired: the session id addresses the hot game and `status == ACTIVE` is the receipt. Start asserts api-game echoes our session id. |

## D. Admin + news ("What's new", stage 2)

| # | Tag | Behaviour |
|---|---|---|
| D1 | NEW | **Admin** = email in the `ADMIN_EMAILS` runtime env allowlist (`dev.env`/`prod.env`), evaluated per request by `require_admin`; `is_admin` appears on the current-user response. No DB role, no JWT claim. Empty allowlist = nobody is admin, app still boots. |
| D2 | NEW | **News reads** are open to any authenticated user: latest post, a post by id, listing. **Writes** (create, update, publish/unpublish, delete, image ops) return 403 for non-admins even with a hand-crafted request; 401 unauthenticated. |
| D3 | NEW | A **news post** has a title, a TipTap document, `author_name` (plain string), draft/published state with `published_at`, and four optional banner slots (home-card top/bottom, article top/bottom; 21:9, letterboxed never cropped). |
| D4 | NEW | **Durability**: every save writes the full post JSON to S3 (`news_media/{id}/article.json`); `admin.py restore-news` re-hydrates PostgreSQL from S3 after a wipe (idempotent: already-present posts are skipped). Stored docs hold S3 *keys*; URLs are signed at read time. |
| D5 | NEW | **Images**: uploaded via presigned URL into an article-scoped folder (default tab THIS ARTICLE) or the shared library; an image can be promoted to shared / claimed by an article (move), refused (409) if another article uses it; deleting an in-use image is refused naming the post; deleting an article removes its whole folder. Submitted image keys are validated (a foreign/pasted URL fails with 400). |
| D6 | NEW | **Editor** at `/news/editor` (index of all posts, drafts + published, Create-New) and `/news/editor/{id}`: TipTap toolbar (headings, block spacing/line height, links, in-content images with alt text), banner slots with a HOME CARD / ARTICLE toggle and drag-from-rail drop targets, tabbed 1-up preview that renders the *real* Home card and article components. PUBLISH saves first, then publishes; it toggles to unpublish. **KNOWN DEVIATION**: banner/in-content previews show the last *saved* art, not unsaved slot changes. |
| D7 | NEW | **Home noticeboard card** shows the latest published post (light "parchment" card with frame-breaking banners); click opens the full article in a full-screen modal on the light ground; the article owns its own header (title → rule → author/meta). |
| D8 | NEW | **Likes**: the like counter beside the date is the CTA; click toggles ±1, heart fills when liked; count is public, liked-state per user. The editor preview's like button is inert. |
| D9 | NEW | **NEW! receipt**: the UPDATES section header shows NEW! until the current user opens the latest post; opening flips a per-user read receipt. |
| D10 | — | Not reintroduced: in-app patch notes / release changelog. Release notes remain GitHub Releases. |

## E. Pulse + presence (stage 2, v1)

| # | Tag | Behaviour |
|---|---|---|
| E1 | NEW | **Presence is pushed**: `friend_online` fires on a user's first events-socket connection, `friend_offline` on their last disconnect (multi-tab does not re-fire), delivered to accepted friends only. Online shows a toast; offline is silent; neither writes a notification row. |
| E2 | CHANGED | Social panel presence dots update on these events, not only on refetch-on-open. A grace window (`users.last_seen`) prevents flapping on brief reconnects. |
| E3 | NEW | **Pulse line** = a full-width divider directly under the hero: breathing gold dot hard left, avatar coins of online friends, event pills emitted as a ticker (newest by the dot, older slide right and dim, max 4 width-aware), hairline rule to the edge. |
| E4 | NEW | **Dimmer, not switch**: breath rate / coin count / cadence scale with a weighted score. v1 signals: a live game in one of *my* campaigns (weighs most) and online friends. |
| E5 | NEW | **Live game = content**: a sticky gold pill at the head of the line ("{campaign} is live") carrying its own JOIN/ENTER action. |
| E6 | NEW | **Calm pill**: when nothing is live and nothing is queued — "All is quiet in the tavern…", or "All is quiet · next game {local short date}" naming the soonest future schedule across the user's campaigns (stage 3). |
| E7 | NEW | Ticker hydrates on load from a bounded, self-expiring per-user `pulse_events` store, so a fresh page load is not empty. A `friend_online` pill is not drawn for someone no longer online. |
| E8 | NEW | Every pill is actionable: friend → opens the social panel; live game → Join. |
| E9 | — | **Privacy invariant**: Pulse never shows a session the user is not a member of. |
| E10 | CHANGED | `session_started` no longer persists a notification row for the host (toast only); other members still get toast + row. |
| E11 | — | **KNOWN LIMITS (v1)**: ticker is arrivals-only (no "game started" pills; live games surface via E5); no "editing character / writing notes" signals; no music line. |

## F. Game lifecycle (stage 6) — the new user flows over existing data

| # | Tag | Behaviour |
|---|---|---|
| F1 | CHANGED | **Every campaign has exactly one session, always.** Created with the campaign; replaced only by Reset; never zero, never two. Start and Schedule never create one. |
| F2 | REMOVED | User-facing session create, rename and delete. `POST /api/sessions/`, `PUT /{id}`, `DELETE /{id}` are gone; the drawer has no "Create new session" CTA and no "No active session" state; the create modal and session-name field are gone. |
| F3 | REMOVED | `sessions.name` (column, request/response fields, "Session Name" input on the campaign form, `session.name` readers). |
| F4 | CHANGED | **User vocabulary is Start game / End game / Reset game.** "Session" appears nowhere a user reads; "Resume" and "Pause" appear nowhere. Backend names (`sessions`, `PauseSession`, `SessionStatus`) unchanged. |
| F5 | CHANGED | **End game** (drawer END GAME, in-game end button, hero has none) = the backend pause: ACTIVE → STOPPING → INACTIVE with the full hot→cold ETL. Token boards (PC and NPC positions) and the adventure log are kept; Start game afterwards restores them. **This is the token-loss fix**: the in-game button previously called `/finish`. |
| F6 | REMOVED | **FINISHED** status, `finish()`/`mark_finished()`, `FinishSession`, `POST /{id}/finish`, `session_finished` event, all frontend readers, and every existing FINISHED row (migration). INACTIVE is the only resting state. |
| F7 | CHANGED | **System pause** (expiry sweeper, `admin.py pause-session`) still exists, passes `PauseReason.SYSTEM`, is silent (no toast, no notification row, cache invalidation only) and leaves cards reading START GAME — indistinguishable from an idle game. |
| F8 | NEW | **`session_ended` event** on `PauseReason.HOST_ENDED`: toast "The game has ended" to campaign members *other than the host*; not persisted. Panel copy "{host} ended the game for {campaign}". |
| F9 | ~~NEW~~ PULLED | **Reset game** *(shipped in #175, then REMOVED from the branch on 2026-09-06 before QA, per [07-game-aggregate.md](07-game-aggregate.md): endpoint, command, modal, mutation, button and tests are gone. Nothing to QA. Original description kept for the record:)* (`POST /{id}/reset`, drawer only, INACTIVE only, 3-second confirm): deletes and recreates the session in one server operation and returns the new one. **Also clears the table**: every non-DM member is removed and every pending invite cancelled through the existing commands (locks released, people notified). Loses: party + invites, player tokens, NPC in-play positions (back to workshop baseline), adventure log, schedule, active map/image/display, audio + Spotify config. Keeps: assets, notes, NPC baselines, the players' characters (released, still theirs). Refused while live with nothing changed ("End the game before resetting it"). |
| F10 | CHANGED | **Seats** are a campaign setting: `campaigns.max_players` (1–8, default 8), a "Seats at the table" control on the campaign form with "applies the next time the game starts" semantics; sent in the Start payload; never read back from a running game. |
| F11 | REMOVED | The in-game seat editor (ModeratorControls), `seat_count_change` websocket event, api-game `PUT /game/{room}/seats` and `update_seat_count`, `SessionStats.max_players` in the contracts. |
| F12 | CHANGED | A campaign remains **editable while its game is live** (deliberate: applies at next Start). No lock. |
| F13 | CHANGED | **Campaign delete** refuses while the game is live ("End the game before deleting this campaign"); when idle it deletes the campaign's session with it. (Before: refused on any non-FINISHED session.) **KNOWN DEVIATION**: `DeleteCampaignModal` copy still says "All associated game sessions will also be deleted" — needs the end-first wording. |
| F14 | CHANGED | **Drawer controls**: live → ENTER GAME + END GAME; idle host → START GAME + SCHEDULE + RESET GAME (subordinate); player → JOIN when live. Header shows game state (Live / Idle / Starting… / Ending…), never a session name. |
| F15 | CHANGED | **Hero**: host idle always START GAME (the "has played → RESUME" branch is gone); "Nothing at the table yet" variant deleted (unreachable). |
| F16 | CHANGED | Event copy: `session_created` panel line no longer names a session; `session_paused` toast is null with panel copy "The game was closed after being left running". |
| F17 | — | Unchanged by design: the 200-line adventure-log cap; STARTING/STOPPING in-flight rendering; the ETL's persisted/restored fields (minus the seat write-back); the hold/drag token system. |

## G. Scheduling (stage 3)

| # | Tag | Behaviour |
|---|---|---|
| G1 | NEW | `sessions.scheduled_at` (timestamptz, nullable) = "the next game". One mutable value per campaign's session; no history, no RSVP. |
| G2 | NEW | **Cosmetic only**: nothing starts, nobody is reminded, nothing is locked or validated against it (no server check that it is in the future). |
| G3 | NEW | **Host sets it from the drawer** (SCHEDULE next to START GAME) via `PATCH /api/sessions/{id}/schedule`: a date input + a TimeField (typed or picked, five-minute marks, any typed minute accepted), SAVE and CLEAR (null). Disabled while live ("End the game to change the schedule"); the server refuses while not INACTIVE (400) and refuses non-host (400) and naive datetimes (422). **KNOWN DEVIATION** from plan: not a single `datetime-local` input. |
| G4 | NEW | **Timezones**: the GM's input is interpreted in their browser zone and sent as a UTC instant; every viewer renders it in their own zone with `Intl`. No user timezone setting; the server zone is irrelevant. |
| G5 | NEW | **End game clears it** (HOST_ENDED, same phase-2 write as the extracted state). **System pause leaves it.** The clock never clears it; a past value is simply not shown. |
| G6 | NEW | **Display**: hero and drawer share one rule — idle with a future value → "Next game · Thu 4 Sep, 20:00"; past or none → the last-played line; live → "Started {relative}". Rendered client-side only. |
| G7 | NEW | **Ranking middle slot**: an idle scheduled campaign outranks an idle unscheduled one with a more recent last-played; a live campaign outranks both (see B3). |
| G8 | NEW | **`session_scheduled` event** to campaign members other than the host on set, change and clear: toast + persisted notification, copy "{host} set the next {campaign} game for {local time}" / "{host} cleared the next game for {campaign}", formatted in the recipient's zone. The host gets neither. |
| G9 | NEW | Calm pulse pill names the soonest future schedule across the user's campaigns (E6). |
| G10 | — | Not built, by decision: RSVP, reminders, recurrence, ICS, countdowns, hero schedule opener (drawer is the single control; revisit if GMs miss it). |

## H. Migration behaviours on existing data (what happens to a real database)

| # | Tag | Behaviour |
|---|---|---|
| H1 | CHANGED | `users.has_received_demo` dropped; no data effect beyond the column. |
| H2 | NEW | `campaigns.last_played_at` backfilled from the latest `sessions.started_at` per campaign; campaigns never played stay null and render as never played. |
| H3 | NEW | `campaigns.max_players` backfilled from each campaign's current non-finished session's value (fallback 8), *before* `sessions.max_players` is dropped. |
| H4 | REMOVED | Every `sessions` row with status `finished` is deleted (their roster rows cascade). Their ETL snapshots are gone with them — nothing surviving reads them. |
| H5 | NEW | Every campaign left without a session gets a fresh INACTIVE one (host = `campaigns.created_by`, JSONB fields at defaults) with its roster filled from `campaign_members` (every role except invited). Afterwards `SELECT campaign_id, count(*) FROM sessions GROUP BY 1 HAVING count(*) <> 1` returns nothing. |
| H6 | NEW | Campaigns whose only session was INACTIVE keep it — boards, log and screen state survive into the new model. |
| H7 | NEW | `sessions.scheduled_at` added, null for all. |
| H8 | NEW | News tables (`news_posts`, likes, reads), `users.last_seen`, `users.pulse_events` added, empty. |
| H9 | CHANGED | Persisted `session_started` notification rows created before this branch still carry `session_name`; the frontend copy no longer reads it, so they render without it. |
| H10 | — | Downgrade of the lifecycle migration restores the dropped columns with defaults but does **not** resurrect FINISHED rows. |

## I. Explicitly NOT in this branch

- Market beyond the visible placeholder (stage 4); the media source/asset split.
- Campaign create→publish flow (05, parked).
- Live seat count on the hero ("N at the table") — api-game HTTP still unauthenticated, no plumbing.
- Tagline template bank (epic step 6).
- Pulse v2 (activity signals, reporting channel, full weight table) and the now-playing music line.
- Reduced-motion and narrow-width QA on Home (recorded as unexercised in #168).
- Focus-visible rings on the three header controls (suppressed, needs shape-following rings).
- Account page redo beyond the chrome rework.

## J. Items already flagged for the code deep-dive

1. `DeleteCampaignModal` copy (F13).
2. Tagline: what actually renders today (B1).
3. Pulse weight/score inputs: confirm E4/E5 wiring given the "arrivals-only" ticker note.
4. Whether the drawer SCHEDULE control is disabled (not hidden) while live with the title text in G3.
5. ~~The `session_created` event now also firing from Reset~~ — moot, Reset is pulled.
6. Stale-schedule edge: a past `scheduled_at` on a *live* game (should show "Started…", G6) and on the calm pill (should be ignored, E6).
