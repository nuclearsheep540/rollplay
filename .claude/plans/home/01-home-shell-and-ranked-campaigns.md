# Stage 1 — Home shell + ranked campaigns

> Part of the [Home landing page epic](00-epic.md). Goal: Home exists, is the default landing,
> and renders campaign *state* from data the app already has. No new infrastructure beyond one
> field on an existing response. Design decisions marked open are made during this stage's
> design pass, not up front.

## Outcome

A returning user lands on Home and can answer "is my game on, and what do I do next?" without
clicking anything. A new user lands on an onboarding hero instead of an auto-granted demo
campaign.

## Design pass — COMPLETE (2026-08-28)

Three Google Stitch wireframe rounds ran on 2026-08-28 (screenshots in the conversation; Stitch
decayed by round 3 and was retired). The design contract is the committed interactive mock:
[design-mock.html](design-mock.html) — pixels defer to app tokens (`app/styles/colorTheme.js`:
carbon `#1F1F1F`, smoke `#F7F4F3`, gold `#D9A441`). Typography settled 2026-08-29: TWO faces —
Metamorphous (the nav face) for greeting + all card titles, Inter for everything else (Cinzel
only on placeholder book-cover art; the earlier "display serif for titles" is superseded).
Decisions from the pass and the 2026-08-29 live session are folded into the epic's decision
record and page composition.

## Page composition (stage-1 scope)

1. Greeting: "Welcome back, {screen_name}" + the flavor tagline (template bank over existing
   fields — character name, campaign, last-played; no status meta). `screen_name` may be `''`
   — degrade gracefully.
2. Hero: the ranked campaign (live > last played until scheduling), full width, art background,
   role chip, session state, role-specific primary action.
3. Working-on card ("Continue building"): most recently edited owned campaign, hero-height
   plate with the 8° art seam, ASSETS / WORKSHOP / CAMPAIGN EDITOR actions (NOTES moved to
   the hero 2026-08-29), last-edited meta top-right.
4. Invite stack: pending invite TUCKS UNDER the hero (switcheroo on click — see the epic's
   decision record); Accept one-tap, Decline two-step confirm on the card.
5. "Your characters" hand-of-cards row below the grid (zero-dependency — portraits pipeline
   exists; added to stage-1 scope 2026-08-29).
6. Empty state variant when the user has no campaigns.

Not in stage 1: Pulse, What's new, Market slots, scheduling fields — the right ("knowing")
column arrives in stage 2.

## Ranking rule (stage-1 form)

Eligibility first (added 2026-08-29, epic decision record): a campaign heroes only if it
carries a **non-finished session** — the session is the trigger (latent today since
creation auto-creates one; the hook for [05-campaign-create-and-publish.md](05-campaign-create-and-publish.md)).
Then rank the eligible: **live first** (via `active_session_id`), then **last
played, most recent first**. The ranking selects the **hero only** — no rank-2/3 compact
cards and no "N more" link (both cut at epic time 2026-08-28, decision record; this file's
earlier "ranks 2–3 → compact cards" text was stale and corrected 2026-08-29 — the Campaigns
index, one launcher click away, is the overflow). (The scheduled slot joins the rule in
stage 3 — write the ranking comparator so inserting it is an extension, not a rewrite.)

## Session-state → hero/card mapping

| Session status | Player sees | GM sees |
|---|---|---|
| ACTIVE | "Session in progress · N at the table" + **Join session** (primary) | Re-enter session |
| STARTING / STOPPING | non-interactive "Starting… / Ending…" | same, non-interactive |
| INACTIVE (resumable session exists) | Join disabled — "Waiting for GM" | **Resume session** |
| No session / FINISHED only | Join disabled — "Waiting for GM" | **Start session** |

## PR sketch

### PR 1 — Home shell, greeting, empty state, demo retirement
- Home surface + default landing (**decided 2026-08-29:** bare `/dashboard` IS Home — remove
  the forced `?tab=campaigns` redirect at `DashboardLayout.js:44-56`; every `?tab=` URL keeps
  pointing at its existing index view).
- Chrome rework (lands app-wide — it's the shared header): remove the Home link and the
  standalone logout button; wordmark becomes a `Link` to `/dashboard`; add the **user chip**
  (avatar + `screen_name`, rectangle button) opening a Headless UI Dropdown with
  [Account → `/account`, Sign out].
- **TabNav retirement → app-select launcher** (decided 2026-08-29; contract in the mock): the
  tab bar goes away; a 9-dot launcher in the top bar opens a panel — 2×2 grid [Campaigns,
  Characters, Library, Market] + a WORKSHOP section whose tool line items REPLACE the workshop
  index view. The pattern that keeps this cheap (Matt, 2026-08-29): launcher entries navigate
  to the SAME `/dashboard?tab=…` index views — the 11 external `?tab=` writer call sites
  (7 files) keep working unchanged; only the entry chrome changes. Full touchpoint inventory:
  [dependency-audit.md](dependency-audit.md) §9. While in there: fix the `tab=account`
  dead-end (eventConfig.js emits a tab that VALID_TABS doesn't know → empty content area) and
  delete the orphaned `SessionsManager.js`. Launcher labels must match real tools: **Image
  Config** (not "Image Editor"); NPC Barracks / Scene Builder render disabled via the
  existing "Soon" badge pattern (`WorkshopToolNav.js`). **Icons are Font Awesome in the
  build** (decision 2026-08-29 — applies generally, not just here); the mock's hand-drawn
  SVGs are placeholders only.
- Greeting + flavor tagline: a small template bank rendered over existing fields (character
  name, campaign title, last-played date). Pure texture — never status. (Adventure logs are
  persisted, so log-derived lines are a possible future upgrade; not now.)
- Empty-state onboarding hero (revised 2026-08-29): invite-centric — no create push on the
  hero (most users are players); the create door is the working-on card's template variant,
  whose CTA opens the existing create modal via a new `create_campaign=1` param. (Market
  CTA slot designed, hidden.)
- **Retire the demo campaign**: remove the auto-grant block in
  `modules/campaign/api/endpoints.py` (`has_received_demo` check in the campaigns list
  endpoint). Drop the `has_received_demo` column via autogenerated Alembic migration in the same
  PR (delete superseded code, don't strand it).

### PR 2 — Ranking data → MOVED (2026-08-30)

This section previously duplicated the epic's delivery-sequence **step 3, "Truth PRs"**,
in full — same three items (`active_session_id`, `last_played_at`, live seat count),
two documents, two numbering schemes. The epic's delivery sequence is the sequencing
authority, so the detail now lives there ONLY:
[00-epic.md → Delivery sequence, step 3](00-epic.md#delivery-sequence-pecking-order--decided-2026-08-29).

Ranking stays computed FE-side from the existing dashboard hooks (unchanged: zero new
endpoints).

### PR 3 — Hero + working-on card + invite stack
- Hero card component (state-driven, per the mapping above), spread-art treatment.
- Working-on card: `max(updated_at)` over owned campaigns (`updated_at` already on the
  summary), hero-height plate with the 8° art seam, ASSETS / WORKSHOP / CAMPAIGN EDITOR
  actions, last-edited meta top-right. Shown even when it's the same campaign as the hero
  (different job, different CTAs); never absent (revised
  2026-08-29 — supersedes "absent for pure players"): with zero owned campaigns it
  renders the create-campaign template variant — Home's only create affordance, in that
  state only. With any owned campaign it strictly mirrors the last-edited one; creating
  more or switching build targets stays on the Campaigns tab (anti-bloat).
- Role chip: Game Master when `campaign.host_id == user.id`, else Player (full words, not
  "GM" — mock 2026-08-29).
- Role actions (mock contract 2026-08-29): GM — NOTES, INVITE PLAYER, START·RESUME·ENTER
  SESSION (live CTA carries the rotating white-glint glow, gold track); Player — MANAGE
  CHARACTER, JOIN SESSION (live only, same glow; else "Waiting for GM").
- NOTES action: resolved — the standalone `/notes?campaign_id=` route exists and is
  dashboard-reachable (audit 2026-08-29); the hero action points there. No dependency wait.
- Invite stack: TUCK-UNDER + SWITCHEROO per the epic's decision record (hero never occluded;
  wiggling "!" on the exposed corner; click swaps the cards exactly; no dimming). Accept
  fires immediately; Decline snaps to an in-card confirm state and only the confirm sends.
  Buttons primary, drag as bonus. Multiple invites: deeper under-stack, one promotion at a
  time.

## Acceptance

- Login lands on Home; the wordmark anchors it; the tab bar is gone (app-select launcher in
  the top bar — no house icon exists, superseded 2026-08-29).
- One-or-two-campaign user (the typical case): hero answering "is my game on?" and the
  working-on card answering "where was I building?" — even when both are the same campaign;
  Campaigns tab unchanged as the full index.
- Live session appears as hero within one refresh cycle with a working Join/Re-enter.
- Brand-new user sees the onboarding hero — and no demo campaign anywhere.
