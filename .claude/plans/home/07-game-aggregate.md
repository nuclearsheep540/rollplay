# Stage 7 — Game as an aggregate: the game owns the play, the session owns the table

> Part of the [Home landing page epic](00-epic.md). **Decided 2026-09-06** (Matt + Fable, in
> the conversation that followed the #175 review; revised the same day after Matt caught the
> plan still leaving play state on the session), **not started.** Ships as **ONE pull
> request on ONE branch** cut from `feature/home-page` AFTER that branch's QA — backend,
> contracts, api-game and frontend together, because the frontend cannot run against either
> half alone. Nothing here goes into #175's release.
>
> **Reset game was already pulled from `feature/home-page` on 2026-09-06**, ahead of this
> plan: endpoint, command, modal, mutation, drawer button and tests are gone from that branch.
> Phase E of this plan only verifies nothing is left.
>
> **Written for an implementing agent that must make no decisions.** Every decision below is
> locked, including UI copy, field names, response shapes, ordering rules, error messages and
> which file each thing lives in. Every anchor was verified against `feature/home-page` at
> `bb5dc22` on 2026-09-06 (before the Reset pull, which only removed code); line numbers
> drift, so re-grep the symbol before editing and never trust a number blindly. **Do not
> invent a data shape, a relationship, a flow, a name or a piece of copy that is not written
> here** — where this document is silent, stop and ask rather than guess. Read the whole
> thing before touching code.
>
> **BUILT 2026-09-06 on `feature/home-page-game-lifecycle`.** All five phases are done and
> the three suites are green (api-site 1218, api-game 105, contracts 121); the migration ran
> on the dev database and round-tripped through downgrade. Deviations from this plan, all
> deliberate:
> - **The disconnect route is `/api/games/internal/{id}/disconnect`**, unauthenticated but
>   404'd at the nginx edge, following the existing `/api/users/internal/` pattern. This plan
>   said the old route was unauthenticated; it was not, which is part of why api-game could
>   never have called it.
> - **The partial unique index is declared for SQLite as well as PostgreSQL** (`sqlite_where`
>   beside `postgresql_where`). Without it the test harness silently applies a TOTAL unique
>   index and refuses a session its second game — the opposite of the invariant.
> - **`_ExtractedGameState` carries `attendance`**, built by `_build_attendance` and passed to
>   `game.end()`. `record_end_state` still copies exactly the seven state fields.
> - **`GameRepository.get_newest_ended_game_for_campaign`** exists so the library's asset
>   guards can ask without a session lookup; the plan had that query inline in the library.
> - **`ConfirmDialog` gained a `children` slot** so the in-game End dialog can carry the same
>   two fields as the drawer's, rather than a second dialog being written.
> - **`eventConfig.toastMessage` may now be a function**, resolved in the toast helper — the
>   minimal extension this plan anticipated for date- and name-dependent copy.
> - The migration binds JSONB explicitly (psycopg2 cannot adapt a bare dict) and refuses to
>   run while any session is not `inactive`.
>
> Scope boundary: this is the first extraction of
> [05](05-campaign-create-and-publish.md)'s long-term model. The second — Party as the
> session's roster *in code*, roles moving off the campaign — is described in 05 and is
> **NOT** in this plan. "Party" appears here only as vocabulary.

---

## Why — the concern this answers

[06](06-game-lifecycle.md) fixed a real data-loss bug by making a campaign carry exactly one
session for life, so the token boards and the adventure log are always where the party left
them. That is continuity, and it stays.

But it did so by making End game a PATCH on the same row, forever. Nothing in the system
records that an evening of play happened. There is no name for the night, no "last game was
Thursday, and here is what happened". Matt's words: *"if we're going to end up PATCHing the
same 1 session every time, then we're just faking it."* Ending should feel like closing a
chapter and be auditable afterwards.

The diagnosis: one word was carrying two concepts, and one row was carrying data that was
never its own.

- The row called `sessions` was being used both as "the campaign's table" and as "the thing
  a GM plays on a Tuesday". The OLD model (pre-06) made rows episodic but strapped the table
  state to each row, so finishing an episode stranded the pieces. 06 kept the table state
  and deleted the episode entirely. Neither was wrong about what it kept; each was missing
  the other half.
- **`sessions.status` was always the game's status.** So were the eight ETL JSONB fields.
  Proof from the code: of the session module's commands, `CreateSession`, `ScheduleSession`,
  `RemovePlayerFromSession`, `SelectCharacterForSession` and `DisconnectFromGame` never
  touch `audio_config`, `spotify_config`, `map_config`, `image_config`, `active_display`,
  `adventure_log`, `map_token_state` or `map_token_seed`. The only writers are
  `StartSession` (stamps the seed, `commands.py:839`) and `PauseSession` (writes the
  extracted state, `commands.py:1254-1260`) — both game operations wearing session names.
  A session cannot produce any of that data; only a running game can. The **baseline** for
  all of it is authored on the campaign side (which maps and images exist, each map asset's
  workshop grid and token config, each track's audio preset); the **deltas** — which map is
  up, where the tokens are, the log, the DM's Spotify block, volume tweaks — exist only
  because a game ran. This is "the big confusion we've had for a few years now": the
  session was holding game things.

So: **the Game becomes an aggregate that owns the lifecycle AND the play state; the session
keeps the party, the schedule, and nothing game-shaped.** Continuity is preserved because
each game is an immutable record of what it ended with, and the next game seeds from the
newest one.

Two further things were decided along the way:

- **Reset game is removed** (done on `feature/home-page`, 2026-09-06). It existed so a GM
  could "run the campaign again". Under the campaign-is-the-authored-baseline principle that
  is a *copy of the campaign*, which is the Market's acquire operation done by the author,
  and Matt doubts anyone runs the same self-authored campaign twice. Every history design we
  tried was a workaround for Reset. The copy flow is NOT built here; it belongs with stage 4
  or its own short plan.
- **The game's id is the room id.** api-game keys the Mongo document by it. This removes the
  "session id vs room id" blur (`useEndGame.js:25-26` documents the blur as a rule).

---

## Vocabulary — the four words, and what each owns

These are the only nouns. Do not introduce "instance", "episode", "table", "run" or "party
aggregate" in code or copy. **Party** is used in prose as the name for the session's
roster; renaming the roster in code is 05's job, not this plan's.

| Word | Meaning | Hot or cold | Owns |
|---|---|---|---|
| **Campaign** | The authored story: title, description, art, assets and their workshop configuration (the **baseline** every game starts from), seat count. Publishable one day. Today it also carries the members (`campaign_members`) — that moves to the session in 05's second extraction, not here. | Cold (PostgreSQL) | Nothing about play. `last_played_at` is a stamp, not state. |
| **Session** | **Who and when.** The gatekeeper between the campaign, its people and its games: the party (roster) and the plan for the next game (its date and its name). It has **no status** and **no play state**. It is "live" iff it has an open game. It knows its campaign through `campaign_id`; it knows its games only because they point at it through `games.session_id` — there is no stored game reference on the session. | Cold (PostgreSQL) | Roster, `scheduled_at`, `next_game_name`. |
| **Game** | **One play, from Start to End, and the state of play.** An aggregate with its own id. While open it has a Mongo document keyed by that id (the room); when ended it is an immutable record: name, when, who was there, what happened — **and where everything was** (boards, log, screen, audio, Spotify). The Game owns STARTING / ACTIVE / ENDING / ENDED and drives the ETL. The next game seeds from the newest ended one. | Cold row always (PostgreSQL, created at Start); hot document only while open (MongoDB) | `status`, `name`, `started_at`, `ended_at`, `ended_by`, `urls_expire_at`, `summary`, `attendance`, and the eight state fields. |
| **Party** | The people at the table and which character each brought: one seat per user, one character in it at a time, swappable over time. Today: `session_joined_users` (+ roles still on `campaign_members`). A value inside the session, never an aggregate — it has no id and no lifecycle of its own. | Cold | (unchanged by this plan) |

User-facing copy uses **game** for a play ("Start game", "End game", "Last game", "Games
played") and never says "session". Backend names keep `sessions` for the row.

### The relationship

```
Campaign 1 ──── 1 Session 1 ──── * Game
   (baseline)      (who, when)      (one play + its end state)
                                  └── at most ONE game open per session
                                      (open = status ≠ ended; enforced by a partial unique index)

Game.id  ==  api-game room id  ==  the `room_id` in /game?room_id=  ==  the Mongo _id while open

Continuity:  Game N+1 seeds from  ( Game N's seed , Game N's end state , the campaign's current baseline )
             Game 1 seeds from    ( — , — , the campaign's current baseline )
```

- Campaign → Session stays **one-to-one by rule** (the aggregate refuses a second; the FK
  permits many). Nothing here changes that. The model is now *capable* of many sessions per
  campaign — each would be its own party and its own lineage of games — and that capability
  is deliberately left unused. If it is ever wanted it needs its own verb (a "new table"),
  never "Start game". It is a future product decision, not a migration.
- Session → Game is **one-to-many**: a session accumulates games over its life.
- A session is **live** iff `SELECT … FROM games WHERE session_id = ? AND status <> 'ended'`
  returns a row. **Derived, never stored.** No `sessions.status`, no
  `sessions.current_game_id`, no `sessions.game` column. A stored pointer is
  `active_game_id` again — retired 2026-08-30 because two places asserting one fact drift
  the first time End fails between marking the game and clearing the pointer.
- `Game.campaign_id` is a **denormalisation** of `Game.session.campaign_id`, kept for one
  reason: the "is this campaign live" and "games played on this campaign" queries that
  callers across the codebase need without a join. Say so in the model's comment.

---

## Data shape — exact

### `games` (new table, `modules/game/model/game_model.py`, class `Game`)

Identity and lifecycle:

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK, default `uuid.uuid4` | The room id. api-game is handed this and keys the Mongo document by it. |
| `session_id` | UUID FK → `sessions.id`, `ondelete='CASCADE'`, NOT NULL | Deleting a campaign deletes its session deletes its games. History does not outlive the campaign (decision; keepsake history is not a goal). |
| `campaign_id` | UUID FK → `campaigns.id`, `ondelete='CASCADE'`, NOT NULL | Denormalised from the session — see above. Never written independently of `session_id`. |
| `host_id` | UUID FK → `users.id`, NOT NULL | Who started it (the session host at the time). |
| `status` | `String(20)` NOT NULL | `starting` / `active` / `ending` / `ended`. Plain string; no PG enum. |
| `name` | `String(100)` nullable | The GM's name for the night. **Set at Start from the session's planned `next_game_name`** (which Start then clears), edited at End or afterwards. Display default when null: "Game {n}" (rule in Phase D §4). |
| `created_at` | timestamptz NOT NULL, `server_default=func.now()` | Row minted at Start, before api-game is called. |
| `started_at` | timestamptz nullable | Set when api-game confirms the room (activate). |
| `ended_at` | timestamptz nullable | Set at End phase 2, in the same write as the state below. |
| `ended_by` | `String(20)` nullable | `host` / `system` (from `EndReason`). Null while open, and null on migrated rows (unknown). |
| `urls_expire_at` | timestamptz nullable | The signed-URL lease deadline, stamped at activate. Moves here from `sessions`; the expiry sweeper reads it from here. |
| `summary` | `Text` nullable | "What happened" — GM-written, prompted at End, optional, editable afterwards. A paragraph, not the log. |
| `attendance` | JSONB NOT NULL, `server_default='[]'` | `[{"user_id": "<uuid>", "character_id": "<uuid>|null"}, …]` — who was at the table during this game, written once at End from api-game's final state (rule in "End game" flow step 4). Never edited. Empty on migrated rows. |

The state of play — **moved from `sessions`, same names, same types, same server defaults,
same semantics**:

| Column | Type | Written when | Read when |
|---|---|---|---|
| `map_token_seed` | JSONB, `server_default='{}'` | **At Start** (activate): the boards the room actually opened with — the merge base for the next game (tokens v2 decision 24). | Next game's Start, as the "seed" input of the three-way merge. |
| `map_token_state` | JSONB, `server_default='{}'` | At End: `asset_id → list[MapToken]`. | Next game's Start, as the "board" input. |
| `adventure_log` | JSONB, `server_default='[]'` | At End: ≤ 200 `LogEntry`. | Next game's Start (restored into the room). |
| `map_config` | JSONB, `server_default='{}'` | At End: the active map (`{"asset_id"}`). | Next game's Start. |
| `image_config` | JSONB, `server_default='{}'` | At End. | Next game's Start. |
| `active_display` | `String(10)` nullable | At End: `map` / `image` / null. | Next game's Start. |
| `audio_config` | JSONB, `server_default='{}'` | At End. | Next game's Start. |
| `spotify_config` | JSONB, `server_default='{}'` | At End. | Next game's Start. |

**These eight columns are server-side only.** They are never serialised onto any response.
The frontend never needs them: the room is hydrated by api-site at Start and the game UI reads
the room from api-game.

Indexes, declared on the model:

```python
__table_args__ = (
    Index(
        'ix_games_one_open_per_session', 'session_id', unique=True,
        postgresql_where=text("status <> 'ended'"),
    ),                                          # the invariant: one open game per session
    Index('ix_games_session_ended', 'session_id', 'ended_at'),   # "newest ended game" lookup
    Index('ix_games_campaign_id', 'campaign_id'),                # "is this campaign live"
)
```

Relationships: `session = relationship("Session", backref=backref("games", passive_deletes=True))`.
No relationship to `Campaign` (reference by id only).

### `sessions` — columns REMOVED

`status`, `started_at`, `stopped_at`, `urls_expire_at`, `audio_config`, `spotify_config`,
`map_config`, `image_config`, `active_display`, `adventure_log`, `map_token_state`,
`map_token_seed`.

### `sessions` — what remains, plus one new column

`id`, `campaign_id`, `host_id`, `created_at`, `scheduled_at`, **`next_game_name`** (new:
`String(100)`, nullable — the planned name of the next game, set beside the date in the
Next Game modal and consumed by Start), and the `session_joined_users` roster table
(unchanged). That is the whole row. The two planning fields are intent about a game that
has not happened, which is session-shaped ("when, and what we said we'd do"); nothing on
the row describes a game that has.

### `campaigns` — unchanged

`last_played_at` is still stamped by `mark_played()` when a game activates.

### Domain — `GameAggregate` (`modules/game/domain/game_aggregate.py`)

```python
class GameStatus(str, Enum):
    STARTING = "starting"   # row exists, api-game not yet confirmed
    ACTIVE   = "active"     # a Mongo room exists keyed by this game's id
    ENDING   = "ending"     # End in progress: extracting hot state
    ENDED    = "ended"      # history; never reopened

class EndReason(str, Enum):
    HOST = "host"       # the GM pressed End game — toast to players, schedule clears
    SYSTEM = "system"   # expiry sweeper or admin CLI — silent, schedule survives

@dataclass(frozen=True)
class Attendee:
    user_id: UUID
    character_id: Optional[UUID]

class GameAggregate:
    # identity + lifecycle
    id: UUID; session_id: UUID; campaign_id: UUID; host_id: UUID
    status: GameStatus
    name: Optional[str]
    created_at: datetime
    started_at: Optional[datetime]; ended_at: Optional[datetime]; urls_expire_at: Optional[datetime]
    ended_by: Optional[EndReason]
    summary: Optional[str]
    attendance: List[Attendee]
    # state of play (see the column table for when each is written)
    map_token_seed: dict; map_token_state: dict; adventure_log: list
    map_config: dict; image_config: dict; active_display: Optional[str]
    audio_config: dict; spotify_config: dict

    @classmethod
    def create(cls, session_id, campaign_id, host_id, name: Optional[str]) -> "GameAggregate":
        # status=STARTING, name = the session's planned next_game_name (may be None),
        # every state field at its default, attendance=[]

    @classmethod
    def from_persistence(cls, **columns) -> "GameAggregate": ...

    def activate(self, urls_expire_at: Optional[datetime], map_token_seed: dict) -> None:
        # STARTING → ACTIVE; started_at = datetime.utcnow(); urls_expire_at, map_token_seed stored
        # raises ValueError("Only a starting game can be activated") otherwise

    def begin_end(self) -> None:
        # ACTIVE → ENDING; raises ValueError("Only a running game can be ended") otherwise

    def record_end_state(self, extracted: "_ExtractedGameState") -> None:
        # ENDING only (ValueError("Only an ending game records its state") otherwise);
        # copies exactly: audio_config, spotify_config, map_config, image_config,
        # active_display, adventure_log, map_token_state

    def end(self, reason: EndReason, attendance: List[Attendee]) -> None:
        # ENDING → ENDED; ended_at = datetime.utcnow(); ended_by = reason; attendance stored

    def abort_end(self) -> None:
        # ENDING → ACTIVE (today's abort_stop); raises otherwise

    def rename(self, name: Optional[str]) -> None:
        # any status; strip(); "" → None; > 100 chars → ValueError("Game name must be 100 characters or fewer")

    def summarise(self, summary: Optional[str]) -> None:
        # any status; strip(); "" → None; no length limit (Text column)

    def remove_asset_references(self, asset_id_str: str) -> bool:
        # moved verbatim from session_aggregate.py:210-243, operating on this aggregate's fields

    @property
    def is_open(self) -> bool:
        return self.status != GameStatus.ENDED
```

`EndReason` **replaces** `PauseReason` (`session_aggregate.py:62-72`): same two members, same
meaning; "pause" leaves the backend vocabulary with the session's status. Rename, do not keep
both. `ENDING` replaces `STOPPING`: the user verb is End (06), the event is `session_ended`,
the drawer already says "Ending…"; the transition should land on the state it names.

**A game that never activated is deleted, not ended.** If api-game fails during Start, the
command removes the row it minted. An ENDED game with no `started_at` would be a phantom in
the history list and a wrong "newest ended game" for the next seed. State this in
`StartGame`'s docstring.

### Domain — `SessionAggregate` after this plan

Remove: `status`, `started_at`, `stopped_at`, `urls_expire_at`, the eight state fields,
`SessionStatus`, `PauseReason`, `is_locked`, `is_active`, `remove_asset_references`,
`start()`, `activate()`, `pause()`, `deactivate()`, `abort_start()`, `abort_stop()`
(`session_aggregate.py:23-72, 104-129, 140, 196-243, 277-350`; `can_delete` is already
gone with Reset).

Keep: `create`, the roster methods, `schedule()`, `clear_schedule()`.

`schedule(scheduled_at, next_game_name)` now takes both planning fields and stores both
(name stripped, `""` → `None`, > 100 chars → `ValueError("Game name must be 100
characters or fewer")`). Add `consume_next_game_name() -> Optional[str]`: returns the
planned name and sets the field to `None` — called by `StartGame` only, and only once the
game is ACTIVE. `clear_schedule()` is unchanged (date only): by the time End runs, the name
has already moved onto the game.

`schedule()`'s guard (`session_aggregate.py:260`, "End the game before changing the
schedule") can no longer read `self.status`. The check moves to the **command**:
`ScheduleSession` asks the game repository for an open game and raises
`ValueError("End the game before changing the schedule")` if one exists. The aggregate
method keeps only the timezone-aware check.

### Response shapes

`modules/game/api/schemas.py`:

```python
class AttendeeResponse(BaseModel):
    user_id: UUID
    character_id: Optional[UUID]
    class Config: from_attributes = True

class GameResponse(BaseModel):          # the ONLY wire shape for a game — no state fields, ever
    id: UUID
    session_id: UUID
    campaign_id: UUID
    host_id: UUID
    status: str                          # starting | active | ending | ended
    name: Optional[str]                  # null → client renders "Game {n}"
    created_at: datetime
    started_at: Optional[datetime]
    ended_at: Optional[datetime]
    ended_by: Optional[str]              # host | system | null
    summary: Optional[str]
    attendance: List[AttendeeResponse]
    class Config: from_attributes = True

class StartGameRequest(BaseModel):
    session_id: UUID

class EndGameRequest(BaseModel):
    name: Optional[str] = None
    summary: Optional[str] = None

class UpdateGameRequest(BaseModel):
    name: Optional[str] = None           # omitted/None = unchanged; "" = clear
    summary: Optional[str] = None        # same
```

`modules/session/api/schemas.py`:

```python
class ScheduleSessionRequest(BaseModel):  # existing; gains the name
    scheduled_at: Optional[datetime] = None   # timezone-aware validator unchanged
    next_game_name: Optional[str] = None      # ≤ 100; "" and None both clear

class SessionResponse(BaseModel):        # `status`, `started_at`, `stopped_at` REMOVED
    id: UUID
    campaign_id: UUID
    host_id: UUID
    host_name: str
    created_at: datetime
    scheduled_at: Optional[datetime]
    next_game_name: Optional[str]        # the planned name; null once Start has consumed it
    game: Optional[GameResponse]         # the OPEN game or null — derived per request
    games: List[GameResponse]            # ENDED games, newest first (ended_at desc) — the history
    joined_users: List[UUID]
    roster: List[RosterPlayerResponse]
    player_count: int
```

`GameResponse` is imported into the session schemas from the game module's `api/schemas.py`
(a DTO import between API layers, not a domain import — permitted). Both `game` and `games`
are filled by the session endpoints' existing response helper from `GameRepository`. There
is no separate history endpoint and no separate frontend query: the drawer reads
`session.games` from the campaigns query it already has. `GameResponse` deliberately has no
"full" variant: the state columns exist for Start to read server-side and for nothing else.
`UpdateGameRequest` semantics: a field omitted or `null` leaves the value alone; an empty
string clears it (the aggregate's strip-to-None does the clearing).

---

## Behavioural flows — step by step

Every flow below is the whole flow. If a step is not listed, it does not happen.

### Start game (host, from hero or drawer)

1. `POST /api/games/` body `{"session_id": …}` (host only).
2. `StartGame` loads the session and campaign. Refuses if the requester is not the session
   host (`ValueError("Only the host can start the game")`). Refuses if the session already
   has an open game (`ValueError("A game is already running")` — the partial index is the
   backstop, this is the message).
3. Mints `GameAggregate.create(session.id, session.campaign_id, host_id,
   name=session.next_game_name)` as STARTING and **saves it** — the row exists before
   api-game is called. The session is only *read* here; its planned name is not cleared
   until step 7, so a failed start leaves the plan intact for the retry.
4. Loads the **previous game**: `game_repo.get_newest_ended_game_for_session(session.id)`,
   or `None` for the session's first game.
5. Builds the start payload exactly as `StartSession` does today — roster and `max_players`
   from the campaign, signed URLs — but every read that today goes to the session row goes
   to the previous game, and when there is none behaves exactly as an empty session does
   today (empty dict / empty list / None):
   - audio: `previous.audio_config` (today `session.audio_config`, `commands.py:441-443`)
   - boards: three-way merge of `previous.map_token_seed`, `previous.map_token_state` and
     the campaign's current workshop baselines (today `:581-582`; `merge_token_boards` is
     unchanged)
   - active map / image / display: `previous.map_config`, `previous.image_config`,
     `previous.active_display` (today `:635-659, :806`)
   - log: `previous.adventure_log` (today `:807`)
   - spotify: `previous.spotify_config` (today `:803`)
   - `game_id = str(game.id)` where the payload sent `session_id` (today `:780`).
6. Calls api-game `POST /game/session/start`. api-game creates the room with
   `room_id = game_id` and echoes it; the command asserts the echo matches (the existing
   tripwire at `:830`, message "api-game returned game id … for game …").
7. `game.activate(urls_expire_at, map_token_seed)` — the seed the room actually opened with
   (today stamped on the session at `:839`). Save the game. `campaign.mark_played()`, save.
   `session.consume_next_game_name()`, save the session — **the one session write Start
   makes**, and it only clears the planning field the game has now taken. Broadcast
   `session_started` with `game_id` and `game_name` added to the payload.
8. On ANY failure between 3 and 7: **delete the game row** (never leave STARTING behind),
   leave the session and the previous game untouched, raise
   `ValueError(f"Failed to start game: {error}")`.
9. Response: `GameResponse` (201). The frontend gets the room id from it.

**Start writes the session only to clear `next_game_name`, and only after the game is
ACTIVE.** No other session field is touched.

### Enter / Join game

`router.push('/game?room_id=' + session.game.id)`. The game page, the websocket
(`/ws/{room_id}`), and every `/api/game/{room_id}/…` call are unchanged — they only ever knew
the room id, which is now the game id.

### End game — host (drawer END GAME, or the in-game end button)

1. `POST /api/games/{game_id}/end` body `{"name": …?, "summary": …?}` — both optional. The
   in-game button already has the game id (it is `room_id`).
2. `EndGame` loads the game. Host check (`ValueError("Only the host can end the game")`).
   Status check (`ValueError("Only a running game can be ended")`). `game.begin_end()`,
   save (ENDING).
3. Phase 1: `_extract_and_sync_game_state` exactly as today, addressed by the game id. It
   returns the `_ExtractedGameState` dataclass unchanged.
4. Phase 2, **one write to the game row**: `game.record_end_state(extracted)`, then
   `game.end(EndReason.HOST, attendance)`, then `game.rename(body.name)` and
   `game.summarise(body.summary)` if the body carried them. **Attendance rule**: one
   `Attendee` per `PlayerState` in `final_state.players`, in list order, de-duplicated by
   `user_id` keeping the first occurrence; `character_id` copied as-is (may be null).
   Save the game with the same retry-and-rollback contract as today
   (`_save_game_with_retry`, 1 s / 2 s / 3 s; on exhausted retries `game.abort_end()` →
   ACTIVE, save, and raise `ValueError("Failed to end the game — it is still live and can
   be ended again. Error: …")`; if even that save fails raise `ValueError("Failed to end
   the game and it could not be returned to live. Game preserved in MongoDB — needs admin
   attention. Error: …")`). Because the reason is HOST, also `session.clear_schedule()` and
   save the session — this is the ONLY thing End ever writes to the session, and it is a
   schedule fact, not play state.
5. Phase 3: `asyncio.create_task(_async_cleanup_game(game.id))` deletes the room
   (`DELETE /game/session/{game_id}`).
6. Broadcast `session_ended` to non-host members (toast, not persisted), payload gains
   `game_id`, `game_name`.
7. 204.

**The End prompt (UX).** Both End dialogs gain the same two optional fields, rendered by one
shared component `app/dashboard/components/GameRecordFields.js` (props: `name`, `summary`,
`onChange({name, summary})`, `disabled`):

- *Name this game* — `<input maxLength={100}>`, label "Name this game", **prefilled with
  `game.name`** (the name planned before Start, if any), placeholder "Game {n}" where n is
  the session's next game number (`session.games.length + 1`).
- *What happened?* — `<textarea rows={3}>`, label "What happened?", placeholder "A line or
  two so everyone remembers where you left off".

**Neither ever blocks ending.** Empty means null. The drawer's `EndGameModal.js` places them
between its explanatory paragraph and the buttons; the in-game confirm in
`GameContent.js:2780-2786` places them above its description line. This is the moment the GM
knows what the night was; it is also editable later from the history list.

### End game — system (expiry sweeper, `admin.py`)

Same command with `EndReason.SYSTEM`: no name/summary, no toast (the existing
`session_paused` wire event, silent, invalidation only), and **the schedule is NOT cleared**.
The end state and attendance are still recorded — a night the sweeper closed was still
played, and the next game must seed from it.

### Reading state (Home, drawer, pulse, notes)

- Live? `session.game !== null && session.game.status === 'active'`.
- In flight? `session.game?.status` is `starting` or `ending`.
- Idle? `session.game === null`.
- Started when? `session.game.started_at`.
- Which room? `session.game.id`.
- Past games? `session.games` (ended, newest first). Last game = `session.games[0]`.
- Planned next game? `session.scheduled_at` and `session.next_game_name` (both null once
  consumed or cleared).
- `campaign.last_played_at` still serves the cheap ranking comparator; the hero's idle line
  is unchanged by this plan.

### Games history (drawer)

The expanded campaign card gains a **GAMES PLAYED** section directly under the game controls
block, rendered from `session.games`, visible to every campaign member:

- Section header uses the existing `PANEL_SUB_HEADER` constant, text "GAMES PLAYED".
- One row per game, newest first, no cap, no pagination. Row layout, left to right on one
  line: **name** (bold; `game.name ?? \`Game ${n}\``), **date** (`formatScheduledTime(game.started_at)`
  — the existing short local format), **duration** (`formatDuration(game.started_at,
  game.ended_at)`), **attendance** (`${game.attendance.length} at the table`). Beneath the
  line, the **summary** in secondary text when present; nothing rendered when null.
- The game number **n** for a row is `session.games.length - index` (newest first, so the
  oldest game is 1).
- For the host only, a pencil icon (`faPen`) at the row's right edge opens
  `app/dashboard/components/EditGameModal.js`: title "Edit game", `GameRecordFields`
  prefilled from the game, buttons CANCEL and SAVE. SAVE calls `useUpdateGame().mutate({
  gameId, name, summary })`. Players see no icon.
- Empty list → a single secondary-text line "No games played yet".
- Styling: the drawer's existing plate language and `THEME` tokens; no new tokens, no new
  CSS classes beyond what `PANEL_SUB_HEADER` and the existing row utilities provide.

`formatDuration(startIso, endIso)` is added to `app/shared/utils/formatTime.js`: whole
minutes; `< 1 min` → "under a minute"; `< 60 min` → "{m}m"; otherwise "{h}h {m}m" with the
minutes omitted when zero ("2h"). Either argument null → "".

### Schedule — now "the next game": its date and its name

The drawer's Next Game modal (`ScheduleGameModal.js`, title "Next Game") gains a text
input **above** the date and time: label "Name (optional)", `maxLength={100}`, placeholder
"e.g. The Siege of Kraghammer", prefilled from `session.next_game_name`. Rules:

- Date and time are a pair: both set, or both empty (→ `scheduled_at: null`). The existing
  "SAVE disabled while one of the pair is empty" rule becomes "disabled while exactly one
  is set". A name with no date is allowed; a date with no name is allowed.
- SAVE sends one request: `PATCH /api/sessions/{id}/schedule` body
  `{ scheduled_at, next_game_name }`. CLEAR sends both as `null`.
- The guard is unchanged in spirit: the control is disabled and the PATCH refused while
  `session.game` is non-null (`ValueError("End the game before changing the schedule")`).
- Host end clears `scheduled_at` (above); the name was consumed at Start, so there is
  nothing to clear. System end leaves the date.
- The `session_scheduled` event payload gains `next_game_name` (string or null). Copy:
  with a name and a date — "{host} set the next {campaign} game, {name}, for {local time}";
  date only — the existing line; name only — "{host} named the next {campaign} game
  {name}"; both cleared — the existing cleared line.

Display (one rule, `gameStatusLine.js`, used by hero and drawer):

| State | Line |
|---|---|
| Live, named | "{name} · Started {relative}" |
| Live, unnamed | "Started {relative}" |
| Idle, future date, named | "Next game · {name} · {local date/time}" |
| Idle, future date, unnamed | "Next game · {local date/time}" |
| Idle, name only | "Next game · {name}" |
| Idle, past date or nothing | the existing last-played line |

The calm pulse pill is unchanged (date only).

### Campaign delete

Refuses if the campaign has an open game (`ValueError("End the game before deleting this
campaign")` — the existing message). Otherwise deletes the campaign; the session and its
games cascade. Same behaviour as today, different predicate.

### Asset deletion (library)

Today `DeleteAsset` scrubs the asset from every session's JSONB
(`library/application/commands.py:214` → `session.remove_asset_references`). After: scrub
the **newest ended game** of each affected campaign's session (`get_newest_ended_game_for_session`,
skip when None), since that is the only row a future Start reads. Older games keep their
record untouched; an open game cannot exist here because the board-in-play check refuses
the delete while a game runs.

### Late-joining player while live

`AcceptCampaignInvite` (`campaign/application/commands.py:248-310`) appends the player to the
session roster and syncs to api-game through `_sync_player_to_game(game_id, …)` (`:312`,
URL at `:322`) — today it is handed `session.id`; it must be handed the **open game's id**.
`_notify_active_session` (`:650`, URL at `:683`) builds its room from `active_session.id`
and must do the same.

### Player disconnect — character state to cold storage

**Added 2026-09-06 after a gap was found in this plan's first draft.** `DisconnectFromGame`
(`session/application/commands.py`, end of file) is the character-level ETL: it writes a
player's current HP from the hot room onto their character row and marks the character dead
at zero. Position and status effects are commented-out TODOs and stay that way.

Three facts established before deciding this:

- It reads `session.is_active()`, which this plan deletes, so it must move whatever else
  happens.
- **Nothing calls it.** `POST /api/sessions/{id}/disconnect` has no caller in the frontend,
  and api-game's only outbound calls to api-site are the role change and the character
  summary (`api-game/site_client.py`). HP changed in play therefore never reaches
  PostgreSQL today. That is a pre-existing bug, not one this plan introduces.
- **The End ETL does not cover it.** `_extract_and_sync_game_state` syncs character
  *colour* only, and `PlayerState` carries no HP field.

**The destination is the character row**, which is user-owned. Not the game, not the party.
The game's cold state is the board, log, screen and audio; the party records which character
someone brought, not that character's state. (05 says this outright: "Runtime state stays on
the character … named here so nobody later 'fixes' it by moving characters into the session".)

The command moves to the game module and is addressed by game id:

1. `POST /api/games/{game_id}/disconnect` body
   `{"user_id": UUID, "character_id": UUID, "character_state": {...}}`.
2. Load the game (404 if absent). Require `status == ACTIVE`
   (`ValueError("No game is running")`).
3. Character ownership check and the campaign-lock check unchanged, with the campaign read
   from `game.campaign_id` instead of `session.campaign_id`.
4. The HP write, the `mark_dead()` branch and the character save are unchanged.

**Its caller** (Phase C): api-game's `player_disconnect` handler
(`websocket_handlers/websocket_events.py:780`), which fires on every socket close. It reads
the disconnecting player's `hp_current` from the room's `player_metadata` and posts it
through a new `site_client.save_character_state(...)`, following the shape of the existing
`request_role_change`. Failures are logged and swallowed — a disconnect must never be held
up by api-site, and the player's next disconnect or the game's End will try again.

**Not taken (decided 2026-09-06):** adding `hp_current` to `PlayerState` so the End ETL
persists HP for everyone. It would make the save redundant rather than best-effort, but it
is a contract change and a genuine scope addition. Revisit if disconnect saves prove lossy.

### Reset game

**Already removed from `feature/home-page`.** Phase E verifies.

---

## What we will NOT do

- No `sessions.status`, no `sessions.current_game_id`, no boolean "is live" column. Liveness
  is a query.
- **No play state on the session, of any kind.** If a future field describes what happened
  in a game or where things are on the board, it goes on the game.
- **No state fields on the wire.** `GameResponse` never carries the eight state columns; there
  is no "full game" response and no endpoint that returns one.
- No dedicated history endpoint and no dedicated history view or query hook. `session.games`
  is the history; the drawer's list is the view.
- No prompt on Start. The hero and drawer Start buttons stay one click; the name comes
  from the planned next game (set beside the date), is edited at End, or afterwards.
- No second session per campaign, and no UI that chooses between sessions. The aggregate's
  one-session rule stays.
- No Party aggregate, no `party_id`, no roster rename — 05's second extraction.
- No Reset, no Archive, no "start from a chosen past game". Start always seeds from the
  newest ended game.
- No copy/duplicate/adopt campaign flow. It is the replacement for Reset's use case and it
  belongs with stage 4 (the Market's acquire) or its own short plan.
- No change to the ETL's *content*: what api-game extracts and what api-site restores is
  byte-for-byte today's. Only the row that owns it and the id used as the room change.
- No fabricated history: the migration creates exactly one ENDED game per session that was
  actually played (it has state or timestamps), from that session's real data. Never-played
  sessions get no row.
- No renaming of wire event types (`session_started`, `session_ended`, `session_paused`,
  `session_scheduled`, `session_created`): persisted notification rows carry them and the
  frontend copy keys on them. Payloads gain `game_id` and `game_name`.
- No change to the hero's idle line, the greeting, the pulse weights, or the notes page
  beyond the status read.
- No JS test suite. No emoji log prefixes. No lazy imports. No single-letter or initialism
  names.

---

## House rules that bite here (full text in CLAUDE.md)

- **Migrations: `alembic revision --autogenerate` inside the container**, then edit the
  generated file for the precondition and the data step, and to confirm the partial index.
- **Never run git write commands.** Propose them; Matt runs them.
- **Every test owns its state**; run a new test alone against the unfixed code first.
- **Delete superseded code in the same PR** and do a deliberate dead-code sweep; JS lint will
  not catch unused symbols.
- **Cross-aggregate rule**: `modules/game/` may inject `SessionRepository`,
  `CampaignRepository`, `UserRepository`, `CharacterRepository`, `MediaAssetRepository` in
  its commands (application layer), and may import `EventConfig`/`EventManager` from
  `modules/events/`. It must not import another module's domain or call its aggregates
  directly, and other modules reference games by id through `GameRepository`.
- **Contracts CI gate**: any change under `shared_contracts/` extends
  `rollplay-shared-contracts/tests/test_contracts.py` in the same change.
- **Do not `npm run build` while `rollplay-dev` is up.** `node_modules` is a named volume:
  lint and compile-check inside the container.
- **`authFetch` for every authenticated call**; GPL headers on new files.

---

## Ground truth (verified 2026-09-06 at `bb5dc22`; Reset lines since removed)

### api-site

| What | Where |
|---|---|
| `SessionStatus`, `PauseReason`, the status/timestamp/state fields, `is_locked`, `is_active`, `remove_asset_references`, `schedule` guard, transitions `start/activate/pause/deactivate/abort_start/abort_stop` | `modules/session/domain/session_aggregate.py:23-72, 104-129, 140, 196-243, 245-267, 277-350` |
| Session model: `status`, `started_at`, `stopped_at`, `urls_expire_at` `:55-59`; `scheduled_at` `:62`; the eight state columns `:63-70`; roster table `:20-36` | `modules/session/model/session_model.py` |
| `CreateSession` (internal only; one-session guard `:97-100`) | `modules/session/application/commands.py:52-148` |
| `ScheduleSession` | `commands.py:150-212` |
| `StartSession` — status guard `:719`, STARTING `:730-732`, **reads of session state**: audio `:441-443`, boards + seed `:581-582`, map `:635-637`, image `:657-659`, spotify/display/log in the payload `:803-807`; payload `session_id=` `:780`; api-game POST `:816`; echo tripwire `:830-832`; **seed stamp** `:839`; activate `:838-843`; rollback `:846-853`; `mark_played` + `session_started` `:858-875` | `commands.py` (numbers pre-Reset-removal; the class starts ~100 lines earlier now) |
| `_ExtractedGameState`, `_extract_and_sync_game_state` (end POST `:931-933`), `_save_session_with_retry`, `_abort_stuck_stop`, `_async_cleanup_game` (DELETE `:1170`) | `commands.py` |
| `PauseSession` — ACTIVE guard `:1236`, `pause()` `:1240`, **phase-2 state copy onto the session** `:1254-1260`, `clear_schedule` on HOST_ENDED `:1261-1267`, retry `:1269`, event split `:1290`, phase 3 `:1315` | `commands.py` |
| `RemovePlayerFromSession`, `SelectCharacterForSession` (deprecated — reads no status, stays put), `DisconnectFromGame` (reads `session.is_active()`; moves to the game module) | `commands.py` (end of file) |
| api-game's outbound calls to api-site (the pattern for the new one) | `api-game/site_client.py:27, 71` |
| api-game's disconnect handler | `api-game/websocket_handlers/websocket_events.py:780` |
| Session routes: `my-sessions`, get, by campaign, remove player, **start**, **end**, schedule, select-character, disconnect | `modules/session/api/endpoints.py` |
| `SessionResponse` (`status`, `started_at`, `stopped_at`), `RosterPlayerResponse`, `ScheduleSessionRequest` | `modules/session/api/schemas.py:10-68` |
| Repository: `get_active_session_for_campaign` `:50`, `get_stopping_sessions` `:64`, `get_expired_sessions` `:77`, `get_active_sessions` `:95`, `save` `:110` (maps the state fields), `_model_to_aggregate` | `modules/session/repositories/session_repository.py` |
| Session events: `session_created` `:33`, `session_started` `:79` (persists for non-host `:110`), `session_paused` `:115`, `session_scheduled` `:152`, `session_ended` `:208` | `modules/session/domain/session_events.py` |
| Expiry sweeper: reads `sessions.urls_expire_at`, drives `PauseSession(reason=SYSTEM)` `:54-70`; stuck-STOPPING reconcile `:80` | `modules/session/application/expired_session_cleanup.py` |
| Admin CLI: `list-active` `:112`, `pause-all-sessions` `:157`, `pause-session` `:205`, all over `get_active_sessions` / `PauseSession` | `api-site/admin.py` |
| Router registration `:93`; sweeper task in lifespan `:57-60` | `api-site/main.py` |
| `alembic/env.py` model imports (add the game model) | `api-site/alembic/env.py:22-50` |
| `campaign.mark_played()` | `modules/campaign/domain/campaign_aggregate.py:225`, called from `StartSession` |
| `DeleteCampaign` live guard via `session.is_locked` | `modules/campaign/application/commands.py:95-103` |
| `AcceptCampaignInvite` auto-add to live session `:277-281`; `_sync_player_to_game` `:312-322` and `_notify_active_session` `:650-683` both address api-game by the session id | `campaign/application/commands.py` |
| Character-select guards via `get_active_session_for_campaign` | `campaign/application/commands.py:606, 654, 731` |
| Slot-reduction guard | `modules/user/application/commands.py:118-128` |
| Library: board-in-play check reads `session.status` `:36-46`; **asset delete scrubs every session** `:214` | `modules/library/application/commands.py` |
| Tests to rewrite/delete: `test_session_lifecycle.py` (`TestWhyEndingKeepsTheSession` keeps its point but its subject becomes "the next game seeds from the previous game"), `test_session_scheduling.py` (`TestScheduleRules` status params, `TestTakeDownClearsTheSchedule` — its api-game mocking is the harness to copy), `test_session_events.py` (payload tests), `test_token_merge.py` (the merge's inputs are unchanged; only their source row) | `modules/session/tests/` |

### Contracts and api-game

| What | Where |
|---|---|
| `SessionStartPayload.session_id` `:61`, `SessionStartResponse.session_id` `:107`, `SessionEndFinalState.players: List[PlayerState]` `:89-92` (attendance source), `PlayerState.user_id/character_id` `:19-28` | `rollplay-shared-contracts/shared_contracts/session.py` |
| Contract tests referencing `SessionStartPayload` | `rollplay-shared-contracts/tests/test_contracts.py:494-562` |
| api-game start route uses `request.session_id` as the room id `:550, 610-664`; end route `:674-850` reads `request.session_id`; `DELETE /game/session/{game_id}` `:853` | `api-game/app.py` |
| `GameService.create_room(settings, room_id=)` | `api-game/gameservice.py:81` |
| nginx: `location /api/game/` (trailing slash) dev `:90`, prod `:64`; prod has explicit `/api/sessions/` `:274`; dev falls through to `/api/` `:137` | `docker/dev/nginx/nginx.conf`, `docker/prod/nginx/nginx.conf` |

### Frontend

| What | Where |
|---|---|
| Room id pushes from `session.id`: SocialPanel `:187`, notes page `:71`, drawer `enterGame`, hero `:54`, pulse `:168` | `app/shared/components/SocialPanel.js`, `app/(authenticated)/notes/page.js`, `app/dashboard/components/CampaignManager.js`, `app/dashboard/components/home/HomeHeroCard.js`, `app/dashboard/components/home/PulseLine.js` |
| `session.status` readers: `homeRanking.js:23-24`, `gameStatusLine.js:28-31`, `CampaignManager.js` (the `isGameLive` line, the live-session filter, the controls block's `'starting'`/`'inactive'` checks), `HomeHeroCard.js:51-52`, `PulseLine.js:69`, notes `findLiveSession` `:20-25` | as listed |
| Mutations: `useStartGame` `:20`, `useEndGame` `:45`, `useScheduleGame` `:72` | `app/dashboard/hooks/mutations/useSessionMutations.js` |
| In-game end: `useEndGame.js` (`/api/sessions/${sessionId}/end` `:42`, comment `:25-26` says room id IS session id); confirm dialog `GameContent.js:2780-2786`; `roomId` from params `:683` | `app/game/hooks/useEndGame.js`, `app/game/GameContent.js` |
| Drawer End modal (gets the two fields) | `app/dashboard/components/EndGameModal.js` |
| Next Game modal (gets the name field; date + `TimeField` pair, SAVE/CLEAR) | `app/dashboard/components/ScheduleGameModal.js` |
| `session_scheduled` factory (gains `next_game_name`) | `modules/session/domain/session_events.py:152` |
| Sessions fan-out per campaign (now also carries `game` and `games`) | `app/dashboard/hooks/useCampaigns.js:73-92` |
| Event bridge: `session_*` handlers `:122-150`; **dead** `game_created/started/ended/finished` `:154-163` | `app/shared/hooks/useAuthenticatedEvents.js` |
| Event copy | `app/shared/config/eventConfig.js:140-200` |
| Time helpers (`formatRelativeTime`, `formatScheduledTime`) — add `formatDuration` | `app/shared/utils/formatTime.js` |
| Panel constants (`PANEL_SUB_HEADER`) | `app/styles/constants.js` |

---

## The work — one PR, five phases in this order

Phases A–C are backend and must be complete and green before D starts; the branch is the
integration point. Do not open the PR until Phase E is done.

### Phase A — the Game module (api-site)

**A1. New module `modules/game/`**, standard layout: `api/endpoints.py`, `api/schemas.py`,
`application/commands.py`, `application/queries.py`, `domain/game_aggregate.py`,
`model/game_model.py`, `repositories/game_repository.py`, `dependencies/providers.py`
(`get_game_repository`), `tests/__init__.py`. GPL headers on every file. No
`domain/game_events.py` — the events stay in the session module (A5).

**A2. `GameRepository`** (`repositories/game_repository.py`):

- `get_by_id(game_id) -> Optional[GameAggregate]`
- `get_open_game_for_session(session_id) -> Optional[GameAggregate]` (`status != 'ended'`)
- `get_open_game_for_campaign(campaign_id) -> Optional[GameAggregate]`
- `get_newest_ended_game_for_session(session_id) -> Optional[GameAggregate]`
  (`status == 'ended'`, `ORDER BY ended_at DESC`, first) — **the seed source**
- `get_ended_games_for_session(session_id) -> List[GameAggregate]` (`ORDER BY ended_at DESC`)
- `get_open_games() -> List[GameAggregate]` (admin work list; replaces `get_active_sessions`)
- `get_ending_games() -> List[GameAggregate]` (stuck-ENDING reconcile; replaces `get_stopping_sessions`)
- `get_expired_open_games(now) -> List[GameAggregate]` (`status == 'active' AND urls_expire_at < now`)
- `save(aggregate) -> UUID` — maps every column including the eight state fields
- `delete(game_id) -> bool` — only ever called by `StartGame`'s rollback
- `_model_to_aggregate` calls `GameAggregate.from_persistence(...)` directly (no mapper file)

**A3. Commands move, they are not copied** (`application/commands.py`). Move `StartSession`
→ `StartGame`, `PauseSession` → `EndGame`, and the helpers `_ExtractedGameState`,
`_extract_and_sync_game_state`, `_save_session_with_retry` → `_save_game_with_retry`,
`_abort_stuck_stop` → `_abort_stuck_end`, `_async_cleanup_game`, and every `_restore_*` /
merge helper that reads the session's state — they now take the previous `GameAggregate`
or `None`. Delete them from the session module. Implement the flows in "Behavioural flows"
exactly. Add `UpdateGame(game_repository).execute(game_id, host_id, name, summary)` (host
check `ValueError("Only the host can edit the game")`; applies `rename` when `name` is not
None, `summarise` when `summary` is not None).

**`DisconnectFromGame` moves too**, into the same module, rewired per "Player disconnect"
above: it takes `game_id`, injects `GameRepository` and `CharacterRepository` (no
`SessionRepository`), and reads the campaign from `game.campaign_id`. Its body below the
guards is unchanged. Delete it from the session module.

`CreateSession` keeps its one-session guard. `ScheduleSession` gains a `GameRepository`
constructor argument, the open-game refusal, and the `next_game_name` parameter passed
through to `session.schedule(scheduled_at, next_game_name)`; its event call passes the
name too.

**A4. Every reader of session status or state moves to the game repository:**

| Caller | Today | After |
|---|---|---|
| `DeleteCampaign` | `session.is_locked` | `game_repo.get_open_game_for_campaign(campaign_id)` |
| `AcceptCampaignInvite` `:277`, `_sync_player_to_game` `:322`, `_notify_active_session` `:654-683` | `get_active_session_for_campaign(...)` then the session id as room | open game; `game.id` as room |
| Character-select guards `:606, 654, 731` | same | same |
| Slot reduction `user/…/commands.py:123` | same | same |
| Library `check_asset_in_active_session` | iterates sessions, reads `status` | `game_repo.get_open_game_for_campaign` per campaign id; error copy "Cannot modify asset while a game is running in a campaign. End the game first." |
| Library `DeleteAsset` scrub `:214` | every session's `remove_asset_references` | the newest ended game's `remove_asset_references`, per affected campaign's session |
| Expiry sweeper | `get_expired_sessions`, `PauseSession(SYSTEM)` | `get_expired_open_games`, `EndGame(EndReason.SYSTEM)`; stuck-ENDING reconcile over `get_ending_games` |
| `admin.py` | `get_active_sessions`, `pause-all-sessions`, `pause-session` | `get_open_games`; commands renamed `end-all-games`, `end-game`; `list-active` prints game id, campaign id, `started_at` |
| `DisconnectFromGame` | `session.is_active()` | loads the game by id; `status == ACTIVE`; campaign from `game.campaign_id` |

Then delete `get_active_session_for_campaign`, `get_stopping_sessions`,
`get_expired_sessions`, `get_active_sessions` from `SessionRepository`, the state-field
mapping from its `save`/`_model_to_aggregate`, and every `SessionStatus` import in the
codebase. Every constructor that took a `SessionRepository` only to ask "is it live" now
takes a `GameRepository` instead; update the providers and the endpoints that build them.

**A5. Events.** Stay in `session_events.py` with their wire names. `session_started`,
`session_ended` and `session_paused` gain `game_id: str` and `game_name: Optional[str]` in
`data` (stringify the UUID at the boundary; `game_name` may be `None`). `session_scheduled`
gains `next_game_name: Optional[str]`. No new event types.

**A6. Routes** (`modules/game/api/endpoints.py`, `APIRouter()`, registered in `main.py` as
`app.include_router(game_router, prefix="/api/games", tags=["games"])` beside the session
router):

| Route | Body | Returns | Errors |
|---|---|---|---|
| `POST /api/games/` | `StartGameRequest` | `GameResponse` 201 | 404 session not found; 400 any `ValueError` |
| `POST /api/games/{game_id}/end` | `EndGameRequest` | 204 | 404 game not found; 400 any `ValueError` |
| `PATCH /api/games/{game_id}` | `UpdateGameRequest` | `GameResponse` | 404; 400 |
| `POST /api/games/{game_id}/disconnect` | `DisconnectRequest(user_id: UUID, character_id: UUID, character_state: dict)` | 204 | 404 game/character not found; 400 any `ValueError` |

Four routes. No GET: reads come through `SessionResponse.game` / `.games`. The disconnect
route is called by api-game, not by a browser, and stays unauthenticated in the same way the
existing session route was.

Session router: delete `POST /{id}/start`, `POST /{id}/end` and `POST /{id}/disconnect`. Keep the rest. The session
endpoints' response helper attaches `game` (`get_open_game_for_session`) and `games`
(`get_ended_games_for_session`).

**A7. Migration** — one autogenerated revision with a precondition, a data step, and the
index check:

```bash
docker exec api-site-dev alembic revision --autogenerate -m "game aggregate: games table owns status and play state"
```

Autogenerate should produce: create `games` (+ the three indexes); add
`sessions.next_game_name`; drop the twelve columns from `sessions`. Edit the file so
`upgrade()` runs in this order, with the reasoning in the docstring:

1. **Precondition, before anything else**:
   `SELECT count(*) FROM sessions WHERE status <> 'inactive'` must be 0; otherwise
   `raise RuntimeError(f"End every running game before migrating: {n} session(s) are not inactive")`.
   A live session at migration time has a Mongo room keyed by the session id, which no game
   row will ever match.
2. `op.create_table('games', …)` with the indexes. **Confirm the partial index** carries
   `postgresql_where=sa.text("status <> 'ended'")`; if autogenerate dropped the `WHERE`, add
   it by hand — it is the invariant.
3. **Data step — carry every played session's last game across, BEFORE the column drops
   (they read the columns being dropped).** Using SQLAlchemy Core on `op.get_bind()`: select
   every session row where `started_at IS NOT NULL OR map_token_state <> '{}'::jsonb OR
   adventure_log <> '[]'::jsonb OR map_config <> '{}'::jsonb OR image_config <> '{}'::jsonb
   OR audio_config <> '{}'::jsonb OR spotify_config <> '{}'::jsonb OR map_token_seed <>
   '{}'::jsonb OR active_display IS NOT NULL`; for each, insert one `games` row:
   - `id` = `uuid.uuid4()` generated in Python (do not rely on `gen_random_uuid()`)
   - `session_id`, `campaign_id`, `host_id` from the session row
   - `status = 'ended'`, `name = NULL`, `ended_by = NULL`, `summary = NULL`,
     `attendance = '[]'`, `urls_expire_at = NULL`
   - `created_at = COALESCE(started_at, created_at)`, `started_at = started_at`,
     `ended_at = COALESCE(stopped_at, started_at, created_at)` — a row with state but no
     timestamps is still a game that happened; give it the session's creation time so the
     "newest ended" ordering is defined
   - the eight state columns copied verbatim
   Print `f"game migration: created {n} ended game(s) from played sessions"`. Sessions
   matching none of the conditions get no row. **This is the step that keeps the 06 fix
   alive**: without it the first Start after deploy seeds from nothing and strands the
   player tokens.
4. `op.add_column('sessions', sa.Column('next_game_name', sa.String(100), nullable=True))`
   (no data — nothing was planned under the old model).
5. `op.drop_column` × 12 on `sessions`.

`downgrade()` drops `next_game_name`, re-adds the twelve columns with their old defaults (`status`
`server_default='inactive'`), copies each session's newest ended game's state and
timestamps back onto it (`stopped_at` ← `ended_at`), and drops `games`. Say in the
docstring that it restores only the newest game per session — older history is not
representable on the old shape.

Add the model import to `alembic/env.py` and to `admin.py`'s model registry.

**A8. Tests (api-site)** — each creating its own state, each run alone against the unfixed
code first. Harness: the `run()` helper and the api-game mocking already used in
`test_session_scheduling.py::TestTakeDownClearsTheSchedule`.

- `GameAggregate` transitions: create→STARTING with defaults; `activate` stamps `started_at`
  and the seed and refuses from any other status; `begin_end` only from ACTIVE;
  `record_end_state` only in ENDING and copies exactly the seven fields; `end` stamps
  `ended_at`, `ended_by`, attendance; `abort_end` returns to ACTIVE; `rename` trims, blanks
  to None, refuses >100; `summarise` trims and blanks to None; `remove_asset_references`
  (port the existing session test); `is_open`.
- `StartGame`: refuses a non-host; refuses when the session has an open game; on api-game
  failure the minted row is **deleted** (assert no row, not an ENDED row) **and the
  session's `next_game_name` survives**; on success `campaign.last_played_at` is stamped,
  the payload carries `game_id == str(game.id)`, the game's `name` equals the planned name,
  the session's `next_game_name` is null, and **no other session field changed** (compare
  a snapshot of the session before and after).
- `SessionAggregate.schedule`: stores both fields; strips and blanks the name; refuses a
  name over 100 chars; `consume_next_game_name` returns the name once and then None.
- `ScheduleSession`: passes the name through; the `session_scheduled` payload carries
  `next_game_name`; refused while a game is open.
- **Seeding**: with a previous ended game holding a board, a seed and a log, `StartGame`
  feeds the merge those (assert the merge receives the previous game's board and seed, and
  the payload carries its log, map, image, display, audio and spotify); with no previous
  game it seeds from the baseline alone; with two ended games it reads the one with the
  greater `ended_at`. (Rewrite `TestWhyEndingKeepsTheSession` around this.)
- `EndGame`: non-host refused; HOST clears the schedule and broadcasts `session_ended` with
  `game_id`; SYSTEM leaves the schedule and broadcasts `session_paused`; attendance equals
  the de-duplicated `final_state.players`; name/summary from the body land on the game; the
  extracted state lands on the **game** and the session row is unchanged apart from
  `scheduled_at`; retry exhaustion returns the game to ACTIVE.
- `UpdateGame`: host only; `None` leaves a field alone; `""` clears it.
- Partial index: two open games for one session raises `IntegrityError` at the DB (skip if
  the harness is SQLite — say so in the docstring; the SQLAlchemy `Index` still declares it).
- `ScheduleSession` refused while a game is open (replaces the status-param test).
- `DeleteCampaign` refused with an open game; succeeds otherwise and the games are gone.
- Library check refuses while a game is open; asset delete scrubs the newest ended game and
  leaves older games untouched.
- Session response: `games` is ENDED only, newest first; `GameResponse.model_fields` contains
  none of the eight state names.
- `DisconnectFromGame`: refuses when no game is running and when the game is not ACTIVE;
  refuses a character the user does not own; refuses a character locked to a different
  campaign; writes `hp_current` and marks the character dead at zero; leaves the game and
  the session rows untouched.
- Sweeper picks up an expired open game and ends it with SYSTEM.
- Migration data step (PostgreSQL only; skip otherwise): a played session becomes exactly
  one ENDED game carrying its state; a never-played session becomes none; counts match.

**A9. CLAUDE.md edits** (in this PR):

- Directory tree: add `game/` under `modules/` (api / application `StartGame, EndGame,
  UpdateGame` / domain `game_aggregate.py` / model / repositories); `session/` comment →
  "(who and when: roster, schedule)" and its `commands.py` list →
  `CreateSession, ScheduleSession, RemovePlayerFromSession`. The game module's
  `commands.py` list is `StartGame, EndGame, UpdateGame, DisconnectFromGame`.
- **Rewrite "Game vs Session — the vocabulary boundary"**: Game is one play, an aggregate
  with a lifecycle (STARTING/ACTIVE/ENDING/ENDED) **that owns the state of play**; it is
  hot while open and a Mongo room keyed by its id exists exactly then; the newest ended game
  is what the next one seeds from; cold-side code may say "game" when it means this
  aggregate. Session is who and when, has no status and no play state; live = has an open
  game. Replace "One session, one game, one id" with "One game, one room, one id — the
  game's". Record `EndReason`, the partial unique index, and that campaign→session stays
  one-to-one by rule while the data model is capable of more. Remove the parenthetical
  about the pulled Reset (it is history now, recorded in this plan).
- "Session Access" bullet: "Start game / End game live in the expanded campaign card,
  which also lists the games played; there is no create and no reset".
- HTTP-Based ETL: Start mints a Game row, seeds the room from the newest ended game and the
  campaign baseline, then creates the room; End writes the game's end state and record, then
  deletes the room. The session is not written by either.
- "Atomic State Updates" and the api-game section: unchanged.

### Phase B — contracts

- `shared_contracts/session.py`: `SessionStartPayload.session_id` → `game_id`;
  `SessionStartResponse.session_id` → `game_id`. Docstrings: "the game id, which is the
  room id". `SessionEndFinalState` unchanged.
- The end request body key `session_id` → `game_id` (api-site builds it at
  `commands.py:933`, api-game reads it at `app.py:704`).
- `tests/test_contracts.py`: update the five `SessionStartPayload` constructions and add a
  round-trip for the renamed response field.

### Phase C — api-game and nginx

- `api-game/app.py:526-664` and `:674-850`: read `request.game_id`; log lines say "game".
  No behaviour change: api-game never knew what a session was.
- **New outbound call.** `site_client.py` gains `save_character_state(game_id, user_id,
  character_id, character_state)` following `request_role_change`'s shape (async httpx,
  `API_SITE_URL`, log and swallow every failure). `WebsocketEvent.player_disconnect`
  (`websocket_handlers/websocket_events.py:780`) calls it for the disconnecting player when
  the room's `player_metadata` holds a `character_id`, sending
  `{"current_hp": <player_metadata hp_current>}`. Best-effort: a failure is logged at
  warning and the disconnect proceeds. This is what makes the character ETL real for the
  first time.
- Run `docker exec api-game-dev python -m pytest -q`.
- nginx: `location /api/game/` (trailing slash) does not match `/api/games/…`, so the new
  prefix falls through to api-site via the `/api/` catch-all in dev and would in prod. Add
  an explicit `location /api/games/` block to BOTH configs anyway: in
  `docker/prod/nginx/nginx.conf` copy the existing `location /api/sessions/` block verbatim
  changing only the path; in `docker/dev/nginx/nginx.conf` copy the `location /api/` block
  verbatim changing only the path. Place each directly above `location /api/game/` with a
  one-line comment "games (api-site) — distinct from /api/game/ (api-game)". Restart nginx
  and verify with `curl -i` through it that `/api/games/` reaches api-site (401 without a
  cookie is the expected answer).

### Phase D — frontend

**D1. Mutations** (`useSessionMutations.js` — keep the file and its header comment):

- `useStartGame()` → `POST /api/games/` with `{ session_id: sessionId }`; error copy
  "Failed to start the game"; invalidates `['campaigns']`.
- `useEndGame()` → `POST /api/games/${gameId}/end` with `{ name, summary }`; error copy
  "Failed to end the game"; invalidates `['campaigns']`.
- `useUpdateGame()` → `PATCH /api/games/${gameId}` with `{ name, summary }`; error copy
  "Failed to save the game"; invalidates `['campaigns']`.
- No query hook is added: history arrives on the campaigns query.

**D2. Every `session.status` reader becomes `session.game`:**

- `homeRanking.js`: `isCampaignLive` → `findCurrentSession(campaign)?.game?.status === 'active'`;
  delete `SESSION_ACTIVE`.
- `gameStatusLine.js`: switch on `session?.game?.status` with cases `'active'`,
  `'starting'`, `'ending'`; implement the display table in "Schedule — now the next game"
  exactly (name prefixes on the live line, name in the Next game line, name-only line).
- `HomeHeroCard.js:51-54`: `isLive = session?.game?.status === 'active'`,
  `isTransitioning = ['starting','ending'].includes(session?.game?.status)`,
  `enterGame` pushes `session.game.id`; `startGame.mutate(session.id)` unchanged.
- `PulseLine.js:69, 168`: `session?.game?.status === 'active'`; push `session.game.id`.
- Notes `findLiveSession`: `campaign.sessions?.find(s => s.game && s.game.status !== 'ended')`;
  push `liveSession.game.id`.
- `SocialPanel.js:187`: push `session.game.id`.
- Drawer: the live-session filter, `isGameLive`, and every `'starting'` / `'inactive'` /
  `'stopping'` check read `currentSession?.game?.status` (`'inactive'` becomes
  `!currentSession?.game`); `enterGame` pushes `currentSession.game.id`;
  `endGameMutation.mutateAsync({ gameId: currentSession.game.id, name, summary })`.

**D3. In-game end** (`useEndGame.js`, `GameContent.js`): `useEndGame` calls
`POST /api/games/${roomId}/end` with `{ name, summary }`; rewrite the comment at `:25-26`
to "the room id is the game id; api-site keys the room by it". The confirm dialog at
`GameContent.js:2780-2786` renders `GameRecordFields` above its description line, holds
`{name, summary}` in local state, and calls `endGame(roomId, { name, summary })`. Log prefix
stays `ENDGAME`.

**D4. Drawer** (`CampaignManager.js`):

- `EndGameModal.js`: render `GameRecordFields` between the explanatory paragraph and the
  buttons; local state `{name, summary}` initialised empty; `onConfirm({ name, summary })`;
  the End button's label unchanged.
- New `GameRecordFields.js` and `EditGameModal.js` as specified in "Behavioural flows".
- `ScheduleGameModal.js`: the "Name (optional)" input and the pair rule per "Schedule — now
  the next game"; `onSave({ scheduledAt, nextGameName })`; `useScheduleGame` sends both.
- **GAMES PLAYED** section per "Games history (drawer)".
- Header state reads `currentSession.game` (Live / Idle / Starting… / Ending…).
- `formatDuration` added to `formatTime.js` per its spec.

**D5. Event bridge and copy:**

- `useAuthenticatedEvents.js`: `session_*` handlers unchanged. **Delete the dead
  `game_created`, `game_started`, `game_ended`, `game_finished` handlers `:154-163` and their
  `eventConfig.js` entries** — pre-existing dead code that 06 left alone; now that "game"
  means something specific they are actively misleading, so this plan owns their removal.
- `eventConfig.js`: `session_ended.toastMessage` becomes a function:
  `data.game_name ? \`${data.game_name} has ended\` : 'The game has ended'`;
  `session_started` likewise: `data.game_name ? \`${data.game_name} has started\` :
  'The game has started'` (keep the existing message text if it differs — only add the
  named variant). `session_scheduled.panelMessage` implements the four copy variants in
  "Schedule — now the next game". If `toastMessage` cannot be a function in the toast
  helper today, extend the helper minimally (the same extension 03 anticipated).

**D6. Copy sweep.** Grep user-facing strings in `app/dashboard`, `app/game`, `app/notes`,
`app/(authenticated)/notes` for "session" (should already be clean after 06), "reset" and
"stopping". Fix any hit.

**D7. Compile-check inside the container.** Follow the throwaway-page recipe in the HMR
memory (a page outside the protected routes that imports the touched modules, restart
`rollplay-dev`, read "✓ Compiled" from the logs, delete the page, restart again). Then
`docker exec rollplay-dev npx next lint`.

### Phase E — sweep and verify

- **Reset residue** (already pulled; verify): `grep -rn "ResetSession\|useResetGame\|ResetGameModal\|/reset\b\|can_delete\|reset_command" api-site rollplay/app` returns nothing.
- **Dead code**: `SESSION_ACTIVE`, `SESSION_FINISHED` (if still present), every
  `session.status` / `session.started_at` / `session.stopped_at` read, the string
  `'stopping'`, `abort_stop`, `get_stopping_sessions`, `PauseReason`, `SessionStatus`,
  `is_locked`, `is_active`, the four dead `game_*` handlers — grep each for a surviving
  reference.
- Suites: `docker exec api-site-dev python -m pytest -q`,
  `docker exec api-game-dev python -m pytest -q`,
  `docker exec api-site-dev python -m pytest /rollplay-shared-contracts/tests/ -q`.
- Then the QA script below on the dev stack.

---

## Deploy notes

1. End every running game (drawer, or on the OLD code `admin.py pause-all-sessions`) — the
   migration refuses otherwise.
2. Record the pre-migration counts:
   ```sql
   SELECT count(*) FROM sessions WHERE started_at IS NOT NULL
      OR map_token_state <> '{}' OR adventure_log <> '[]' OR map_config <> '{}';
   ```
3. Deploy api-site (migration runs on boot), api-game, contracts, nginx, frontend together.
4. Check the post-migration counts:
   ```sql
   SELECT count(*) FROM games WHERE status = 'ended';            -- must match step 2
   SELECT session_id FROM games GROUP BY 1 HAVING count(*) <> 1;  -- must be empty
   ```
5. The first Start after deploy seeds from that migrated game — the party's pieces are where
   they left them. Check it on the first real campaign before announcing.

---

## Acceptance — QA script (dev stack, GM + player browsers)

1. **Continuity across the migration**: on a dev DB seeded with a played session (board, log,
   active map), migrate, then Start: tokens, log and map exactly as they were. This is the
   06 bug, first check.
2. **Continuity across games**: Start, place a PC token, move an NPC, End from inside the game
   with a name and a summary, Start again: both tokens where they were, log intact. The
   drawer's GAMES PLAYED shows one row with that name, tonight's date, a duration, "N at the
   table", and the summary. In PostgreSQL the `sessions` row has no state columns and only
   `scheduled_at` could have changed.
3. **Room id is the game id**: the URL `room_id` equals `session.game.id`; the websocket
   connects; `/api/game/{room_id}` answers.
4. **Two starts refused**: a second Start while live is refused with "A game is already
   running"; the database has exactly one open game for the session.
5. **Start failure leaves no phantom**: stop api-game, press Start, confirm the error and that
   `session.games` is unchanged (no ENDED row without `started_at`), and that the next
   successful Start still seeds from the previous real game.
6. **State never on the wire**: `GET /api/sessions/campaign/{id}` carries `game` and `games`
   with no `map_token_state`, `adventure_log` or config keys anywhere in the JSON.
7. **System end**: let the sweeper (or `admin.py end-game`) close a game: no toast, schedule
   kept, a history row with `ended_by = system`, attendance filled, and the next Start seeds
   from it.
8. **Host end**: players toast (naming the game when it was named), host does not; schedule
   cleared; `ended_by = host`.
9. **Edit history**: host renames a past game and edits its summary from the drawer; a player
   sees the change and has no edit icon.
10. **Empty prompt**: End with both fields blank → history row named "Game {n}" with no summary.
10a. **Planned name**: in the Next Game modal set a name and a date; the player's hero reads
    "Next game · {name} · {local time}" and the player gets the named toast; Start → the
    in-game End dialog shows the name prefilled and `session.next_game_name` is null; change
    the name at End → the history row shows the edited name. Set a name with no date →
    "Next game · {name}"; CLEAR empties both.
11. **Schedule guard**: SCHEDULE disabled while live; `PATCH …/schedule` returns 400.
12. **Campaign delete**: refused while live; succeeds when idle and the games are gone.
13. **Asset delete**: delete a map that the newest ended game had active; the next Start has
    no active map and no orphaned token board for it; an older game's record is untouched.
14. **Late joiner while live** is added to the room (accept an invite during a game; the
    player can join).
14a. **Disconnect saves HP**: with a player in a live game, change their HP in the room,
    close their tab, and confirm the character row's `hp_current` matches in PostgreSQL.
    Take HP to zero and confirm the character is marked dead. Stop api-site and repeat:
    the disconnect still completes in the game and a warning is logged.
15. **No Reset anywhere**: no button; `POST /api/sessions/{id}/reset` is 404/405.
16. **Migration precondition**: with a session left `active` in the dev DB, `alembic upgrade`
    fails with the message; end it, upgrade succeeds; `\d games` shows the partial unique index
    and the pre/post counts match.
17. Suites green (Phase E).

---

## Relation to other plans

- [05](05-campaign-create-and-publish.md): this is its first extraction. Its "Where players
  and characters live" section stays the target; its "Archived runs" open item is
  **superseded** (no Reset, no archive — a session is never replaced). The Party rename and
  the membership move are its second extraction and must come AFTER this plan.
- [06](06-game-lifecycle.md): decision 3 ("INACTIVE is the only not-live state") is
  superseded — the session has no status; decision 5 (Reset) is **removed** (done);
  `PauseReason` becomes `EndReason`; STOPPING becomes ENDING; the "carried play state lives
  on the session" premise moves to "lives on the newest ended game". The bug it fixed stays
  fixed by the seeding rule and the migration's data step.
- [03](03-scheduling.md): the schedule guard is "no open game"; End by the host still clears
  the date; the Next Game modal grows a name field (`sessions.next_game_name`) that Start
  consumes onto the game — decided 2026-09-06 after this plan's first draft.
- [00-epic.md](00-epic.md): stage 7 in the stage split.
- [deliverables.md](deliverables.md): F9 (Reset) is pulled; nothing there to QA.
- Tokens system (memory / `token_merge.py`): the three-way merge is untouched; its inputs come
  from the previous game instead of the session row.
- Stage 4 (Market): the copy/adopt campaign operation is the replacement for Reset's use
  case and is built there.
