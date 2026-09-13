# 05 — Character create flow, character detail, the party on the dashboard

> Read `00-agent-brief.md` first. Depends on PRs 2 and 4. The fourth artboard of
> `../design-mock.html` (`CharacterCreate.dc.html`) is the create form. Paths relative to
> `rollplay/`.

## The component registry (shared by PRs 4, 5, 6)

New slice `app/characters/` with:

```
app/characters/
├── components/
│   ├── registry.js                # export const COMPONENT_REGISTRY = { name, hit_points, attribute }; export function pieceFor(type, piece)
│   ├── RUNTIME_TYPE_ORDER.js      # export const RUNTIME_TYPE_ORDER = ['name', 'hit_points', 'attribute']  // mirror of shared_contracts.components.RUNTIME_TYPE_ORDER — keep in sync
│   ├── fallback/                  # GenericConfigEditor, GenericCreateInput, GenericSeatCompact, GenericSheetFull, describeChange
│   ├── name/
│   ├── hit_points/
│   └── attribute/
│       ├── ConfigEditor.js        # (configuration, onChange) — PR 4's ComponentCard delegates here
│       ├── CreateInput.js         # (configuration, value, onChange) — this PR
│       ├── SeatCompact.js         # (configuration, value) — PR 6
│       ├── SheetFull.js           # (configuration, value, editable, onChange, pending) — PR 6
│       └── describeChange.js      # (configuration, before, after) -> string — PR 6
├── hooks/
└── index.js
```

`pieceFor(type, piece)` returns the type's export or the fallback's. Every piece receives
the **configuration object** (never just the id) so it can read `label`, `rules`, bounds.
PR 4's `ComponentCard` must import `ConfigEditor` from here; move the editors written in
PR 4 into these folders in that PR (this file is the authority on location).

### `CreateInput` per type (this PR)

- **name**: text input, `maxLength={configuration.max_length}`, label = `configuration.label`
  with a gold `required` word when `configuration.required`. Value shape:
  `{type:'name', component_id, text}`.
- **hit_points**: int → a 90px centred number input (`text-[18px] font-semibold`) with
  hint `<minimum> to <maximum>. Starts at <starting>.`; weighted → a row of skewed chips,
  one per scale step, the selected one gold, hint `Starts at <label of starting_weight>.`
  Value shape `{type:'hit_points', component_id, state:{representation, current | current_weight}}`.
- **attribute**: a parchment tile: label, centred number input, hint
  `<minimum> to <maximum>, default <default>` (omit ", default" when null).
  Value shape `{type:'attribute', component_id, score}`.

Initial value for each configuration (function `initialValueFor(configuration)` in
`registry.js`): name → `''`; hit_points int → `starting`; weighted → `starting_weight`;
attribute → `default ?? minimum`.

Attributes render together in a 3-column grid under an "Attributes" eyebrow; every other
type renders one per row in GM order. That grouping is a create-form presentation rule and
lives in `CharacterCreateForm.js`, not in the registry.

## Backend addendum (do in PR 2 if not already there)

`CampaignResponse` gains `character_config_version: Optional[int]` (the latest published
version number, `None` when unpublished) so the chooser can mark campaigns without a
config in one request. Populate it in the campaign list/read helpers from
`CharacterConfigVersionRepository.get_latest`.

## Routes

- `app/(authenticated)/character/new/page.js` — replaces `character/create/page.js`
  (delete it). Reads `?session_id=`. Without it, renders the **chooser**; with it, the
  **form**.
- `app/(authenticated)/character/[id]/page.js` — rewritten (below).

## Chooser — `app/characters/components/CampaignChooser.js`

Heading (Metamorphous 28px): "Which table is this character for?" Sub: "Characters are
built against a campaign's character config and join the party at its table."

List: every campaign from `useCampaigns(user.id).campaigns` (member or host), as rows:
title, host screen name, `v<character_config_version>` tag or the disabled reason. A row is
**enabled** when `character_config_version` is not null; clicking navigates to
`/character/new?session_id=<campaign.sessions[0].id>`. **Disabled** rows read "The GM
hasn't published a character config yet" (host's own campaigns add a link "Configure it" →
`/campaign/<id>?section=character`).

Invited-but-not-accepted campaigns (`invitedCampaigns`) are listed under a divider
"Waiting on you" with an "Accept invite" `PlateButton` that calls the existing
`useAcceptInvite`; after success the row moves up and becomes clickable.

**Zero campaigns of any kind**: the `EmptyState` component from `app/shared/components/`
with heading "Nothing to build against yet", body "Characters are built for a campaign's
table. Accept an invite, or create a campaign and publish its character config.", and two
`PlateButton`s: gold "Create a campaign" → `/campaign/new`, outline "Back to dashboard".
This is the first thing a brand-new player meets; do not shortcut it.

## Form — `app/characters/components/CharacterCreateForm.js`

> **Revision (2026-09-13, groups).** The form renders the config's entries: a group is a
> named section (its label as the gold eyebrow, skipped when published empty); bare
> components stand on their own with no heading. Consecutive attributes inside any
> container tile into the 3-column grid — a layout rule, not a group. Seeding, validation
> and the payload iterate `flatComponents(config.components)`; the runtime sheet ignores
> groups and keeps the platform type order.

Data: `useSessionParty(sessionId)`? No — the form needs the campaign and its latest
config: `useCampaign(campaignId)` (from PR 4's hooks; campaign id comes from the session:
add `useSession(sessionId)` → `GET /api/sessions/{id}` key `['sessions', id]`) and
`useCharacterConfigState(campaignId)` (`latest`, `latest_version_id`).

Layout (`max-w-[760px] mx-auto`): the hero plate (same clip and gradient as the campaign
band's plate; eyebrow gold "Join the party", campaign title Metamorphous 36px, line
`Built against v<n> · run by <host>`), then a white card `p-7` with the inputs in GM
order (attributes grouped, above), a footer row: hint "Nothing here is checked against a
rulebook. Your table decides what is fair." and gold `PlateButton` **Join the party**.

Submit: build `values` from every configuration (skip a `name` whose text is empty and
not required), `POST /api/characters/` `{session_id, values}` via `useCreateCharacter()`
(new, in `app/characters/hooks/useCharacterMutations.js`; invalidates `['characters']`,
`['campaigns']`, `['sessions', sessionId]`). On 400 show the server message in a toast
(it names missing required labels). On success: toast "Joined the party at <campaign title>",
`router.push('/character/<id>')`.

No draft, no multi-step, no back button beyond the browser's. Refreshing loses unsent input;
acceptable and stated in `08-followups.md`.

## Detail page — `app/(authenticated)/character/[id]/page.js` (rewrite)

Data: `useCharacter(id)` (`GET /api/characters/{id}`, key `['character', id]`, replaces
`useCharacterDraft`), `useCampaigns` for host detection (`character.campaign_id` in the
user's hosted campaigns → `isGM`). Left: `CharacterAvatarPane` (keep the file; it only
needs `avatar_url`/`avatar_asset_id`/`display_name`). Right: `RuntimeCharacterSheet` from
PR 6 rendered in **cold mode** — until PR 6 lands, render a minimal list here: per
component in `RUNTIME_TYPE_ORDER` then GM order, `configuration.label` and the value's
raw display (number, text, or the step label for weighted). PR 6 replaces it.

Header row: display name (Metamorphous), a `v<config_snapshot.version>` tag **only when
`config_version_id` is set** (a keepsake, migrated or orphaned, has no version to claim), a
**Keepsake** chip when `is_keepsake` with body copy "This character isn't at a table. It's
yours to keep; it can't join a party." (the copy must not assume the campaign was deleted —
migrated characters have a campaign that still exists), a **Dead** chip when `!is_alive`. Actions (owner or GM):
"Mark dead" / "Mark alive" (`PATCH /alive`), "Delete" (existing hand-rolled modal; on 400
"eject first" show the server message). Edits to values go through
`useUpdateCharacterComponent(id)` → `PUT /components/{cid}`; on 409 show the message
"A game is running: edit this character in the game" and leave the field unchanged.

Delete the Edit → wizard link (`[id]/page.js:123`) and every `active_campaign` read
(`[id]/page.js:89`, `HomeManager.js:63`, `game/hooks/useCharacterRuntime.js:61`;
`CharacterSelectionModal.js:88` goes with the file).

## Characters tab — `app/dashboard/components/CharacterManager.js`

- Replace the direct `authFetch('/api/characters/me')` (206-233) with `useCharacters()`
  so mutations invalidate it.
- Card fields: `display_name` (was `character_name`); meta line: `campaign_title` when
  bound, "Keepsake" when `is_keepsake`; a small "Dead" badge when `!is_alive`.
- Create card (293-299) → `router.push('/character/new')`.
- Card click → `/character/<id>` (unchanged).

`app/dashboard/components/home/CharacterHand.js`: `character_name` → `display_name`;
create card → `/character/new`. `HomeManager.js:63`: drop the `active_campaign` filter.

## Campaign drawer — `app/dashboard/components/CampaignManager.js`

> **Done (2026-09-13).** `CharacterSelectionModal.js` and `dashboard/hooks/mutations/useCharacterMutations.js`
> (select-character / my-character, routes retired in PR 2) deleted. The viewer's own party
> tile goes to `/character/new?session_id=…` when they have no character and to
> `/character/{id}` when they do; the eject control on that tile is "Leave the party"
> via `POST /api/characters/{id}/eject`. The character page shows a version-drift panel.
> The character page keeps main's two-column shell: `CharacterAvatarPane` (restored) at
> 33vw on the left, full-height wedge; the sheet scrolls on the right, values laid out by
> the config's groups. `AvatarPlate` is the create form's, not this page's.

- `characterLine` (1893-1901): `character_display_name`, plus "· dead" when
  `character_is_alive === false`. Remove level/class.
- `handleSelectCharacter` (586) is **deleted**. A roster member with no character has
  exactly one action now — build one — so the button reads "Create a character" and
  navigates to `/character/new?session_id=<sessionId>`. There is nothing to choose between
  (see `02-api-site.md` §0 and §3.3), so there is no chooser.
- `handleReleaseCharacter` (598) → `handleEjectCharacter`, calling
  `useEjectCharacter(characterId)` (`POST /api/characters/{id}/eject`). Copy:
  "Eject character" and the tooltip "Cannot eject while a game is running" becomes
  **allowed** (the backend permits it, saves the character's current state out of the room
  and then notifies it) — delete the `hasRunningGame` gate at 1911/610 for this action only.
  Confirm first via `ConfirmDialog` (`variant="warning"`): heading "Eject this character?",
  body "They leave the table and become a keepsake you keep. They can't come back to this
  campaign, and you'll be able to build a new character straight away." On **503** show the
  server message ("Couldn't save this character's current state from the running game; try
  again") and leave the character where it is.
- Host-side `PartyMemberCard` gains an "Eject" action for other members — the **same**
  endpoint, `POST /api/characters/{id}/eject`, since permission is read off the character
  — with the `ConfirmDialog` "Eject <name>'s character? It leaves the table for good and
  stays theirs to keep."
- `sessionStorage openCharacterModalForCampaign` (657-672): **delete** — it existed to
  reopen the selection modal after a redirect, and there is no modal.

## `CharacterSelectionModal.js` — delete the file

It has nothing to list. Creating a character joins the party, and ejection unbinds the
character from the table, so a user never holds two characters at one table — the modal's
list is empty by construction. Every entry point to it becomes
"Create a character" → `/character/new?session_id=<sessionId>`.

Delete the component, its imports, `characterMetaLine`, the `active_campaign` filter, and
`useSelectCharacter` / `useReleaseCharacter` from
`hooks/mutations/useCharacterMutations.js` (the file's exports become `useDeleteCharacter`
only; the eject hooks live in `useSessionMutations.js`). Choosing between several
characters at one table is a real feature the day a table wants it — it is in
`08-followups.md`, and it needs the deleted backend command back before any UI.

## Hooks summary (new or changed)

| Hook | File | Endpoint | Invalidates |
|---|---|---|---|
| `useCharacter(id)` | `app/characters/hooks/useCharacter.js` | `GET /api/characters/{id}` | — |
| `useCreateCharacter()` | `app/characters/hooks/useCharacterMutations.js` | `POST /api/characters/` | characters, campaigns, sessions/{id} |
| `useUpdateCharacterComponent(id)` | same | `PUT /api/characters/{id}/components/{cid}` | character/{id}, characters |
| `useSetCharacterAlive(id)` | same | `PATCH /api/characters/{id}/alive` | character/{id}, characters, campaigns |
| `useSession(id)` | `app/dashboard/hooks/useSession.js` | `GET /api/sessions/{id}` | — |
| `useEjectCharacter()` | `app/characters/hooks/useCharacterMutations.js` | `POST /api/characters/{id}/eject` | campaigns, characters, sessions/{id} |

All via `authFetch`.

## Removals in this PR (delete, then grep every symbol)

- `app/(authenticated)/character/create/page.js`
- `app/(authenticated)/character/components/CharacterWizard.js`, `components/wizard/*`,
  `components/CharacterSheet.js` (the dashboard-side D&D sheet), `FeatureChoicePicker.js`,
  `ExpandableTile.js`, `ClassTile.js`, `SpeciesTile.js`, `BackgroundTile.js`,
  `StepFooter.js`, `WizardChrome.js`
- `app/dashboard/components/CharacterSelectionModal.js` and every import of it
- `app/(authenticated)/character/hooks/useCharacterDraft.js`, `useReferenceData.js`
- `app/(authenticated)/character/utils/pointBuyCalculations.js`, `hpAcCalculations.js`,
  `diceRolling.js` (confirm no game-side import first; the game has its own dice code)
- Keep: `CharacterAvatarPane.js`, `useSetCharacterAvatar.js`.
- Any `['editions', …]` query usage (there will be none once `useReferenceData` goes).

## Verification

`07-verification.md` steps 12–16, plus: a user with zero campaigns sees the empty state at
`/character/new`; a host whose campaign has no published config sees the disabled row
with the "Configure it" link.
