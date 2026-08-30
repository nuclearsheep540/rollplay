# Implementation — Phase D: session slice correction + game vocabulary cleanup

> Agreed 2026-08-30, mid-flight on `feature/home-page-shell` (deliberate strike-while-hot
> decision — Matt). Continues the phase lettering of
> [step-01-home-shell.md](step-01-home-shell.md): this is **Phase D**, more commits in the
> same PR.
>
> **STATUS 2026-08-30: D1–D6 complete, awaiting manual QA.** 997/997 api-site tests pass,
> frontend build clean, api-site boots clean with the migration applied, autogenerate
> confirms zero residual drift. Nothing committed — Matt runs git.
>
> Execution notes / deviations:
> - `InviteStatus` was deleted alongside `GameInvites` (D3): it had no other consumer, so
>   it died with the phantom. Removing both orphaned the `Enum` and `List` imports, also
>   pruned.
> - D2's route is `POST /api/sessions/` (FastAPI's prefix + `"/"`), verified registered and
>   returning 401 through nginx; the old `/api/campaigns/sessions` now 405s.
> - D6 gate 2 simplified further than planned — `get_active_session_for_campaign` already
>   filters `status=ACTIVE` in SQL, so the second clause was pure redundancy and is gone
>   rather than converted.
> - D6 gate 1 uses the existing `is_active()` helper.
> - `SocialPanel.js` was simplified (the optional item): with the field gone, its
>   `|| session.id` fallback would have referenced a field that no longer exists.
>   `SessionsManager.js` deliberately left for its step-2 deletion.
> - The class is `SessionJoinedUser` (singular); the plan said plural.

## The semantic rule (Matt, 2026-08-30 — the keeper decision)

**"Game" means hot runtime. Nothing else.** api-site builds and stores campaigns and
sessions — cold domain data. The moment api-site hands a session to api-game and it goes
hot in MongoDB, *that* is a game: the real runtime of hot data in a live environment.
The word is a boundary marker — when a reader sees `game` in api-site code, they are
allowed to think "something is running realtime right now in api-game". Cold-side code
wearing `game` vocabulary is misnamed; boundary-cross code speaking `game` is correct
and must stay.

**Codebase alignment audit (2026-08-30) — the model is already mostly honored:**

- `sessions.active_game_id` — correctly *named* under the rule, but SUPERSEDED later the
  same day: **retired outright in D6**. The name was never the problem; the duplication
  was (see D6's rationale).
- `campaign/application/commands.py` (8 hits) — ALIGNED, keep. All are hot-sync calls to
  `http://api-game:8081/game/{id}/...` (late-join player sync, character hot update),
  keyed by `active_game_id`. Legitimately game.
- `library/map_asset_aggregate.py` (14 hits) — ALIGNED, keep. Matt's hunch checked out in
  spirit: the library holds **zero game ids**. The hits are `game_grid_config` /
  `game_fog_config` parameters on ETL write-back methods — hot state handed back to cold
  storage at session end. The naming encodes exactly the boundary cross the rule wants
  visible.
- `_async_cleanup_game`, `_extract_and_sync_game_state` (hot→cold ETL extraction at
  stop/finish — `commands.py:369,809,1079,1216`), ETL start/stop payloads,
  `SessionStartResponse` wire parsing — ALIGNED, keep (they speak to api-game about
  games).
- **MISALIGNED**: `conftest.py` fixtures (`game_repo`, `create_game` — cold session
  fixtures), assorted cold-side variables in the session module, and the `GameInvites`
  phantom (below).

## Work items

### D1 — Session model moves into its slice
- `modules/campaign/model/session_model.py` → `modules/session/model/session_model.py`
  (both `Session` and `SessionJoinedUsers`). Git: propose `git mv` to Matt.
- Update every importer, **including `alembic/env.py`** (autogenerate silently stops
  seeing the tables otherwise — verify afterwards by running autogenerate and expecting
  an empty revision).
- `CampaignModel.sessions` relationship survives the move unchanged (string-resolved
  class name via the SQLAlchemy registry).
- Update CLAUDE.md's directory tree (it documents `campaign/model/session_model.py` and
  gives the session module no `model/` dir).

### D2 — Create-session endpoint moves into its slice
- The route lives in `modules/campaign/api/endpoints.py` (~:183, `POST
  /campaigns/sessions?campaign_id=`). Move it to `modules/session/api/endpoints.py`.
- New shape: **`POST /api/sessions`** with `campaign_id` in the body — which the frontend
  already sends (`useSessionMutations.js:16-19` posts `campaign_id` in the JSON body
  *and* the query string today). NOT `/api/sessions/{campaign_id}`: a path segment on
  the sessions collection reads as a session id.
- Frontend: one-line URL change in `useCreateSession`. nginx: `/api/sessions` location
  already exists in both dev and prod configs — no nginx change.
- Prune the campaign endpoints' now-unused session imports (`CreateSessionRequest`,
  `SessionResponse`, `CreateSession`, session repo/event deps if unused after the move).

### D3 — Vocabulary sweep (rename only what provably means session)
- **Delete the `GameInvites` phantom**: `user_aggregate.py:27-29` (class) and `:65`
  (field). No `game_invites` column exists on the users table and the repository never
  maps the field — pure dead code. **No migration** (nothing in the DB to drop;
  autogenerate would emit an empty revision).
- **Classification COMPLETE (2026-08-30, Fable line pass) — no judgment calls remain at
  execution time.** All 92 `game_` hits across 13 files are accounted for: the
  campaign-commands hot-sync cluster, the library ETL params, and the
  `_extract_and_sync_game_state` family KEEP (aligned list above); `GameInvites` is
  DELETED (below); every remaining session-module hit is an `active_game_id` line owned
  by D6's inventory. **The session module contains zero cold-side renames.**
- The only renames in the sweep: `conftest.py:225,301,315` — `game_repo` fixture →
  `session_repo` (check for a name collision with existing fixtures first; pick the
  free session-named variant), `create_game` factory → `create_session`, its local
  `game` variable → `session`. Update the tests that consume these fixtures by name.
- Anything discovered mid-execution that this classification missed: leave it unchanged
  and list it in the report — never guess.
- **Keep all boundary vocabulary** per the alignment audit above.

### D4 — Comment archaeology
- `campaign_aggregate.py:26` "Session is now a separate aggregate…" and
  `campaign/api/endpoints.py:112` "Campaign now only stores session_ids, not full
  session objects" — superseded-era comments, delete.
- ~~`session_aggregate.py:88` / `schemas.py:45` "MongoDB ObjectID" corrections~~ —
  superseded by D6: those lines are deleted with the field.
- Sweep the session module for other games-era comments during D3's line pass.

### D5 — The updated_at proxy fix (green-lit 2026-08-30)
- Remove `self.update_timestamp()` from `add_session` and `remove_session`
  (`campaign_aggregate.py:157,163`) and the two `campaign_repo.save(campaign)` calls in
  `CreateSession` / `DeleteSession` (`session/application/commands.py:123,218`).
- Effect: session lifecycle never touches `campaign.updated_at`, so the Home working-on
  card stops moving when a GM changes a session. Verified safe: the saves persist
  nothing else (members sync is a no-op diff in these flows; `session_ids` is derived at
  read from the FK), and no other path flushes the campaigns row.
- Known and accepted: `add_session`'s duplicate/max-20 guards were already advisory
  (they fire after the session row is saved, and the derived list ignores them) —
  unchanged by this fix.

### D6 — Retire `active_game_id` (added 2026-08-30, Matt's single-source-of-truth call)

**Rationale.** One way to prove something, never two. The field conflates a boolean and
an address, and both are already owned elsewhere: `status == ACTIVE` is the receipt
(written only after api-game's 200 — the gate lives in `activate()`, not in the column),
and `session.id` is the address (api-game keys the hot doc by our session id — the value
was always a round-tripped copy of our own primary key). Two fields recording one fact
can only agree or drift. Verified before deciding: both FE readers already carry a
`|| session.id` fallback, and the `session_started` event's `active_game_id` key is
emitted but consumed by nothing.

**Inventory (all substitutions are same-value; ~45 lines, 9 api-site files):**
- Domain: drop the field, `__init__` param, `activate()` param, and the two `= None`
  clears (`session_aggregate.py:88,109,255,265,286,320`) — `activate()` keeps its
  200-only call site, it just stops writing the duplicate.
- Repository: three mappings (`session_repository.py:112,137,242`).
- API: drop from `SessionResponse` (`schemas.py:45`) and the queries mapping
  (`queries.py:74`); docstring at `session/api/endpoints.py:164`.
- Events: drop the param + data key + docstring from `session_started`
  (`session_events.py:81,91,108`); update the five test kwargs in
  `test_session_events.py`.
- Commands: start flow stops storing the echo (`commands.py:749-772`) but **gains the
  contract tripwire** — verify `start_response.session_id == str(session.id)` and raise
  on mismatch (the hot-sync URLs depend on that contract; with the column gone this
  assert is its only in-code record). `_async_cleanup_game` collapses to one id param
  (it already receives both, always equal — `commands.py:1006`). STOPPING/FINISH
  cleanup reads (`:1085,:1102,:1222,:1239`) use `session.id`.
- Campaign commands: the two `if session.active_game_id:` hot gates (`:294,:659`)
  become status checks; hot-sync URLs (`:297→:328`, `:687`) use `str(session.id)`.
- Model: drop the column + the three stale docstring/comment lines
  (`session_model.py:11,46,59`); **one autogenerated migration** — generated only at
  the point Execution order says, never earlier.
- Frontend: no mandatory change (fallbacks already resolve to the same value).
  Optional: simplify `SocialPanel.js:160` to `session.id`; leave `SessionsManager.js`
  for its step-2 deletion.

## Consider while in there
- Propose a short "game vs session" paragraph for CLAUDE.md's Service Boundaries section
  — the semantic rule deserves to outlive this cleanup.

## Execution order — INSTRUCTION, do not reorder

1. **D1 first** — move the model file, update every importer, update `alembic/env.py`.
2. **D2, D3, D4, D5** — any order (they touch disjoint concerns; D5 and D6 both edit
   the campaign/session commands files, which is fine within one working tree).
3. **D6 code edits** — including removing the column from the model.
4. **The migration, exactly once, only now** — after BOTH the D1 move and the D6 model
   edit are complete:
   `docker exec api-site-dev alembic revision --autogenerate -m "drop session active_game_id"`.
   Read the generated file before applying. It must contain **`op.drop_column('sessions',
   'active_game_id')` and nothing else**.
   - ⚠️ **If it contains `op.drop_table('sessions')` or `op.drop_table('session_joined_users')`,
     STOP — do not apply, delete the revision.** That output means `alembic/env.py` is
     not importing the moved models, so autogenerate believes the tables were deleted.
     Fix the env.py imports (D1) and regenerate. Applying it would drop real tables.
   - Any other unexpected content: stop and investigate drift before proceeding.
5. Restart api-site (`docker-compose -f docker-compose.dev.yml restart api-site`),
   confirm the migration ran and boot is clean, then run the verification gate below.

## Verification gate
- `npm run build` clean (D2's URL change + D6's optional SocialPanel line); api-site
  boots clean with the migration applied.
- `alembic revision --autogenerate` after D1+D6 produces **exactly the
  drop-active_game_id revision and nothing else** — one check proving both that env.py
  still sees every moved model and that nothing else drifted.
- Final greps: `active_game_id` → zero hits in api-site and rollplay/app; every
  remaining `game_` hit must appear in this file's ALIGNED list or the execution
  report's classified-keep list.
- Manual QA: full session lifecycle from the campaigns drawer — create (new URL) →
  start → enter live game → pause → resume → finish; invite-accept hot-sync and
  character hot-update still work; social panel join still works.

## Out of scope
- Frontend cold-side vocabulary (`enterGame`, `createGame`, `game.session_id || game.id`
  vestige in CampaignManager) — same rule, future sweep, JS not Python.
- api-game internal naming (it IS the game service; its vocabulary is correct).
- Alembic history (frozen), the `games_campaign_id_fkey` fossil constraint name (harmless;
  renaming constraints is migration churn for zero behavior).
