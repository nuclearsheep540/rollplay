# Session URL-Expiry Countdown + Auto-Pause Sweeper

## Problem

Users treat game sessions as persistent and leave them running overnight. Sessions exist
to sync game data (hot→cold ETL) and to scope the lifetime of the signed asset URLs
generated at start — URLs signed once in `StartSession` with TTL `PRESIGNED_URL_EXPIRY`
(currently 86400s in `.env`, code default 3600 in `api-site/config/settings.py:61`) and
never refreshed mid-session. A session left running past the TTL has silently dead asset
URLs.

**Goal:** when the URL lease runs out, the session closes itself (server-side pause), and
players in the room see it coming via a countdown clock in the game runtime's top nav.
This is a cleanup mechanism, not a pause/resume UX feature.

## Design at a glance — one timestamp, three consumers

`StartSession` computes **`urls_expire_at` once, at URL-signing time**, and fans it out:

| Consumer | Path | Uses it for |
|---|---|---|
| Cleanup job (api-site) | new `sessions.urls_expire_at` column | `status = ACTIVE AND urls_expire_at <= now()` → auto-pause |
| Room doc (api-game) | ETL payload → MongoDB → `GET /game/{room_id}` spread | delivers the anchor to the frontend, no new endpoint |
| Nav clock (frontend) | read once in `GameContent.onLoad` | countdown display, clamped at 00:00 |

Nobody derives their own deadline. The clock never does `now + expiry` math; the cleanup
job compares against the same stored value it was stamped with.

Note: `started_at` already exists on the session, but signing happens seconds *before*
`activate()` (there's a deliberate 2s UX sleep plus the api-game round trip in between),
and a derived deadline would silently shift if the env value changes mid-lease. An
explicit signing-time timestamp is the honest lease.

**Timestamp format rule (avoids a real bug):** the value crosses Python → Mongo → JSON →
JS. `datetime.utcnow().isoformat()` has no timezone marker, and `new Date("...")` without
a `Z` parses as *local* time — a silent skew of the user's UTC offset. So: compute with
`datetime.now(timezone.utc)`, store the PG column as `DateTime(timezone=True)`, and ship
it through the ETL payload / room doc / GET response as an **ISO-8601 string with
explicit offset** (`...+00:00`). Keep it a `str` in the contracts and room doc so nothing
en route re-serializes it naively.

---

## PR 1 — Backend: deadline column + expired-session cleanup job

### 1. Column + aggregate + migration

- `modules/campaign/model/session_model.py` — add
  `urls_expire_at = Column(DateTime(timezone=True), nullable=True)` next to
  `started_at`/`stopped_at` (session_model.py:56-57).
- `modules/session/domain/session_aggregate.py` — add the field; extend
  `activate(active_game_id)` (session_aggregate.py:247-254) to
  `activate(active_game_id, urls_expire_at)` so the stamp lives in the domain method that
  already stamps `started_at`.
- `modules/session/repositories/session_repository.py` — map the field in
  `_model_to_aggregate` and `save`.
- Migration: **`docker exec api-site-dev alembic revision --autogenerate`** (never
  hand-written). `session_model.py` is already imported in `alembic/env.py` (existing
  table), so autogenerate picks up the column with no env.py change.

### 2. Stamp it in StartSession

In `StartSession.execute` step 7 (commands.py:486-498), right where
`_generate_presigned_urls_parallel` runs:

```python
urls_expire_at = datetime.now(timezone.utc) + timedelta(seconds=settings.PRESIGNED_URL_EXPIRY)
```

Then `session.activate(active_game_id, urls_expire_at)` at step 11 (commands.py:558).

### 3. Ship it to api-game (contract + room doc)

- `rollplay-shared-contracts/shared_contracts/session.py` — add
  `urls_expire_at: Optional[str] = None` to `SessionStartPayload`. (Volume-mounted into
  both containers in dev — docker-compose.dev.yml:34,50 — so no image rebuild.)
- `StartSession` payload build (commands.py:513-538): `urls_expire_at=urls_expire_at.isoformat()`
  — stringify at the HTTP boundary per the UUID/serialization convention.
- `api-game/gameservice.py` — `GameSettings` gets `urls_expire_at: str = ""` (keep as
  string; see format rule above).
- `api-game/app.py` `/game/session/start` handler — pass `request.urls_expire_at` into
  the `GameSettings(...)` construction (app.py:528-540).
- **No GET change needed:** `GET /game/{room_id}` spreads the whole room doc
  (app.py:283-289), so the field reaches the frontend automatically. WS `initial_state`
  untouched — the clock only needs its anchor once at load.

### 4. Reuse the existing `PauseSession` command — no new command

`PauseSession.execute(session_id, host_id)` (commands.py) already does the whole
three-phase ETL and is host-gated. The cleanup job knows the session, so it knows
`session.host_id` — it just calls the command **as the host**:

```python
await PauseSession(...).execute(session.id, host_id=session.host_id)
```

The host guard passes; the `session_paused` broadcast reads "paused by \<host\>" —
identical to a dashboard-initiated pause. No `ExpireSession`, no shared-flow extraction,
no changes to `PauseSession`/`FinishSession` at all. (An earlier draft invented an
`ExpireSession` + `_pause_session_flow` to "skip the host check"; the host id was
available all along, so all of that was deleted.)

- **In-game modal comes for free** (verified end-to-end): Phase 3
  `_async_cleanup_game` → `DELETE /game/session/{id}` (commands.py:784) → api-game
  broadcasts `session_ended` to every connected socket *before* deleting the room
  (`connection_manager.py:206-259`) → game client shows `SessionEndedModal` + 5s redirect
  (`GameContent.js:2605-2672`). Initiator-agnostic — going through the real command means
  the DELETE fires exactly as it does for a manual pause.

**Failure behaviour (deliberately simple):** if a due session has no live Mongo room
(a pause that crashed mid-ETL, or the orphan cron got there first), `PauseSession` hits
api-game's 404, rolls itself back to ACTIVE, and raises. The cleanup job catches that per
session, logs it, and retries next pass. An infinite-but-visible retry for a rare,
pre-existing failure state — and the *correct* behaviour for the common transient case
(api-game briefly down). We are **not** adding missing-room hardening or a `STOPPING`
re-drive; that's a separate concern from "close abandoned games".

### 5. Repository query

```python
def get_expired_sessions(self, now: datetime) -> List[SessionEntity]:
    """ACTIVE sessions whose signed-URL lease has lapsed — the cleanup job's work list."""
```

One SQL filter (positional args AND together), in the repository like
`get_active_session_for_campaign` (session_repository.py:49-61):

- `status = ACTIVE AND urls_expire_at IS NOT NULL AND urls_expire_at <= now`

No `STOPPING` clause, no legacy `urls_expire_at IS NULL` fallback. Sessions already
running when this deploys simply won't auto-close until their next natural
pause/resume re-stamps a deadline — fine for a cleanup feature.

### 6. The cleanup job

New file `modules/session/application/expired_session_cleanup.py` (GPL header):

```python
async def run_expired_session_cleanup(stop_event: asyncio.Event):
    interval = settings.EXPIRED_SESSION_CLEANUP_INTERVAL
    while not stop_event.is_set():
        try:
            await _run_cleanup_pass()
        except Exception:
            logger.exception("Expired-session cleanup pass failed; retrying next interval")
        # wait() instead of sleep() so shutdown is immediate
        with suppress(asyncio.TimeoutError):
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
```

`_run_cleanup_pass()`: `db = SessionLocal()` (from `shared/dependencies/db.py` —
background task, no `Depends`), build `PauseSession` with its repos + `EventManager`
(`character_repository=None` — pause never uses it), run `get_expired_sessions`, then for
each hit call `pause.execute(session.id, host_id=session.host_id)` in its own `try/except`
— one wedged game must not block the rest. `finally: db.close()`.

Lifecycle in `main.py` lifespan (next to `RulesetRegistry.initialize()`): create the task
before `yield`, set the stop event + await the task after. Stateless by design: all
deadlines live in PG, so restarts/deploys lose nothing — the first pass after boot catches
anything that expired during downtime (the query is "past due", not "fires at the moment").

Double-fire safety: `PauseSession`'s ACTIVE-only guard makes a second attempt a no-op
(`pause()` raises on non-ACTIVE, session_aggregate.py:256-264) — caught and logged.

### 7. Settings

`config/settings.py`: `EXPIRED_SESSION_CLEANUP_INTERVAL: int = Field(default=60, ...)`.
With a 24h lease, ±60s precision is invisible; sessions each close at their own deadline.

---

## PR 2 — Frontend: nav countdown clock

### 1. Read the anchor

`GameContent.onLoad` (GameContent.js:467-536) already receives the room-doc spread; add:

```js
setUrlsExpireAt(res["urls_expire_at"] ? new Date(res["urls_expire_at"]).getTime() : null);
```

### 2. `SessionCountdown` component

New `app/game/components/SessionCountdown.js` (GPL header), slice pattern. Props:
`expireAt` (ms epoch). Null → render nothing (old rooms during transition).

- 1s `setInterval`; each tick computes `remaining = Math.max(0, expireAt - Date.now())`
  from the anchor (drift-proof — never decrements a counter).
- **Format:** `hh:mm` while remaining ≥ 1h (hours not zero-capped, so a 24h lease reads
  `24:00`); switches to `mm:ss` under 1h.
- **At zero: clear the interval and freeze at `00:00`.** No negative time by
  construction. The frozen clock holds for at most one sweep interval (+ client clock
  skew) before the server's `session_ended` modal takes the screen.
- `title="Session auto-pauses when the timer ends"` for hover discoverability.

### 3. Placement + styling

First child of `.nav-actions` (GameContent.js:1817), before the asset-status button —
right cluster, out of the campaign title's way, scales with the existing
`calc(... * var(--ui-scale))` sizing.

Digital/mono font: add `Share_Tech_Mono` (weight 400) to `app/layout.js` following the
existing `next/font/google` pattern (layout.js:7-39), variable `--font-share-tech-mono`,
plus `fontVariantNumeric: 'tabular-nums'` so digits don't jitter. Fallback chain ends in
the default mono stack. Plain `COLORS.smoke`-tier styling; no warning colours — the
`hh:mm → mm:ss` switch is the urgency signal, and the modal is the enforcement UX.

---

## What we will NOT build

- **No scheduler library** (APScheduler/celery/arq), **no Redis TTL events** (best-effort
  delivery), **no cron container** — one lifespan coroutine + one indexed query.
- **No per-session timers / in-memory deadline heap** — forgets everything on restart;
  the DB pass *is* the rehydration.
- **No new pause command and no changes to `PauseSession`/`FinishSession`** — the job
  calls the existing command as the host. (This is the DRY correction from an earlier
  draft that had extracted a `_pause_session_flow` and added an `ExpireSession`.)
- **No missing-room hardening / `STOPPING` re-drive / legacy-NULL fallback** — a rare,
  pre-existing failure state is left to visible retry, not new recovery code.
- **No new WebSocket events, no `SessionEndedModal` changes** — the existing
  room-deletion → `session_ended` → modal → redirect chain fires for any initiator.
- **No `NEXT_PUBLIC_PRESIGNED_URL_EXPIRY`** — the frontend gets a timestamp, not config.
- **No mid-session URL refresh** — explicitly out of scope; expiry now has a clean
  lifecycle answer instead.
- **No pause-specific modal copy** — players get the generic "Session Ended" treatment;
  threading a reason through the DELETE broadcast is a possible later nicety.

## Pattern fit

- Cleanup job startup → extends the existing lifespan hook.
- Pausing → reuses the existing `PauseSession` command verbatim; the job is the only new
  application-layer code, and it orchestrates rather than reimplements.
- Contract change → `shared_contracts/session.py`, the established cross-service DTO
  boundary; stringify-at-boundary per the UUID convention.
- Repository query → same shape as `get_active_session_for_campaign` (filter in SQL).
- Countdown → functional-slice component under `app/game/components/`; font added the
  same way the five existing Google fonts are.
- No new Python/npm deps → no image rebuilds (dev images only need rebuilds on
  dependency changes).

## Verification

Dev `.env`: `PRESIGNED_URL_EXPIRY=4000` (~1h07m — exercises the `hh:mm` state *and* the
format switch within a sitting). `EXPIRED_SESSION_CLEANUP_INTERVAL` defaults to 60s.
Note: env changes need a container **recreate** (`docker-compose … up -d api-site`), not
a restart — env is injected at creation. Then:

1. Start a session → clock shows `01:06` in mono font; at <1h it flips to `mm:ss`.
2. Drop expiry to 120s, restart session → watch the clock freeze at `00:00`, modal
   appears within a cleanup pass, 5s redirect lands on the dashboard, session shows paused
   (INACTIVE), Mongo room gone (`docker exec mongo-dev mongosh` → `active_sessions`).
3. Restart api-site mid-lease → session still auto-pauses on schedule (deadline is in PG).
4. Player sitting in the room at expiry with no DM connected → same modal + redirect
   (nobody's browser is load-bearing).
5. Non-expired manual pause from the dashboard → behaviour identical to today.
6. Headless check (no real room): SQL-fake an ACTIVE session past its lease → the pass
   attempts `PauseSession`, hits api-game 404, rolls back to ACTIVE, logs, and the loop
   survives to retry (the accepted failure behaviour).
