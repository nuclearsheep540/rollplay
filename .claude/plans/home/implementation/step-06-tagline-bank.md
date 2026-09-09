# Implementation — Delivery step 6: Greeting tagline

> Extracted 2026-09-09 from [00-epic.md](../00-epic.md) delivery sequence step 6. Replaces
> the literal `Tagline goes here` that decision D6 shipped in
> [step-01-home-shell.md](step-01-home-shell.md). Branch: `feature/home-page-tagline`.
>
> **STATUS 2026-09-09: built, awaiting dev QA.** Lint clean. Nothing committed — Matt runs
> git.

## The ask

Replace the placeholder with a flavour line personalised from data Home already holds: the
viewer's character, the hero campaign, the party, the next scheduled game. Degrade for
people with no character or no campaign.

## What shipped

One function, `selectTagline({ user, heroCampaign, characters })` in
`app/dashboard/utils/tagline.js`. `describeSituation` gathers every fact once; then **four
situations in priority order**, each a function that picks its own voice and its own lines
(one by `Math.random`):

1. `noCampaign` — voices: has a character / nothing
2. `gameToday` — voices: owner / player with character / player without
3. `gameAhead` — same three voices, using the drawer's `formatScheduledTime` wording
4. `betweenGames` — voices: with party / character alone / owner still building (no
   players joined) / owner with players / player without character

Two axes, deliberately separated (Matt, 2026-09-09): the **situation** decides priority and
lives in the chain; the **voice** (who is reading, and whether the party has characters)
never changes priority, so it lives inside the situation's function. A first cut flattened
voices into the chain and produced thirteen rows nobody could read as the spec.

`HomeManager` computes it under `useMemo` keyed on the two queries, so it is picked once per
situation rather than per render, and passes it to `HomeGreeting`. Blank (a `&nbsp;`) while
the queries are in flight.

## Decisions

- **Client-side.** "Today" is the viewer's today and there is deliberately no user timezone
  anywhere; the server cannot answer it. All inputs are already on the page — the session
  response carries the schedule and a roster with every member's `character_name`.
- **No cache, no endpoint.** It is arithmetic over objects in memory. A cached line would
  have hidden a schedule set at lunchtime for that evening.
- **Random pick, not a stable rotation.** Matt, 2026-09-09: the personalisation is the
  names in the sentence, not which sentence. A first cut built a deterministic half-day
  seed with a string hash so the phrasing held across refreshes; it grew a bank module,
  slot-eligibility rules and a hash finalizer to serve variety nobody asked for, and was
  cut back to this. If same-line-twice ever matters, pass the current line in and exclude
  it.
- **No live-game line.** That is status; the hero card and the pulse own it. A
  scheduled-today line is allowed because it is a mood, not a readout.
- **Owner voice.** The owner is never spoken about in the third person ("the Game Master
  of X" reads wrong to the person it is addressed to).
- **System-agnostic copy.** No line leans on any one game system's mechanics. Game-rich
  context (played history, adventure-log moments) is a deliberate later revisit.
- **Past schedule** counts as none, via `isUpcoming`.
- Ownership is `campaign.host_id === user.id`, the same test the hero's role chip uses.

## Dev QA

- Character in a campaign, no schedule: tier 3 if a party member has a character, else 4.
- Set a schedule for today: tier 1 on the next campaigns refetch, no reload. Set it for
  another day: tier 2 with the drawer's wording. Let it pass: falls back, never mentions it.
- GM with no character in their own campaign: owner wording, never third person.
- Player with no character locked: tier 5 player wording.
- Characters but no campaign: tier 6. Brand-new user: tier 7.
- Hard refresh: blank slot, never a newcomer flash, before the line appears.
- The line does not change while the page sits open; it changes on reload or when the
  situation does.
