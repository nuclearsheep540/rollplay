# Stage 6 — Game lifecycle: two verbs, one session

> **SHIPPED — PR #175 (2026-09-06): PRs 1 and 2 below plus [03](03-scheduling.md) as PR 3,
> one commit on `feature/home-page`. Not yet QA'd; the acceptance script at the bottom is
> the QA plan.** Built as written, including the 2026-09-06 revision that Reset also clears
> the table (via `RemovePlayerFromCampaign` / `CancelCampaignInvite`). Migration is
> `9584fb2e1a4c` (data steps ordered as §PR 1.8 describes, reasoning in its docstring).
> Tests: `modules/session/tests/test_session_lifecycle.py`, the rewritten
> `test_campaign_with_session.py`, `test_session_events.py`. **One item not done:**
> `DeleteCampaignModal.js` copy still reads "All associated game sessions will also be
> deleted" rather than telling the GM to end the game first (PR 2 §3, last bullet) — the
> backend refusal is in place; fix the copy during QA.
>
> Part of the [Home landing page epic](00-epic.md). **Decided 2026-09-05** (Matt + Fable, from
> GM feedback). Written for the implementing agent: every decision below is
> locked, every anchor was verified against the repo on 2026-09-05 (branch
> `feature/home-page`, HEAD `413599e`). Line numbers drift — re-grep the symbol before editing,
> never trust a number blindly.
>
> This stage sits BEFORE [03-scheduling.md](03-scheduling.md) in delivery: scheduling hangs off
> the one-session model defined here. Read this whole document before touching code.

## Why — the feedback

GMs are confused by the session UI. In their heads a *session* is the whole game, start to
finish, until the campaign is done. They do not understand what Pause versus Finish means, so
they leave games running (the expiry sweeper eventually pauses them).

They are right about their own experience. Today the drawer asks a GM to manage a session
object with four verbs — create, pause, finish, delete — where pause-versus-finish is a
distinction only the backend cares about. The fix is to make the UI agree with the GM's
mental model: **a campaign has one game, and it is either running or not.**

**An actual data-loss bug drove this home.** Matt tested the in-game end button (#173) and
found that GM tokens survived but player tokens did not. Cause, verified in code:

- The in-game button calls `POST /api/sessions/{id}/finish`
  ([useFinishSession.js:39](../../../rollplay/app/game/hooks/useFinishSession.js)), which marks
  the session FINISHED. FINISHED is terminal, so the GM must create a **new** session row.
- The ETL saves token boards on both pause and finish (`_extract_and_sync_game_state`,
  `commands.py:1000-1013`), and Start restores them through the three-way merge
  (`_restore_map_token_state`, `commands.py:474`). But the new row has empty boards.
- The merge re-seeds NPC tokens from the map asset's workshop baseline
  (`map_assets.token_config`, `token_merge.py:88-117`), while **PC tokens only ever live on
  the paused board** (`token_merge.py:83-86`: "pc tokens are players' state — always from
  the board"). A fresh row has no board, so PCs have nothing to come back from.

A pause followed by a start on the *same* session keeps PC tokens by design. So the fix is
structural, not an ETL change: stop creating new rows. The same applies to the adventure log
(`sessions.adventure_log`, restored at start via `commands.py:727`).

## The model — locked decisions

| # | Decision |
|---|---|
| 1 | **Two user-facing verbs: Start game, End game.** Plus **Reset game** as the deliberate wipe. The word "session" leaves all user-facing copy. Backend names (`sessions` table, `PauseSession`, `SessionStatus`) stay as they are — "game" is the hot runtime, "session" is the cold record, per CLAUDE.md's vocabulary boundary. |
| 2 | **Every campaign has exactly one session, always.** Created with the campaign (today's auto-create in the campaign create route), replaced wholesale by Reset game, never zero, never two. There is no user-facing create. Start and Schedule never create a session — they require the one that always exists. |
| 3 | **End game = backend pause.** ACTIVE → STOPPING → INACTIVE with the full hot-to-cold ETL. Pause stays as the backend's name for it and as the *system-level* control (the expiry sweeper, the admin CLI). INACTIVE is the only not-live state. Cards always say Start game — **never Resume**; a system-paused game is indistinguishable from an idle one to users. |
| 4 | **FINISHED is retired entirely** — the status, the aggregate methods, the command, the endpoint, the frontend readers and the existing rows. Nothing needs it: a game stopped is an INACTIVE session; a game wiped is a Reset. |
| 5 | **Reset game = delete + recreate in one server operation**, INACTIVE only, behind a confirm. **Revised 2026-09-06 — it also clears the table.** Reset exists for a fresh run with new players, so every non-DM member is removed (through the existing remove-player and cancel-invite commands: locks released, people notified) before the row is replaced. Loses: the party and pending invites, player tokens, npc tokens' in-play positions (back to the workshop baseline), adventure log, schedule, what was on screen, audio and Spotify config. Keeps: assets, notes, the baselines, and the players' characters (released, still theirs). |
| 6 | **Seat count moves to the campaign** (`campaigns.max_players`, 1–8, default 8). Edited in campaign settings at any time; **takes effect at the next Start** because api-game reads it from the start payload. The in-game seat editor and its api-game endpoint are removed. |
| 7 | **Session name is removed** (column, request fields, the "Session Name" input on the campaign form, `session.name` readers). One session per campaign needs no name. |
| 8 | **A campaign is editable while its game is live.** No guard on either side — there is one GM, campaign data lives in PostgreSQL and does not need to survive the ETL. Explicit decision; do not add a lock. |
| 9 | **Events.** New `session_ended` (host pressed End game): toast to campaign members *other than the host*, not persisted. `session_paused` stays for the system path: silent, not persisted, cache-invalidation only. `session_finished` deleted. `session_created` stays as-is (silent invalidation) and now also fires from Reset. |
| 10 | **The 200-line adventure log cap stays.** It is the guard against unbounded growth now that one session spans many evenings. Do not raise it. |
| 11 | **STARTING / STOPPING rendering is unchanged.** The in-flight button states cover it. |
| 12 | **Campaign delete** refuses while the game is live; otherwise deletes the campaign's session with it. (Today it refuses on any non-FINISHED session, which would make every campaign undeletable once FINISHED is gone.) |

## What we will NOT do

- No zero-session state, anywhere — not as a resting state, not as a transient one the UI
  can observe.
- No "Resume" wording, no pause anywhere in the UI, no pause toast, no pause notification row.
- No RSVP, no reminders, no recurring schedule (see 03 for scheduling scope).
- No new ETL fields and no change to what the ETL persists or restores — only the removal of
  the `max_players` write-back.
- No change to the hold/drag token system, api-game's room model, or the log cap.
- No lock on campaign editing during a live game.
- No JS test suite (repo rule — Matt does not want one "vibed" into existence).
- No renaming of backend vocabulary (`sessions`, `PauseSession`, `SessionStatus.INACTIVE`).
- Do not touch the dead `game_created` / `game_started` / `game_ended` / `game_finished`
  frontend handlers listed in the dependency audit §11 — they are pre-existing dead code
  outside this change's scope. (Delete-superseded applies to code THIS change supersedes.)

## House rules that bite here (see CLAUDE.md for the full text)

- **Migrations: `alembic revision --autogenerate` inside the container, never hand-written.**
  The one hand-authored part is the data step you add *into* the generated revision (§PR 1).
- **Never run git write commands.** Propose the exact commands; Matt runs them.
- **Tests own their state**; run a new test alone against the unfixed code before citing it
  as proof. Run the suites in the containers (`docker exec api-site-dev python -m pytest …`).
- **Delete superseded code in the same PR** and do a deliberate dead-code sweep before
  review — JS lint will not catch unused symbols here.
- **Explicit over implicit** at I/O boundaries; **no single-character or initialism variable
  names**; **`authFetch` for every authenticated call**; GPL headers on new files.
- **Do not `npm run build` while `rollplay-dev` is up** (it clobbers the dev server's `.next`).
- The shared contracts package has a CI gate: any change under `shared_contracts/` must
  extend `rollplay-shared-contracts/tests/test_contracts.py` in the same change.

## Ground truth (verified 2026-09-05)

### Backend — api-site

| What | Where |
|---|---|
| Session columns incl. `name`, `max_players`, the ETL JSONB fields, `adventure_log`, `map_token_state`, `map_token_seed` | `modules/session/model/session_model.py:46-69`; roster table `session_joined_users` at `:23-33` (FK `ondelete='CASCADE'`) |
| `SessionStatus` incl. `FINISHED`; transitions `start/pause/finish/finish_from_active/mark_finished/abort_stop`; `can_delete` (INACTIVE or FINISHED); `create()` defaulting the name to "Session 1"; `_validate_max_players` | `modules/session/domain/session_aggregate.py:35-42, 132-138, 139-165, 192-193, 239-340` |
| `CreateSession` — host check, one-non-finished-session guard, roster auto-fill from `campaign.get_all_member_ids()` | `modules/session/application/commands.py:60-122` |
| `DeleteSession` | `commands.py:178-219` |
| `StartSession` — builds the start payload with `max_players=session.max_players` (`:705`), restores boards (`:688-695`), restores the log (`:727`) | `commands.py:222-780` |
| `_extract_and_sync_game_state` — extracts `max_players` from `final_state.session_stats` (`:862-864`), boards (`:1000-1003`), log (`:995-997`); returns the extracted dataclass (`:818-826`) | `commands.py:828-1020` |
| `PauseSession` — three-phase; broadcasts `session_paused` (`:1190-1205`) | `commands.py:1108-1213` |
| `FinishSession` — the whole class goes | `commands.py:1214-1330` |
| Expiry sweeper drives `PauseSession` acting as host | `modules/session/application/expired_session_cleanup.py:44-60` |
| Admin CLI `pause-session` drives `PauseSession` | `api-site/admin.py:14, 69` |
| Session routes: create `POST /` (`:53`), `PUT /{id}` name update (`:118`), `DELETE /{id}` (`:133`), `/start` (`:165`), `/pause` (`:205`), `/finish` (`:247`) | `modules/session/api/endpoints.py` |
| Session schemas: `CreateSessionRequest`, `UpdateSessionRequest`, `SessionResponse.name/max_players` | `modules/session/api/schemas.py:10-57` |
| Session events: `session_created` (silent), `session_started` (toast; persisted for non-host), `session_paused` (silent), `session_finished` (silent) | `modules/session/domain/session_events.py:32-190` |
| Repository: `save` maps `name` (`:123,145`) and `max_players` (`:128,153`); `_model_to_aggregate` (`:245,254`); `delete` with `can_delete` gate (`:178-201`) | `modules/session/repositories/session_repository.py` |
| Campaign create route auto-creates the session with `max_players=8` and the optional `session_name` | `modules/campaign/api/endpoints.py:196-204` |
| `UpdateCampaign` also renames the current non-finished session | `modules/campaign/application/commands.py:53-77` |
| `DeleteCampaign` refuses on any non-FINISHED session | `campaign/application/commands.py:98-109` |
| `CampaignAggregate.add_session` limit of 20; `session_ids` is read-derived | `modules/campaign/domain/campaign_aggregate.py:151-170` |
| Campaign model has no `max_players`; host column is `created_by` | `modules/campaign/model/campaign_model.py:16-28` |
| Campaign schemas: `CampaignCreateRequest.session_name` (`:16`), `CampaignUpdateRequest.session_name` (`:24`), `CampaignResponse` (`:70-89`), `CampaignSummaryResponse` (`:95+`) | `modules/campaign/api/schemas.py` |
| Library board-in-play check skips FINISHED sessions | `modules/library/application/commands.py:643` |
| Campaign member table (`campaign_members`: `campaign_id`, `user_id`, `role`) — roster source for the migration | `modules/campaign/model/campaign_member_model.py:32-38` |
| Tests that reference what changes | `modules/campaign/tests/test_campaign_with_session.py` (session_name conditional), `modules/session/tests/test_session_events.py` (finished factory, `:111-141`), `modules/library/tests/test_token_baseline.py:183` (`test_finished_sessions_never_block`) |

### Contracts and api-game

| What | Where |
|---|---|
| `SessionStats.max_players` (only reader is the api-site write-back being removed); `SessionStartPayload.max_players` (stays — api-game needs it) | `rollplay-shared-contracts/shared_contracts/session.py:45-57` |
| api-game builds `SessionStats` in the end/final-state route | `api-game/app.py:911-916` |
| `PUT /game/{room_id}/seats` — the in-game seat editor endpoint | `api-game/app.py:326-360` |
| `GameService.update_seat_count` | `api-game/gameservice.py:233` |
| `WebsocketEvent.seat_count_change` + its `EVENT_HANDLERS` row | `api-game/websocket_handlers/websocket_events.py:595`; `websocket_handlers/app_websocket.py:32` |
| Roundtrip tests mention seats — read them: the seat *layout* tests stay, only tests that call `update_seat_count` go | `api-game/tests/test_services_roundtrip.py:109, 237, 269, 290` |

### Frontend

| What | Where |
|---|---|
| Session mutations: `useCreateSession` (`:11`), `useStartSession` (`:46`), `usePauseSession` (`:71`), `useFinishSession` (`:96`), `useDeleteSession` (`:121`) | `app/dashboard/hooks/mutations/useSessionMutations.js` |
| Campaign mutations send `session_name` | `app/dashboard/hooks/mutations/useCampaignMutations.js:15-21, 52-58` |
| In-game end button hook + confirm | `app/game/hooks/useFinishSession.js`; `app/game/GameContent.js:46, 370, 2847-2858` |
| In-game seat editor: UI, state, sender, handler | `app/game/components/ModeratorControls.js:28, 385-398`; `GameContent.js:568, 840-897`; `app/game/hooks/webSocketEvent.js:136-160, 638-645, 729` (plus the dispatch entry for `seat_count_change` — grep it) |
| Drawer: mutation wiring (`:284-288`), modal targets (`:309-311`), `sessionForm` (`:332`), create handler (`:388-400`), pause/finish/delete handlers (`:422-490`), `sessionName` in the campaign form (`:323, 505, 523, 545, 2130-2155`), current-session lookup incl. `'paused'` (`:1406-1416`), controls block (`:1655-1725`: header `currentSession.name \|\| 'Game Session'`, Pause/Finish buttons, "Create new session" CTA, "No active session"), create-session modal (`:2027-2075`), modals mount (`:2255-2300`) | `app/dashboard/components/CampaignManager.js` |
| Drawer modals to replace | `app/dashboard/components/PauseSessionModal.js` (48 lines), `FinishSessionModal.js` (73), `DeleteSessionModal.js` (33, reads `session.name`) |
| Hero: `sessionStatusLabel` (`:34-40`), `useStartSession` (`:9, 51`), primary action with `RESUME SESSION` / `START SESSION` / `ENTER SESSION` / `JOIN SESSION` / `WAITING FOR GM` (`:60-84`) | `app/dashboard/components/home/HomeHeroCard.js` |
| Ranking: `SESSION_FINISHED`, `findCurrentSession`, `isCampaignLive`, `compareHeroRank`, `selectHeroCampaign` | `app/dashboard/utils/homeRanking.js` |
| Event bridge: `session_created/started/paused/finished` handlers | `app/shared/hooks/useAuthenticatedEvents.js:122-140` |
| Event copy: `session_created` (uses `data.session_name`), `session_started`, `session_paused` (uses `data.session_name`), `session_finished` | `app/shared/config/eventConfig.js:140-172` |
| Campaigns query fans out `GET /api/sessions/campaign/{id}` per campaign into `campaign.sessions[]` | `app/dashboard/hooks/useCampaigns.js:73-92` |
| Notes: live-session check and "Live" chip | `app/(authenticated)/notes/page.js:22, 71`; `app/notes/components/NotesWorkspace.js:211-216` |
| Existing time helper (check before writing a new one) | `app/shared/utils/formatTime.js` |

## PR 1 — api-site + contracts: the lifecycle model

Backend only. Ships together with PR 2 in the same release (the frontend still calls
`/pause`, `/finish`, `POST /sessions/` and sends `session_name` until PR 2 lands — the
feature branch is the integration point; do not deploy PR 1 alone).

### 1. Session aggregate (`session_aggregate.py`)

- Delete `SessionStatus.FINISHED`, `finish()`, `finish_from_active()`, `mark_finished()`, and
  every docstring line that mentions FINISHED. `abort_stop()` stays (its "before
  INACTIVE/FINISHED" wording becomes "before INACTIVE").
- `can_delete()` → `self.status == SessionStatus.INACTIVE`. Update its docstring.
- `create(cls, campaign_id, host_id)` — drop `name` and `max_players`. Delete
  `_validate_max_players` (it moves to the campaign aggregate) and the `max_players` field.
- Add a `PauseReason` enum next to `SessionStatus`:

  ```python
  class PauseReason(str, Enum):
      HOST_ENDED = "host_ended"   # the GM pressed End game
      SYSTEM = "system"           # expiry sweeper or admin CLI
  ```
  It is a domain concept: it decides which event fires and (from 03) whether the schedule
  clears. Keep it here, not in `commands.py`.

### 2. Commands (`session/application/commands.py`)

- **`CreateSession.execute(campaign_id, host_id)`** — drop `name`, `max_players`. Guard becomes
  "the campaign already has its session" for ANY existing session (no FINISHED exclusion).
  It is now internal only (called by campaign create and by Reset) — no HTTP route.
- **`PauseSession.execute(session_id, host_id, reason: PauseReason)`** — `reason` is required,
  no default (explicit at every call site). Behaviour split lives in ONE place, after
  phase 2 succeeds:
  - `HOST_ENDED` → broadcast `SessionEvents.session_ended(...)`.
  - `SYSTEM` → broadcast `SessionEvents.session_paused(...)` (unchanged, silent).
  Everything else (three phases, retry, `abort_stop`) is shared. Do not duplicate the ETL.
- **Delete `FinishSession`** whole.
- **Replace `DeleteSession` with `ResetSession`**: load, host check, `can_delete()` (INACTIVE
  only — error text: "End the game before resetting it"), `session_repo.delete(session_id)`,
  then `CreateSession(...).execute(campaign_id, host_id)` and return the NEW `SessionEntity`.
  One command, one transaction boundary per repository call as today; if the create fails
  after the delete, raise — the invariant is then broken and the error must say so loudly
  (log at error level with both ids). Reuse `CreateSession`, do not re-implement the roster
  fill.
- **`StartSession`**: `max_players=campaign.max_players` in the start payload (`:705`); the
  command already loads the campaign. Delete the `session.max_players` write-back at `:1165`
  and the `max_players` member of the extracted dataclass + its extraction at `:862-864,
  :1006`.
- Sweeper (`expired_session_cleanup.py`) and `admin.py pause-session` pass
  `reason=PauseReason.SYSTEM`.

### 3. Events (`session_events.py`)

- Add `session_ended(campaign_member_ids, session_id, campaign_id, campaign_name, host_id,
  host_screen_name) -> List[EventConfig]`: recipients = every campaign member **except the
  host**, `show_toast=True`, `save_notification=False`. Payload keys mirror
  `session_started` minus `session_name`. (The host pressed the button — they do not need
  telling.)
- Delete `session_finished`.
- Drop `session_name` from every remaining factory's signature and payload
  (`session_created`, `session_started`, `session_paused`). Persisted `session_started`
  notification rows in the database already carry `session_name`; that is fine because the
  frontend copy stops reading it (PR 2).

### 4. Endpoints and schemas (`session/api/`)

- Delete `POST /` (create), `PUT /{id}` (rename), `DELETE /{id}`, `POST /{id}/pause`,
  `POST /{id}/finish`.
- Add `POST /{id}/end` → `PauseSession(...).execute(session_id, user_id,
  reason=PauseReason.HOST_ENDED)`, 204. Keep the pause route's error mapping.
- Add `POST /{id}/reset` → `ResetSession`, returns `SessionResponse` of the NEW session
  (200). The id changes; the frontend re-reads through the campaigns query.
- Delete `CreateSessionRequest`, `UpdateSessionRequest`. `SessionResponse`: drop `name`,
  `max_players`.
- Nothing changes in NGINX: every route is still under `/api/sessions`.

### 5. Campaign module

- Model: `max_players = Column(Integer, nullable=False, server_default='8')`.
- Aggregate: `max_players: int` field with the 1–8 validation moved from the session
  aggregate; `update_details(...)` gains `max_players: Optional[int] = None` (None =
  unchanged). `add_session` limit becomes one: raise if `self.session_ids` is non-empty.
- `CreateCampaign.execute(..., max_players: int = 8)`; `UpdateCampaign`: delete the
  `session_name` branch and parameter, pass `max_players` through.
- `DeleteCampaign`: replace the non-FINISHED refusal with: refuse if the session is not
  INACTIVE ("End the game before deleting the campaign"); otherwise delete the session
  through the session repository, then the campaign. Re-check what the campaign row's own
  cascade already does so the session is not deleted twice.
- Campaign create route: `CreateSession(...).execute(campaign_id=campaign.id,
  host_id=user_id)`; drop the `session_name` handling.
- Schemas: `CampaignCreateRequest`/`CampaignUpdateRequest` — drop `session_name`, add
  `max_players: int = Field(8, ge=1, le=8)` (create) / `Optional[int] = Field(None, ge=1,
  le=8)` (update). Expose `max_players` on `CampaignResponse` and `CampaignSummaryResponse`.
- `_to_campaign_response` helpers: map the new field (they are manual mappers — see the
  DTO section of CLAUDE.md for why).

### 6. Library

- `library/application/commands.py:643`: delete the FINISHED skip; every session of the
  campaign (there is one) is checked.

### 7. Contracts + api-game (the write-back's other half)

- `shared_contracts/session.py`: remove `SessionStats.max_players`. Extend
  `tests/test_contracts.py` accordingly (the CI gate).
- `api-game/app.py:911-916`: stop populating it.
- (The api-game seat-count *endpoint* removal is PR 2, with its frontend caller.)

### 8. Migration — one autogenerated revision with a data step

Generate first:

```bash
docker exec api-site-dev alembic revision --autogenerate -m "one session per campaign: retire FINISHED, seat count to campaign"
```

Autogenerate will produce: add `campaigns.max_players`; drop `sessions.name`; drop
`sessions.max_players`. Then **edit the generated file** to insert the data step BETWEEN the
add-column and the drop-columns, using SQLAlchemy Core on `op.get_bind()` (generate UUIDs in
Python — do not rely on `gen_random_uuid()` being available):

1. Backfill `campaigns.max_players` from the campaign's current non-finished session's
   `max_players` (fall back to 8).
2. Delete every `sessions` row with `status = 'finished'` (`session_joined_users` cascades
   via its FK).
3. For every campaign with no remaining session, insert one: `host_id = campaigns.created_by`
   (verify the host mapping in `campaign_repository.py` first), `status = 'inactive'`, JSONB
   fields at their server defaults.
4. For each session inserted in step 3, insert `session_joined_users` rows for every
   `campaign_members` row of that campaign whose `role != 'invited'` (mirror
   `get_all_member_ids`).

Order matters: step 1 before the column drop; step 3 before the app boots, because
`add_session` now assumes one session and the hero assumes every campaign has one. Put the
reasoning in the revision's docstring. Downgrade may re-add the columns with defaults; it
does not need to resurrect FINISHED rows (say so in the docstring).

Before running it against any real data, record counts so the result can be checked:

```sql
SELECT status, count(*) FROM sessions GROUP BY status;
SELECT count(*) FROM campaigns c WHERE NOT EXISTS (SELECT 1 FROM sessions s WHERE s.campaign_id = c.id AND s.status <> 'finished');
```

### 9. Tests (api-site)

Update: `test_campaign_with_session.py` (a session is always created; no `session_name`
branch — rewrite the tests around that), `test_session_events.py` (the `session_finished`
tests become `session_ended` tests: host excluded, toast on, persist off), delete
`test_token_baseline.py::test_finished_sessions_never_block`.

Add (each creating its own state, each run alone first):
- `ResetSession` returns a new id, the old row is gone, the new row's boards/log are empty,
  the roster equals the campaign's non-invited members, and it refuses on ACTIVE.
- `CreateSession` refuses when the campaign already has any session.
- `CampaignAggregate.add_session` refuses a second session.
- `PauseSession` with `HOST_ENDED` broadcasts `session_ended`; with `SYSTEM` broadcasts
  `session_paused` (mock the event manager; assert on event types and recipients).
- `DeleteCampaign` refuses while ACTIVE and succeeds (session gone) while INACTIVE.
- Campaign `max_players` validation (0 and 9 rejected) and the start payload carrying the
  campaign's value.

### 10. CLAUDE.md edits (in this PR)

- Directory tree: `session/` comment "(start/pause/finish)" → "(start/end/reset)";
  `commands.py` list: `CreateSession, StartSession, PauseSession, ResetSession`.
- "Session Access" bullet: "all session management (create/start/pause/finish/delete)" →
  "Start game / End game / Reset game live in the expanded campaign card; there is no
  create — every campaign always has exactly one session".
- HTTP-Based ETL "Game End": "game status set to INACTIVE/FINISHED" → "INACTIVE".
- Add to the "Game vs Session" section: the one-session invariant, End game = pause,
  `PauseReason`, and that FINISHED no longer exists.

## PR 2 — frontend vocabulary + api-game seat removal

### 1. Mutations (`useSessionMutations.js`)

- Delete `useCreateSession`.
- `useStartSession` → `useStartGame` (same endpoint).
- `usePauseSession` + `useFinishSession` → one `useEndGame` calling `POST /api/sessions/{id}/end`.
- `useDeleteSession` → `useResetGame` calling `POST /api/sessions/{id}/reset`, invalidating
  `['campaigns']` on success.
- `useCampaignMutations.js`: drop `sessionName`/`session_name`; send `max_players`.

### 2. In-game end button

- `app/game/hooks/useFinishSession.js` → `useEndGame.js`, calling `/end`; error copy
  "Failed to end the game". Log prefix stays a text constant (e.g. `ENDGAME`).
- `GameContent.js:2847-2858`: title/description in game vocabulary ("End game" — "Everyone
  still in the game will be returned to their dashboard."). The eviction path is unchanged:
  api-game deletes the room in phase 3 and the existing end-of-game modal fires.

### 3. Campaign drawer (`CampaignManager.js`)

- Header: `currentSession.name || 'Game Session'` → the campaign's game state only
  ("Live" / "Idle" / "Starting…" / "Ending…").
- Controls: live → **ENTER GAME** + **END GAME**; idle (host) → **START GAME** + **RESET GAME**
  (a quieter secondary control — it is destructive; keep it visually subordinate). Never
  Resume. Player: unchanged (Join when live).
- Delete: the create-session modal, `sessionForm`, `openCreateGameModal`, the "Create new
  session" CTA and "No active session" branch (there is always a session — if
  `campaign.sessions` is empty the data is wrong; render nothing rather than a create door),
  `PauseSessionModal.js`, `FinishSessionModal.js`.
- `DeleteSessionModal.js` → `ResetGameModal.js`. Copy (revised 2026-09-06): everything
  returns to baseline — player tokens removed, npc tokens back to where the map was
  authored, log/schedule/screen cleared, **every player removed and their characters
  released, invite them again to play**; maps, assets and notes stay. 3-second confirm
  delay, the friction the old permanent finish carried. Confirm button: RESET GAME.
- `EndGameModal.js` (from `FinishSessionModal.js`): "End the game? Everyone at the table is
  returned to their dashboard. Token positions and the log are kept." (Phrase it so a GM
  understands nothing is lost.)
- Current-session lookup (`:1406-1416`): drop `'finished'` and the phantom `'paused'`;
  `currentSession = campaignSessions[0]`.
- Campaign form: replace the "Session Name (Optional)" field (`:2130-2155`) with a **Seats**
  control (1–8; the drawer's existing `sessionForm.maxPlayers` select is the pattern —
  reuse its markup). Helper text: "Applies the next time the game starts."
- `DeleteCampaignModal.js`: copy must say the game must be ended first if it is live
  (mirror the backend error).

### 4. Home hero (`HomeHeroCard.js`, `homeRanking.js`)

- `sessionStatusLabel`: `'Session live'` → `'Game live'`; `'No session running'` → the idle
  line. (03 shipped in the same PR, so the idle line is `gameStatusLine.js`'s.)
- Primary action: `ENTER GAME` / `JOIN GAME` when live; host idle → always `START GAME`
  (delete the `hasPlayed` branch and `RESUME SESSION`); player idle → `WAITING FOR GM`
  (unchanged).
- Live meta line: "Started {relative}" from `session.started_at` (e.g. "Started 2 hours
  ago"). Check `app/shared/utils/formatTime.js` for an existing relative formatter before
  writing one; if none, add a small `formatRelativeTime(isoString, now)` there.
- `homeRanking.js`: delete `SESSION_FINISHED`; `findCurrentSession` returns
  `campaign.sessions?.[0] ?? null`; rewrite the header comment (the "hook the create/publish
  flow hangs off" text is superseded — see 05). Keep `compareHeroRank` shaped so 03 inserts
  the scheduled block between live and last-played.
- The "Nothing at the table yet" hero variant (rendered when the user has campaigns but
  `selectHeroCampaign` returns null) becomes unreachable — every campaign has a live-able
  session. Delete the variant and its copy; keep the zero-campaigns onboarding hero.

### 5. Events bridge and copy

- `useAuthenticatedEvents.js`: `session_finished` → `session_ended` (invalidate + toast);
  `session_paused` keeps invalidation, no toast (already null in config — leave the
  `toast()` call only if the config's null message makes it a no-op; otherwise remove it).
- `eventConfig.js`: `session_created` panelMessage without `session_name` ("{host} set up
  the game for {campaign}"); `session_paused` toastMessage null, panelMessage without
  `session_name`; delete `session_finished`; add `session_ended` — toast "The game has
  ended", panelMessage "{host} ended the game for {campaign}", `navigationTab: 'campaigns'`.

### 6. Seat editor removal (frontend + api-game, same PR)

- Frontend: `ModeratorControls.js` seat-count block and `setSeatCount` prop;
  `GameContent.js` `setSeatCount` (`:840-897`) and its wiring; `webSocketEvent.js`
  `handleSeatCountChange`, `sendSeatCountChange`, the export and the dispatch entry. Keep
  `GameContent.js:568` reading `max_players` from `GET /game/{room}` — api-game still
  holds it from the start payload.
- api-game: `PUT /game/{room_id}/seats`, `GameService.update_seat_count`,
  `WebsocketEvent.seat_count_change` and its `EVENT_HANDLERS` row. Then run
  `api-game/tests/test_event_dispatch.py` and the roundtrip suite; delete only tests that
  exercised `update_seat_count`. Grep `shared_contracts` for a seat-count-change model and
  remove it if one exists (extend `test_contracts.py`).

### 7. Copy sweep

Grep user-facing strings for "session" in `app/dashboard`, `app/game`, `app/notes`,
`app/(authenticated)/notes` and `eventConfig.js`; replace with "game" wherever a user reads
it. Code identifiers, comments and API paths keep "session". The notes "Live" chip and its
read-only banner are already vocabulary-neutral — check their tooltip/comment copy only.

### 8. Dead-code sweep before review

`useCreateSession`, `usePauseSession`, `useFinishSession`, `sessionForm`,
`openCreateGameModal`, `promptPauseSession`, `promptFinishSession`, `pauseSessionTarget`,
`finishSessionTarget`, `deleteSessionTarget`, `sessionName`, `setSeatCount`,
`sendSeatCountChange`, `handleSeatCountChange`, `SESSION_FINISHED`, `hasPlayed` — grep each
for a surviving reference. Run `npx next lint` for the hooks-deps class of issue.

## Acceptance — QA script (dev stack, two browsers: GM + player)

1. **PC tokens survive End game.** Start game, place a PC token and move an NPC, End game
   from inside the game, Start game again: both are where they were. (This is the bug that
   started this; it must be the first check.)
2. **Never Resume.** After End game, hero and drawer both say START GAME.
3. **Reset game** on an idle campaign: new session id, board and log empty, NPCs back at
   their workshop baseline, every non-DM member removed from the campaign and notified,
   their character released, pending invites cancelled, roster = the DM alone. Refused
   while live with nothing changed.
4. **System pause is silent.** Let the sweeper pause a game (or run `admin.py
   pause-session`): players get no toast, no notification row; cards flip to idle.
5. **End game toasts players, not the host**; no notification row is created.
6. **Seat count** changed in campaign settings while live: no change in the running game;
   next Start uses the new count.
7. **Campaign delete** refused while live with the "end the game" message; succeeds when
   idle and leaves no orphan session row.
8. **Migration** on a dev DB seeded with a FINISHED row and a campaign whose only session is
   FINISHED: counts before/after match the expectations in §PR 1.8; every campaign has
   exactly one session afterwards (`SELECT campaign_id, count(*) FROM sessions GROUP BY 1
   HAVING count(*) <> 1` returns nothing).
9. **STARTING / STOPPING** still render the in-flight button states.
10. Suites green: `docker exec api-site-dev python -m pytest -q`, `docker exec api-game-dev
    python -m pytest -q`, `docker exec api-site-dev python -m pytest
    /rollplay-shared-contracts/tests/ -q`.

## Relation to other plans

- [03-scheduling.md](03-scheduling.md) is PR 3 of this sequence and depends on PR 1's
  `PauseReason` (End game clears the schedule; system pause does not).
- [05-campaign-create-and-publish.md](05-campaign-create-and-publish.md): its
  "session is the hero trigger" hook is superseded by the one-session invariant (note added
  there 2026-09-05).
- [TODO-in-game-pause.md](TODO-in-game-pause.md): overtaken — #173 shipped the in-game
  button; PR 2 re-points it at End game.
- The epic's decision record carries the dated rows for these decisions.
