# 04 — Campaign builder page (Overview · World · Character)

> Read `00-agent-brief.md` first. Depends on PR 2 (api-site). Open `../design-mock.html`
> and keep it beside you: the first three artboards are this PR. Paths are relative to
> `rollplay/`.

## Route and shell

- **Page**: `app/(authenticated)/campaign/[id]/page.js` and
  `app/(authenticated)/campaign/new/page.js`. Both render the same `CampaignBuilder`
  component; `new` passes `campaignId=null`. On first save of a new campaign the page
  `router.replace`s to `/campaign/<id>?section=<current>` so refresh is safe.
- **Middleware**: add `/campaign` to `PROTECTED_ROUTES` in `middleware.js:9-18`.
- **Query state**: `?section=overview|world|character` (default `overview`) and
  `?tab=<subtab>` (default first). Read with `useSearchParams`, write with
  `router.replace`, mirroring `app/workshop/hooks/useWorkshopToolNav.js`. Implement as
  `app/campaign_builder/hooks/useBuilderNav.js`.
- **Slice**: new functional slice `app/campaign_builder/` with `components/`, `hooks/`,
  `index.js`, per the frontend slice pattern.
- **Chrome**: the authenticated layout supplies the site header. Below it the page is a
  full-height flex row: the **rail** (92px, `bg-surface-secondary`), then a column with
  the **campaign band** (96px), the **sub-tab strip** (44px, `bg-content-secondary`
  which is silver `#B5ADA6`, `border-b border-border`), and the scrolling content
  (`px-10 pt-9 pb-14`). Match the mock's `build.py` measurements exactly; they were lifted
  from the app.

## Entry points (replace, do not add)

- `app/dashboard/components/home/WorkingOnCard.js:64`: the create CTA goes to
  `/campaign/new` (was `/dashboard?tab=campaigns&create_campaign=1`).
- `app/(authenticated)/dashboard/page.js`: delete the `create_campaign` param read (27-30),
  `clearOpenCreateCampaign` (88), and its prop threading (128-136).
- `app/dashboard/components/CampaignManager.js`: delete the create tile's handler
  `openNewCampaignForm` (470) → the tile navigates to `/campaign/new`; delete `createCampaign`
  (483), `updateCampaign` (504), `closeCampaignForm` (329), `campaignFormOpen`/`campaignForm`
  state (325-326), the `create_campaign` effect (649-654), the entire form `Modal`
  (2114-2285) and its preset tile list. The drawer's **Configure** button (1971-1988)
  navigates to `/campaign/<id>?section=overview`. Sweep the file for every symbol those
  removals orphan (`formatBytes` stays if used elsewhere; the tile background presets move
  to the builder).
- `app/dashboard/hooks/mutations/useCampaignMutations.js`: `useCreateCampaign` and
  `useUpdateCampaign` stay (the builder uses them); their bodies are unchanged.

## Data hooks (`app/campaign_builder/hooks/`)

All via `authFetch`; TanStack keys extend the existing `['campaigns']` family so the
dashboard's invalidations keep working.

| Hook | Endpoint | Key |
|---|---|---|
| `useCampaign(id)` | `GET /api/campaigns/{id}` | `['campaigns', id]` |
| `useCharacterConfigState(id)` | `GET /api/campaigns/{id}/character-config` | `['campaigns', id, 'character-config']` |
| `useSaveCharacterConfigDraft(id)` | `PUT …/character-config/draft` | invalidates `['campaigns', id, 'character-config']` |
| `usePublishCharacterConfig(id)` | `POST …/character-config/publish` | invalidates the same + `['campaigns']` |
| `useComponentCatalogue()` | `GET /api/components` | `['components']`, `staleTime: 60*60*1000` |

Reuse `useCreateCampaign` / `useUpdateCampaign` from the dashboard mutations for title,
description, hero image and seats.

## The rail — `components/BuilderRail.js`

Three tabs, vertical, in this order: Overview, World, Character. Each is a
`52×168px` block, `rounded-lg`, `transform: skewY(-8deg)`, label inside counter-skewed
(`skewY(8deg) rotate(-90deg)`), `text-[13px] font-semibold tracking-[0.12em] uppercase`.
Active: `.home-btn-gold` colours (gold bg, `#241C08` text). Inactive: `.home-btn-outline`
colours. Click sets `?section=`. Keyboard: the three tabs are buttons in a
`role="tablist"`; arrow keys move focus (write it by hand; there is no `TabNav` component
in the kit — the inventory confirmed it).

## The band — `components/CampaignBand.js`

Left: eyebrow "Campaign" (`text-[11.5px] font-semibold uppercase tracking-[0.14em]`
gold-ink `#9A7526`), then title (Metamorphous `text-[26px]`), a "Draft" chip (skewed,
`border-border` outline) shown only while the campaign has never been saved, the version
tag (gold `text-[9.5px] font-bold tracking-[0.1em]` skewed) reading `v<latest.version>`
or `unpublished` when no version exists, and a hint reading `unsaved changes` when any
section has dirty state. Right: `PlateButton` outline "Back to campaigns" →
`/dashboard?tab=campaigns`, and `PlateButton` gold **Save campaign**. Save is one button
for the whole page: it runs the dirty sections' saves in this order — campaign fields
(create or update), then character config draft — and shows one toast via `showToast`
from `useAuthenticated()`.

## Sub-tab strip — `components/BuilderSubTabs.js`

Skewed chips (`skewX(-8deg)`, label counter-skewed), `text-xs font-medium`, active
`bg-surface-secondary text-content-on-dark`. Sub-tabs per section:

| Section | Sub-tabs |
|---|---|
| overview | Story, Setup |
| world | Tables, Reference (both render the stub) |
| character | Components, Versions |

## Overview section — `components/OverviewSection.js`

Layout: `grid grid-cols-[minmax(0,1fr)_300px] gap-[26px] items-start`. Left column holds
the sections; right column is a **sticky index** (`sticky top-6`, `border-l border-[#E5DECF] pl-[18px]`)
listing every section heading; the one whose heading is nearest the top of the viewport
is bold. Clicking scrolls to the section (`scrollIntoView({behavior: 'smooth', block: 'start'})`).

**Story sub-tab**, sections in order (each a card; parchment cards use
`bg-[var(--parchment)] border border-[var(--parchment-border)] rounded-xl`, plain cards
`bg-white border border-[#E5DECF] rounded-md`):

1. **Hero plate** — the `platePolygon()` clip and hero gradient from
   `app/dashboard/components/home/HomeHeroCard.js:96-193`. Contains the title input
   (Metamorphous 44px, transparent, dashed bottom border, `maxLength=100`), a tag chip
   row with a `+ tag` chip (tags are **local UI state only in v1**: rendered, not
   persisted — say so in a code comment; persistence is in `08-followups.md`), and the
   description textarea (`rows=5`, `maxLength=1000`, dashed border). Title and
   description bind to `useCreateCampaign`/`useUpdateCampaign`.
2. **Starting the adventure** — parchment card, italic textarea `rows=7`, hint "Read
   aloud to open the first game. Optional." **Local UI state in v1** (no column yet; in
   `08-followups.md`). Render it, keep it in component state, do not send it.
3. **Important characters** and **Key locations** — two parchment cards side by side,
   each a list with an avatar wedge (`clip-path: polygon(0 0, 100% 0, 80% 100%, 0 100%)`,
   44px, `bg-graphite`) or plain rows, and a `+ Add …` outline button. **Local UI state in
   v1**; same note.
4. **Secrets and clues** — dashed parchment card, ordered list, GM-only hint. **Local UI
   state in v1**.
5. **The table** — plain card: `Seats at the table` select 1–8 (bind `max_players`; hint
   "Applies the next time the game starts.") and `Tile background` picker: the four preset
   tiles from the deleted modal (`/campaign-tile-bg.png`, `/floating-city.png`,
   `/barren-land.png`, `/underworld.png`) plus a dashed "From library" tile that opens the
   same library image chooser the modal used (`S3Image` grid; move that code here).
   Binds `hero_image` / `hero_image_asset_id`.
6. **Ruleset** — plain card: one sentence "Characters in this campaign are built from the
   components you configure under Character." and a "Framework preset" row reading
   "None. Start from scratch." with a **disabled** Choose button (tooltip "Coming later").

Sections 2–4 exist so the page matches the mock and so the GM can see what the Overview
will hold. They must be visually indistinguishable from persisted sections but carry a
single small caption under the section heading: `Not saved yet in this version`. Do not
skip them and do not persist them.

**Setup sub-tab**: renders sections 5 and 6 only (same components), for GMs who want the
config without the story.

## World section — `components/WorldSection.js`

The stub from the mock: a dashed card with eyebrow "World", heading "Reference tables for
your world", the sentence "Travel pace, mounts, prices, light sources. Whatever your table
needs to look up mid-game. Display-only, never enforced. Not part of the first release.",
a "Not in v1" tag, then two ghosted (`opacity-55`, `pointer-events-none`) example tables
and a ghosted "+ Add table" button. Copy the table contents from `World.dc.html` verbatim
(they were made system-neutral on purpose). Both sub-tabs render the same stub.

## Character section — `components/CharacterSection.js`

Layout: `grid grid-cols-[minmax(0,1fr)_300px] gap-[26px] items-start`.

**Header row**: eyebrow "Character config", heading "What a character is made of"
(Metamorphous 28px), hint "Players build against this when they take a seat. Order here
is the order they see. Nothing is required except what you mark required."

**Components sub-tab, left column**: the draft's components in order, each a
`ComponentCard`, then a dashed drop target reading "Drop a component here, or pick one from
the palette". Reordering: drag by the grip column (36px, `bg-[#F6F1E6]`, six-dot SVG) —
implement with the HTML5 drag events (`draggable`, `onDragStart/Over/Drop`) on the card;
no library. Reorder writes the new `components` order into the draft state.

**Right column** (sticky): the **Components palette** card (`bg-surface-secondary`,
`rounded-md`, eyebrow gold "Components", hint "Ours to define, yours to configure. Add as
many of each as your game needs, or none. Secret components are seen only by their player
and the GM.") with one outline row per catalogue entry from `useComponentCatalogue()`,
each with a `+` SVG; clicking appends a new configuration with that type's defaults (§
"Defaults" below). Below it the hint "Number, Text and Choice arrive with the framework
preset." No Versions card here (the mock removed it; versions have their own sub-tab).

**Versions sub-tab**: a list of published versions (newest first): `v<n>`, created date,
component count. Above the list, when `pending_changes` is non-empty, a "Pending changes"
card listing each `ComponentChange` as `<label> — added | removed | changed (<fields>)`,
and a gold `PlateButton` **Publish v<next>**. When empty: "No changes since v<latest>".
Publish calls `usePublishCharacterConfig`, then shows a toast "Published v<n>".

### Draft state and saving

`useCharacterConfigDraft(campaignId)` (in `hooks/`) holds the working config in React
state, seeded from `state.draft ?? state.latest ?? {version: 1, components: []}` on load.
Every edit is local. The page's **Save campaign** calls `useSaveCharacterConfigDraft` with
the whole document. The band's "unsaved changes" hint reads this hook's `isDirty`.

### `components/ComponentCard.js`

Props: `configuration`, `onChange(next)`, `onRemove()`, drag handlers. Structure (from the
mock, `Character.dc.html`): grip column; body with a header row — a black chip with the
type's catalogue label (skewed), then a caption **Label** (`text-[11px] font-semibold
tracking-[0.12em] uppercase`) and the label input (`w-[240px] font-semibold text-[15px]`);
right side a **Secret** checkbox and a trash SVG button. Below the header, the
type-specific editor, imported from the component registry
(`app/characters/components/<type>/ConfigEditor.js`, declared in
`05-character-create-flow-ui.md` — create that slice and the three `ConfigEditor` files
in this PR; PR 5 adds the other pieces). `ComponentCard` calls
`pieceFor(configuration.type, 'ConfigEditor')`. The editors:

- **Name**: `Maximum length` (number 1–200) and a `Required` checkbox.
- **Hit points**: `Representation` select (`Number` → `int`, `Weighted scale` →
  `weighted`). Switching representation replaces `rules` with that representation's
  defaults (below). Number: `Minimum`, `Maximum`, `Starting value` (three 140px number
  inputs) and the hint "A number between minimum and maximum. Reaching the minimum is the
  zero point." Weighted: `Starting step` select (the current scale's labels), and a
  `Scale, best to worst` list — each row `weight` (number, step 0.05, 0–1) + `label` +
  trash — with `+ Add step`; hint "An ordered scale. Damage moves a character down it. The
  last step is the zero point."
- **Attribute**: `Minimum`, `Maximum`, `Default` (blank = none).

Editors validate on blur against the catalogue's `config_schema` using a small
`validateAgainstSchema(schema, value)` helper in `app/campaign_builder/utils/` that checks
only: required keys present, numeric `minimum`/`maximum` bounds, and `enum` membership. It
is not a full JSON-schema validator and must say so in its docstring. Any error shows
inline under the field in `text-feedback-error text-[12.5px]`; the card gets
`border-feedback-error`. Save is blocked while any card has an error (band button
disabled with tooltip "Fix the highlighted components").

### Defaults when adding from the palette

- Name: `{type:"name", id, label:"Name", secret:false, max_length:60, required:true}`
- Hit points: `{type:"hit_points", id, label:"Hit points", secret:false, rules:{representation:"int", minimum:0, maximum:10, starting:10}}`;
  switching to weighted → `rules:{representation:"weighted", starting_weight:1.0, scale:[{weight:1.0,label:"Full"},{weight:0.5,label:"Half"},{weight:0.0,label:"Zero"}]}`
- Attribute: `{type:"attribute", id, label:"Attribute", secret:false, minimum:1, maximum:10, default:null}`

`id` is minted client-side as `<type>_<n>` where `n` is one more than the highest existing
suffix for that type in the draft (`hit_points_3`). The server accepts any unique id; the
convention exists so the id never depends on the label.

## Removals in this PR

- The create and edit modal in `CampaignManager.js` (listed above) and every symbol it
  orphaned.
- `create_campaign` query param plumbing in the dashboard page.
- Nothing from the Characters tab yet (PR 5).

## Tests

There is no JS test runner in this repo and one must not be added. Verification is manual
(`07-verification.md` steps 8–11) plus the compile check: restart `rollplay-dev`, load
`/campaign/new`, and confirm `docker logs rollplay-dev` shows a clean compile of the route.
