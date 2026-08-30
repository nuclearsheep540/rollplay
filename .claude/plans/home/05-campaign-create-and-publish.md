# Stage plan — Campaign create + publish flow

> Part of the [Home landing page epic](00-epic.md). **Status: PARKED — shape only,
> unscheduled.** Extracted 2026-08-29 from the hero-eligibility alignment conversation
> (Matt + Claude Code, during step-1 implementation planning). Not scoped, not specced —
> this document exists so the concept is never lost. Detail is extracted when its turn
> comes, per the epic operating model.

## The concept

Campaigns currently have no lifecycle between "created" and "played". The create endpoint
hand-feeds every campaign a session at birth (`# Always create a session with the
campaign`, `campaign/api/endpoints.py` create route), so the system has never had to
distinguish **a campaign being built** from **a campaign fit to play** — and the product
has no understanding of the process a GM actually goes through.

The missing distinction: **building is a state**. A campaign under construction is by
nature not playable — it cannot honestly offer a START SESSION action anywhere. What ends
that state is an authorial declaration, not a completeness threshold:

> **Publish** = putting the seal on a campaign: "whatever I've got now, this is good
> enough to be called a campaign." One map and one sound effect is a valid published
> campaign. Publishing is a *seal*, never a *validation gate* — no content checks, no
> minimum requirements (see the facilitate-don't-enforce principle,
> `.claude/plans/core/product-principles.md`).

## Naming — settled 2026-08-29

- **Publish** = the seal above. Campaign-level, author-facing, about *my table*.
- **Share** = giving a campaign to the community (the Market, stage 4 —
  [04-market.md](04-market.md)). A different verb for a different act.

No collision: publish has nothing to do with the Market. Whether *sharing* requires a
campaign to be *published* first is plausible but undecided — open question below.

## Target flow

```
Create a campaign  →  do something with it  →  publish it  →  hero + campaign index
   (form modal)          (build state)        (the seal;       say "you can start
                                              creates its       this game"
                                              session by
                                              default)
```

- Creation no longer auto-creates a session — that coupling moves to publish, which by
  default brings the campaign's session into being (INACTIVE, ready to start).
- Pre-publish, the campaign lives ONLY in build surfaces (the Home "Continue building"
  card, the campaign editor). It is never the Home hero and never claims to be startable
  anywhere, including the Campaigns index.
- Post-publish, the campaign is session-bearing and enters hero eligibility like any
  other — appearing in both Home slots when it is also the most recently edited owned
  campaign (hero = play it, working-on = build it; publishing does not end editing).

## v1 sizing (Matt, 2026-08-29)

This flow is ~90% built already. The create/build/edit surface IS the existing campaign
create/edit form; v1 is little more than:

- a **save-without-publishing** option on that form (creates/updates the campaign, no
  session), and
- a **publish button** (the seal; fires the session creation that the create endpoint
  currently hand-feeds).

Don't let the parked status inflate the scope at extraction — v1 stays this thin, and the
open questions below only get answers that fit inside it.

## Groundwork already shipped (step 1)

The Home hero's eligibility rule is **session-triggered** from day one
(`implementation/step-01-home-shell.md`): a campaign heroes only if it has a non-finished
session. Because creation currently auto-creates sessions, the filter is latent — every
campaign passes today — but the mechanism is exactly the hook this flow needs: when
publish takes over session creation, unpublished campaigns fall out of the hero (and out
of "startable" surfaces) with no ranking rework.

## Supersedes (when this lands, delete in the same change)

- The `# Always create a session with the campaign` block in the create endpoint, and the
  session-name field on the create modal (the form becomes campaign-only).
- Any copy implying a fresh campaign is immediately playable.

## Open questions (answer at extraction, not before)

1. **State mechanics**: explicit `published` state on the campaign aggregate (column +
   migration) vs derived ("has a session"). The 2026-08-29 lean: the flow language above
   implies explicit — publish is an *act* with a default *effect* (session creation) —
   but decide against real requirements at extraction.
2. **Where the publish affordance lives**: working-on card? campaign drawer? campaign
   editor? All three?
3. **Invites pre-publish**: can a GM invite players to an unpublished campaign (gather
   the party while building), and what do those players see?
4. **Player-side hero eligibility**: strict symmetry (no session → no hero for players
   either) vs the asymmetry leaned toward during step-1 planning (player campaigns hero
   regardless — "Waiting for GM" is honest whether or not the session row exists yet).
5. **Un-publish / re-publish**: does the seal come off? What happens to the session and
   to players if it does?
6. **Only place to create** — RESOLVED 2026-08-29: Home offers creation solely in the
   zero-owned-campaigns state (the working-on template card); with any owned campaign,
   Home shows no create/switch affordance at all (anti-bloat). The Campaigns tab keeps
   its New Campaign button as the standing create surface and the place to pick a
   different campaign to edit. Remaining sliver for this flow: whether the tab's create
   UX changes when save-without-publish / publish verbs arrive.
7. **Share ⇄ publish interplay** (stage 4): must a campaign be published to be shared?
8. **Grandfathering**: existing campaigns all have sessions; at migration they read as
   published (derived) or get `published = true` backfilled (explicit).
