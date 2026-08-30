# Implementation — Delivery step 1: Home shell + route flip

> **STATUS 2026-08-29: built, awaiting dev QA.** All three phases are in the working tree on
> `feature/home-page-shell`; production build and dev-server compile both clean; the
> `has_received_demo` migration is applied to dev. Nothing committed — Matt runs git.
>
> Deviations from the plan below, all deliberate:
> - `PlateButton.js` and `HomeOnboardingHero.js` were added to the file list (the CTA
>   parallelogram repeats 10+ times across three cards; the onboarding hero needed its own
>   component rather than a branch inside the hero card).
> - The demoted card's actions go inert via a `.home-deck-demoted button` CSS rule instead
>   of a threaded `actionsEnabled` prop — same behaviour, no prop drilling.
> - `openNewCampaignForm` was extracted in `CampaignManager.js` so the create tile and the
>   new `create_campaign=1` param share one form-reset definition instead of two literals.
> - Hero START/RESUME disables on the session's own transitional states, matching the
>   drawer's per-campaign guard rather than the cross-campaign one the plan guessed at.
>
> **Phase D added 2026-08-30** (same PR, strike-while-hot): session slice correction +
> game-vocabulary cleanup + the `updated_at` proxy fix —
> [step-01b-session-slice-and-game-vocab.md](step-01b-session-slice-and-game-vocab.md).

> Extracted 2026-08-29 from [00-epic.md](../00-epic.md) delivery sequence step 1 and
> [01-home-shell-and-ranked-campaigns.md](../01-home-shell-and-ranked-campaigns.md), against a
> fresh code sweep (file:line evidence below). Design contract:
> [design-mock.html](../design-mock.html) — where prose and mock disagree, the mock wins.
> Scope confirmed by Matt 2026-08-29: route flip + shell + plumbing + chrome rework +
> characters hand + empty states + demo retirement, **plus the invite tuck/switcheroo**
> (pulled forward from step 5 — the invite plumbing is complete end-to-end: mutations,
> events, and the WebSocket→query-invalidation bridge). Stretch (pace permitting): delivery
> step 2, the app-select launcher — outline at the bottom, extracted properly if we commit.
>
> Out of scope tonight (per epic sequencing): scheduling anything (step 4), truth PRs
> (step 3), tagline bank (step 6), news/pulse/market as real features (steps 7–8), seat
> counts ("N at the table" — no data source until step 3).
>
> **All decisions D1–D8 settled by Matt 2026-08-29** — the table at the bottom records the
> outcomes; the sections below are written to them.

## Ground truth from the sweep (what changes the stage plans' assumptions)

Facts established 2026-08-29 that refine (never contradict) the epic:

1. **Auth already lands on bare `/dashboard`.** `auth/verify/page.js:42`, `auth/magic/page.js:49,206`
   all `router.push('/dashboard')`. The ONLY thing forcing `?tab=campaigns` is the mount
   effect at `DashboardLayout.js:44-56`. The flip is mostly deletion.
2. **The FE already has per-campaign session state.** `useCampaigns.js:74-95` fans out to
   `/api/sessions/campaign/{id}` and embeds a `sessions` array on every joined campaign —
   CampaignManager derives active sessions from it today (`CampaignManager.js:1384-1385`).
   The audit's "live state unserved" verdict applies to the summary *field*
   (`active_sessions` hardcoded 0), not to what the FE actually holds. The hero can render
   true live/idle state in step 1 at ~zero cost. **Recommended upgrade over the epic's
   "placeholder live dot" — decision D1 below.**
3. **Font Awesome and both faces are already in the build.** `@fortawesome/*` v7 in
   package.json; Metamorphous + Inter loaded as next/font variables (`--font-metamorphous`,
   `--font-inter`, `app/layout.js:7-39`). The mock's hand-drawn SVGs and Google-Fonts link
   translate to existing infrastructure.
4. **No gold token exists.** `COLORS` is carbon/smoke/onyx/graphite/silver only
   (`colorTheme.js:10-16`); `#D9A441` lives as `FAVORITE_COLOR` (`colorTheme.js:67`) and
   `--favorite` (`globals.css:101`). Home leans on gold everywhere → promote it (D4).
5. **`SiteHeader` has exactly one consumer** — `(authenticated)/layout.js:66` (with
   `showHome={false}`). After the chrome rework nothing renders the house icon: the
   `showHome` prop and its `faHouse` import become fully dead. Delete them.
6. **Every bare-`/dashboard` navigator is labelled "Dashboard"**, none "Campaigns"
   (workshop back buttons, game exits, spectator banner). Post-flip they all land on Home
   with zero label edits — semantically correct.
7. **TabNav falsifies Home.** `TabNav.js:46-47` clamps `selectedIndex === -1 ? 0` — on Home
   it would underline Campaigns. Needs a true unselected state (small guard; TabNav dies in
   step 2 anyway).
8. **Explicit-anchor URL contracts already exist** for every card action we need:
   - `?tab=library&campaign={id}` (`CampaignManager.js:1876`)
   - `?tab=campaigns&expand_campaign_id={id}` (auto-expands the drawer; param-clear helper
     at `dashboard/page.js:73-78`)
   - `/notes?campaign_id={id}` (`CampaignManager.js:1889`)
   - `/game?room_id={session.id}` (`CampaignManager.js:494`, `enterGame`)
   - `/character/{id}` and `/character/create`
9. **Reusable as-is**: `useCampaigns` / `useCharacters` (TanStack + authFetch),
   `useHeroImage` (blob-cached campaign art + legacy presets), `useAvatarImage`
   (`app/shared/hooks/`, `/heroes.png` default), `formatRelativeTime`
   (`shared/utils/formatTime.js`), `Dropdown` (Headless Menu — trigger + items API fits the
   user chip exactly), `UserDisc`, accept/decline invite mutations
   (`useCampaignMutations.js:113-161` — the invite deck consumes these directly).
10. **`CampaignSummaryResponse` carries everything the cards read**: title, description,
    hero_image / hero_image_asset, host_id, host_screen_name, created_at, updated_at,
    player_ids, invited_player_ids (`campaign/api/schemas.py:95-114`). Step 1 needs **zero
    backend additions** — the only backend work is demo *removal*.
11. **Demo retirement inventory** (complete): endpoint block
    `campaign/api/endpoints.py:259-291`; `user_aggregate.py:66,126`; `user_model.py:29`;
    `user_repository.py:50,75,151,222,246,356`; no test coverage anywhere; no frontend
    references. Plus an autogenerated migration to drop the column.
12. **No frontend tests exist** — nothing pins the tab contract; QA is manual (dev QA
    checklist at the bottom).

## Work phasing — ONE PR, three phases as commits (D3)

Everything ships unified in **one PR on `feature/home-page-shell`**. The A/B/C slices below
survive as *phases* — commit groupings in path-of-least-resistance dependency order, so each
commit leaves the tree coherent. Matt runs all git.

| Phase | Blast radius | Contents |
|---|---|---|
| **A — Chrome rework** | Every authenticated page (shared header) | Wordmark → Home anchor, user chip + menu, logout/house icon removal |
| **B — Route flip + Home shell** | `/dashboard` only | The flip, HomeManager + all cards, hand, invite deck + switcheroo, placeholders, empty states, gold token, keyframes, TabNav guard |
| **C — Demo retirement** | Backend only | Endpoint block + field + column drop migration |

A first (zero dependencies, and the chip/wordmark are Home's chrome contract). B in
component-sized commits — suggested order within the phase: token + geometry groundwork →
route flip + empty HomeManager → greeting/clock → hero card → working-on → hand →
placeholders → invite deck (needs the hero deck's slot mechanics) → empty states. C last —
inside this one PR the demo auto-grant and the onboarding hero that replaces it land
together, which is the point of shipping unified.

---

## Phase A — Chrome rework (app-wide header)

**Files**: `app/shared/components/SiteHeader.js`, `app/(authenticated)/layout.js`.

1. **SiteHeader**: wrap the wordmark in `<Link href="/dashboard">` (it's currently a plain
   div, `SiteHeader.js:37-42`). Delete the `showHome` prop, the conditional house-icon
   block (`:50-60`), and the now-unused `faHouse`/`FontAwesomeIcon` imports. Update the
   doc comment to the new contract (wordmark anchors Home; children are the right-side nav).
2. **(authenticated)/layout.js**: remove the house-icon `Link` (`:72-80`), the divider
   (`:110-113`), and the logout button (`:114-121`). Replace the bare `UserDisc`-in-a-Link
   (`:81-106`) with the **user chip**: a rectangular button — `UserDisc` (keep the w-9
   sizing block and its comment; that reasoning still applies) + screen name label
   (`--font-inter`, smoke) — as the `trigger` of the shared `Dropdown`
   (`shared/components/Dropdown.js`), items:
   - `Account` → `router.push('/account')`
   - `Sign out` → `auth.handleLogout` (exists on the `useAuth` hook, wired today at `:115`)
   Chip label fallback: `screen_name || account_name || email` (same chain the disc's
   initial uses at `:103`).
3. Icon row order per mock: SocialPanel, then the chip. (Launcher slots between them in
   step 2.)

**Pattern fit**: Dropdown is the codebase's menu primitive; no new menu component. UserDisc
unchanged. **Reuse over invention: nothing new is created in this phase except JSX.**

**QA**: header renders on dashboard, account, notes, workshop pages, character sheet/wizard;
sign-out works; account reachable; no house icon anywhere; misclick-prone logout gone.

---

## Phase B — Route flip + Home shell

### B1. Route mechanics

**Files**: `app/dashboard/components/DashboardLayout.js`,
`app/(authenticated)/dashboard/page.js`, `app/shared/components/TabNav.js`.

- **DashboardLayout**: delete the mount effect (`:44-56`) entirely — the page component
  already seeds from the URL; the effect's only unique job was the forced redirect.
  `switchSection` stays (tab clicks still write `?tab=`). `VALID_TABS` moves to the page
  component (it becomes the seed's validator).
- **page.js**: seed becomes
  `useState(VALID_TABS.includes(tabParam) ? tabParam : 'home')`. The sync effect (`:53-57`)
  gains the return path: valid `tabParam` → that section; absent/invalid → `'home'` (covers
  back-button to bare `/dashboard`). Add the `activeSection === 'home'` render branch
  mounting `<HomeManager user={user} />`. Home is a normal child (not full-bleed); it
  renders its own `mx-auto w-full max-w-[1410px]` frame (SiteHeader precedent, `:35`).
- **Modals unaffected**: AccountNameModal + InDevWarningModal live at page level and gate
  over Home exactly as they gate over tabs today (`page.js:42-50`).
- **TabNav unselected state**: when `tabs.findIndex` misses, render no highlight bar and no
  active label styling instead of clamping to 0 (`TabNav.js:46-47` + the highlight
  measurement effect). TabGroup still needs a valid `selectedIndex` — keep the clamp for
  the controlled prop but gate the *visuals* on `selectedIndex >= 0`. Interim code: dies
  with TabNav in step 2.
- **Side effect worth knowing**: `?tab=account` (the eventConfig dead-end, 4 entries) and
  any garbage tab now fall through to Home instead of a blank content area — symptom fixed
  for free; the real re-route to `/account` lands with the launcher PR.

### B2. Home slice layout

Home lives **inside the dashboard slice** — it composes the dashboard's hooks and URL
contracts, and a separate slice would force cross-slice imports for zero gain:

```
app/dashboard/components/home/
├── HomeManager.js        # composition + data + ranking
├── HomeGreeting.js       # greeting h1 + tagline line + clock
├── HomeClock.js          # 1s tick, tabular digits, blinking colon
├── HomeHeroCard.js       # ranked campaign plate (primary slot of the deck)
├── InviteDeck.js         # tucked invite card + switcheroo + accept/decline
├── WorkingOnCard.js      # continue-building plate (+ create-campaign template variant)
├── CharacterHand.js      # hand of 8° cards + create ghost
├── HomePlaceholders.js   # pulse line, news noticeboard, market featured (static)
└── plateGeometry.js      # the 8° dial: shared clip/seam/shadow derivations
app/dashboard/hooks/… (none new — existing hooks only)
app/dashboard/utils/homeRanking.js   # pure hero/working-on selection
```

(Component-per-card because each has real behaviour; resist merging into one mega-file, and
equally resist inventing a generic `<Card>` — the two dark plates share *geometry*, which is
what `plateGeometry.js` extracts, not a component.)

### B3. Geometry + motion — the repo idiom, not the mock's

**Pattern fit**: `CharacterManager.js:40-77` is the precedent — named JS constants deriving
clip-paths/gradients from one angle, applied as inline styles. `plateGeometry.js` does the
same for the 8° family:

- `SLANT_ANGLE_DEGREES = 8`, run per plate = `tan(8°) × height` (hero/working 300px → 42px).
- Plate clip polygon (square left face, full 8° right face, the 3-point rounded bottom
  vertex from the mock at `design-mock.html:459-464`).
- Seam clip + 98° contact-shadow gradient (seam sits ≤40% width — art owns the majority).
- Skew/counter-skew pair for chips, CTAs, pills, and the hand cards.

**Keyframes** (`breathe`, the live CTA's `glow-spin` + `@property --glow-angle`, the invite
`wiggle`, clock colon class) go to `globals.css` beside the existing animation CSS, each
with the `prefers-reduced-motion` guards the mock specifies (`design-mock.html:567-574` —
the "!" holds still, glint goes static, colon steady).

**Comment discipline in the build** (Matt, 2026-08-29): the mock's essay comments are its
*design record* — they do NOT port. Derivations become well-named constants; a comment
states direction or a non-obvious constraint only (e.g. `// seam never crosses the card
midline`), never justification or history. No emoji, no initialisms, loops over clever
one-liners.

### B4. Data + ranking

`HomeManager` calls `useCampaigns(user.id)` + `useCharacters()` — both cached TanStack
queries shared with the tabs (no double-fetch; the tabs warm the same keys).

`homeRanking.js`, pure functions over the campaigns array:

- `selectHeroCampaign(campaigns)` — **eligibility filter first** (epic decision
  2026-08-29, the session-trigger rule): only campaigns carrying a **non-finished
  session** can hero — no session, no game, no hero slot. Latent today (creation
  auto-creates a session, `campaign/api/endpoints.py` create route: `# Always create a
  session with the campaign`) but it is the shipped groundwork for the parked
  create→publish flow ([05-campaign-create-and-publish.md](../05-campaign-create-and-publish.md)).
  Then the comparator over the eligible: **live first** (a session with
  `status === 'active'`), then **`updated_at` desc** (interim for `last_played_at`,
  step 3's truth PRs). Written as an ordered list of rank rules so step 4's scheduled
  slot is an insertion, not a rewrite (01 plan requirement). Returns `null` when nothing
  is eligible → the hero renders its empty/quiet state (B11).
- `selectWorkingOnCampaign(campaigns, userId)` — owned only (`host_id === userId`), max
  `updated_at`. May equal the hero (by design: different job, different verbs). `null` for
  users with no owned campaign → the card renders its **create-campaign template variant**
  (D5) — the section itself is always present.

### B5. Hero card — step-1 state contract

Art: `useHeroImage(campaign)` over the plate/seam treatment; scrim + 98° contact shadow per
mock. **No-art / still-loading fallback is the mock's CSS gradient composition** (D8 — the
`hero-art` radial/linear stack, `design-mock.html:277-280`): always painted as the base
layer, art laid over it when the blob is ready. CSS-only, no fallback image on Home.

Role chip: `Game Master` / `Player` (full words) by `host_id === user.id`. Title
Metamorphous; description from `campaign.description`, clamped.

State + actions (D1 approved: true state from the embedded `sessions`; D2: start/resume
happen **in place on Home**). `currentSession` = the campaign's non-finished session,
same derivation the drawer uses:

| Session state | Meta line | GM CTA | Player CTA |
|---|---|---|---|
| ACTIVE | green dot + "Session live" | **ENTER SESSION** → `/game?room_id={session.id}` (gold, glow ring) | **JOIN SESSION** (same target, glow) |
| STARTING / STOPPING | "Starting… / Ending…" | non-interactive | non-interactive |
| INACTIVE, previously played (`started_at` set) | quiet | **RESUME SESSION** — fires `useStartSession(session.id)` in place | ghost "Waiting for GM" (disabled) |
| INACTIVE, never started | quiet | **START SESSION** — same mutation | ghost "Waiting for GM" |

No FINISHED-only row: a campaign with no non-finished session is **not hero-eligible at
all** (B4's session-trigger filter) — the old drawer-route edge case dissolves. Recovery
for that campaign is the drawer's existing "Create new session" button, and the campaign
returns to hero eligibility the moment the session exists.

START/RESUME is a plain mutation (`useSessionMutations.js:49-68` — no modal; modals guard
pause/finish/delete only, which stay OFF Home). Two-step by design: START → `['campaigns']`
invalidates → hero flips live → ENTER SESSION appears (mirrors the drawer; no auto-enter).
CTA shows a pending state while the mutation runs; disabled when another owned campaign
already has an active session (the drawer's `activeSessions.length > 0` guard,
`CampaignManager.js:1657`).

Secondary actions per mock contract: GM — NOTES → `/notes?campaign_id=`, INVITE PLAYER →
`?tab=campaigns&expand_campaign_id=` (the drawer owns invite-sending UX; direct
CampaignInviteModal reuse is a QA-time upgrade); Player — MANAGE CHARACTER →
`/character/{their locked character id}` if one is selected in this campaign, else the
drawer route.

The green live dot uses the same green family as the In Game badge (mock note), not gold.
Still absent until step 3 (no data source): the "N at the table" seat count.

### B6. Invite deck — tuck + switcheroo (pulled forward from step 5)

The mock's two-slot deck mechanics, faithfully (`design-mock.html:33-49` header contract +
`:354-442` CSS + `:1200-1277` script — this is the one place the mock's *behaviour* ports
as-is, translated to React state):

- **Slots are places, not states**: primary `(0,0)` and tucked `(56px, 24px)`. The hero
  deck wraps the hero's pieces as one element; the invite card is a sibling plate (right
  face slant, NO inner seam, own gradient art base per D8). Shadow lives on the wrapper
  (clip-path kills same-element shadows — mock's documented trap); rest state keeps a
  transparent drop-shadow so the swap interpolates.
- **At rest the hero is never occluded**: invite tucks under the bottom-right, bare gold
  "!" (fa-solid `faExclamation`, no circle/plate) on the exposed corner, wiggle spec ±20°,
  two oscillations in 1s then 2s rest (3s loop).
- **Switcheroo**: clicking the tucked card's band swaps the two cards exactly (transforms
  trade; z swaps instantly; demoted card stays live, its buttons inert; clicking its band
  swaps back). Component state (`promoted` boolean + `confirming` + `leaving`), not
  body-class toggles.
- **Accept = one tap** → `useAcceptInvite(campaignId)` (`useCampaignMutations.js:113`);
  **Decline = two-step in-card confirm** — nothing sends until YES, DECLINE →
  `useDeclineInvite` (`:140`). On either: the leaving animation lifts the card while the
  hero slides home; `['campaigns']` invalidation re-renders the deck (accepted campaign
  joins the ranking pool immediately).
- **Data**: `invitedCampaigns` from the same `useCampaigns` result — card shows campaign
  title + `host_screen_name` ("{host} invited you to this campaign"). **Live arrival**:
  the socket bridge already invalidates `['campaigns']` on invite events
  (`useEventQueryInvalidation.js` via `useAuthenticatedEvents`) — an invite lands while
  you're on Home without a refresh.
- **Multiple invites**: deeper under-stack (offset per depth), ONE promotion at a time —
  promote the top invite; the next surfaces after accept/decline.
- The tuck slot's space is **permanently reserved** (the 54px hero→pulse gap) whether or
  not an invite exists — toggling never shifts the page.

### B7. Working-on card

Hero-height plate (300px), moodier scrim, seam at 42%, gradient base per D8 (the mock's
`working-art` brown stack). Title + `Last edited {formatRelativeTime(updated_at)}`
top-right (**reuse** `shared/utils/formatTime.js`). Description text =
campaign.description (the mock's "what was I doing" meta has no data source until
notes-derived meta exists — description is the honest stand-in). Actions:

- ASSETS → `/dashboard?tab=library&campaign={id}` (existing contract)
- WORKSHOP → `/dashboard?tab=workshop`
- CAMPAIGN EDITOR → `/dashboard?tab=campaigns&expand_campaign_id={id}`

Rendered even when it duplicates the hero. **The section never disappears** (D5, refined
2026-08-29): with **zero owned campaigns** it renders the **create-campaign template
variant** — same plate silhouette in the create-ghost language (knocked-out skin, no
shadow, like the hand's create card), "CREATE CAMPAIGN" CTA →
`?tab=campaigns&create_campaign=1` (B11's new param). That zero-owned state is the ONLY
create affordance Home ever shows (and it keeps the hero's empty state free of any
create push). Once a user owns any campaign, the card only ever mirrors the last-edited
one — no create-another, no switch-campaign affordance on Home (anti-bloat rule):
creating more or picking a different build target happens on the Campaigns tab.

### B8. Character hand

`CharacterHand.js` + a card subcomponent. **Reuse**: `useCharacters` (list),
`useAvatarImage` (blob-cached art + focal + `/heroes.png` default), the strip's
saturate-0-at-rest / hover-recolor idiom (`CharacterManager.js:86-98`). **New presentation**
(deliberate — the 18° strip constants stay untouched in CharacterManager; the hand is the
8° family): skew construction with counter-skew inner layer, `transform-origin` bottom-left,
4-shell fixed width fill rule, 28px overlap, first-on-top z order, hover lifts
(`translateY(-8px)` + z bump — **Home-only**; the Characters tab keeps its hover). Create
ghost: knocked-out graphite, no shadow (confirm at dev QA — epic open decision).

Click targets: card → `/character/{id}`; create → `/character/create`.

### B9. Placeholders (the unserved), per delivery step 1

All static, all honest, none pretending to be live:

- **Pulse divider**: full-width line under the hero — breathing gold dot (rest cadence,
  4s), hairline rule, ONE quiet pill: `All quiet in the tavern` (no schedule clause — no
  source until step 4; no coins, no ticker, no live pill until step 8). The divider's top
  margin carries the **invite tuck slot** (24px slot + 30px gap = the mock's 54px,
  `design-mock.html:553-555`) — reserved permanently, occupied by B6's deck when an
  invite exists.
- **News noticeboard**: the light parchment card, ONE hardcoded post authored for the
  release (real content, hardcoded plumbing — e.g. introducing the new Home). No banners
  (current PNGs are 3:2; the 21:9 contract means they'd letterbox narrow — banners arrive
  with stage 2 + re-exported art), no NEW! chip, no like counter (both need stage-2
  backend). READ MORE omitted (nothing to open) — date + title + body only.
- **Market featured**: the narrow stepped rect with mock-style static content (epic
  decision 2026-08-29: VISIBLE placeholder, never "coming soon").
- **Tagline**: the literal text `Tagline goes here` in the greeting row (D6) — visible
  template slot, italic soft voice per mock; the template bank is step 6.

Parchment + parchment-border hexes stay component-local constants (mock-local derivations,
not tokens) until the news module makes them systemic.

### B10. Greeting + clock

`Welcome back, {screen_name}` (Metamorphous h1, `--font-metamorphous` idiom as
`dashboard/page.js:157`). Fallback `screen_name || account_name || 'adventurer'` (D7) —
degrade, never blank (the setup modal usually intercepts anyway). Clock: date · time,
right-aligned, `tabular-nums`, colon dims on odd seconds via the 1s tick (not a CSS
animation — re-render safe), ordinal date suffix helper as a plain function. Port the
mock's `tickClock` logic (`design-mock.html:1183-1198`) into `HomeClock.js` with React
state; reduced-motion: colon steady.

### B11. Empty states

- **No campaigns → onboarding hero** (replaces the demo as first-run). **Not
  create-centric** (D5 — most users will be players, not GMs): the plate frame with
  invite-side onboarding — "Your adventures will live here" voice, "invites from your
  Game Master arrive right here" line (which is literally true: B6's deck lands on this
  card). NO create-campaign push on the hero — the build-side door is the working-on
  card's create template (B7), always present below. Market CTA slot: not rendered
  (arrives stage 4). This state is **unmocked** — build it from the plate language,
  screenshot at dev QA, iterate with Matt before merge.
- **The `create_campaign=1` param**: new param CampaignManager consumes to open its
  existing create modal then clears — **pattern fit**: exact mirror of
  `invite_campaign_id` / `expand_campaign_id` (`dashboard/page.js:65-87`). Fired by the
  working-on template card's CREATE CAMPAIGN CTA.
- **Zero characters**: hand renders the create ghost alone.
- **No owned campaigns**: working-on renders its create template variant (B7) — never
  absent.
- **Hero with no art**: resolved by D8 — the gradient base IS the designed look; nothing
  extra to build here.
- **Campaigns exist but none hero-eligible** (all sessions FINISHED — rare today): the
  hero renders a quiet "nothing at the table yet" variant of the onboarding card,
  pointing at the build card below; copy at dev QA. Distinct from the no-campaigns
  invite-centric state.

### B12. Gold token — now official (D4)

`COLORS.gold = '#D9A441'` (`colorTheme.js`), `--gold` in `globals.css`, `gold` in
`tailwind.config.js` colors. Re-point `FAVORITE_COLOR = COLORS.gold` and
`--favorite: var(--gold)` so the value has one home (consumers unchanged). The mock's
darkened gold-on-light `#9a7526` (section heads) stays a Home-local constant until stage 2
gives it a second consumer.

---

## Phase C — Demo retirement (backend)

Delete-superseded-code sweep, per the inventory in Ground truth §11:

1. Remove the block at `campaign/api/endpoints.py:259-291` (template dict, CreateCampaign +
   CreateSession calls, the swallow-and-mark logic). Then prune the endpoint signature:
   `session_repo` and `event_manager` were demo-only in `get_user_campaigns` — verify and
   drop them + any now-unused imports (`user_repo` stays — the response helper uses it).
2. Remove `has_received_demo` from `user_aggregate.py` (field + `__init__`),
   `user_model.py:29`, and all six `user_repository.py` mappings.
3. Migration: `docker exec api-site-dev alembic revision --autogenerate -m "drop user has_received_demo"`
   — **autogenerate only, never hand-written**. Restart api-site; migrations run on boot.
4. Existing demo campaigns in user accounts persist (they're ordinary campaigns now) —
   deliberate; purging them would be a separate, destructive decision nobody has asked for.

**QA**: brand-new user (fresh email) logs in → onboarding hero, zero campaigns anywhere;
existing users unaffected; api-site boots clean with the migration applied.

---

## What we will NOT invent (locks)

- **No new endpoints, no new fetch hooks, no summary-field additions** — step 1 is served
  entirely by `useCampaigns` + `useCharacters`. The truth PRs (step 3) own schema changes.
- **No generic Card/Panel component** — shared *geometry* module only; two plates in one PR
  is repetition of math, not of component shape.
- **No new slice, no state manager, no context** — Home is dashboard-slice composition over
  existing TanStack queries.
- **No greeting-name shared helper yet** — the audit's duplicated fallback chain is real,
  but a third inline use isn't the moment to abstract; noted for a cleanup PR.
- **No touch/mobile QA gates** — desktop-first; the mock's single 920px column collapse is
  the only responsive behaviour.
- **No frontend test scaffolding** — none exists; introducing it is not a ride-along.
- **No nginx changes** — no new routes anywhere in step 1.

## Removal opportunities (this work's dead-code dividend)

| What | When |
|---|---|
| `SiteHeader` `showHome` prop + `faHouse` import | PR A |
| `DashboardLayout` mount effect (redirect + seed duplication) | PR B |
| `has_received_demo` everywhere + demo template block + dead endpoint deps | PR C |
| `TabNav.js` + `SubNav.js` tabs mode + SubNav's already-dead breadcrumb mode | step 2 (launcher) |
| `SessionsManager.js` (zero importers) | step 2 rides along |
| `active_sessions` hardcoded ints | step 3 truth PRs (do not touch now) |

## Decisions — SETTLED by Matt 2026-08-29

| # | Decision | Outcome |
|---|---|---|
| D1 | Hero renders true live/idle from embedded sessions in step 1 | **Approved** (was an approval gate on deviating from the epic's "placeholder live dot" — granted; no open question remains) |
| D2 | Not-live GM primary CTA | **START/RESUME SESSION in place on Home** — `useStartSession` directly; drawer route only for the no-session FINISHED-only edge (session *creation* form stays in the drawer). Pause/finish never on Home |
| D3 | Delivery shape | **ONE unified PR**; A/B/C survive as commit phases in dependency order |
| D4 | Gold token promotion + FAVORITE_COLOR aliasing | **Approved — gold is official** in COLORS/globals/tailwind |
| D5 | Onboarding shape | **Onboarding ≠ create-a-campaign** (most users are players). Hero empty state is invite-centric; the create door is the working-on card's template variant — **zero-owned-campaigns state only** (refined 2026-08-29): once a user owns any campaign, Home never offers create/switch — the Campaigns tab (which keeps its New Campaign button) is where you create more or pick a different build target. `create_campaign=1` opens the existing create modal |
| D6 | Tagline slot in step 1 | Literal **"Tagline goes here"** so the template row is visible; clock ships regardless; bank is step 6 |
| D7 | Greeting fallback when `screen_name === ''` | `screen_name → account_name → "adventurer"`. (Setup modal gates over Home for new users anyway — Home is what's underneath until they set it) |
| D8 | No-art plate art | **The mock's CSS gradient compositions ARE the design** — always painted as the base layer, CSS-only, no image fallbacks on Home. Onboarding-hero visuals: build → screenshot → iterate at dev QA |
| — | Invite tuck/switcheroo | **Pulled into step 1** (plumbing complete end-to-end); see B6 |
| — | Hero eligibility | **Session-triggered** (Matt, 2026-08-29): only campaigns with a non-finished session can hero — the session, not the campaign's existence, is the signal. Latent today (creation auto-creates sessions — kept as-is tonight); the concept behind it (publish = the author's seal, ≠ share) is parked in [05-campaign-create-and-publish.md](../05-campaign-create-and-publish.md) |

## Dev QA checklist (acceptance, adapted from plan 01)

- Login (magic + OTP) lands on bare `/dashboard` rendering Home; the wordmark anchors it
  from every authenticated page.
- Every existing `?tab=` URL renders its index view unchanged; tab clicks still write
  `?tab=`; **no tab underlined while on Home**; browser back from a tab to bare
  `/dashboard` returns to Home.
- Campaigns view reachable ONLY via explicit anchors (tab bar, card actions, the 11
  `?tab=` writer call sites — all untouched).
- One-or-two-campaign user: hero answers "is my game on?" (live session → green dot +
  working ENTER/JOIN within one refresh cycle of `useCampaigns`' 60s staleTime); working-on
  answers "where was I building?" — even when both are the same campaign.
- GM start flow in place: START/RESUME shows pending while the mutation runs, hero flips
  to live + ENTER SESSION on invalidation; label reads RESUME when the session has a
  `started_at`, START otherwise; disabled while another owned campaign is live.
- Session-trigger rule: a campaign whose sessions are all FINISHED never heroes — the
  next eligible campaign takes the slot, or the quiet "nothing at the table" state
  renders; creating a session from the drawer restores eligibility on the next fetch.
- Invite deck: an invite arriving over the socket tucks under the hero without a refresh,
  "!" wiggles on the exposed corner; band click swaps the cards exactly (and back);
  Accept joins the campaign into the ranking pool immediately; Decline requires the
  in-card confirm and sends nothing until YES; multiple invites promote one at a time;
  page never shifts as the deck toggles.
- Pure player / zero-owned user: working-on shows the create-campaign template variant
  (never absent); its CTA opens the campaigns tab's create modal via `create_campaign=1`.
- User with ≥1 owned campaign: NO create or switch-campaign affordance anywhere on Home —
  continue-building mirrors the last-edited owned campaign only; the Campaigns tab's New
  Campaign button is untouched.
- Cards with no art (and while art loads): the gradient bases read as the designed look —
  no image fallback, no flash of empty carbon.
- Greeting row: "Tagline goes here" visible in the template slot; clock ticks with the
  blinking colon.
- Characters hand: real portraits greyscale-at-rest, hover recolors + lifts (Home only —
  Characters tab hover unchanged); create ghost casts no shadow; card → sheet, ghost →
  wizard.
- Brand-new user: invite-centric onboarding hero (no create push on it), no demo campaign
  anywhere; the build door lives in the working-on template card below.
- Reduced motion: no breathing dot, no glow spin, steady colon.
- No horizontal scroll on Home at any width ≥ the 920px collapse; the reserved tuck-slot
  gap sits between hero and pulse line.
- InDev warning + account-setup modals still fire over Home after login.

## Code style contract (for the implementing session)

Matt's standing rules, restated for this work: readable variable names, no initialisms, no
single-character loop variables; plain loops where a chain would need reading twice;
imports at top; **directional comments only — no why-essays, no history, no
self-justification in code** (the mock's annotated style is a design record, not a code
style); GPL-3.0 headers on every new file; `authFetch` for anything authenticated (step 1
adds no new calls); delete superseded code in the same PR; **no git write commands — Matt
runs them** (propose exact commands + commit messages when each PR is ready).

---

## Stretch — Delivery step 2: launcher + TabNav retirement (outline only)

Extract to `step-02-launcher.md` before starting; this is the shape, not the plan:

- **One PR.** App-select launcher (9-dot, Headless UI popover/menu matching the user-menu
  skin) in the top bar between SocialPanel and the chip: 2×2 grid [Campaigns, Characters,
  Library, Market] + WORKSHOP section [Map Config, **Image Config** (real name — not
  "Image Editor"), Audio Workstation, NPC Barracks (disabled, "Soon" badge pattern from
  `WorkshopToolNav.js`), Scene Builder (disabled)]. **Font Awesome icons** (build
  decision), Metamorphous labels, diamond pips as line-item markers.
- Entries navigate to the existing `/dashboard?tab=…` views — all 11 external `?tab=`
  writers (7 files, audit §9) keep working untouched; only entry chrome changes.
- Retire `TabNav.js` + SubNav tabs mode (+ its dead breadcrumb mode = whole `SubNav.js`);
  `DashboardLayout` becomes main-content-only (question: does it still earn its existence,
  or fold into page.js?).
- Fix the `tab=account` dead-end properly: eventConfig's 4 `navigationTab:'account'`
  entries → route `/account`.
- Delete orphaned `SessionsManager.js`.
- Carries the workshop deep-link decision (open with media context vs at own pickers) —
  decide at extraction.
