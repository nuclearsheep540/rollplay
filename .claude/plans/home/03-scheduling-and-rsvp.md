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

# matt's impromptu thought
im thinking where schedule lives, and im thinking the most sense is it lives in the session model, therefore, a GM has a campaign and says 'were going to play next week monday', they dont schedule in the campaign, instead they create a new session (forcing them to stop any current ones - which is good for us because it unlocks media/characters) (and also a session is required for our campaign hero to look up) and the session create form has an optional field 'schedule: date'. This model column is nothing more than cosmetic though, we're not automatically starting sessions or policing anything, this whole 'schedule' concept is cosmetic and communicative data only, i.e, just because GM said next session is monday and wrote that in the session - it doesnt change anything, all it does it let the players know intent and helps align users (thats the facilitate dont enforce rule being applied) does that make sense? next time you read this in a plan please validate.

I also notice that this plan mentions RSVP, but we really dont need that at this v1 stage, we can just have 'next schedulled' and players know - the reality of it is the date was very much likely pre-agreed in person, hence why its added. so no RSVP, just schedule. This one shouldnt be too complicated.

Another food for thought is that schedulling = time, and our current time in the home page = time. time is currently read from the server's time based on where its deployed, but with all things time - we need to adjust for timezones. Server time is GMT+01, and im GMT+0, so we'd need to have timezones set for users so we can offset scheduled time, so if a user in GMT+1 see's the scheduled time to start at 2pm, for users in GMT+0 that means 1pm, so we need to get that right - and then also ensure the home page is adjusted for the user's time

if its not already in this plan, the idea of pausing/ending a session from the game runtime needs to be shipped with this feature to enable the user-flow.