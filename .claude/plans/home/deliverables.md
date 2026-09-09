# Deliverables — what `feature/home-page` is shipping

> Written 2026-09-06 from the [epic](00-epic.md), [01](01-home-shell-and-ranked-campaigns.md),
> [02](02-live-panels-and-news.md), [03](03-scheduling.md) and [06](06-game-lifecycle.md),
> BEFORE the code deep-dive. **Revised 2026-09-09 against the code at `7a443f2`.** Two PRs
> landed after the first draft and moved the ground under it: #176 built
> [07](07-game-aggregate.md) (the Game aggregate — sessions lost their status and play
> state, `games` rows own both) and #177 built the tagline bank. Sections C, F, G and H are
> rewritten here to what the code does; every other row was checked against the code row by
> row. §K collects everything the check found that the plans did not predict.
>
> This is the *intended* behaviour list, phrased as behaviours a user or the system
> exhibits — the contract we QA against. **KNOWN DEVIATION** marks a place where the code
> differs from the plan; the plan stays the intent until someone decides otherwise (§K1 is
> the decision list). **HAND QA** marks a row that cannot be proven from the code and needs
> the dev stack.
>
> Tags: **NEW** (did not exist before this branch), **CHANGED** (existed, behaves
> differently), **REMOVED** (existed, gone), **PULLED** (shipped on the branch, then removed
> before QA). [05](05-campaign-create-and-publish.md) is parked — nothing from it ships here.
>
> PRs on the branch: #168 (shell + launcher), #170 (news + pulse + presence), #175
> (lifecycle + scheduling), #176 (game aggregate), #177 (taglines). Base: main at 0.64.6.

---

## A. Landing and chrome (stage 1)

| # | Tag | Behaviour |
|---|---|---|
| A1 | CHANGED | **Given** a signed-in user opens `/dashboard` (or any bare `/dashboard` navigator: login return, game exit, wordmark) **then** they land on Home — not on the Campaigns tab. No forced `?tab=campaigns` redirect. |
| A2 | CHANGED | **Given** any existing `?tab=campaigns|characters|library|…` URL (deep links, notification routing, workshop back-links) **then** it still opens that index view unchanged. (`?tab=account` is deliberately not a tab and falls through to Home — see A9.) |
| A3 | REMOVED | The tab bar (`TabNav`/`SubNav`) is gone. No tab is ever "underlined"; Home has no tab of its own. |
| A4 | NEW | **App-select launcher** (9-dot button in the top bar): a 2×2 grid [Campaigns, Characters, Library, Market] plus a WORKSHOP section listing the real tools (Map Config, Image Config, Audio Workstation; NPC Barracks / Scene Builder disabled with "Soon"). Entries navigate to the same `?tab=` views. The surface you are on is marked (gold pip + `aria-current`) but not disabled — only while on `/dashboard`; on `/account`, `/notes`, `/character/*` and inside a workshop tool nothing is marked. The workshop index remains reachable via the section header. |
| A5 | NEW | **ADMIN launcher section** (first entry "News editor") is visible only when the current user is an admin (see D1). |
| A6 | CHANGED | The wordmark/logo is a link to `/dashboard` (Home). There is no house icon. Since #176 the header image is the extended logo (`/tabletop-extended-logo.png`). |
| A7 | REMOVED | The standalone logout icon in the header is gone. |
| A8 | NEW | **User chip** (avatar capsule + screen name) opens a menu [Account, Sign out] — sign-out is now a deliberate two-step. |
| A9 | CHANGED | `tab=account` notification links route to `/account` instead of an empty dashboard content area. |
| A10 | CHANGED | Social panel closes on outside click (long-standing bug fixed as a rider of the chrome work). |
| A11 | CHANGED | Account page restructured in the 8° plate language (profile capsule, identity colour swatches). No behaviour change beyond layout. |
| A12 | CHANGED | `screen_name` is capped at 30 characters at the API (request schema, aggregate, column) and in both live inputs — the setup modal (`AccountNameModal`) and the account page (`ProfileManager`) — each with a live "{n}/30" counter. The orphaned single-field `ScreenNameModal.js` was deleted (stage 8). |

## B. Home page content (stage 1)

| # | Tag | Behaviour |
|---|---|---|
| B1 | NEW | **Greeting**: "Welcome back, {screen_name}" + a flavour tagline sharing a line with a live client-side clock (date · time, blinking colon). The greeting never carries status. **Tagline bank shipped in #177** (`dashboard/utils/tagline.js`): four situations in priority order — no campaign; a game scheduled today; a game scheduled ahead; between games — each with its own voices (owner / player with a character / player without; between games also with-party / alone / owner-still-building) and one line picked at random per situation. Blank (`&nbsp;`) until both the campaigns and characters queries have data, so a returning player is never greeted as a newcomer. Re-picked only when the campaigns or characters data actually changes (TanStack keeps identities stable across an unchanged refetch) — **HAND QA**: the line must not flicker while the page sits open. No live-game line (the hero owns status); a past schedule counts as none; the owner is never spoken of in the third person; every line is system-agnostic (no critical fails, no slots, no initiative). |
| B2 | NEW | **Hero card** = the single ranked campaign, full width, campaign art (preset or signed asset; painted gradient base when no art), title, role chip ("Game Master" / "Player"), state line, role-conditional actions. Only ONE hero — no rank-2/3 cards, no "N more" link. |
| B3 | NEW | **Ranking** (client-side over the campaigns query): live game first → soonest *future* `scheduled_at` → most recent `last_played_at`. A past schedule counts as none. "Live" = the session's open game has status `active`. Eligibility = every campaign the user is a member of (every campaign has a session — see F). |
| B4 | NEW | **GM hero actions**: NOTES (→ `/notes?campaign_id=`), INVITE PLAYER, and the game button: START GAME when idle, ENTER GAME when live (glow ring). Never "Resume". While a game is starting or ending the button reads **STARTING…** / **ENDING…** and is disabled (stage 8), so nobody keeps pressing it; the status line says the same. |
| B5 | NEW | **Player hero actions**: MANAGE CHARACTER, JOIN GAME (enabled only when live, with the glow); WAITING FOR GM while idle; STARTING… / ENDING… (disabled) during the transitions (stage 8). |
| B6 | NEW | **Hero state line** (one shared rule, see G6): live → "Started {relative}" (prefixed with the game's name when it has one); idle with a future schedule → "Next game · {when}"; idle and played before → **"Last played · {relative}"**; never played → **"Not played yet"** (stage 8 — the earlier "No game running" is gone). |
| B7 | NEW | **Working-on card** ("Continue building"): the most recently edited *owned* campaign, with ASSETS / WORKSHOP / CAMPAIGN EDITOR actions and last-edited meta. May show the same campaign as the hero. With zero owned campaigns it renders the **create-campaign template** — Home's only create affordance — whose CTA opens the existing create modal via `?create_campaign=1`. With any owned campaign there is no create/switch affordance on Home. |
| B8 | NEW | **Invite deck**: a pending campaign invite tucks UNDER the hero's bottom-right with a wiggling "!" on the exposed corner; clicking swaps the two cards exactly (switcheroo), the hero staying live in the tuck slot (its buttons go inert while demoted); the tuck space is always reserved so nothing shifts. Accept = one tap. Decline = two-step in-card confirm, nothing sent until confirmed. Multiple invites stack under, one promoted at a time. |
| B9 | NEW | **"Your characters" hand**: overlapping rounded-parallelogram cards of the user's characters with real portraits (default art when none); hover lifts (Home only). Zero characters → ghost create card. |
| B10 | NEW | **Empty state** (no campaigns at all): the hero becomes the invite-centric onboarding card (no create push, no buttons at all — "invites from your GM arrive right here"); the working-on slot shows the create template. |
| B11 | NEW | **Featured from the Market** renders as a VISIBLE placeholder card (mock-style content, cover-forward, pinned to the right column foot). No real feed. Its "VIEW IN MARKET →" links to `?tab=market`, which is an inline "Coming soon" placeholder. |
| B12 | NEW | **Layout**: greeting → hero (+ tuck slot) → Pulse divider → two columns (news noticeboard 2/5 left; working-on over featured 3/5 right) → characters hand. **KNOWN DEVIATION**: there is no footer — the page ends with the hand and bottom padding. |
| B13 | REMOVED | **Demo campaign auto-grant** is gone (`has_received_demo` column dropped, no grant code path). New users get the onboarding hero, never a demo campaign. Two stale comments still mention lazy demo creation (`user/api/endpoints.py`, `user/application/commands.py`). |
| B14 | REMOVED | `CampaignSummaryResponse.active_sessions` (always hardcoded 0, nothing read it) is deleted. |
| B15 | REMOVED | `SessionsManager.js` (orphaned Sessions tab) deleted. There is no Sessions surface. |

## C. Campaign truth data (stage 1 truth PRs; C4 rewritten for stage 7)

| # | Tag | Behaviour |
|---|---|---|
| C1 | NEW | `campaigns.last_played_at` exists, is stamped when a game goes ACTIVE (`campaign.mark_played()` in `StartGame`, as a swallowed post-start side effect — a failed stamp never fails a start), is exposed on both campaign responses, and is **backfilled** from `MAX(sessions.started_at)` for existing data. |
| C2 | CHANGED | The Campaigns tab "Last played" no longer shows "Never" for every campaign (was a shipped defect). (The hero does not show it at all — B6.) |
| C3 | CHANGED | `campaigns.updated_at` is stamped by commands, not by the ORM `onupdate`; session create never saves the campaign row and there is no session delete at all (sessions go only with their campaign), so lifecycle actions do not move the "last edited" meta on the working-on card. |
| C4 | CHANGED | `active_game_id` stays retired and nothing replaced it. **The game's id is the room id**: Start mints a `games` row first, sends its id as `game_id` in the start payload, api-game keys the Mongo document by it and echoes it, and Start asserts the echo matches. `/game?room_id=` carries the game id. **Liveness is a query, never a column**: a session is live iff it has an open game (`status <> 'ended'`), and a partial unique index (`ix_games_one_open_per_session`) enforces at most one open game per session in the database. |

## D. Admin + news ("What's new", stage 2)

| # | Tag | Behaviour |
|---|---|---|
| D1 | NEW | **Admin** = email in the `ADMIN_EMAILS` runtime env allowlist (`dev.env`/`prod.env`), lowercased into a set and evaluated per request by `require_admin`; `is_admin` appears on the current-user response. No DB role, no JWT claim. Empty or missing allowlist = nobody is admin, app still boots. The allowlist is read once at import, so an edit needs `docker compose up -d` (recreate), not `restart`. |
| D2 | NEW | **News reads** open to any authenticated user: latest published post, a post by id (drafts 404 to non-admins), like, read-receipt. **Writes** (create, update, publish/unpublish, delete, image list/upload/move/delete) return 403 for non-admins even with a hand-crafted request; 401 unauthenticated. **KNOWN DEVIATION**: the listing `GET /api/news/` is admin-only too (it serves the editor index); the plan said listing was open. |
| D3 | NEW | A **news post** has a title, a TipTap document, `author_name` (plain string, no user FK), draft/published state with `published_at`, and four optional banner slots (home-card top/bottom, article top/bottom; 21:9, `contain` — letterboxed never cropped). |
| D4 | NEW | **Durability**: every save writes the full post JSON to S3 (`news_media/{id}/article.json`); `admin.py restore-news` re-hydrates PostgreSQL from S3 after a wipe (idempotent: already-present posts are skipped). Stored docs hold S3 *keys*; URLs are signed at read time. The write-through swallows S3 client errors, so a save can succeed with no S3 copy (logged). |
| D5 | NEW | **Images**: uploaded via presigned URL into an article-scoped folder (default tab THIS ARTICLE) or the shared library; an image can be promoted to shared / claimed by an article (move), refused (409) if another article uses it; deleting an in-use image is refused naming the post; deleting an article removes its whole folder. Submitted image keys are validated (a foreign/pasted URL fails with 400). |
| D6 | NEW | **Editor** at `/news/editor` (index of all posts, drafts first, NEW POST) and `/news/editor/{id}`: TipTap toolbar (H2/H3, block spacing/line height, links, in-content images with alt text), banner slots with a HOME CARD / ARTICLE toggle and drag-from-rail drop targets, tabbed 1-up preview (EDIT / HOME CARD / ARTICLE) that renders the *real* Home card and article components. PUBLISH saves first, then publishes; it toggles to unpublish. The previews re-sign banner and in-content URLs from the live image directory, so **unsaved slot changes do preview** (the "last saved art" deviation recorded on 2026-09-06 no longer holds) — **HAND QA** that the directory is populated before the first preview. Re-publishing keeps the original `published_at`; unpublish clears it, so unpublish → republish re-dates the post to the top of Home. |
| D7 | NEW | **Home noticeboard card** shows the latest published post (light "parchment" card with frame-breaking banners); click opens the full article in a modal on the light ground that starts below the site header (not full-viewport); the article owns its own header (title → rule → author/meta). |
| D8 | NEW | **Likes**: the like counter beside the date is the CTA; click toggles ±1 optimistically, heart fills when liked; count is public, liked-state per user. The editor preview's like button is inert. **Displayed counts are the stored count + 1** (`LIKE_COUNT_BASE = 1`) — a post nobody has liked shows 1; QA reading raw numbers should expect the off-by-one. |
| D9 | NEW | **NEW! receipt**: the UPDATES section header shows NEW! until the current user opens the latest post; opening flips a per-user read receipt (`news_post_reads`). |
| D10 | — | Not reintroduced: in-app patch notes / release changelog. Release notes remain GitHub Releases. |
| D11 | — | No NGINX change: `/api/news` falls through the `/api/` catch-all to api-site in both dev and prod. Non-admins reaching `/news/editor` see "Not available" rather than a 403 page. |

## E. Pulse + presence (stage 2, v1)

| # | Tag | Behaviour |
|---|---|---|
| E1 | NEW | **Presence is pushed**: `friend_online` fires on a user's first events-socket connection, `friend_offline` on their last disconnect (multi-tab does not re-fire), delivered to accepted friends only. Online shows a toast; offline is silent; neither writes a notification row. |
| E2 | CHANGED | Social panel presence dots update on these events (both handlers invalidate the friendships query, which the panel keeps mounted), not only on refetch-on-open. A **30 s** grace window (`users.last_seen`, `returned_after_absence`) suppresses the announcement on brief reconnects. |
| E3 | NEW | **Pulse line** = a full-width divider directly under the hero: breathing gold dot hard left, coins of online friends, event pills emitted as a ticker (newest by the dot, older dimmer), hairline rule to the edge. The coins are the app's one identity disc (`UserDisc`, stage 8): the same colour resolution as the social panel — chosen colour, else the palette hash — and whatever avatar lands there lands here. Accepted as intent (D10 of stage 8): the ticker holds **5** pills (a constant, not width-aware); older pills dim rather than slide; the rule fades to transparent. |
| E4 | NEW | **Dimmer, not switch**: a weighted score — a live game in one of *my* campaigns = 6, each online friend = 1, full tilt at 10 — drives the dot's breath period (4 s → 0.9 s) and glow alpha. **KNOWN DEVIATION**: nothing else scales — the coin count is a fixed slice of at most 5 and there is no cadence/emission rate. |
| E5 | NEW | **Live game = content**: a sticky gold pill at the head of the line ("{campaign} is live") carrying its own JOIN action, which enters the open game's room (`/game?room_id={game.id}`). |
| E6 | NEW | **Calm pill**: when nothing is live and no ticker pill is showing — "All is quiet in the tavern..." (ASCII dots), or "All is quiet · next game {when}" naming the soonest *future* schedule across the user's campaigns (date only, never the planned name; a past `scheduled_at` is skipped). A live game replaces it with the live pill even if a stale schedule exists. Note it is suppressed whenever any ticker pill exists, even with nothing live. |
| E7 | NEW | Ticker hydrates on load from a bounded, self-expiring per-user `pulse_events` store — **5 entries, 6 h lifetime**, enforced server-side on write and read and client-side by a 60 s sweep — so a fresh page load is not empty. A `friend_online` pill is not drawn for someone no longer online. |
| E8 | NEW | Actionable: the live pill's JOIN enters the game; the **coin stack** opens the social panel. **KNOWN DEVIATION**: the friend pills themselves are inert spans — a `friend_online` pill does not open the social panel. |
| E9 | — | **Privacy invariant**: Pulse never shows a game the user is not a member of — the live pill iterates only the user's own campaigns query. |
| E10 | CHANGED | `session_started` no longer persists a notification row for the host (toast only); other members still get toast + row. |
| E11 | — | **KNOWN LIMITS (v1)**: ticker is arrivals-only — `friend_online` is the only event that adds a pulse entry, on both sides (no "game started" pills; live games surface via E5); no "editing character / writing notes" signals; no music line. |

## F. Game lifecycle (stages 6 + 7) — the new user flows over existing data

> Rewritten 2026-09-09. Stage 6 (#175) made End keep the session; stage 7 (#176) made the
> Game its own aggregate so ending closes a chapter that can be read back. Rows F1–F17
> keep their ids from the first draft (updated where stage 7 changed them); F18 onward are
> stage 7's additions.

| # | Tag | Behaviour |
|---|---|---|
| F1 | CHANGED | **Every campaign has exactly one session, always.** Created with the campaign; never replaced (Reset is gone — F9); never zero, never two. Start and Schedule never create one. The session is the table — the party and the plan for the next game — and **it has no status and no play state**. |
| F2 | REMOVED | User-facing session create, rename and delete: `POST /api/sessions/`, `PUT /{id}`, `DELETE /{id}` are gone, as are the drawer's "Create new session" CTA, its "No active session" state, the create modal and the session-name field. Stage 7 also removed `POST /api/sessions/{id}/start`, `/{id}/end`, `/{id}/reset` and `/{id}/disconnect`. What remains under `/api/sessions`: `my-sessions`, get by id, by campaign, remove player, `PATCH /{id}/schedule`, `select-character`. |
| F3 | REMOVED | `sessions.name` (column, request/response fields, "Session Name" input on the campaign form, `session.name` readers). |
| F4 | CHANGED | **User vocabulary is Start game / End game.** "Session", "Resume", "Pause", "Finish" and "Reset" appear nowhere a user reads (stage 8 rewrote the nineteen surviving strings; the sweep in its §4 is the check). The backend keeps `sessions` for the table row and the `session_*` wire event names (persisted notification rows carry them). `SessionStatus`, `PauseSession`, `PauseReason` and STOPPING are gone: the lifecycle lives on `GameAggregate` as `GameStatus` STARTING → ACTIVE → ENDING → ENDED and `EndReason` HOST / SYSTEM. The one string api-game sends to users on room close reads "This game has ended." |
| F5 | CHANGED | **End game** (drawer END GAME, in-game end button; the hero has none) = `POST /api/games/{game_id}/end`: ACTIVE → ENDING → ENDED with the full hot→cold ETL, written in one commit **onto the game row** — token boards (PC and NPC), adventure log, active map/image/display, audio and Spotify config, plus attendance. The session is not written by it except for the schedule (G5). The next Start seeds from this game, so the pieces and the log come back. **This is the token-loss fix**: the in-game button previously called `/finish`. Phase-3 room deletion is scheduled the moment the ENDED write lands, before any side effect; a failed schedule write or broadcast is logged and can no longer leave the room hot. A failed cold write retries 1 s / 2 s / 3 s, then rolls the game back to ACTIVE ("still live and can be ended again"). |
| F6 | REMOVED | **FINISHED** status, `finish()`/`mark_finished()`, `FinishSession`, `POST /{id}/finish`, `session_finished` event, all frontend readers, and every existing FINISHED row (migration 9584fb2e1a4c). Stage 7 then removed INACTIVE too: **there is no resting state on the session — idle is the absence of an open game.** ENDED is terminal on a *game*, which is safe because the next game seeds from it. |
| F7 | CHANGED | **System end** (expiry sweeper `expired_game_cleanup.py`; `admin.py end-game` / `end-all-games`) is the same `EndGame` command with `EndReason.SYSTEM`: silent (the `session_paused` wire event — no toast, no notification row, cache invalidation only), the schedule is kept, the end state and attendance are still recorded, and cards read START GAME afterwards — indistinguishable from an idle game. Boot rolls any game stranded at ENDING back to ACTIVE so the sweep can end it properly. |
| F8 | NEW | **`session_ended` event** on `EndReason.HOST`: toast to campaign members *other than the host* — "{game name} has ended" when the game was named, else "The game has ended"; not persisted. Panel copy "{host} ended {game name \| the game} for {campaign}". Payload carries `game_id` and `game_name`. |
| F9 | PULLED | **Reset game** shipped in #175 and was removed on 2026-09-06 before QA (endpoint, command, modal, mutation, drawer button, tests, `can_delete`). "Run the campaign again" is a *copy of the campaign* — the Market's acquire, done by the author — and is not built here. Verified absent: no RESET control, no `/reset` route, no `ResetSession`/`useResetGame`/`ResetGameModal`; the only user-visible "Reset" is the dev-only PerfOverlay's render-counter reset. |
| F10 | CHANGED | **Seats** are a campaign setting: `campaigns.max_players` (1–8, default 8), a "Seats at the table" control on the campaign form with "applies the next time the game starts" semantics; sent in every Start payload; never read back from a running game. |
| F11 | REMOVED | The in-game seat editor (ModeratorControls has only moderator add/remove and kick), `seat_count_change` websocket event, api-game `PUT /game/{room}/seats` and `update_seat_count`, `SessionStats.max_players` in the contracts. `max_players` is only read in the runtime. |
| F12 | CHANGED | A campaign remains **editable while its game is live** (deliberate: applies at next Start). No lock. |
| F13 | CHANGED | **Campaign delete ends any running game first** (stage 8): the endpoint runs `EndGame` with `EndReason.SYSTEM` as the caller — so a non-host member cannot end a game by asking for a delete — then `DeleteCampaign`; the session, party and every game cascade. The players in the room get the eviction modal and land on a dashboard without the campaign; the only toast is `campaign_deleted`. The command's own "End the game before deleting this campaign" refusal remains as the backstop for a game in flight (STARTING/ENDING) or api-game being down. One confirm, whose copy reads: "This cannot be undone. Any running game ends and everyone is sent back to their dashboard. Every game played here, its history and the party go with the campaign. Players keep their characters, and your assets are kept." A refusal closes the dialog and shows in the tab's banner. |
| F14 | CHANGED | **Expanded campaign card controls** (stage 8 — the row keeps its shape, buttons disable rather than vanish): idle host → START + SCHEDULE; starting → "Starting…" (disabled, stripes) + SCHEDULE disabled; live → ENTER (everyone) + END GAME (host) + SCHEDULE disabled; ending → ENTER disabled + END (disabled, "Ending…") + SCHEDULE disabled. The disabled SCHEDULE's tooltip and aria-label read "End the game to change the schedule". Player while not live → nothing (the hero shows WAITING FOR GM). No RESET, no create. The card's header is a "Game Live" badge (visibility-toggled so nothing shifts) plus the shared status line (G6); there is no "Idle" literal and never a session name. The card also lists the games played (F21). |
| F15 | CHANGED | **Hero**: host idle always START GAME (the "has played → RESUME" branch is gone); "Nothing at the table yet" variant deleted (unreachable). |
| F16 | CHANGED | Event copy: `session_created` is silent with panel "{host} set up the game for {campaign}"; `session_paused` toast is null with panel "The game was closed after being left running"; `session_started` toast is "{game name} has started" when named, else "The game has started", panel "{actor} started {game name \| the game} for {campaign}". The in-game eviction modal reads "The game has ended for now. You will be redirected shortly" (its heading is still "Session Ended" — §K1 item 6). |
| F17 | — | Unchanged by design: the 200-line adventure-log cap; STARTING/ENDING in-flight rendering; the ETL's *content* (what api-game extracts and what api-site restores is byte-for-byte the same — only the row that owns it and the id used as the room changed); the hold/drag token system; the three-way token merge (its inputs now come from the previous game instead of the session row). |
| F18 | NEW | **The Game aggregate**: `games` table, one row per play, minted at Start. On the wire `GameResponse` carries identity, lifecycle and record only — `id, session_id, campaign_id, host_id, status, name, created_at, started_at, ended_at, ended_by (host \| system \| null), summary, attendance[{user_id, character_id}], campaign_name` (filled by the read route only) — **and never the eight state columns** (`map_token_seed`, `map_token_state`, `adventure_log`, `map_config`, `image_config`, `active_display`, `audio_config`, `spotify_config`), which exist for the next Start to read server-side. `SessionResponse` gains `game` (the open game or null), `games` (ENDED games, newest first, **capped at the latest 5**), `games_played` (the true total) and `next_game_name`; it loses `status`, `started_at`, `stopped_at`. |
| F19 | NEW | **Start game** = `POST /api/games/` `{session_id}` (host only; 201 with the `GameResponse` whose id the client enters with). Refuses "A game is already running" when the session has an open game, and "Only the host can start the game". Flow: mint the row STARTING → seed from the session's newest ENDED game merged with the campaign's current workshop baseline (a first game seeds from the baseline alone) → sign asset URLs and stamp the lease → call api-game with `game_id` → assert the echoed id → ACTIVE (stamps `started_at`, `urls_expire_at`, the `map_token_seed` the room actually opened with) → then, as swallowed side effects: consume `next_game_name` onto the game, `mark_played()`, broadcast `session_started` (+`game_id`, `game_name`). **Any failure before ACTIVE deletes the row and tears down any room api-game had already made** — no phantom in the history, no wrong "newest ended game". |
| F20 | NEW | **The wrap-up** — one shared `EndGameModal` ("That's a wrap") used by the drawer and the game runtime alike: TONIGHT'S GAME — "What was it called?" (prefilled with the name planned before Start; placeholder "Game {n}" in the drawer, "Name this game" in-game) and "What happened?"; THE NEXT GAME — date + TimeField. Nothing is required and nothing blocks ending except exactly one half of the date pair being filled. Blanking a prefilled name clears it. A refused or failed end is shown inside the dialog. The runtime prefills through `GET /api/games/{room_id}` (F22). THE NEXT GAME also takes a "Name (optional)" (stage 8), sent as `next_game_name`; the `session_scheduled` broadcast carries the name as the session stored it (trimmed). |
| F21 | NEW | **GAMES PLAYED** in the expanded card, visible to every campaign member: one row per ended game, newest first — **name** (or "Game {n}", n counting down from `games_played` so numbering survives the cap), local start time, **duration** ("under a minute" / "{m}m" / "{h}h {m}m", minutes dropped when zero), "{n} at the table"; the **summary** beneath when present. The list scrolls in a bounded box; when capped the header says "latest 5 of {games_played}". Host only: a pencil per row opens **Edit game** (name + "What happened", SAVE → `PATCH /api/games/{id}`; host only, any status; an omitted field is unchanged, an empty string clears). Players see no pencil. The heading always renders; with no games it says "No games played yet" (stage 8). |
| F22 | NEW | `GET /api/games/{game_id}` — any member of the game's campaign; 404 unknown, 403 non-member; returns the `GameResponse` plus `campaign_name`. Exists for the runtime, which knows only a room id. No history endpoint: history arrives on the campaigns query. |
| F23 | NEW | **Player disconnect is a validated no-op.** `POST /api/games/internal/{game_id}/disconnect` `{user_id, character_id}` (returned 404 at the nginx edge; Docker network only, like `/api/users/internal/`) checks a game is running, the character is the user's and is locked to the game's campaign — and **writes nothing**. api-game has no caller for it. Decided 2026-09-06 against the 07 plan: the room's copy of a player's HP is *older* than the character row (the sheet patches HP straight to api-site and nothing pushes it back hot), so saving on disconnect would overwrite fresh with stale. The real fix is a hot-authoritative runtime-state design (`.claude/plans/TODO-runtime-character-state-authority.md`, option B), not built here. HP changed in play still never reaches PostgreSQL from the room — a pre-existing gap, unchanged. |
| F24 | NEW | api-game `player_disconnect` re-checks that the closing socket is still the player's current one after its first await; a player who reconnected inside that window keeps their seat and party status and no disconnect is broadcast (rider; `api-game/tests/test_disconnect_reconnect_race.py`). |
| F25 | CHANGED | **Every "is it live?" reader asks the game repository** (`get_open_game_for_campaign` / `_for_session`) instead of a session status: campaign delete; accept-invite (the late joiner always joins the party, and is synced to the room — addressed by the **game** id — only when a game is active); character select ("You can't change your character while a game is running") and release ("Cannot release your character while a game is running"); slot reduction ("…in a campaign with a game running"); the library guards ("Cannot modify asset while a game is running in a campaign. End the game first."). Asset delete scrubs references from each campaign's **newest ended game** only (older games keep their record); the map board-in-play check consults the open game, else the newest ended one ("This map's board is in play in the last game…"). No frontend reader of `session.status`, `session.started_at` or `'stopping'` survives. |
| F26 | CHANGED | **Admin CLI**: `list-active` lists open games (id, status, campaign, host, started, lease); `pause-all` → `end-all-games`; `pause-session` → `end-game <game_id>`; both run the real `EndGame` with `EndReason.SYSTEM` acting as the host. |
| F27 | NEW | **nginx** (dev and prod): `location /api/games/internal/` returns 404; `location /api/games/` proxies to api-site. `/api/game/` (api-game) is untouched and must never be "tidied" into it. |
| F28 | CHANGED | **Contracts**: `SessionStartPayload.session_id` → `game_id`; `SessionStartResponse.session_id` → `game_id`; api-game's `SessionEndRequest.session_id` → `game_id`. `SessionEndFinalState` unchanged. |

## G. Scheduling (stage 3; name added by stage 7)

| # | Tag | Behaviour |
|---|---|---|
| G1 | NEW | `sessions.scheduled_at` (timestamptz, nullable) + `sessions.next_game_name` (≤ 100 chars, nullable) = **the plan for the next game**: when it is and what it is called. One mutable pair per campaign's session; no history, no RSVP. |
| G2 | NEW | **Cosmetic only**: nothing starts, nobody is reminded, nothing is locked or validated against it (no server check that the date is in the future; the date input's `min` is today, client-side only). |
| G3 | NEW | **Host sets both from the drawer's Next Game modal** (SCHEDULE beside START) via `PATCH /api/sessions/{id}/schedule` `{scheduled_at, next_game_name}`: "Name (optional)" input, a date input and a TimeField (typed or picked, five-minute marks, any typed minute accepted). Date and time are a pair — both or neither; a name with no date is allowed; SAVE is disabled while exactly one half of the pair is set or nothing at all is set; CLEAR sends both null immediately (no confirm) and is enabled when either exists. The server refuses while a game is open ("End the game before changing the schedule", 400), a non-host ("Only the host can schedule the game", 400) and a naive datetime (422). **KNOWN DEVIATION** from plan: not a single `datetime-local` input. The control is always rendered for the host and disabled — never hidden — while any game is open, with the tooltip and aria-label "End the game to change the schedule" (stage 8). |
| G4 | NEW | **Timezones**: the GM's input is interpreted in their browser zone and sent as a UTC instant; every viewer renders it in their own zone with dayjs. No user timezone setting; the server zone is irrelevant. |
| G5 | NEW | **Start consumes the name** onto the game (`session.next_game_name` → null, `game.name` set) once the game is ACTIVE; a failed Start leaves the plan intact. **A host's End clears the date** and, in the same act, applies whatever the wrap-up set for the next game (a new date replaces the old; nothing set → cleared). A system end leaves it. The clock never clears it; a past value is simply not shown. |
| G6 | NEW | **Display** — hero and drawer share one rule (`gameStatusLine.js`): live, named → "{name} · Started {relative}"; live → "Started {relative}" ("Game live" if `started_at` is somehow missing); starting → "Starting…"; ending → "Ending…"; idle, future date, named → "Next game · {name} · {when}"; idle, future date → "Next game · {when}"; idle, name only → "Next game · {name}"; past date or nothing, played before → **"Last played · {relative}"**; never played → **"Not played yet"** (stage 8). `{when}` is "Today HH:mm" / "Tomorrow HH:mm" for calendar-near days in the viewer's zone, otherwise "Thu 4 Sep, 20:00"; computed per render so a page left open overnight stops saying Today. Rendered client-side only. |
| G7 | NEW | **Ranking middle slot**: an idle scheduled campaign outranks an idle unscheduled one with a more recent last-played; a live campaign outranks both (see B3). |
| G8 | NEW | **`session_scheduled` event** to campaign members other than the host — from the drawer on set, change and clear, **and from a host's End that sets the next date** (the same event, so the toast reads the same and the notification is findable later): "{host} set the next {campaign} game, {name}, for {when}" / "{host} set the next {campaign} game for {when}" / "{host} named the next {campaign} game {name}" / "{host} cleared the next game for {campaign}", formatted in the recipient's zone. Toast + persisted notification. The host gets neither. |
| G9 | NEW | Calm pulse pill names the soonest future schedule across the user's campaigns (E6) — date only. |
| G10 | — | Not built, by decision: RSVP, reminders, recurrence, ICS, countdowns, a hero schedule opener (the drawer is the single control; revisit if GMs miss it). |

## H. Migration behaviours on existing data (what happens to a real database)

> Branch migrations in order (single head): `5d79a91d9d41` (drop `has_received_demo`) →
> `295bcace5419` (drop `active_game_id`) → `e58664838aae` (`last_played_at`) → two small
> ones → `a8e1bf630345` (news) → `4095d1fcc9a0` (`last_seen`) → `7bfb0f207666`
> (`pulse_events`) → `9584fb2e1a4c` (one session per campaign, FINISHED gone, seats to the
> campaign) → `b1ae5a5e538b` (`scheduled_at`) → `78e9f165d016` (the game aggregate; head).
> H11–H15 are the last one's. The Game model is imported by both `alembic/env.py` and `admin.py`.

| # | Tag | Behaviour |
|---|---|---|
| H1 | CHANGED | `users.has_received_demo` dropped; no data effect beyond the column. |
| H2 | NEW | `campaigns.last_played_at` backfilled from the latest `sessions.started_at` per campaign; campaigns never played stay null and render as never played. |
| H3 | NEW | `campaigns.max_players` backfilled from each campaign's newest non-finished session's value (fallback 8), *before* `sessions.max_players` is dropped. |
| H4 | REMOVED | Every `sessions` row with status `finished` is deleted (their roster rows cascade at the database, `ondelete='CASCADE'`). Their ETL snapshots are gone with them — nothing surviving reads them. |
| H5 | NEW | Every campaign left without a session gets a fresh INACTIVE one with its roster filled from `campaign_members` (every role except invited) and JSONB fields at defaults. **Host resolution differs from the plan**: the campaign's `dm` member row wins, `campaigns.created_by` is the fallback. Afterwards `SELECT campaign_id, count(*) FROM sessions GROUP BY 1 HAVING count(*) <> 1` returns nothing. |
| H6 | NEW | Campaigns whose only session was INACTIVE keep it (the only DELETE is the FINISHED one; the insert is guarded by NOT EXISTS) — boards, log and screen state survive into the new model (and then into their first `games` row, H12). |
| H7 | NEW | `sessions.scheduled_at` added, null for all. |
| H8 | NEW | News tables (`news_posts`, `news_post_likes`, `news_post_reads` + indexes), `users.last_seen` (a naive `DateTime`, unlike the other timestamps), `users.pulse_events` (JSONB `[]` NOT NULL) added, empty. |
| H9 | CHANGED | Persisted `session_started` notification rows created before this branch may still carry `session_name`; the frontend copy no longer reads it (it reads host, `game_name`, `campaign_name` only), so they render without it. **HAND QA** on a real database: `SELECT count(*) FROM notifications WHERE type = 'session_started' AND data ? 'session_name'`, then open one. |
| H10 | — | Downgrade of `9584fb2e1a4c` restores the dropped columns with defaults but does **not** resurrect FINISHED rows. |
| H11 | NEW | **`78e9f165d016` refuses to run while any session is not `inactive`** ("End every running game before migrating: N session(s) are not inactive…") — a live session's room is keyed by the *session* id, which no game row will ever match. End every game on the code being replaced first (`admin.py pause-all --yes` there). Then: creates `games` with `ix_games_one_open_per_session` (partial unique on `session_id WHERE status <> 'ended'`, declared for SQLite as well so the test harness enforces the same invariant), `ix_games_session_ended`, `ix_games_campaign_id`; adds `sessions.next_game_name` (null for all). |
| H12 | NEW | **Data step, before the drops**: every session that was *played* — `started_at` set, or any of the eight state columns non-default — becomes exactly one ENDED game carrying its state verbatim: `created_at = started_at ?? created_at`, `started_at` as was, `ended_at = stopped_at ?? started_at ?? created_at`, `name`/`summary`/`ended_by`/`urls_expire_at` null, `attendance []`. A session created and never used gets no row (no invented history). Prints "game migration: created N ended game(s)". **This is what keeps continuity across the deploy**: the first Start afterwards seeds from that game. |
| H13 | REMOVED | Twelve columns dropped from `sessions`: `status`, `started_at`, `stopped_at`, `urls_expire_at`, `audio_config`, `spotify_config`, `map_config`, `image_config`, `active_display`, `adventure_log`, `map_token_state`, `map_token_seed`. Afterwards `sessions` = `id, campaign_id, host_id, created_at, scheduled_at, next_game_name` plus the roster table. |
| H14 | — | Downgrade restores the twelve columns (`status` default `inactive`), copies each session's **newest** ended game's state and timestamps back onto it (`stopped_at` ← `ended_at`), drops `next_game_name`, then drops `games`. Older history, and every game's name, summary, attendance and `ended_by`, are not representable on the old shape. Round-tripped on the dev database. |
| H15 | — | **Deploy checks**: before — `SELECT count(*) FROM sessions WHERE started_at IS NOT NULL OR map_token_state <> '{}' OR adventure_log <> '[]' OR map_config <> '{}'`; after — `SELECT count(*) FROM games WHERE status = 'ended'` matches it and `SELECT session_id FROM games GROUP BY 1 HAVING count(*) <> 1` is empty; the first real Start seeds from the migrated game (the party's pieces are where they left them). |

## I. Explicitly NOT in this branch

- Market beyond the visible placeholder (stage 4); the media source/asset split.
- Campaign create→publish flow (05, parked); Party as a value *in code* and roles off the
  campaign (05's second extraction, after 07).
- Campaign copy/adopt — Reset's replacement use case (stage 4's acquire, or its own plan).
- Live seat count on the hero ("N at the table") — api-game HTTP still unauthenticated, no plumbing.
- A last-played line on the hero/drawer (never built — B6/G6, §K1).
- A field to *name* the next game from the wrap-up (the API takes it; the dialog does not — F20).
- Paging for games beyond the latest 5 on the session response (the count is sent, F18; a
  paging route is not built).
- Disconnect-time character state save — decided against (F23); runtime-state authority is
  its own TODO plan.
- Pulse v2 (activity signals, reporting channel, full weight table, width-aware ticker,
  clickable friend pills, real avatar coins) and the now-playing music line.
- Reduced-motion and narrow-width QA on Home (recorded as unexercised in #168).
- Focus-visible rings on the three header controls (suppressed, needs shape-following rings).
- Account page redo beyond the chrome rework.

## J. Items flagged for the code deep-dive (2026-09-06) — resolved 2026-09-09

1. `DeleteCampaignModal` copy (F13) — **still stale** (§K1 item 5).
2. Tagline: what renders today (B1) — **the bank shipped in #177**; B1 rewritten.
3. Pulse weight/score inputs (E4/E5) — score is live-game 6 + online friends 1 each; it
   drives breath and glow only; the live pill reads `session.game` correctly. Arrivals-only
   holds on both sides (E11).
4. Drawer SCHEDULE while live (G3) — **hidden, not disabled; the "End the game…" title
   was never wired** (§K1 item 2).
5. ~~`session_created` also firing from Reset~~ — moot, Reset is pulled.
6. Stale-schedule edge on a *live* game — `gameStatusLine` returns the live line before it
   looks at the schedule, so a past `scheduled_at` is never shown over "Started…" (G6);
   the calm pill is replaced by the live pill and `nextScheduledGame` skips past dates (E6).

## K. Code check — 2026-09-09 (against `7a443f2`)

Five read-only sweeps, one per area, every row above checked against the working tree.
Anything not listed here matched its row.

### K1. Plan ≠ code — decided and built as [stage 8](08-creases.md) on 2026-09-09

Items 1–8 below were **fixed** (the rows above now describe the code); 9–13 were
**accepted as intent** (doc-only) and are recorded in the rows. The list is kept as the
record of what the check found.

1. **No last-played line anywhere on Home or the card** (B6, G6). `gameStatusLine` ends in
   "No game running"; `last_played_at` is read only by the ranking. The 01/03/06 plans all
   assumed the idle line falls back to "Last played {relative}". *Fixed.*
2. **SCHEDULE is hidden while live, not disabled, and carries no hint** (G3, J4). Visible
   and disabled only during STARTING; title always "Set when the next game is". *Fixed.*
3. **The wrap-up cannot name the next game** (F20). `EndGameRequest.next_game_name` is
   accepted and applied server-side; neither `EndGameModal` nor either `useEndGame` sends it.
   *Fixed.*
4. **GAMES PLAYED vanishes when empty** (F21). No "No games played yet" line. *Fixed.*
5. **`DeleteCampaignModal` copy is stale** (F13): "This action cannot be undone. All
   associated game sessions will also be deleted." — and a running game was a refusal
   rather than a step. *Fixed: end first, then delete; one confirm with the true cascade.*
6. **User-facing "session" / "Pause" copy survives** (F4) — thirteen "session" hits and two
   "Pause" (plus six more in the workshop and library found while building). *All fixed.*
   - `CharacterSelectionModal.js:150` — "You can't change your character while a session is
     active. Pause or finish the session first." (both words; "finish" is also retired)
   - `CampaignManager.js:138` — tooltip "Cannot remove your character while a session is active"
   - `SocialPanel.js:380` — friend status "In session · {campaign}"
   - `shared/components/EndGameModal.js:165` — "Why not plan your next game session while everyone is here?"
   - `game/GameContent.js:2859-2861` — the eviction modal heading "Session Ended" and fallback
     body "This game session has ended: {reason}" (also `webSocketEvent.js:771`)
   - `game/GameContent.js:2141` — "You're watching this session. Select a character…"
   - `game/GameContent.js:93,96` — two app tips ("between sessions", "in your session")
   - `game/components/SessionCountdown.js:57` — title "Session auto-pauses when the timer ends"
   - `notes/components/NotesWorkspace.js:227,279`, `NotesPanel.js:147`, `NoteEditor.js:104` —
     "between sessions" ×2, "A session is live for this campaign…", placeholder "Session notes…"
   - `(authenticated)/character/components/CharacterWizard.js:318` — toast "…applies from your next game session"
   - `DeleteCampaignModal.js:23` — item 5 above.
7. **Hero in-flight label** (B4): the button disables but reads START GAME during STARTING and
   ENDING; "STARTING…" only while this browser's own request is pending; no "ENDING…".
   *Fixed: STARTING… / ENDING… for both roles.*
8. **`screen_name` counter** (A12): the account-page input has the cap and no counter;
   `ScreenNameModal.js` is dead code and should be deleted. *Fixed; deleted.*
9. **News listing is admin-only** (D2): `GET /api/news/` requires `require_admin`. Harmless
   today (only the editor index calls it) but not what the plan said. *Accepted.*
10. **Pulse line, several** (E3, E4, E8): ticker cap 5 not 4, fixed rather than width-aware;
    no slide-right animation, dimming only; coins are coloured initials, not avatars; friend
    pills are inert (only the coin stack opens the social panel); score drives breath period and
    glow only, coin count is a fixed 5; the rule fades out rather than running to the edge.
    *Coins now render through `UserDisc` (fixed); the rest accepted as v1.*
11. **No footer on Home** (B12). *Accepted.*
12. **Migration H5 host resolution**: the `dm` member row first, `created_by` as fallback.
    *Accepted.*
13. **The D6 "previews show last saved art" deviation is no longer true** — previews re-sign
    from the live image directory. Confirm at runtime, then drop it from 02's shipped notes.
    *Hand QA.*

### K2. Worth knowing at QA (not deviations)

- **Like counts display stored + 1** (`LIKE_COUNT_BASE = 1`, news endpoints) — everywhere,
  including the editor index.
- **`ADMIN_EMAILS` is read at import**: editing the env file needs `up -d` (recreate).
- News S3 write-through swallows client errors; a save can succeed with no backup copy.
- Unpublish → republish re-dates the post (`published_at` cleared on unpublish).
- The calm pill is suppressed whenever any ticker pill is showing, live or not.
- Presence is per-process (`event_connection_manager` is an in-memory dict): with more than
  one api-site instance the first/last-connection semantics break; a restart marks everyone
  offline and the grace window re-announces them.
- Pulse hydration appends stored entries after live ones without sorting by `created_at`.
- `users.last_seen` is a naive `DateTime`; the other timestamps are timezone-aware.
- After a game is ACTIVE, the name consumption, `last_played_at` stamp and `session_started`
  broadcast are swallowed side effects — a failure there is a warning, not a failed start.
- `AcceptCampaignInvite` iterates `campaign.session_ids` and takes the first — correct under
  one-session-per-campaign, silently wrong if a second session ever appears.
- Stale comments: lazy demo creation (`user/api/endpoints.py:94`, `user/application/commands.py:37`);
  "site header, notification bell, logout" (`(authenticated)/account/page.js:14-16`).
- `?tab=market` is an inline "Coming soon" placeholder; the Featured card links to it.
- Backend test coverage: `modules/game/tests/test_game_lifecycle.py` (+ `api/test_game_read_endpoint.py`),
  `session/tests/test_session_scheduling.py`, `test_session_events.py`, `campaign/tests/test_campaign_with_session.py`,
  `news/tests/` (84), `user/tests/test_pulse_events.py`, `test_presence_grace.py`,
  `friendship/tests/test_presence_events.py`, `shared/tests/test_admin_allowlist.py`,
  `api-game/tests/test_disconnect_reconnect_race.py`. No frontend tests (by decision).

### K3. Hand QA only

- The 07 acceptance script (continuity across the migration and across games, room id ==
  game id, second Start refused, Start failure leaves no phantom, state never on the wire,
  system end vs host end, edit history, empty prompt, planned name, schedule guard, campaign
  delete, asset delete, late joiner, migration precondition and counts).
- H9's old `session_started` notification rows.
- D6's preview of unsaved banner art.
- B1's tagline stability while the page sits open.
- Reduced-motion and narrow widths on Home (still unexercised).
