# Stage plan — Campaign create + publish flow

> Part of the [Home landing page epic](00-epic.md). **Status: PARKED — shape only,
> unscheduled.** Extracted 2026-08-29 from the hero-eligibility alignment conversation
> (Matt + Claude Code, during step-1 implementation planning). Not scoped, not specced —
> this document exists so the concept is never lost. Detail is extracted when its turn
> comes, per the epic operating model.
>
> **2026-09-06:** this file also holds the long-term model for **where players and
> characters live** relative to the campaign, the session, and the create/publish flows
> (section below). The thin v1 above is unchanged and still first; the character-form
> work is the feature the membership move lands with.

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

> **Superseded 2026-09-05 by [06-game-lifecycle.md](06-game-lifecycle.md).** Every campaign
> now has exactly one session from birth, always — created with it, replaced by Reset game,
> never zero — and Start/Schedule never create one. So "no session until publish" is no
> longer an available hook: if this flow is ever extracted it carries an explicit
> `published` flag on the campaign (open question 1 is thereby leaning explicit), and the
> hero filter reads that flag rather than session presence. The session-name field this
> section planned to delete is already gone in 06.

## Where players and characters live — decided 2026-09-06

> Reached by working backwards from Reset (see [06](06-game-lifecycle.md)): Reset keeps
> the party because invites and character locks live on the campaign — which means a
> *published* campaign would ship its players. Play data and campaign data are conflated
> today. This section records the split and everything it drags in. **Not scheduled** —
> it is the long-term shape, written down so nothing built before it has to be reverted.

**The split: the campaign is the *what*, the session is the *who and when*, the user owns
the character.**

| Lives on | Holds |
|---|---|
| Campaign | Authored content: setup, assets, notes, NPC baselines, the seat maximum ("built for 2–6"), and the **character-creation form**. Publishable and shareable — contains no people. |
| Session | The table: roster (who is in, which ONE of their characters for this campaign they brought, roles), the schedule, play state (boards, log, what was on screen). Reset clears it. |
| User | Their characters, persisted regardless of resets. |

**Characters.**
- **User-owned, campaign-bound.** Every character is built against some campaign's form
  and carries that campaign as *provenance* — a `campaign_id` that never changes — not as a
  lock. (Built *against* a campaign, not owned by it: creation still starts from the
  character surfaces — see the create-flow bullet.) Today's movable `active_in_campaign_id` and the "release / locked elsewhere" rules
  go; the session roster's `selected_character_id` (already a column, display-only today)
  becomes the real link. "One table at a time" is then a rule on live rosters, not a
  column on the character.
- **No portability, by design.** There are no shared "systems"; each campaign's form is
  its own document, so a character built for campaign A plays in campaign A. The Foundry
  route — publishing character templates separately so two campaigns can prove they share
  one — was considered and **rejected** (2026-09-06): hundreds of near-duplicate templates
  nobody can find, and the platform degrades by proxy of misuse.
- **The create-character CTAs STAY; they gain a "for which campaign?" step**
  (Matt, 2026-09-06 — explicitly correcting an earlier reading in that conversation that
  raw character creation would be *removed*). Nothing is taken away from the Characters tab
  or the Home hand. What changes is the first step of those flows: with no shared systems
  there is nothing to build against except a campaign's form, so the CTA asks which of the
  player's campaigns (member **or** invited) this character is for, then renders that
  campaign's form. Accepting an invite is simply a second door into the same flow, not a
  privileged one.
  - **Zero eligible campaigns = nothing to create against.** The CTA explains that rather
    than opening an empty form; the honest next action is an invite (or creating a
    campaign). Design this state — it is the first thing a brand-new player meets.
  - **A player may build MANY characters for the SAME campaign.** The library holds all of
    them; the session roster holds the ONE they are bringing to this table. This is a real
    departure from today's code, which assumes one: `get_user_character_for_campaign()`
    returns a single row via `.first()`
    (`characters/repositories/character_repository.py:305`), and
    `SelectCharacterForCampaign` enforces "one active character per (user, campaign)" by
    releasing the previous one (`campaign/application/commands.py:602-620`). Both are
    superseded — the "which character am I playing" question moves to the roster.
- **Reset clears the roster, not the characters.** They stay on the player, still bound to
  the campaign, ready for its next run. **Shipped early at the campaign level (2026-09-06):**
  Reset already removes every non-DM member and releases their character locks via the
  existing remove-player command, and the dialog already says so. This model only changes
  *where* that state lives (roster instead of `campaign_members`), not the behaviour.
- **Deleting a campaign keeps its characters as keepsakes** — they can never play again,
  but they render (see form versions) and are the player's to keep.

**The form.** An author-built document: which attributes exist, hit-point rules, which dice
are thrown, and the option values each field offers. System-agnostic means the platform
knows the *shape*, not the rules.
- **Versioned and immutable; characters reference the version that built them.** Editing
  the form does NOT version the campaign — the form is small and is the only part a
  character depends on. Both campaign kinds are handled by the same mechanism: a prebuilt
  campaign has one form version for life; a campaign built as it is played accumulates
  them. **Publishing pins the current form version into the published snapshot** — publish
  is what versions the campaign ("Curse of Strahd v1.05"). Form versions outlive the
  campaign row (or the character embeds its version at creation — pick at build time), which
  is what makes deleted-campaign keepsakes free.
- Editing the form mid-run must never touch existing sheets; players on an older version
  are shown as such, not migrated silently.
- **Compatibility is a diff, never a gate.** Comparing two forms structurally (fields,
  types, option values) is fuzzy in both directions — same-named fields may mean different
  things, trivial differences would block — so the comparison produces information for
  the GM ("built on a form that differs in two fields: Species, Hit Dice"), per
  facilitate-don't-enforce. Two characters from the same *published version* have
  identical forms, so a published-ID match is simply the fast path of the same check. This
  is also how "play again if the same campaign is recreated" works without published
  templates.
- **Runtime state stays on the character** (current HP, conditions, death saves — written
  back from the game today). It is run data living on a user-owned object; named here so
  nobody later "fixes" it by moving characters into the session.

**Membership and roles move to the session roster.** Invites, accept/decline, and the
player/spectator/mod roles become roster state. **The DM splits in two**: authorship stays
on the campaign (`created_by`), running the table is a session role — a campaign acquired
from the Market is authored by one person and run by another. Publishing therefore
excludes people by construction; Market acquisition copies structure and the form, never
members.

**What this supersedes.** The rules engine. A document form holds values; it cannot compute
a proficiency bonus, a level-up or a spell slot. The character v2 completeness plan
(`.claude/plans/character_v2/`), its phases, and the product-principles line about a
notebook that "knows the rules" are largely superseded: the sheet knows the shape. The six
relational character tables become a document schema (`values` keyed by the form's fields
+ runtime state). Nothing is live, so that is droppable — but it is a **rewrite** of the
characters module, not an extension. The SRD content may survive as a starter form an
author copies into a campaign. The Home "Your characters" hand and the avatar pipeline are
unaffected (avatars are assets).

**Sequencing and size.** Not a Market prerequisite — acquisition simply does not copy
members. Land the membership move *with* the character-form feature, not before it (infra
lands with the feature that needs it). Sized 2026-09-06 as roughly: two migrations with
data moves, ~25 backend files, ~15 frontend files, plus the characters rewrite — 3–4 PRs
for membership alone, more with characters. Nothing shipped in 06 needs reverting.

**Open, decide at extraction.**
- **Archived runs.** Once the roster owns "who played", the previous run's party is a
  query worth keeping. Additive: `archived_at` on sessions, invariant tightened to "one
  *unarchived* session per campaign"; Reset becomes archive-and-recreate instead of
  delete-and-recreate. Does not bring FINISHED back.
- **Form language scope**: derivations/formulas (computed stats) are explicitly *not* in
  the first cut; a values-only form is the baseline.
- **Keepsake mechanics**: retain form versions past campaign deletion vs embed the version
  in the character.
- Open question 3 below (invites pre-publish) is now a roster question, not a campaign one.

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
   the party while building), and what do those players see? (2026-09-06: invites become
   session-roster state — see the section above — so this is "can the roster fill before
   the seal", and the invited player's create-character door is the form, which may
   still be changing.)
4. **Player-side hero eligibility**: strict symmetry (no session → no hero for players
   either) vs the asymmetry leaned toward during step-1 planning (player campaigns hero
   regardless — "Waiting for GM" is honest whether or not the session row exists yet).
   (Moot since 06: every campaign has a session from birth; eligibility is membership.)
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
