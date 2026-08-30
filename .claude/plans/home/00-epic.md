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
> [04-market.md](04-market.md) (shape only; largest stage, will split further at extraction),
> [05-campaign-create-and-publish.md](05-campaign-create-and-publish.md) (shape only; PARKED,
> unscheduled — the create→build→publish flow, captured 2026-08-29).
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
| Hero eligibility (added 2026-08-29) | **The session is the trigger**: a campaign heroes only if it carries a non-finished session — no session, no game, no hero slot (a START CTA against nothing makes no sense; building is a state, and a campaign being built is not yet playable). Latent today — creation auto-creates a session (`campaign/api/endpoints.py` create route), so every campaign passes — but the filter is the hook for the parked create→publish flow ([05](05-campaign-create-and-publish.md)), where the publish seal takes over session creation. Naming settled 2026-08-29: **publish** = the author's seal, nothing to do with the Market; **share** = giving to the community (stage 4) |
| Working-on card ("Continue building") | Explicit, not dynamic: the user's most recently edited **owned** campaign (`last_edited && is_owned`). Build verbs — Assets / Workshop / Campaign Editor (revised 2026-08-29: NOTES moved to the hero — notes are an active-campaign verb, not a build verb) — plus "what was I doing" meta. Spread darkened art background (no thumbnail block; the art is flair, not content). May show the SAME campaign as the hero: different job, different CTAs (hero = play, this = build). NEVER absent (revised 2026-08-29 — supersedes "absent for pure players"): with **zero owned campaigns** the card renders its **create-campaign template variant** — the home of "Create your first campaign" (NOT the hero — see Empty state) and Home's ONLY create affordance, existing only in that state. Once a user owns any campaign the card strictly mirrors the last-edited one — no create-another or switch-campaign affordance on Home (anti-bloat, refined 2026-08-29): creating more or picking a different build target is Campaigns-tab business, and the tab keeps its New Campaign button |
| Card actions | Revised 2026-08-29 (mock contract): GM — NOTES, INVITE PLAYER, START·RESUME·ENTER SESSION. Player — MANAGE CHARACTER, JOIN SESSION (enabled only when live, else "Waiting for GM"; JOIN carries the live glow). Supersedes "Edit character" and "'Read notes' for all". The notes route exists standalone (`/notes?campaign_id=`) — no dependency wait needed |
| Greeting | "Welcome back, {screen_name}" + a rotating **flavor tagline** — silly, personal, templated over cheap existing fields ("{character} still hasn't forgiven you for that critical fail in {campaign} on {date_last_played}"). Pure texture: the tagline never carries status or actionable state — one actionable home per fact, and status belongs to the hero/Pulse/invite card. The live-status meta line is CUT (2026-08-28). (Adventure logs are persisted, so log-derived taglines — real nat-1s — are feasible one day; v1 is a dumb template bank) |
| Pending invites | DECIDED 2026-08-28, **reworked 2026-08-29 (the switcheroo — supersedes the dealt-on-top version)**: the hero is NEVER occluded at rest — the hero-sized invite **tucks UNDER** the hero's bottom-right (parallel 8° slants expose a constant band; a bare gold "!" wiggles on the exposed corner: ±20°, two oscillations in 1s, 2s rest). Clicking swaps the two cards EXACTLY — the invite takes the hero's position while the hero slides into the vacated tuck slot, still a live card (no dimming; clicking its band swaps back). The tuck slot's space is permanently reserved so toggling never shifts the page. Multiple invites = a deeper under-stack, one promotion at a time. Mechanics kept: Accept = one tap; Decline = **two-step confirm on the card** (nothing sent until confirmed); drag/swipe bonus only |
| Pulse | Site-level ambient awareness — "what's happening on the site": friends online, players in session, now-playing music (the music line needs an api-site→api-game hot-state read; it ships when that plumbing exists). Strictly what the user is entitled to see: sessions the user isn't a member of are **never exposed** — the chat's opt-in spectate idea was rejected outright as a privacy violation (2026-08-28). A now-snapshot, not a history feed, and not in-game peeks — the fan-out in-game activity feed (nat 20s, level-ups; old `TODO-social-live-pulse.md`) was retired 2026-08-28 as too D&D-shaped for the system-agnostic direction. Quiet state must read as alive; every item actionable; sharing a user's own activity (e.g. their Spotify track) must be visible and opt-out-able. **Form (2026-08-28, ticker model 2026-08-29): a line, not a region** — breathing gold dot clamped hard left (the pulse *source*) + overlapping avatar coins + an event ticker emitting from the dot (each event a discrete quiet pill; new one slides in beside the dot, older pills slide right and dim with age, oldest drops off; width-aware cap, max 4); **a dimmer, not a switch**: intensity (breath rate, glow, coin count, text specificity) scales with **weighted activity** — a user in-session awaiting players weighs most; online and editing a character / writing notes pre-session weighs more than idling on the dashboard; merely logged in weighs least; a scheduled session drawing near raises the baseline. **No modes (2026-08-29)**: busy-ness is a continuous dial — the weighted score interpolates breath, coins, and cadence; a **live session is content, not a state**: a sticky gold pill at the head of the line carrying its own Join action, raising the activity floor while the ticker keeps flowing behind it. Calm is championed: at rest the lone pill names the next scheduled thing ("All quiet · next game Thursday 20:00"). Placement (2026-08-29): a full-width **divider** directly beneath the hero — the edge of the table; it owns a sliver of space even when quiet |
| What's new | Authored editorial news: eye-catching card (campaign-art visual language) → full-screen modal with rich content. TipTap-authored, PostgreSQL-stored. NOT release-changelog-driven, NOT a feed |
| Admin access | Env-var allowlist (`ADMIN_EMAILS` in dev/prod.env) + `require_admin` request-time dependency. No DB role column, no admin claims in JWT. Lands in stage 2 with news authoring — first feature that needs it |
| Demo campaign | **Retire it** (auto-grant in campaign endpoints). The empty-state onboarding hero becomes the real first-run experience |
| Empty state | REVISED 2026-08-29 (supersedes the create-first hero): **onboarding ≠ creating a campaign** — most users will be players, not GMs, so the hero never pushes creation. Hero empty state is **invite-centric** ("invites from your GM arrive right here" — literally true, the invite deck lands on this card; there is no join-by-code and none is planned). The create door is the working-on card's always-present template variant (see Working-on row). A new campaign reaches the hero via its SESSION, not its mere existence (see Hero eligibility row): today creation auto-creates the session, so it appears in both slots at once (hero to play, working-on to build); once [05](05-campaign-create-and-publish.md) hands session creation to the publish seal, the hero waits for it. Later: browse the Market |
| Market | In this epic (stage 4): users publish and share fully built campaigns (setup, GM notes, media). Acquisition copies *structure* over shared media sources — files are never duplicated (prerequisite: `media-source-asset-split.md`; marginal cost is CloudFront bandwidth, not S3 storage). **Revocation: retroactive cascade** (decided 2026-08-28, the Spotify model) — a `permitted` flag on `MediaSource`: revoked sources can't be instantiated and raw media is unreadable everywhere, while instances tombstone to metadata (name, type) so campaigns degrade visibly, never silently; applies to takedown and contributor withdrawal alike. **Always free** — no money transactions; monetization would be a new epic-level decision. On Home: "Featured from the Market" card + empty-state CTA — designed now, shipped hidden, activated in stage 4. Never a "coming soon" tile. Featured selection leaning admin-curated *and provenance-vetted* (reuses stage-2 admin infra). Legal terrain + non-negotiable launch gates: `market-legal-notes.md` — safe harbour is earned by process, and the takedown process must exist before the first shared asset |
| Scheduling + RSVP | In this epic (stage 3) — the most-requested VTT capability and the ranking rule's middle slot. `scheduled_at` and RSVP are modeled **together from the start**: "3 of 5 confirmed" is the value, a bare date field is not. Activates the hero's Scheduled state ("Next session Thu 4 Sep, 20:00") and the greeting's next-session meta |
| Nav & header (revised 2026-08-29) | **No house icon** — the wordmark/logo anchors to the dashboard (standard convention; supersedes the earlier house-icon decision). No tab underlined on Home — the unmarked state IS Home. **User chip**: avatar + screen name as a rectangular button opening a menu [Account, Sign out]; the standalone logout icon is removed (users misclick it aiming for account — sign-out becomes a deliberate two-step). `SiteHeader` is shared, so this lands app-wide. **Superseded 2026-08-29: the tab bar is RETIRED outright** — replaced by the app-select launcher (9-dot; 2×2 grid + WORKSHOP tool section); "tab bar visually unchanged" and "no tab underlined on Home" no longer apply — there is no tab bar |
| Density & shape language | **Cards, not panels** — and each content type gets its own shape (2026-08-28): hero and working-on cards use the spread-art treatment (working-on moodier); the news card is the page's single **light** "noticeboard" card with **frame-breaking art** (illustration overlaps the card boundary — the mascot-ready breakout layer); Market featured is a **portrait shelf card** built around the cover; Pulse is a line, not a region. Uniform equal-weight grids are the enemy. Card meta is state-driven — `Created / Last played / Assets` management meta stays on the Campaigns tab. (2026-08-29: the spread-art treatment matured into the 8° plate/seam shape language, and featured became a narrow stepped rect, still cover-forward — see the composition amendments) |

**Cut (do not resurrect):** quick-actions row, owned/joined sections on Home (role is a chip;
sections belong on Campaigns tab), standalone upcoming-sessions panel, recent-notes panel,
cross-campaign activity feed, characters strip (**un-cut 2026-08-29** — returned as the
"Your characters" hand-of-cards row, the one deliberate resurrection), storage meter AND
conditional notice banners
(cut entirely 2026-08-28 — storage concerns live in the Library tab), the greeting status-meta
line, rank-2/3 compact campaign cards, the "N more in Campaigns" link, left sidebar, search bar.

## Page composition — agreed 2026-08-28, revised through the live mock session 2026-08-29
(design contract: `design-mock.html`)

Settled through the Stitch wireframe rounds + design conversation, then evolved live in the
mock (the amendments block below is the delta log). Section labels are small h3s on the page
ground OUTSIDE the cards (Updates / Continue building / Featured from the Market / Your
characters).

1. **Greeting** — "Welcome back, {screen_name}" (nav face) + the flavor tagline sharing one
   line with the page clock (date · time, right-aligned, blinking colon). No status meta.
2. **Hero** — the ranked campaign, full width, state-driven, TOP-aligned text,
   role-conditional actions. A pending **invite TUCKS UNDER** the hero's bottom-right
   (wiggling "!" on the exposed corner); clicking runs the switcheroo — the two cards trade
   places exactly, no dimming.
3. **Pulse divider** — the Pulse line as a full-width divider directly beneath the hero,
   hairline rules either side, so it owns a sliver of space even when quiet. The invite's
   tuck slot is permanently reserved above it (no layout shift on toggle).
4. **Two columns, 2/5 : 3/5** — left 2/5: the **news noticeboard** (the page's single light
   card; frame-breaking 21:9 banners top/bottom, per-post optional; like counter as the CTA
   beside the date; NEW! chip in the section header) spanning the full column height, READ
   MORE always above the bottom banner; right 3/5: **working-on** (hero-height plate)
   stacked over **Featured from the Market** (narrow stepped rect, cover-forward, VISIBLE
   placeholder until stage 4) pinned to the column foot — the slack opens between them.
5. **Your characters** — a hand of free rounded-8°-parallelogram character cards below the
   grid (added 2026-08-29; the Cut list's one deliberate resurrection).
6. **Footer** — standard links; grounds the page.
7. **Empty state variant** (revised 2026-08-29) — the hero becomes an invite-centric
   onboarding card (no create push; the invite deck lands here), while the working-on slot
   renders its create-campaign template — the always-present build door (Market CTA at
   stage 4). The real first-run experience now the demo campaign is retired; must be
   inviting through content and craft, not color/animation spam.

Per-card, not panels: session state, next-session date + RSVP count (stage 3), role chip,
"your character" link (players). (New-since-last-visit lines killed 2026-08-29 — see 02.)

### Composition amendments — 2026-08-29 delta log

The list above now reflects the 2026-08-29 session; this block records the major deltas from
the 2026-08-28 original, for history. **`design-mock.html`'s header comment remains the
authoritative design record** — where any prose and the mock disagree, the mock wins:

- **Chrome**: tab bar RETIRED → app-select launcher (9-dot button; panel = 2×2 grid
  [Campaigns, Characters, Library, Market] + a WORKSHOP tool section replacing the workshop
  index view). Top bar: wordmark · launcher · social · account.
- **Invite stack reworked**: the hero is never occluded — a pending invite TUCKS UNDER the
  hero's bottom-right (bare wiggling "!" on the exposed corner); clicking runs the
  SWITCHEROO (the two cards trade places exactly); no dimming. The tuck slot's space is
  permanently reserved so toggling never shifts the page.
- **The 8° shape language**: dark cards are slanted plates (square left face, full 8° right
  face), art seams before midline with 98° contact shadows, chips/CTAs/pills as rounded
  parallelograms; the featured card is a NARROW RECT stepped under the working card's slant
  terminus; news card + pulse rule deliberately level.
- **"Your characters" row added** below the grid: a HAND of free-standing rounded 8°
  parallelogram cards (28px overlap, first on top; hover lifts the card — **Home-only,
  decided 2026-08-29: the Characters tab strip keeps its existing hover**) — replaced the
  CharacterManager tray port. Zero-dependency (portraits pipeline exists).
- **Greeting row**: page clock (date · time, blinking colon) shares the tagline's line.
- **Updates card**: full-width frame-breaking banners top/bottom (per-post optional; art
  contract 21:9, letterbox never crop), like counter IS the CTA beside the date, NEW! chip
  in the UPDATES section header, READ MORE always above the bottom banner.
- **Hero**: text top-aligned; role-conditional actions incl. MANAGE CHARACTER (player);
  green = live (dot + rotating white-glint glow ring on the CTA, gold track); the working
  card is hero-height (300px) with the slack opening above the featured card.
- **Featured slot ships as a VISIBLE placeholder** (decision 2026-08-29 — supersedes
  "hidden until stage 4" above and 02's dormant-slot hiding); activates in stage 4.
- **No compact rank-2/3 cards in the mock** — consistent with the decision record ("hero
  only", cut 2026-08-28); plan 01's stale ranking text was corrected 2026-08-29.

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
  backend gap for the ranking rule (stage 1). (Audit 2026-08-29: worse — the field is
  hardcoded `0`; full ground truth in [dependency-audit.md](dependency-audit.md).)

## Stage split

Rule: **infrastructure lands with the first feature that needs it, not before.** No admin
permission exists until news authoring does; no read tracking until the news NEW! receipt
does. (New-since-last-visit campaign lines were killed 2026-08-29 — see 02.)

- **Stage 1 — [Home shell + ranked campaigns](01-home-shell-and-ranked-campaigns.md).** The page
  exists, is the default landing, and renders the hero/compact/overflow ranking from data the
  app already has (plus one summary field). Includes demo retirement and the empty state.
- **Stage 2 — [Live panels + news](02-live-panels-and-news.md).** The "alive" layer: Pulse
  (friends online + your live games; the music line follows once the api-game hot-state read
  exists), What's-new (news module + TipTap authoring + admin infra), Market slot placeholder.
- **Stage 3 — [Scheduling + RSVP](03-scheduling-and-rsvp.md).** `scheduled_at` + RSVP data
  model, GM scheduling UI, player RSVP flow, and Home integration (ranking middle slot, hero
  Scheduled state, greeting meta). Shape recorded now; PR-level detail extracted after stages
  1–2 land.
- **Stage 4 — [Market](04-market.md).** Publish / browse / acquire packaged campaigns, the
  featured mechanism, and activation of Home's dormant Market slots. Shape recorded now; the
  largest stage, expected to split into multiple extraction plans when its turn comes.
  Prerequisite: [media-source-asset-split.md](media-source-asset-split.md) — one stored file,
  many cross-user instances; acquisition costs CloudFront bandwidth, not S3 storage.
- **Parked — [Campaign create + publish](05-campaign-create-and-publish.md).** Shape only,
  unscheduled; v1 known-thin (save-without-publish + a publish button over the existing
  create form). Records the publish-is-a-seal concept (publish ≠ share) and the
  create→build→publish flow; step 1's session-triggered hero eligibility is its shipped
  groundwork.

## Delivery sequence (pecking order — decided 2026-08-29)

Ordered by minimal dependencies + least blast radius, informed by the
[dependency audit](dependency-audit.md). Each step pairs a dependency with its consumer —
nothing ships orphaned. (This sequences delivery ACROSS the stages above; stage docs keep
owning their scope.)

1. **Home shell + route flip.** `/dashboard` = Home (delete the forced `?tab=campaigns`
   redirect — the tab URLs already work), greeting + clock, user-chip chrome rework
   (wordmark → home anchor, account dropdown, logout removal), cards rendering the data
   that already exists — campaign art, titles, role chip, last-edited, AND the characters
   hand (zero-dependency: portraits pipeline exists). REVISED 2026-08-29 at implementation
   (extraction: [implementation/step-01-home-shell.md](implementation/step-01-home-shell.md)):
   the hero ships TRUE live/idle state + in-place START/RESUME — the sweep found
   `useCampaigns` already fans out per-campaign sessions, so the "placeholder live dot" was
   underselling data the client holds; hero eligibility is session-triggered from day one
   (decision record); and the **invite tuck/switcheroo is pulled forward from step 5**
   (mutations, events, and the socket→query-invalidation bridge all exist). Honest
   placeholders narrow to the truly unserved: next-session line, seat count, pulse, news,
   market. Includes the empty states (invite-centric onboarding hero — no create push, the
   build door is the working-on template; still unmocked, small design task first;
   zero-characters hand); the no-art plate look is the mock's CSS gradient bases (decision
   2026-08-29 — always painted, art overlays when ready, no fallback images). Demo
   retirement rides along.
2. **Launcher + tab bar removal.** One PR: app-select menu in, TabNav out, `tab=account`
   dead-end fixed, orphaned `SessionsManager.js` deleted. Safe after 1 because all `?tab=`
   URLs keep working — only the entry chrome changes. Carries the workshop deep-link
   decision (tool items open with media context vs at their own pickers).
3. **Truth PRs** (backend, near-zero UI blast; can run parallel to 1–2).
   **`last_played_at` SHIPPED EARLY in step 1's PR (2026-08-30)** — the hero's ranking
   fallback was the feature that needed it, per the infra-lands-with-its-feature rule.
   Delivered as: a `campaigns.last_played_at` column stamped by `mark_played()` when a
   session goes live, backfilled from `MAX(sessions.started_at)`, exposed on both campaign
   responses, and consumed by the hero comparator + the Campaigns tab's "Never" display
   (a shipped defect, now fixed). Shipped alongside it: **`onupdate=func.now()` removed
   from `campaigns.updated_at`** (Matt, 2026-08-30) so commands — not the ORM — decide
   when a campaign was edited; the aggregate already stamped every real mutation, making
   the ORM hook a redundant implicit second source.

   Still outstanding here:
   - **`active_sessions`** — audit finding 2026-08-30: **nothing reads it**, in any
     frontend file. So the `active_session_id` replacement would be orphaned
     infrastructure; the honest treatment is deleting the dead hardcoded int. (Home reads
     liveness from the embedded sessions array instead.) Decide at extraction.
   - **The live seat count** (`active_session_members` fed from api-game) — unchanged,
     still needs its own scoping incl. the api-game unauthenticated-HTTP constraint.
4. **Scheduling + RSVP** (stage 3, promoted 2026-08-29: it hangs off aggregates that
   already exist and unblocks everything downstream). `scheduled_at` + RSVP together per
   the 03 non-negotiable.
5. **Hero completes its states** (narrowed 2026-08-29 — step 1 took live/idle truth,
   in-place START/RESUME, role-conditional actions, and the invite tuck/switcheroo).
   Remaining here: the scheduled state (date + confirmed count), the seat count ("N at
   the table", from step 3), and the ranking upgrade (live > scheduled > `last_played_at`).
   Needs 3 + 4.
6. **Tagline template bank** — small, pure texture, any time after 1.
7. **News vertical** — admin infra → news module → authoring → Home card + likes + NEW!
   read receipt. Self-contained.
8. **Pulse** — in two deliberate releases (framing agreed 2026-08-29): **v1** wires what
   the social tab already reads — friends online + live games, poll-based, zero new
   dependencies — and is a complete shippable feature in its own right. **v2 is the MVP
   we're aiming for**: the new parts — activity signals ("editing their character",
   "writing notes"), the client→server reporting channel, the broadcast transport, the
   full weighted dial — shipped whole per the infra-lands-with-its-feature rule. The
   music line follows separately per 02. By v1 the calm pill already has a real schedule
   to name.

Market stays placeholded throughout (a VISIBLE placeholder — decision 2026-08-29 —
activated in stage 4).

## SHIPPED — delivery steps 1 & 2 (2026-08-29 → 2026-08-30)

> Branch `feature/home-page-shell`, commits `09ea0dd`, `8ca1d48`, `640eb29`, `98b6ee0`.
> Extraction plans: [implementation/step-01-home-shell.md](implementation/step-01-home-shell.md)
> and [implementation/step-01b-session-slice-and-game-vocab.md](implementation/step-01b-session-slice-and-game-vocab.md).
>
> **Nothing above this section has been edited to match** — the plans record what we
> intended and when, this section records what actually shipped. Where they disagree, this
> section is the newer truth and the divergence is deliberate history.

### Delivery step 1 — Home shell + route flip (plan 01: all four acceptance criteria met)

- **Route flip**: bare `/dashboard` is Home; the forced `?tab=campaigns` redirect is gone.
  Every `?tab=` URL still resolves, and all 11 external writer call sites were untouched.
- **Chrome**: wordmark anchors Home (later replaced by `tabletop-logo-w.png`); house icon
  and standalone logout button removed; user chip opens [Account, Sign out].
- **Home surface**: greeting + live clock, hero card, working-on card, characters hand,
  and honest placeholders for pulse / news / market. 8° plate geometry extracted to a
  shared module deriving every clip, seam and contact shadow from one angle.
- **Gold is an official token** (`COLORS.gold`, `--gold`, Tailwind `gold`), with
  `FAVORITE_COLOR` and `--favorite` aliasing it.
- **Demo campaign retired**: auto-grant block and `has_received_demo` removed end-to-end,
  column dropped.

**Delivered ahead of plan** (both approved in-flight):
- **Hero ships genuinely state-aware** — true live/idle from the sessions the client
  already holds, plus in-place START/RESUME, rather than plan 01's placeholder live dot.
- **Invite deck with tuck + switcheroo landed here**, pulled forward from step 5, because
  the mutations, events and socket→query-invalidation bridge already existed.

**Added at implementation, not in any plan:**
- **Hero eligibility is session-triggered** — a campaign with no live-able session cannot
  hero (decision record row added). Groundwork for
  [05-campaign-create-and-publish.md](05-campaign-create-and-publish.md).
- **`create_campaign=1` param** opening the existing create modal, mirroring the
  `expand_campaign_id` pattern.

### Phase D — session slice + vocabulary (added mid-flight 2026-08-30)

- `session_model.py` moved from `campaign/model/` into `modules/session/model/`.
- Create-session endpoint moved to **`POST /api/sessions/`** (was `/api/campaigns/sessions`).
- **`active_game_id` retired entirely** — column, aggregate field, event payload key and
  both FE readers. `status == ACTIVE` is the receipt; `session.id` is the address. Start
  now asserts api-game echoes our session id, turning an implicit contract into a tripwire.
- **`updated_at` proxy fix**: session create/delete no longer write the campaign row, so
  session lifecycle stops moving the working-on card's "last edited".
- Dead `GameInvites` / `InviteStatus` phantom deleted; conftest fixtures renamed off
  games-era vocabulary; superseded comments cleared.
- **CLAUDE.md gained a "Game vs Session" boundary section** recording the semantic rule.

### Pulled forward from step 3 (truth PRs)

- **`campaigns.last_played_at`** — column, `mark_played()` stamped when a session goes
  live, backfilled from `MAX(sessions.started_at)`, exposed on both campaign responses.
  The hero now ranks on real play recency; the Campaigns tab's permanent "Never" (a
  shipped defect) is fixed as a side effect.
- **`onupdate=func.now()` removed from `campaigns.updated_at`** — commands own the
  timestamp, not the ORM. This is what made the new column safe to write.
- `screen_name` bounded to `varchar(30)`, matching the limit the aggregate always
  enforced, surfaced in all three FE inputs with live counters.

### Delivery step 2 — launcher + tab bar retirement

- **App-select launcher**: 9-dot button, 2×2 surface grid, and a WORKSHOP section whose
  tool entries read from the workshop's own `TOOLS`/`TOOL_ROUTES` so they can never drift
  from the index. **Revised: the workshop index is KEPT** as a destination (the section
  header opens it) — supersedes the plan's "REPLACES the workshop index view".
- **`TabNav.js`, `SubNav.js` and the orphaned `SessionsManager.js` deleted.**
- **`tab=account` dead-end fixed** — those notification types route to `/account`.
- Launcher marks the surface you're already on (white label + gold diamond) without
  disabling it; the 9-dot glyph is a hand-drawn SVG of nine diamonds — a documented
  exception to the Font-Awesome rule, since FA Free has no 3×3 dot grid.

### Chrome work beyond the epic's scope (2026-08-30)

Undertaken on Matt's direction during QA; the epic's "Account page redo is future work"
entry is knowingly overtaken in part.

- **`UserChrome`** — user identity as an 8° capsule (name on the dark face, identity
  colour full-bleed into the slanted end, presence pip as a corner chip). Replaced
  `UserDisc` in the header chip, social friend + request rows, and `FriendsManager`.
  `UserDisc` survives for the one genuine circle use (the 16px lookup result).
- **Account page restructured**: profile capsule, email/account-id as stacked meta
  plates, identity colour moved up and its swatches rebuilt as 8° cards.
- **Social panel**: add-friend, copy-tag, input and both CTAs reshaped as parallelograms;
  copy-tag promoted from hint to control.
- **Long-standing bug fixed** — the social panel now closes on outside click. It listens
  on `pointerdown`, not `mousedown`, because Headless UI cancels `pointerdown` on its menu
  buttons, which suppresses the synthesised `mousedown` entirely.
- `Dropdown` gained `compact` / `panel` skins, deliberately decoupled so header styling
  never reaches the notes editor's menus.

### Known deferred / not shipped

- **Pause is deliberately absent from the hero** — it needs game-runtime support and still
  lives in the Campaigns tab. Not an oversight. That support is now scoped as
  [TODO-in-game-pause.md](TODO-in-game-pause.md) (high priority, 2026-08-30).
- **Focus-visible rings are suppressed** on all three header controls. Restoring them
  properly needs shape-following rings, not the browser default rectangle.
- **Unexercised QA**: reduced-motion behaviour, horizontal scroll at narrow widths, and
  the "Nothing at the table yet" hero variant (needs a campaign whose sessions are all
  FINISHED — its copy is also unreviewed).
- **`active_sessions`**: audit found nothing reads it. Recommendation is deletion rather
  than the planned `active_session_id` replacement — see step 3 above.

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
| Ranking computed FE-side from existing hooks vs dedicated summary endpoint | Stage 1, backend PR |
| Workshop launcher items: deep-link with media context vs open at own pickers | Step 2 (launcher PR) |
| Create-card ghost shadow (mock: none — "a card that isn't real yet casts none") — confirm or revert with real card art | Step 1 dev QA |
| Pulse activity-weighting signals beyond online/in-session (editing character, writing notes) — design the weight table now, feed signals as they become available | Stage 2, Pulse PR |
| TipTap image support for news (`@tiptap/extension-image` + S3 flow) | Stage 2, news PR |
| Market: user-facing naming ("Market" implies commerce — legal lean: library-style name + share/adopt verbs), audio in sharing v1 (lean: exclude), featured vetting mechanics | Stage 4 extraction, with solicitor input (`market-legal-notes.md`) |
