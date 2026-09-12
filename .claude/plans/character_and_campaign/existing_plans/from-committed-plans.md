# Extracted notes — character & campaign-create content living in committed plans

> **What this is.** The plan files that were *loose* in `.claude/plans/` have been moved
> into this directory wholesale. The files below could not be moved — they are committed
> members of other epics that remain in place (`plans/home/`, `plans/core/`) — so their
> character and campaign-create content is copied here instead.
>
> **Why.** So the redesign has every existing decision in one directory, and so the
> supersede list can be written deliberately rather than by memory.
>
> Extracted 2026-09-12. Every claim below carries its source file and line. Nothing here
> is new thinking; where a source contradicts itself or the live code, that is flagged
> rather than resolved.

---

## 1. `home/05-campaign-create-and-publish.md` — the existing campaign-create plan

**Status in its own words: PARKED, shape only, unscheduled** (`:3-7`). Extracted
2026-08-29 from a hero-eligibility conversation; amended 2026-09-06. It exists so the
concept is not lost, and was explicitly never scoped or specced.

This is the single most relevant file to the new work. It is *entirely* about campaign
create, and its second half is *entirely* about the character model.

### 1.1 The problem it names

Campaigns have no lifecycle between "created" and "played" (`:22-28`). The create endpoint
hand-feeds every campaign a session at birth, so the system has never distinguished **a
campaign being built** from **a campaign fit to play**.

> "**Building is a state.** A campaign under construction is by nature not playable — it
> cannot honestly offer a START SESSION action anywhere." (`:30-33`)

### 1.2 Publish — the seal (`:35-38`)

**Publish is an authorial declaration, never a completeness threshold.** "Whatever I've
got now, this is good enough to be called a campaign." One map and one sound effect is a
valid published campaign. No content checks, no minimum requirements — explicitly tied to
facilitate-don't-enforce.

**Publish ≠ Share** (`:40-47`). Publish is campaign-level, author-facing, about *my table*.
Share is the Market verb (stage 4). Whether sharing requires publishing first is open.

### 1.3 Target flow (`:49-66`)

```
Create a campaign → do something with it → publish it → hero + campaign index
   (form modal)         (build state)       (the seal)
```

- Pre-publish the campaign lives **only** in build surfaces (the "Continue building" card,
  the campaign editor). Never the hero, never startable, not even in the Campaigns index.
- Post-publish it enters hero eligibility like any other. Publishing does not end editing.

### 1.4 v1 sizing — Matt, 2026-08-29 (`:68-79`)

The flow is **~90% built**. The build/edit surface IS the existing create/edit form. v1 is
little more than:

1. a **save-without-publishing** option on the form, and
2. a **publish button** that fires the session creation the create endpoint currently
   hand-feeds.

> "Don't let the parked status inflate the scope at extraction — v1 stays this thin, and
> the open questions below only get answers that fit inside it." (`:77-79`)

### 1.5 Its groundwork is now stale (`:81-96`)

The original hook was "no session until publish", riding the hero's session-triggered
eligibility filter. **Superseded 2026-09-05 by `06-game-lifecycle.md`**: every campaign now
has exactly one session from birth. So publish needs an **explicit `published` column** and
the hero filter reads that flag. The session-name field this section planned to delete is
already gone.

### 1.6 Supersede list it declares for itself (`:203-208`)

When it lands, delete in the same change: the `# Always create a session with the campaign`
block in the create endpoint; the session-name field on the create modal; any copy implying
a fresh campaign is immediately playable.

*(Note: the session-name field is already gone — that item is stale.)*

### 1.7 Its eight open questions (`:210-247`)

1. **State mechanics** — explicit `published` column vs derived "has a session". 2026-08-29
   leaned explicit; the 2026-09-05 supersede note makes explicit the only option left.
2. **Where the publish affordance lives** — working-on card, campaign drawer, editor, all three?
3. **Invites pre-publish** — can a GM gather the party while building, and what do those
   players see? (2026-09-06: now a roster question.)
4. **Player-side hero eligibility** — moot since 06; eligibility is membership.
5. **Un-publish / re-publish** — does the seal come off? What happens to the session and players?
6. **Only place to create** — **RESOLVED 2026-08-29**: Home offers creation *solely* in the
   zero-owned-campaigns state (the template card). With any owned campaign, Home shows no
   create affordance at all (anti-bloat). The Campaigns tab keeps New Campaign as the
   standing create surface. Open sliver: whether that tab's UX changes when
   save-without-publish arrives.
7. **Share ⇄ publish interplay** — must a campaign be published to be shared?
8. **Grandfathering** — existing campaigns all have sessions; read as published, or backfill.

---

## 2. `home/05` §"Where players and characters live" — decided 2026-09-06

> This section (`:98-217`) is the one that **explicitly supersedes the character_v2 plan**.
> It is marked *decided* but **not scheduled**, and nothing was built.

Reached by working backwards from Reset: Reset kept the party because invites and character
locks live on the campaign — which means a *published* campaign would ship its players.

### 2.1 The split (`:107-113`)

**The campaign is the *what*; the session is the *who and when*; the user owns the character.**

| Lives on | Holds |
|---|---|
| Campaign | Authored content: setup, assets, notes, NPC baselines, the seat maximum, and **the character-creation form**. Publishable and shareable — contains no people. |
| Session | The table: roster (who is in, which ONE character they brought, roles), schedule, play state. |
| User | Their characters, persisted regardless of resets. |

### 2.2 Characters (`:115-178`)

- **User-owned, campaign-bound.** Every character is built against some campaign's form and
  carries that campaign as *provenance* — a `campaign_id` that never changes — **not a lock**.
  Today's movable `active_in_campaign_id` and the release/locked-elsewhere rules go. The
  roster's `selected_character_id` becomes the real link. "One table at a time" becomes a
  rule on live rosters, not a column on the character.
- **No portability, by design.** No shared "systems"; each campaign's form is its own
  document. A character built for campaign A plays in campaign A. **The Foundry route —
  publishing character templates separately — was considered and REJECTED (2026-09-06)**:
  hundreds of near-duplicate templates nobody can find.
- **The create-character CTAs STAY; they gain a "for which campaign?" step** (`:128-135`).
  Matt explicitly corrected an earlier reading that raw character creation would be removed.
  Nothing is taken from the Characters tab or the Home hand. With no shared systems there is
  nothing to build against except a campaign's form, so the CTA asks which campaign (member
  **or** invited), then renders that campaign's form. Accepting an invite is a second door
  into the same flow, not a privileged one.
- **Zero eligible campaigns = nothing to create against** (`:136-138`). Explain rather than
  open an empty form. *"Design this state — it is the first thing a brand-new player meets."*
- **A player may build MANY characters for the SAME campaign** (`:139-146`). The library
  holds all; the roster holds the one they bring. **A real departure from live code**, which
  assumes one: `get_user_character_for_campaign()` returns a single row via `.first()`
  (`character_repository.py:305`), and `SelectCharacterForCampaign` enforces one active
  character per (user, campaign) by releasing the previous (`campaign/commands.py:602-620`).
- **Deleting a campaign keeps its characters as keepsakes** (`:152`) — they can never play
  again, but they render and are the player's to keep.
- **Runtime state stays on the character** (`:176-178`) — current HP, conditions, death
  saves. Named explicitly so nobody later "fixes" it by moving characters into the session.

### 2.3 The form (`:155-174`)

An **author-built document**: which attributes exist, hit-point rules, which dice are
thrown, and the option values each field offers. *System-agnostic means the platform knows
the **shape**, not the rules.*

- **Versioned and immutable; characters reference the version that built them.** Editing the
  form does NOT version the campaign. A prebuilt campaign has one form version for life; a
  campaign built as it is played accumulates them.
- **Publishing pins the current form version into the published snapshot** — publish is what
  versions the campaign ("Curse of Strahd v1.05").
- Editing the form mid-run must never touch existing sheets; players on an older version are
  **shown as such, not migrated silently**.
- **Compatibility is a diff, never a gate** (`:167-174`). Structural comparison is fuzzy in
  both directions, so it produces information for the GM ("built on a form that differs in
  two fields: Species, Hit Dice"), per facilitate-don't-enforce.

### 2.4 Membership and roles move to the session roster (`:180-185`)

Invites, accept/decline, and player/spectator/mod roles become roster state. **The DM splits
in two**: authorship stays on the campaign (`created_by`); running the table is a session
role — a Market-acquired campaign is authored by one person and run by another. **Publishing
therefore excludes people by construction.**

### 2.5 What it says it supersedes (`:187-196`)

> "**The rules engine.** A document form holds values; it cannot compute a proficiency
> bonus, a level-up or a spell slot. The character v2 completeness plan
> (`.claude/plans/character_v2/`), its phases, and the product-principles line about a
> notebook that 'knows the rules' are **largely superseded**: the sheet knows the shape."

- The six relational character tables become a document schema (`values` keyed by the form's
  fields + runtime state).
- **Nothing is live, so that is droppable — but it is a *rewrite* of the characters module,
  not an extension.**
- The SRD content **may survive as a starter form** an author copies into a campaign.
- The Home "Your characters" hand and the avatar pipeline are **unaffected** (avatars are assets).

### 2.6 Sequencing and size (`:198-201`)

Not a Market prerequisite. Land the membership move **with** the character-form feature, not
before it. Sized 2026-09-06 as: two migrations with data moves, ~25 backend files, ~15
frontend files, plus the characters rewrite — 3–4 PRs for membership alone, more with
characters. Nothing shipped in 06 needs reverting.

### 2.7 Its own open items (`:210-217`)

- **Archived runs** — superseded by 07 (with Reset gone a session is never replaced).
- **Form language scope** — derivations/formulas (computed stats) explicitly *not* in the
  first cut; a values-only form is the baseline.
- **Keepsake mechanics** — retain form versions past campaign deletion vs embed the version
  in the character.

---

## 3. `core/product-principles.md` — foundational, governs both flows

Status: foundational, product-wide, explicitly governing "*every* feature — character
creation, level-up, the live game session, DM tools, dice, audio, everything" (`:3`).

- **Inform maximally, constrain minimally.**
- **Three axes that must never be conflated** (`:25`): **completeness** (required to exist —
  fine to require at finalize, never per-keystroke), **canon-correctness** (never gate, hide,
  disallow or caution-at-submit), **data invariants** (always hard-block).
- **No homebrew mode** (`:17`): "A player can build an Orc Warrior with 0 STR 'because it'd
  be hilarious,' and the app neither blocks it nor brands the whole character homebrew."
- **`:41` contains an unfinished instruction**: it retires the character-v2 plan's
  `warnings: list[str]` "violation on save" rail in favour of point-of-choice eligibility,
  and asks that §3.0 / Phase D of the completeness plan be updated to match. That edit was
  only partially done.

> **Tension to resolve in the new work:** 05 §2.5 says this document's "notebook that knows
> the rules" line is superseded by the form model. The three axes themselves are not
> obviously superseded — a values-only form still has completeness, canon and invariant
> questions. Decide explicitly which parts survive.

---

## 4. Scattered character & campaign-create references in other committed plans

### `home/07-game-aggregate.md` — SHIPPED (release 0.65.0)

- **Party is a value inside the session, never an aggregate** — no id, no lifecycle
  (`:115`). One seat per user, one character in it at a time, swappable over time.
- `games.attendance` JSONB: `[{user_id, character_id}]`, written once at End from api-game's
  final state (`:171`).
- `SelectCharacterForSession` exists and is a live command (`:74`).
- **Player disconnect writes character state to cold storage** (`:598-610`): a player's
  current HP is written onto their character row and the character marked dead if
  applicable. This is the character-level ETL and is one of api-game's only two outbound
  calls to api-site.

### `home/deliverables.md` — the shipped contract for `feature/home-page`

- `:20` — "**05 is parked — nothing from it ships here**"; `:188` lists create→publish as
  explicitly not shipped.
- **B7** (`:54`) — the working-on card renders a create-campaign template when the user owns
  zero campaigns; its CTA opens **the existing create modal** via `?create_campaign=1`. This
  is Home's only create affordance.
- **B9** (`:56`) — the "Your characters" hand: overlapping parallelogram cards with real
  portraits, zero-characters shows a ghost state.
- **B5** (`:52`) — player hero action is MANAGE CHARACTER.
- **F2** (`:115`) — user-facing session create, rename and delete are **REMOVED**.
- **F23 / `:194`** — disconnect-time character state save was **decided against**; runtime
  state authority is deferred (see the moved `TODO-runtime-character-state-authority.md`).

### `home/08-creases.md` — BUILT 2026-09-09

Copy and vocabulary sweep. Relevant only as the record of live character-facing copy:

- `CharacterSelectionModal.js:150` — "You can't change your character while a session is
  active" → reworded to *game*.
- `CampaignManager.js:138` — "Cannot remove your character…" → "Cannot **release** your
  character while a game is running".
- `GameContent.js:2141` / `:93`, `CharacterWizard.js:318` — same session→game sweep.
- `:53` D5 — campaign delete composes two commands "the way the create endpoint composes
  `CreateCampaign` and `CreateSession`" — i.e. **auto-session-at-create is still live code**.
- `:246-254` — on campaign delete, character colours sync back to characters; character locks
  are released; copy promises "Players keep their characters, and your assets are kept."

### `home/00-epic.md`

- `:69-70`, `:98`, `:127-130` — the "Your characters" hand was cut then **un-cut 2026-08-29**,
  "the one deliberate resurrection". Zero-dependency because the portraits pipeline exists.
- `:452-454` — seats are `campaigns.max_players` (1–8, default 8), edited in the campaign
  form, read at Start.
- `:202-208` — stage 05 entry: parked, v1 thin, groundwork gone, needs an explicit flag.

### `home/01-home-shell-and-ranked-campaigns.md` / `02-live-panels-and-news.md`

Character content is display-only: character name on cards (`01:28`), the characters hand
(`01:37`), MANAGE CHARACTER hero action (`01:125`), and "editing their character" as a Pulse
activity weight that is **not yet fed by any signal** (`02:41`, `02:51`, `02:185`).

---

## 5. Flags for the supersede list

Recorded, not resolved:

1. **05 §2.5 claims to supersede `character_v2/` and part of `core/product-principles.md`.**
   That claim was written in prose and never actioned. The new work should make it explicit.
2. **05's v1 (thin publish flow) and 05's long-term model (form-driven characters) are two
   different sized pieces of work in one file.** A ground-up redesign may keep the first,
   the second, both or neither — but they should stop sharing a document.
3. **05 §2.2 contradicts live code** on one-character-per-campaign. The plan declares the
   live behaviour superseded; the live behaviour is still shipped.
4. **`core/product-principles.md:41` carries an unfinished instruction** to update the
   completeness plan. If the completeness plan is being superseded anyway, that instruction
   dies with it — confirm rather than assume.
5. **Auto-session-at-create is still live** (`campaign/api/endpoints.py`, per `08:53`), and
   every campaign has exactly one session for life per `06`. Any create redesign starts here.
