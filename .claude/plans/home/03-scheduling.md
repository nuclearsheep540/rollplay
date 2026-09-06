# Stage 3 — Scheduling (the next game)

> Part of the [Home landing page epic](00-epic.md). **Rewritten 2026-09-05** on top of
> [06-game-lifecycle.md](06-game-lifecycle.md) — read that first; this is PR 3 of its
> sequence and depends on its PR 1 (`PauseReason`) and PR 2 (hero/drawer vocabulary).
> Supersedes the 2026-08-28 "Scheduling + RSVP" shape: **RSVP is dropped** (Matt,
> 2026-09-05 — dates are pre-agreed in person; the schedule just records intent). Matt's
> impromptu note in the old file was validated in conversation and is folded in below.
> Written for the implementing agent; anchors verified 2026-09-05, re-grep before editing.

## Outcome

A GM writes down when the next game is; players see it on Home and in the campaign card;
Home's calm state names it. "Next game · Thu 4 Sep, 20:00". Nothing is automated by it.

## Decisions — locked

| # | Decision |
|---|---|
| 1 | **The schedule is a single mutable value on the campaign's one session**: `sessions.scheduled_at`, timestamptz, nullable. It means "the next game". There is no per-game schedule history and no second entity. |
| 2 | **Cosmetic and communicative only.** It starts nothing, polices nothing, reminds nobody. This is facilitate-don't-enforce applied to a play-coordination fact: the app records intent so the table can align. |
| 3 | **Editable only while the game is not running** (session INACTIVE). Host only. |
| 4 | **End game clears it.** The GM's End game (`PauseReason.HOST_ENDED`) sets it to null in the same phase-2 write. A **system pause does not** clear it (the sweeper putting a forgotten game to sleep is not the end of the game). |
| 5 | **The value lingers otherwise.** It is never auto-cleared by the clock. A stale past value is handled by display rules, not by data rules (see Display). |
| 6 | **Store UTC, render local.** No user timezone setting. The browser knows its zone: the GM's `datetime-local` input is interpreted in their zone and converted to an ISO UTC instant before sending; every viewer formats that instant in their own zone with `Intl`. Server timezone is irrelevant (the Home clock is already pure client time, `HomeClock.js:43`). |
| 7 | **No RSVP.** Model it later as a separate table if ever wanted; nothing here needs rework for that. |
| 8 | **Notify players when the schedule is set or changed**: toast + persisted notification, to campaign members other than the host. Clearing it notifies too (same event, null value) — a cancelled game is worth knowing. |
| 9 | **Where the GM sets it — v1: the campaign drawer.** The hero *displays* it. The hero's GM button budget is three (NOTES, INVITE PLAYER, START GAME) and this plan does not add a fourth. Cheap to flip later: the drawer modal is the single control, so a hero affordance would only be a second opener. |
| 10 | **Ranking**: live > soonest *future* schedule > last played. A past schedule ranks as no schedule. |

## What we will NOT do

- No RSVP, no attendance, no "3 of 5 confirmed".
- No reminders or time-based triggers, no recurring schedules, no ICS export.
- No `users.timezone` column, no server-side formatting of dates.
- No greeting/tagline integration — the greeting never carries status (epic decision record).
- No auto-start, no countdown, no locking of anything because a time is near.
- No validation that the date is in the future on the server (the input sets `min` as a hint;
  a past value is legal data and the display rules absorb it).

## Ground truth

- Scheduling has zero footprint today (dependency audit §2): no column, no entity, no
  frontend reader.
- The Session model now lives at `modules/session/model/session_model.py` (moved 2026-08-30;
  the audit's "campaign module" location is stale).
- After 06/PR 1: `PauseSession.execute(session_id, host_id, reason: PauseReason)` exists,
  with the phase-2 write at the point where the extracted state is copied onto the session
  (`commands.py` ~`:1160-1175` today).
- Hero status line: `HomeHeroCard.js` `sessionStatusLabel` (`:34-40`) and the meta span
  next to the role chip (`:135-145`). Live line "Started {relative}" is PR 2's.
- Pulse calm pill: `PulseLine.js:184-192` ("All is quiet in the tavern...").
- Ranking comparator: `homeRanking.js` `compareHeroRank` — written to take a scheduled block
  between live and last played.
- Events pattern: `session/domain/session_events.py` factories returning
  `List[EventConfig]`; frontend copy in `app/shared/config/eventConfig.js`; handlers in
  `app/shared/hooks/useAuthenticatedEvents.js:122-140`.
- Session routes: `modules/session/api/endpoints.py`; schemas `modules/session/api/schemas.py`.
- No date/time input component exists in the app (grep `datetime-local` returns nothing) —
  use the native input; desktop-first, no picker library.
- Time helpers: `app/shared/utils/formatTime.js` — extend, do not add a second module.

## Backend

### Model + migration

- `session_model.py`: `scheduled_at = Column(DateTime(timezone=True), nullable=True)  # The next game, GM-declared; cosmetic`.
- `docker exec api-site-dev alembic revision --autogenerate -m "sessions.scheduled_at"`.
  Pure schema, no data step.
- Repository: map the field in `save` and `_model_to_aggregate` (`session_repository.py`).

### Aggregate (`session_aggregate.py`)

```python
def schedule(self, scheduled_at: Optional[datetime]) -> None:
    """Set or clear the next game. Cosmetic data — starts nothing (facilitate, don't enforce)."""
    if self.status != SessionStatus.INACTIVE:
        raise ValueError("End the game before changing the schedule")
    if scheduled_at is not None and scheduled_at.tzinfo is None:
        raise ValueError("scheduled_at must be timezone-aware")
    self.scheduled_at = scheduled_at

def clear_schedule(self) -> None:
    """Called by PauseSession on HOST_ENDED — the declared game happened."""
    self.scheduled_at = None
```

`clear_schedule` has no status guard: it runs mid-STOPPING inside the pause command.

### Commands

- New `ScheduleSession(session_repository, campaign_repository, user_repository,
  event_manager)`, `async execute(session_id, host_id, scheduled_at: Optional[datetime]) ->
  SessionEntity`: load, host check ("Only the host can schedule the game"),
  `session.schedule(scheduled_at)`, save, then broadcast
  `SessionEvents.session_scheduled(...)` to the campaign's non-host members.
- `PauseSession`: when `reason is PauseReason.HOST_ENDED`, call `session.clear_schedule()`
  **before** the phase-2 `_save_session_with_retry` so the clear rides the same commit as the
  extracted state. Not on `SYSTEM`.

### Event (`session_events.py`)

`session_scheduled(campaign_member_ids, host_id, host_screen_name, session_id, campaign_id,
campaign_name, scheduled_at: Optional[datetime]) -> List[EventConfig]` — recipients exclude
the host; `show_toast=True`, `save_notification=True`; payload `scheduled_at` as ISO-8601
UTC string or `None` (the data dict must stay JSON-safe: stringify here, nowhere earlier).

### Endpoint + schema

- `PATCH /api/sessions/{session_id}/schedule`, body `ScheduleSessionRequest(scheduled_at:
  Optional[datetime])`. `null` clears. Add a validator rejecting naive datetimes with 422
  (the aggregate also guards — the boundary check gives the client a precise error). 204.
- `SessionResponse.scheduled_at: Optional[datetime]`.
- NGINX: nothing — still under `/api/sessions`.

### Tests (api-site)

- `schedule()` refuses on ACTIVE/STARTING/STOPPING; accepts and clears on INACTIVE; rejects
  naive datetimes.
- `PauseSession` with `HOST_ENDED` leaves `scheduled_at` null after phase 2; with `SYSTEM`
  the value survives. (Mock the api-game HTTP calls the way the existing pause tests do —
  check `modules/session/tests/` for the current harness before inventing one.)
- `session_scheduled` factory: host excluded, every other member once, toast on, persist
  on, `scheduled_at` stringified or None.
- Endpoint: non-host 400, naive datetime 422.

## Frontend

### Mutation + control

- `useScheduleGame()` in `useSessionMutations.js` → `PATCH /api/sessions/{id}/schedule`,
  `authFetch`, invalidates `['campaigns']`.
- `ScheduleGameModal.js` (dashboard components, alongside `ResetGameModal.js`): native
  `<input type="datetime-local">` prefilled from the existing value (convert the ISO instant
  to a local `YYYY-MM-DDTHH:mm` string for the input), `min` = now, buttons **SAVE** and
  **CLEAR** (Clear sends `null`). On save: `new Date(inputValue).toISOString()` — write a
  one-line comment that `new Date` on a `datetime-local` string interprets it in the
  browser's zone, which is exactly the conversion we want.
- Drawer (`CampaignManager.js`): a **SCHEDULE** control in the idle host controls next to
  START GAME; disabled while live with title "End the game to change the schedule". The
  card shows the schedule line (rules below) for everyone.

### Display rules (hero meta line, drawer card, one helper)

Put the rule in ONE place — `homeRanking.js` or a sibling `gameStatusLine.js` — and have hero
and drawer call it:

| State | Line |
|---|---|
| Live | "Started {relative}" (PR 2) |
| Idle, `scheduled_at` in the future | "Next game · {Intl local, e.g. Thu 4 Sep, 20:00}" |
| Idle, `scheduled_at` in the past | the existing last-played line — the stale value is not shown |
| Idle, no schedule | the existing last-played line |

Formatting via `Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month:
'short', hour: '2-digit', minute: '2-digit' })` in `formatTime.js`. Hydration note: render
the line client-side only (same reason as `HomeClock`).

### Pulse calm pill (`PulseLine.js:184-192`)

When nothing is live and no events are queued, and any member campaign has a future
`scheduled_at`, the pill reads "All is quiet in the tavern · next game {short local}",
taking the soonest across campaigns. Otherwise unchanged.

### Ranking (`homeRanking.js`)

Insert the scheduled block into `compareHeroRank`: after the live comparison, campaigns with
a *future* `scheduled_at` rank before those without, soonest first; then last played. Past
values count as none.

### Event bridge + copy

- `useAuthenticatedEvents.js`: `session_scheduled` → invalidate campaigns + toast.
- `eventConfig.js`: `session_scheduled` — toast "Next game: {local date}" or "The next game
  was cleared" (format client-side from `data.scheduled_at`; if `toastMessage` cannot be a
  function today, extend the toast helper minimally rather than hard-coding a string);
  panelMessage in the same shape; `navigationTab: 'campaigns'`.

### Copy sweep

The hero's idle line and the drawer share vocabulary with 06: "game", never "session".

## Acceptance — QA script

1. GM sets a time in the drawer; player's hero shows "Next game · …" in the player's own
   zone (test with the two browsers' OS zones differing, or `TZ=` on one).
2. GM's End game clears it; the hero returns to the last-played line.
3. Sweeper pause leaves it; the drawer still shows the schedule.
4. A past value shows nothing on the hero; setting a new one replaces it.
5. SCHEDULE is disabled while live; PATCH while live returns 400.
6. Player gets the toast and a notification row; the host gets neither.
7. Calm pulse pill names the soonest next game across campaigns.
8. Ranking: an idle scheduled campaign outranks an idle unscheduled one with a more recent
   last-played; a live campaign outranks both.
9. Suites green in the containers.
