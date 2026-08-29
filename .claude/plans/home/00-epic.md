# Epic — Home landing page

> **Status: agreed, staged, not started.** Design conversation ran on claude.ai chat (2026-08-28),
> handed over to Claude Code the same day and reconciled against the repo.
>
> **Operating model:** this file is the epic — EVERYTHING required to deliver the Home vision
> lives here (decisions, corrections, full scope). The numbered stage plans are *extractions*
> from it: shippable chunks of a few PRs each, written in detail only when their turn comes.
> Currently extracted: [01-home-shell-and-ranked-campaigns.md](01-home-shell-and-ranked-campaigns.md),
> [02-live-panels-and-news.md](02-live-panels-and-news.md),
> [03-scheduling-and-rsvp.md](03-scheduling-and-rsvp.md) (shape only; detail follows stages 1–2),
> [04-market.md](04-market.md) (shape only; largest stage, will split further at extraction).
> Supporting docs here too: [market-legal-notes.md](market-legal-notes.md) (legal terrain),
> [media-source-asset-split.md](media-source-asset-split.md) (full implementation plan — a
> stage-4 prerequisite; Market is its main driver), and [design-mock.html](design-mock.html)
> (the interactive design contract — pixels defer to app tokens).
>
> Supersedes `TODO-home-landing-page.md` (deleted; parked 2026-08-19, absorbed here).

## Goal

Users currently cold-open on the Campaigns tab (`DashboardLayout.js` forces `?tab=campaigns`).
Replace that with a Home surface that reads the account's *state*: what's next, what's changed,
what needs me.

**Guiding principle — Home shows state, not doors.** Every panel must answer at least one of
those three questions. A panel that is only a nicer button to an existing tab is cut. Home is a
relevance cut; the Campaigns tab remains the full index and management view.

## Decision record

Agreed in the chat conversation, reconfirmed here. Do not reopen without new information.

| Item | Decision |
|---|---|
| Hero | Full-width card for the single most relevant campaign: art, title, role chip (GM/Player), session state, role-specific primary action. NOT a "Continue" button — GM initiates sessions, so the hero answers "is my game on?" |
| Ranking rule | Selects the **hero only** (revised 2026-08-28): live > next scheduled (stage 3) > last played → that one campaign is the hero. No rank-2/3 compact cards and no "N more" link — both cut; the Campaigns tab is one click away in the nav. Degrades to live > last played until scheduling exists |
| Working-on card ("Continue building") | Explicit, not dynamic: the user's most recently edited **owned** campaign (`last_edited && is_owned`). Build verbs — Assets / Notes / Workshop — plus "what was I doing" meta. Spread darkened art background (no thumbnail block; the art is flair, not content). May show the SAME campaign as the hero: different job, different CTAs (hero = play, this = build). Absent for pure players |
| Card actions | GM: Start/Resume session, Invite player. Player: Join session (enabled only when live, else "Waiting for GM"), Edit character. "Read notes" for all — see stage 1 dependency note |
| Greeting | "Welcome back, {screen_name}" + a rotating **flavor tagline** — silly, personal, templated over cheap existing fields ("{character} still hasn't forgiven you for that critical fail in {campaign} on {date_last_played}"). Pure texture: the tagline never carries status or actionable state — one actionable home per fact, and status belongs to the hero/Pulse/invite card. The live-status meta line is CUT (2026-08-28). (Adventure logs are persisted, so log-derived taglines — real nat-1s — are feasible one day; v1 is a dumb template bank) |
| Pending invites | DECIDED 2026-08-28 (refined 2026-08-29): a **card stack layered on the hero** — the invite card is **hero-sized**, dealt directly on top with a slight tilt ("a card on a card"); the hero beneath **dims and goes inert** (pointer events blocked) while an invite sits on it. Handles multiple invites natively (top card first). Never hijacks the hero ranking. Desktop-first mechanics: buttons are primary — Accept = one action (low stakes); Decline = **two-step confirm on the card** (nothing sent until confirmed — no undo infrastructure, no delayed-send); drag/swipe is a bonus affordance only |
| Pulse | Site-level ambient awareness — "what's happening on the site": friends online, players in session, now-playing music (the music line needs an api-site→api-game hot-state read; it ships when that plumbing exists). Strictly what the user is entitled to see: sessions the user isn't a member of are **never exposed** — the chat's opt-in spectate idea was rejected outright as a privacy violation (2026-08-28). A now-snapshot, not a history feed, and not in-game peeks — the fan-out in-game activity feed (nat 20s, level-ups; old `TODO-social-live-pulse.md`) was retired 2026-08-28 as too D&D-shaped for the system-agnostic direction. Quiet state must read as alive; every item actionable; sharing a user's own activity (e.g. their Spotify track) must be visible and opt-out-able. **Form (2026-08-28, ticker model 2026-08-29): a line, not a region** — breathing gold dot clamped hard left (the pulse *source*) + overlapping avatar coins + an event ticker emitting from the dot (each event a discrete quiet pill; new one slides in beside the dot, older pills slide right and dim with age, oldest drops off; width-aware cap, max 4); **a dimmer, not a switch**: intensity (breath rate, glow, coin count, text specificity) scales with **weighted activity** — a user in-session awaiting players weighs most; online and editing a character / writing notes pre-session weighs more than idling on the dashboard; merely logged in weighs least; a scheduled session drawing near raises the baseline. **No modes (2026-08-29)**: busy-ness is a continuous dial — the weighted score interpolates breath, coins, and cadence; a **live session is content, not a state**: a sticky gold pill at the head of the line carrying its own Join action, raising the activity floor while the ticker keeps flowing behind it. Calm is championed: at rest the lone pill names the next scheduled thing ("All quiet · next game Thursday 20:00"). Placement (2026-08-29): a full-width **divider** directly beneath the hero — the edge of the table; it owns a sliver of space even when quiet |
| What's new | Authored editorial news: eye-catching card (campaign-art visual language) → full-screen modal with rich content. TipTap-authored, PostgreSQL-stored. NOT release-changelog-driven, NOT a feed |
| Admin access | Env-var allowlist (`ADMIN_EMAILS` in dev/prod.env) + `require_admin` request-time dependency. No DB role column, no admin claims in JWT. Lands in stage 2 with news authoring — first feature that needs it |
| Demo campaign | **Retire it** (auto-grant in campaign endpoints). The empty-state onboarding hero becomes the real first-run experience |
| Empty state | Hero becomes onboarding card: "Create your first campaign" / wait for an invite (invites arrive via social panel; there is no join-by-code and none is planned). Later: browse the Market |
| Market | In this epic (stage 4): users publish and share fully built campaigns (setup, GM notes, media). Acquisition copies *structure* over shared media sources — files are never duplicated (prerequisite: `media-source-asset-split.md`; marginal cost is CloudFront bandwidth, not S3 storage). **Revocation: retroactive cascade** (decided 2026-08-28, the Spotify model) — a `permitted` flag on `MediaSource`: revoked sources can't be instantiated and raw media is unreadable everywhere, while instances tombstone to metadata (name, type) so campaigns degrade visibly, never silently; applies to takedown and contributor withdrawal alike. **Always free** — no money transactions; monetization would be a new epic-level decision. On Home: "Featured from the Market" card + empty-state CTA — designed now, shipped hidden, activated in stage 4. Never a "coming soon" tile. Featured selection leaning admin-curated *and provenance-vetted* (reuses stage-2 admin infra). Legal terrain + non-negotiable launch gates: `market-legal-notes.md` — safe harbour is earned by process, and the takedown process must exist before the first shared asset |
| Scheduling + RSVP | In this epic (stage 3) — the most-requested VTT capability and the ranking rule's middle slot. `scheduled_at` and RSVP are modeled **together from the start**: "3 of 5 confirmed" is the value, a bare date field is not. Activates the hero's Scheduled state ("Next session Thu 4 Sep, 20:00") and the greeting's next-session meta |
| Nav & header (revised 2026-08-29) | **No house icon** — the wordmark/logo anchors to the dashboard (standard convention; supersedes the earlier house-icon decision). No tab underlined on Home — the unmarked state IS Home. **User chip**: avatar + screen name as a rectangular button opening a menu [Account, Sign out]; the standalone logout icon is removed (users misclick it aiming for account — sign-out becomes a deliberate two-step). `SiteHeader` is shared, so this lands app-wide. Tab bar itself visually unchanged |
| Density & shape language | **Cards, not panels** — and each content type gets its own shape (2026-08-28): hero and working-on cards use the spread-art treatment (working-on moodier); the news card is the page's single **light** "noticeboard" card with **frame-breaking art** (illustration overlaps the card boundary — the mascot-ready breakout layer); Market featured is a **portrait shelf card** built around the cover; Pulse is a line, not a region. Uniform equal-weight grids are the enemy. Card meta is state-driven — `Created / Last played / Assets` management meta stays on the Campaigns tab |

**Cut (do not resurrect):** quick-actions row, owned/joined sections on Home (role is a chip;
sections belong on Campaigns tab), standalone upcoming-sessions panel, recent-notes panel,
cross-campaign activity feed, characters strip, storage meter AND conditional notice banners
(cut entirely 2026-08-28 — storage concerns live in the Library tab), the greeting status-meta
line, rank-2/3 compact campaign cards, the "N more in Campaigns" link, left sidebar, search bar.

## Page composition — agreed 2026-08-28 (design contract: `design-mock.html`)

Settled through the Stitch wireframe rounds + design conversation; column grouping revised
2026-08-29 by visual weight (news needs width to breathe; featured stays subordinate).

1. **Greeting** — "Welcome back, {screen_name}" + the flavor tagline. No status meta.
2. **Hero** — the ranked campaign, full width, state-driven, role-specific primary action.
   **Invite stack** overlays the hero when an invite is pending (dealt-card layer).
3. **Pulse divider** — the Pulse line as a full-width divider directly beneath the hero,
   hairline rules either side, so it owns a sliver of space even when quiet.
4. **Two columns, 2/5 : 3/5** — left 2/5: the **news noticeboard** (the page's single light
   card, frame-breaking art) spanning the full column height, with "Read more" anchored to
   its foot; right 3/5: **working-on** stacked over **Featured from the Market** (compact
   shelf card, hidden until stage 4). The working-on card carries the visual weight of the
   right column; featured stays low-profile beneath it.
6. **Footer** — standard links; grounds the page.
7. **Empty state variant** — hero becomes the onboarding card (create your first campaign /
   wait for an invite; Market CTA at stage 4). The real first-run experience now the demo
   campaign is retired; must be inviting through content and craft, not color/animation spam.

Per-card, not panels: session state, next-session date + RSVP count (stage 3),
new-since-last-visit line (stage 2), role chip, "your character" link (players).

## Repo corrections to the chat design

Facts the chat got wrong or couldn't know, established 2026-08-28:

- **Style tokens**: use `app/styles/colorTheme.js` — carbon `#1F1F1F`, smoke `#F7F4F3`, onyx
  `#0B0A09`, graphite `#37322F`, silver `#B5ADA6`, gold `#D9A441`. The handover's hexes were
  guesses; any mock/Stitch prompt uses the real values.
- **Session lifecycle** is INACTIVE / STARTING / ACTIVE / STOPPING / FINISHED; pause collapses to
  INACTIVE (resumable), and the expiry sweeper auto-pauses. Hero "Idle" is sometimes **Resume**,
  not Start; STARTING/STOPPING need a non-interactive rendering.
- **No first name exists** — greeting uses `user.screen_name` (may be `''`; FE already prompts).
- **In-app patch notes were removed 2026-08-28** and must not be reintroduced. What's-new is a
  new authored-content feature, not a changelog surface. Release notes remain GitHub Releases.
- **Demo campaign auto-grant** (`campaign/api/endpoints.py`, first campaigns fetch) made the
  designed empty state unreachable — hence the retire decision.
- **`CampaignSummaryResponse` has `active_sessions` but no last-played timestamp** — the one
  backend gap for the ranking rule (stage 1).

## Stage split

Rule: **infrastructure lands with the first feature that needs it, not before.** No admin
permission exists until news authoring does; no visit-tracking until the new-since-last-visit
line does.

- **Stage 1 — [Home shell + ranked campaigns](01-home-shell-and-ranked-campaigns.md).** The page
  exists, is the default landing, and renders the hero/compact/overflow ranking from data the
  app already has (plus one summary field). Includes demo retirement and the empty state.
- **Stage 2 — [Live panels + news](02-live-panels-and-news.md).** The "alive" layer: Pulse
  (friends online + your live games; the music line follows once the api-game hot-state read
  exists), What's-new (news module + TipTap authoring + admin infra), new-since-last-visit
  lines, dormant Market slots.
- **Stage 3 — [Scheduling + RSVP](03-scheduling-and-rsvp.md).** `scheduled_at` + RSVP data
  model, GM scheduling UI, player RSVP flow, and Home integration (ranking middle slot, hero
  Scheduled state, greeting meta). Shape recorded now; PR-level detail extracted after stages
  1–2 land.
- **Stage 4 — [Market](04-market.md).** Publish / browse / acquire packaged campaigns, the
  featured mechanism, and activation of Home's dormant Market slots. Shape recorded now; the
  largest stage, expected to split into multiple extraction plans when its turn comes.
  Prerequisite: [media-source-asset-split.md](media-source-asset-split.md) — one stored file,
  many cross-user instances; acquisition costs CloudFront bandwidth, not S3 storage.

## Out of scope (this epic)

- **Honorable mention — Account page redo.** The header rework (user chip → [Account,
  Sign out], logout button removed, wordmark anchoring Home) makes the account surface the
  natural next cleanup: redo `/account` in the design language this epic established (the
  mock's card shapes, tokens, chrome). This epic only re-points the entry via the chip menu;
  the account page itself is future work — recorded here so the intent isn't lost.
- **Orphaned notes surface** — notes survive campaign deletion (`campaign_id` SET NULL) and
  still have no home; the cut of the notes panel did not solve this. Recorded here so it isn't
  lost; workaround at current scale is a direct query.

## Open decisions ledger

| Decision | When |
|---|---|
| Home routing shape (`?tab=home` vs bare `/dashboard`) | Stage 1, first PR |
| Ranking computed FE-side from existing hooks vs dedicated summary endpoint | Stage 1, backend PR |
| Pulse activity-weighting signals beyond online/in-session (editing character, writing notes) — design the weight table now, feed signals as they become available | Stage 2, Pulse PR |
| TipTap image support for news (`@tiptap/extension-image` + S3 flow) | Stage 2, news PR |
| Market: user-facing naming ("Market" implies commerce — legal lean: library-style name + share/adopt verbs), audio in sharing v1 (lean: exclude), featured vetting mechanics | Stage 4 extraction, with solicitor input (`market-legal-notes.md`) |
