# Home landing page — dependency audit

> Part of the [Home landing page epic](00-epic.md). Compiled 2026-08-29 from four code sweeps
> of api-site, api-game, and rollplay/app, with file:line evidence for every claim.
>
> **Rule of this document**: existence findings only. Each Home-page UI feature is mapped to
> the events, data, and schema that would serve it, and each dependency is marked EXISTS or
> DOES NOT EXIST. No solution design here — that happens in the stage plans.
> The design contract being audited is [design-mock.html](design-mock.html).

## Verdict at a glance

| Mock element | Served by existing data? |
|---|---|
| Greeting name | YES (with `''`-unset caveat) |
| Tagline | Fields yes; template bank NO |
| Clock | Client-only, no dependency |
| Hero: campaign art | **YES** — preset + S3-signed upload, on list response |
| Hero: role chip (GM/Player) | YES |
| Hero: live state | **NO — `active_sessions` hardcoded 0** |
| Hero: "N players at the table" | **NO — live presence has no HTTP surface** |
| Hero: "Next session · …" | **NO — scheduling has zero footprint** |
| Hero actions (notes/invite/start/manage character) | YES (all four have real routes/APIs) |
| Invite card (accept / 2-step decline) | YES — full lifecycle |
| Pulse: friends online | Partial — binary, poll-only |
| Pulse: live games across my campaigns | **NO single query** (composable N+1) |
| Pulse: activity granularity ("editing character…") | **NO — and no inbound channel to report it** |
| Updates card (news, likes, NEW!) | **NO — module, tables, admin all absent** |
| Continue building card | YES (`updated_at` exposed) |
| Featured from the Market | **NO** — decision 2026-08-29: massive placeholder |
| Your characters (portraits, focal, count) | **YES** — full pipeline |
| App-select launcher | Rework — see sizing section |

---

## 1. Greeting, tagline, clock

- `users.screen_name` — EXISTS, `NOT NULL, server_default=''`; **`''` means unset** (FE name
  modal prompts on empty) — `user_model.py:22`. The API schema is looser
  (`Optional[str]`, `user/api/schemas.py:57`).
- Display-name fallback chain `account_name → screen_name → email` is **duplicated inline**
  at every call site — `(authenticated)/layout.js:103`, `GameContent.js:1700`,
  `campaign/application/queries.py:121`. No canonical greeting-name helper EXISTS.
- Tagline raw fields all EXIST: character names + `active_in_campaign_id`
  (`character_model.py:35`), campaign titles, per-session `started_at`/`stopped_at`
  (`session_model.py:56-57`). The template bank itself DOES NOT EXIST (stage-1 scope).
- Clock: pure client. No dependency.

## 2. Hero — ranked campaign

### Art — EXISTS (the mock's placeholder gradients undersell reality)
- `campaigns.hero_image` (legacy preset path, e.g. `/floating-city.png`) OR
  `hero_image_asset_id` → `media_assets`, mutually exclusive by domain rule
  (`campaign_aggregate.py:183-191`). Both on `CampaignSummaryResponse`
  (`campaign/api/schemas.py:95-114`); the asset variant is CloudFront-signed per request
  (`campaign/api/endpoints.py:71-88`).
- Frontend already resolves it: `useHeroImage.js:16-31` (blob-cached via
  AssetDownloadManager), rendered by `HeroBackground` with fallback `/campaign-tile-bg.png`
  (`CampaignManager.js:1418-1421`). Four preset PNGs confirmed in `rollplay/public/`.
- A named "hero spread" *treatment* does not exist in code — what exists is cover art +
  scrim overlays. The mock's seam/plate treatment is new presentation over existing data.

### Live state — DOES NOT EXIST as served
- `CampaignSummaryResponse.active_sessions` is **hardcoded `0`** with
  `# TODO: Query session module for active count` at `campaign/api/endpoints.py:145`
  (detail) and `:173` (summary). Same TODO on `GET /api/users/dashboard`
  (`user/api/endpoints.py:624`). The ranking rule "live first" has no live signal today.
- What EXISTS underneath: `sessions.status` (`'inactive'|'active'|'starting'|'stopping'|
  'finished'`, `session_aggregate.py:38-42`), unindexed; `SessionResponse.status` is
  accurate per-session. `get_active_session_for_campaign(campaign_id)`
  (`session_repository.py:50`) EXISTS but is single-campaign.

### "Session live · 3 players at the table" — DOES NOT EXIST
- api-site's `player_count` = persisted roster = campaign membership (auto-filled at
  session creation, `session/application/commands.py:106-116`) — NOT who is connected.
- Actual connected-player state lives ONLY in api-game's in-memory `ConnectionManager`
  (`connection_manager.py:9-147`), broadcast to room websockets (`lobby_update`), never
  serialized over HTTP, never crossed to api-site. `GET /game/{room_id}` returns
  `seat_layout`/`player_metadata` but not connections, requires knowing `active_game_id`,
  and — noted as a standing fact — **api-game HTTP routes carry no auth**.

### "Next session · Saturday 29th August, 8pm" — DOES NOT EXIST
- Scheduling has **zero footprint**: no column, no entity, no RSVP, in any service,
  migration, or frontend (exhaustive greps; only prose comments call a Session "the
  scheduled/planned play instance"). Plan for it exists at
  [03-scheduling-and-rsvp.md](03-scheduling-and-rsvp.md) (stage 3). Until then the
  not-live hero meta and the calm pulse pill both have **no data source**.

### Ranking inputs
- `updated_at` EXISTS on summary (row-mutation semantics — tracks edits AND membership
  churn, `campaign_aggregate.py:195-197` — not play).
- `last_played_at` DOES NOT EXIST anywhere in the backend. **Latent bug**: the frontend
  already reads it — `CampaignManager.js:1540` — so that UI renders "Never" for every
  campaign today. Raw material for deriving it EXISTS per-session
  (`started_at`/`stopped_at`), but no aggregation query/repo method exists.

### Hero actions — all EXIST
- NOTES → standalone `/notes?campaign_id=` route EXISTS (`(authenticated)/notes/page.js`),
  full api-site module (`main.py:96`), campaign-scoped, read-only while a session is live
  (`notes/page.js:42-44`). Today reachable only from the expanded campaign drawer
  (`CampaignManager.js:1889`).
- MANAGE CHARACTER → character lock per campaign EXISTS (`SelectCharacter`,
  `campaign/application/commands.py:575-640`; one character per (user, campaign)).
- INVITE PLAYER / START·ENTER SESSION → see §3 and session lifecycle (both EXIST).

## 3. Invite stack — EXISTS end-to-end

- Five endpoints: send `POST /{id}/players/{player_id}`, accept `POST /{id}/invites/accept`,
  decline `DELETE /{id}/invites`, cancel `DELETE /{id}/invites/{player_id}`, remove
  (`campaign/api/endpoints.py:430-539`).
- Six invite event types (`campaign_events.py:39-176`); `campaign_invite_received` and
  `campaign_invite_accepted` persist to notifications.
- Pending invites queryable two ways: `GET /api/campaigns/` includes invited campaigns
  (`GetUserCampaigns` merges `get_invited_campaigns`, `campaign/application/queries.py:25-28`;
  distinguish via `invited_player_ids`), and persisted notifications
  (`GET /api/notifications/unread`).
- Frontend mutations already wired: `useCampaignMutations.js:118` (accept), `:145` (decline).

## 4. Pulse

- **Event system EXISTS**: 22 domain event types (14 campaign, 4 session, 4 friendship —
  full inventory with recipients/toast/persist flags in the sweep). Delivery is strictly
  **per-recipient unicast** (`event_manager.py:34-60`): no topic/room fanout, and events to
  offline users are **silently dropped** (`:50-54`) — no queue, no replay. 8 of 22 persist
  to `notifications`.
- **Presence is binary and poll-only**: `is_online` = in-process WS-registry lookup
  (`websocket_manager.py:91`), computed on read, exposed ONLY on `GET /api/friendships/`
  (`friendship/api/endpoints.py:61`). Never broadcast — no `friend_online`/`presence_update`
  event type exists. In-memory only: does not survive restart, not shared across replicas.
- **Activity granularity DOES NOT EXIST**: no "editing character / writing notes / on
  dashboard" signal anywhere in api-site — and the `/ws/events` inbound loop accepts ONLY
  `ping` (`websocket_endpoint.py:94`), so clients have no channel to report activity even
  if signals were defined.
- **"Live sessions across my campaigns" has no query**: composable only as N+1
  (`get_by_member_id` → per-campaign `get_active_session_for_campaign`).
  `get_active_sessions()` EXISTS but is global/unscoped ("the admin command's work list").
- Richer live presence (api-game `lobby_update`: connected/disconnecting, seats, party
  state) is per-room, in-memory, websocket-only, and never crosses to api-site.
- Adjacent recency timestamps that DO exist in Postgres: `users.last_login`,
  `notes.updated_at`, `characters.updated_at`, `session_joined_users.joined_at`,
  `sessions.started_at/stopped_at`.

## 5. Updates card (news, likes, NEW!)

All absent — verified against module listing, router registrations (`main.py:88-98`), all
31 `__tablename__`s, and all 76 alembic migrations:

- News/articles/posts module: DOES NOT EXIST. (`modules/stream/` is LiveKit tokens, not
  content. Root `releases.json` is deploy tooling only — nothing reads it in app code.)
- Likes/reactions: DOES NOT EXIST. Nearest neighbour is `media_assets.favorite` — a
  private owner-only star (`asset_model.py:59-60`), no actor, no count.
- Per-user read receipts / last-seen / visit tracking: DOES NOT EXIST. Only
  `notifications.read` (per-row bool) and `users.last_login`.
- **Admin (needed to author news): DOES NOT EXIST** — no role column
  (`user_model.py:20-34`), no `require_admin` dependency, no allowlist, no admin router.
  `admin.py` is a shell-gated Click CLI by explicit design ("shell access is the auth").
  The only role concept in the codebase is campaign-scoped `CampaignRole`.

## 6. Continue building card — EXISTS

- `updated_at` on summary EXISTS (see semantics caveat in §2). Art as §2. Actions: assets
  (library routes EXIST), workshop (routes EXIST, §8), campaign editor (EXISTS in
  CampaignManager).

## 7. Featured from the Market — DOES NOT EXIST

- Zero backend across all three services; frontend is one inline "Coming soon" block
  (`dashboard/page.js:154-167`).
- **Decision (2026-08-29): ship the Home slot massively placeholded** — mock-style content,
  no real feed, until stage 4 defines the featured-item contract
  ([04-market.md](04-market.md)).

## 8. Your characters — EXISTS (full pipeline)

- Portraits: `characters.avatar_asset_id` FK → media_assets (`character_model.py:82-86`),
  presigned `avatar_url` + `avatar_focal_area` on `CharacterResponse`
  (`characters/api/schemas.py:209-216`, signing at `characters/api/endpoints.py:156-163`).
- Coded default when unset: `/heroes.png` (`useAvatarImage.js:12`, file confirmed in
  `rollplay/public/`).
- The current strip already renders real art (blob-cached, greyscale-at-rest,
  `CharacterManager.js:86-98`) — the mock's hand-of-cards is new presentation over
  existing data. `GET /api/characters/me` serves the list (`useCharacters.js:20`).

## 9. Chrome — app-select launcher rework sizing (facts)

Tab mechanism is centralized but tentacled — full inventory from the sweep:

- **Core mechanism, 4 files**: `DashboardLayout.js` (tabs array :31-37, `VALID_TABS` :41
  — function-local, not exported; forces `?tab=campaigns` onto bare `/dashboard` :44-56),
  `(authenticated)/dashboard/page.js` (state seed + 5 `activeSection` render blocks +
  param-strip helpers), `SubNav.js` (tabs mode; breadcrumb mode is dead code, zero
  callers), `TabNav.js` (254 lines, single consumer).
- **Explicit `?tab=` writers: 11 call sites in 7 files** — `useWorkshopToolNav.js:49,53`,
  `SocialPanel.js:170-175`, `AccountNotificationFeed.js:31-35`,
  `CharacterWizard.js:363,371`, `character/[id]/page.js:83`, `notes/page.js:64`,
  `CampaignManager.js:1876`.
- **`eventConfig.js`: 22 `navigationTab:` entries** (L19-172) feeding two of the writers.
- **8 bare `/dashboard` navigators** (auth pages, game exits, header links) that land on
  the forced default tab.
- **No frontend tests exist** (no `*.test.js`/`__tests__` anywhere under `rollplay/`) — the
  tab contract is pinned by nothing.
- Workshop tool reality vs the launcher's five line items:
  - Map Config — EXISTS, `/workshop/map-config` (sub-tools `?tool=` move/grid/tokens/paint/erase)
  - **"Image Editor" — wrong name**: the real tool is **Image Config**
    (`/workshop/image-config`, display modes + cinematic effects, not pixel editing)
  - Audio Workstation — EXISTS, `/workshop/audio-workstation` (the audio *mixer* is
    in-game only; presets cross over via `usePresets`)
  - NPC Barracks — `enabled:false` placeholder, "Soon" badge, no route
    (`WorkshopToolNav.js:32-39`; only NPC token baselines exist inside Map Config)
  - Scene Builder — `enabled:false`, nothing but a `.webp` icon

## 10. Null / empty-state inventory (defaults to design for)

Every null the Home page will meet, with what exists today:

| Null case | What exists today |
|---|---|
| Campaign has no art at all (`hero_image` AND asset both null) | FE falls back to `/campaign-tile-bg.png` (`CampaignManager.js:1421`); the new plate/seam treatment's no-art look is undesigned |
| Character has no portrait | `/heroes.png` default (`useAvatarImage.js:12,57`) |
| `screen_name === ''` | Name-setup modal gate (`dashboard/page.js:42`); greeting fallback chain is inline-duplicated, no shared helper |
| User avatar image | Does not exist as a concept — `UserDisc` renders initial + `users.color` (`UserDisc.js:22-31`); the mock's coin matches this |
| No campaigns at all | Empty-state onboarding hero planned (stage 1) but **not yet in the mock**; demo auto-grant still active (`has_received_demo`, retirement is stage-1 PR 1) |
| Zero characters | Hand renders ghost create-card only — unmocked state |
| Not live AND no schedule data | Hero meta line has **no source** (scheduling absent, §2); interim copy undecided |
| No news post yet / stale post | Module absent (§5); staleness-visible-by-design is the accepted stance (02 plan) |
| Market slot | Placeholder by decision (§7) |
| Pulse with nothing to say | Calm pill copy references the (absent) schedule — same gap as hero meta |

## 11. Latent defects surfaced by the audit (pre-existing, not Home work)

- `campaign.last_played_at` read at `CampaignManager.js:1540` is never served → renders
  "Never" always.
- `active_sessions=0` TODOs ship wrong data on two live endpoints
  (`campaign/api/endpoints.py:145,173`; `user/api/endpoints.py:624`).
- `eventConfig.js` emits `navigationTab:'account'` (4 entries) but `'account'` is not in
  `VALID_TABS` → `/dashboard?tab=account` renders an empty content area.
- Six dead frontend event handlers with zero backend emitters:
  `friend_request_declined`, `friend_removed`, `game_created`, `game_started`,
  `game_ended`, `game_finished` (`useAuthenticatedEvents.js:51-135`).
- `SessionsManager.js` is orphaned (zero importers) though CLAUDE.md documents a
  "Sessions Tab".
- `/api/notes` has no dedicated nginx block in prod (served by the `/api/` catch-all
  while sibling APIs have explicit blocks — inconsistency, not an outage).
- api-game HTTP routes have no authentication (`app.py` — no Depends anywhere), proxied
  publicly at `/api/game/`.
