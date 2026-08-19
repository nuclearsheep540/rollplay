# TODO — "Home" landing page (account-level overview)

> **Status: parked idea, raised 2026-08-19 during notes R&D.** Not scheduled, not costed. Recorded
> because reasons to want it are starting to accrue from unrelated features.

## The idea

The dashboard currently drops users straight into **Campaigns** — `DashboardLayout.js:51` forces
`tab=campaigns` as the default, and the nav is a flat five (`campaigns`, `characters`, `library`,
`workshop`, `market`, `DashboardLayout.js:32-36`). That is a cold open: the first thing a returning
user sees is a management screen, not their account.

A **Home** tab would be the landing surface instead — a holistic read of your account:

- recent campaigns (and their next/last session)
- last-played characters
- recent library uploads
- **notes** (see below)
- patch notes / news — a channel to actually communicate with users, which we currently have none of

## Why it's a TODO and not v1

It is a big change in *surface*, even though it is close to zero change in *data*. Everything listed
above already has an endpoint: campaigns, characters and library are all fetched by existing
dashboard hooks, and `rollplay/patch_notes/` already holds versioned markdown that ships with the
app. So this is largely a UI/composition exercise — but "largely" is doing real work, and it needs a
design pass, not just a route.

## Relationship to notes

Notes v2 (reading/writing notes outside a live session) has no obvious home today:

- **Workshop** is GM-relative; notes are for every user.
- **Library** is rich media (S3 binaries, uploads). Users will not look for a text journal there —
  the context clue points the wrong way.
- **Account** would work but buries it; features put in settings get found once.
- A **sixth top-level tab** was considered and rejected — notes for a campaign are too low-level for
  top-level navigation.

Home is the natural answer, and it also solves the one case a campaign-drawer button cannot: notes
whose campaign has been **deleted**. Notes survive campaign deletion by design (`campaign_id` is
`SET NULL`, with `campaign_name` stamped on the note at creation), so orphaned notes need a surface
that is not inside a campaign. An "archived notes" group on Home is that surface.

**Explicitly: notes v2 must not depend on this.** If Home slips, notes v2 ships in the campaign
drawer alone and the archive waits. Keep them independently shippable. Interim workaround for
orphaned notes at current scale (~7 production users) is a direct PostgreSQL query.

## Out of scope / open

- Whether Home replaces Campaigns as the default tab or sits alongside it.
- Whether "news" is authored content (a CMS-ish thing) or just the existing patch-notes markdown
  surfaced differently. Strong preference for the latter until there is a reason otherwise.
- Layout/design — nothing has been drawn. Repo convention for a design contract is an interactive
  mock committed next to the plan (see `.claude/plans/library_v2/design-mock.html`).
