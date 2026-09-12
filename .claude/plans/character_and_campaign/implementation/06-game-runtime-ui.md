# 06 — Game runtime UI: render what you are given

> Read `00-agent-brief.md` first. Depends on PRs 3 and 5. Paths relative to `rollplay/`.
> This PR makes the seat card and the in-game sheet mappers over the component registry,
> wires the component write, and deletes every D&D surface in the game.

## State (`app/game/GameContent.js` + `app/game/hooks/webSocketEvent.js`)

- New state slice `characterConfigs` (`{ [versionId]: CharacterConfig }`), set by
  `handleInitialState` from `room.character_configs`, and extended by
  `handlePlayerCharacterChanged` when the event carries a `config` not yet present.
- `playerMetadata[userId]` now carries `display_name`, `config_version_id`, `values`.
  `characterNameMap` (200-208) reads `display_name`. `getCharacterData` (222) returns
  `{ identity, configuration: characterConfigs[meta.config_version_id], values: meta.values }`.
- New handler `handlePlayerComponentChanged` (`player_component_changed`
  `{user_id, component_id, value}`): sets `playerMetadata[user_id].values[component_id] = value`
  by producing a new object (never mutate). Register it in `useWebSocket`'s handler map.
- `handlePlayerCharacterChanged` (140-183): merge identity + `config_version_id` + `values`
  (replace `values` wholesale when the event carries a different `character_id`;
  otherwise leave `values` alone — the room did the same). A null `character_id` clears the
  character fields for that seat.
- Remove: `combatActive`, `initiativeOrder`, `currentInitiativePromptId` state (291-300),
  `promptAllPlayersInitiative`, `handleInitiativeClick` (1574-1598), `handleCombatState`
  (267), `handleInitiativePromptAll` (350) → replaced by `handleGroupPrompt`, senders
  `sendCombatStateChange`, `sendInitiativePromptAll` → `sendGroupPrompt(promptText)`
  (`createSendFunctions`, 457). Remove `myCharacter` from `useMyCharacterForCampaign`
  (392) — "my character" is `getCharacterData(thisUserId)`. Delete
  `app/game/hooks/useCharacterRuntime.js` entirely and `LevelUpModal` usage (2250, 395).

## Component write — `app/game/hooks/useUpdateGameComponent.js`

```js
export function useUpdateGameComponent(roomId) {
  // mutationFn: authFetch(`/api/game/${roomId}/players/${userId}/components/${componentId}`,
  //   { method: 'PUT', credentials: 'include', body: JSON.stringify({ value }) })
  // No optimistic update: the room is authoritative; the broadcast updates state.
  // Expose `pendingComponentIds` (Set) so the sheet can show a pending state per field.
}
```

`/api/game` is already routed to api-game by nginx. On 400 show the server message via
`showToast`; on 403 "Only the player or the GM can change that".

## Seat card — `app/game/components/PlayerCard.js`

Keep: name (`resolveName` now over `display_name`), seat colour, avatar, turn state,
dice roll button. Delete: class/level line (36-40), the HP bar and its colour thresholds
(41-42, 170-198), `statusEffects` chips (206-216).

Add, under the name: for each configuration in `characterConfigs[meta.config_version_id]`
whose type is `hit_points`, in config order, and whose value is present in `meta.values`
(absent = secret to this viewer → render nothing), the type's `SeatCompact`. Other types do
not appear on the seat card in v1 (`RUNTIME_TYPE_ORDER` is for the sheet; the seat opt-in
is a constant `SEAT_CARD_TYPES = ['hit_points']` in `PlayerCard.js`).

`hit_points/SeatCompact.js`: label (`text-[11px] uppercase tracking-widest`), a 6px bar,
and a value caption. Int: fill = `(current - minimum) / (maximum - minimum)`, caption
`current / maximum`. Weighted: fill = `current_weight`, caption = the step's label. Fill at
or below zero renders an empty bar with the caption; nothing else happens.

## In-game sheet — `app/game/components/RuntimeCharacterSheet.js` (replaces `CharacterSheet.js`)

Props: `{ configuration, values, displayName, isOwner, isGM, onChange, pendingComponentIds }`.

Renders a header (display name Metamorphous, `v<configuration.version>`), then every
configuration grouped by `RUNTIME_TYPE_ORDER` (unknown types last, in config order),
GM order within a group. Each group has an eyebrow (the type's catalogue label,
pluralised by a small map `{name: 'Name', hit_points: 'Hit points', attribute: 'Attributes'}`).
Each entry renders `pieceFor(type, 'SheetFull')` with `editable = isOwner || isGM`. Absent
value → the entry is skipped (secret to this viewer). It has **no sections of its own**.

`SheetFull` per type:
- **name**: text, editable inline (blur commits).
- **hit_points** int: stepper (−, value input, +) bounded by `minimum..maximum`, commit
  on blur or step; weighted: chip row like the create input; the current chip gold.
- **attribute**: number input bounded by `minimum..maximum`.

Every commit builds the full value object and calls `onChange(componentId, value)`. While
`pendingComponentIds.has(componentId)` the control is disabled with `opacity-60`.

The sheet opens where `CharacterSheet` opened (left drawer `character` tab, 2222); it
shows for `getCharacterData(thisUserId)`; the GM additionally gets a member picker above
it (a `Dropdown` of seated players) to open anyone's sheet. Delete `CharacterSheet.js`,
`LevelUpModal.js`, `ModeratorControls.formatCharacterSummary` (59-66; the summary line is
now `display_name` only).

## Adventure log

api-game appends a system line on every component write (see `03-api-game.md` §4
addendum); the client renders it as any other system message. No client composition in
v1. `describeChange` in the registry exists for the pending-state tooltip only
("Vitality 10 → 7") and must produce the same text the server template does.

## Prompts

- `CombatControlsPanel.js` → rename to `PromptsPanel.js`. Delete the combat toggle
  (24-39, 101-110) and the initiative prompt list (64-95). Keep the single-target dice
  prompt UI (it already takes free text). Add a **Prompt everyone** row: text input
  placeholder "What should everyone roll?", `maxLength=120`, gold `PlateButton`
  "Prompt all" → `sendGroupPrompt(text)`; disabled when empty.
- Players: the existing dice prompt banner (`handleDicePrompt`, 320) shows group prompts
  too, with the `prompt_text` as the message and "GM" as the source; `dice_prompt_clear`
  dismisses it. `DMDicePrompt.js` shows active group prompts with a Clear button.
- Delete `HorizontalInitiativeTracker.js` and its render (2502), and the
  `DMControlCenter` stale export in `app/game/components/index.js:9-19`.

## Copy sweep

Grep `app/game/` for `initiative`, `combat`, ` AC`, `class`, `level`, `spell`, `death
save`, `inspiration`, `saving throw`, `d20` and remove or reword every user-facing
occurrence. Keep `class` where it is CSS.

## Tokens and chips

`app/map_tokens/components/MapTokenChipList.js:39,48` and `MapTokenLayer.js:555` read
`character_name` → `display_name`. Nothing else changes.

## Verification

`07-verification.md` steps 17–24. Compile check per the brief.
