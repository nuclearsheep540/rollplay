# Stage 3 — Scheduling + RSVP

> Part of the [Home landing page epic](00-epic.md). **Shape only** — recorded at epic time
> (2026-08-28) so the full delivery scope lives in the epic; PR-level detail gets extracted here
> once stages 1–2 have landed and taught us the real FE/data shapes. Scheduling is the single
> most requested capability in VTT communities; it earns its place in this epic because it is
> the ranking rule's missing middle slot.

## Outcome

A GM can put the next session on the calendar; players answer it; Home answers "when's my next
game, and is it actually happening?" — "Next session Thu 4 Sep, 20:00 · 3 of 5 confirmed".

## Non-negotiable (decided at epic time)

**Model `scheduled_at` and RSVP together from the start.** A bare date field is not the feature
— "3 of 5 confirmed" is. Do not ship the date and defer availability; the data model for both
lands in the same PR.

## Ground truth (dependency audit, 2026-08-29)

Verified by code sweep — [dependency-audit.md](dependency-audit.md) §2:

- Scheduling has **zero footprint** today: no column, no entity, no RSVP concept in
  api-site, api-game, the frontend, or any of the 76 migrations. Only prose comments call
  a Session "the scheduled/planned play instance" (`session_model.py:8`) — the naming is
  ready; the data isn't.
- The Session model lives in the **campaign module's** model file
  (`modules/campaign/model/session_model.py`), not `modules/session/` — the
  `scheduled_at` migration and model import land there.
- **Two Home lines depend on this stage and have no source until it lands**: the hero's
  not-live meta ("Next session · Saturday 29th August, 8pm") and the pulse's calm pill
  ("All quiet in the tavern · next game Saturday, 8pm"). Stages 1–2 ship both with
  interim copy (last-played based — exact line decided at stage-1 build).
- The only time-based trigger precedent is the session-expiry sweeper
  (`get_expired_sessions`, `session_repository.py:64`) — confirmed nothing else exists
  for the reminder-notifications open question below.

## Known shape

- **Data**: `scheduled_at` on sessions — the Session aggregate already self-describes as "the
  scheduled/planned play instance", so this completes its own naming. RSVP as its own table
  (session_id, user_id, status confirmed/declined/tentative, responded_at). Store UTC, render
  local.
- **Ranking**: activates the middle slot — live > next scheduled (soonest) > last played. Stage
  1's comparator was written to take this as an extension.
- **Hero/card Scheduled state** (from the stage-1 mapping table): date + confirmed count; GM
  primary Start session (plus edit-schedule affordance); player primary = RSVP while
  unanswered, then Join disabled showing the date.
- **Greeting meta** gains next-session mentions.
- **Events**: schedule set/changed → multi-recipient EventConfig to campaign players (existing
  `SessionEvents` pattern); RSVP responses → notify the GM. Toast/persist flags per event type,
  decided per the events module conventions.

## Open (decide at extraction)

- Where the GM sets/edits the date — campaign management view vs inline on the card/hero.
- Reminder notifications ("session in 1 hour") — needs a time-based trigger; the session expiry
  sweeper is precedent for a sweeper-style job. Nice-to-have, not a gate.
- Recurring sessions ("every Thursday") — likely v2; don't build until asked.
- Calendar export (ICS) — v2 at most.

## PR sketch (rough, revisit at extraction)

1. Backend: `scheduled_at` + RSVP model/migrations, endpoints, events.
2. Scheduling UI (GM) + RSVP flow (player) + notifications.
3. Home integration: ranking middle slot, hero/card Scheduled state, greeting meta.
