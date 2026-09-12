# 07 — End-to-end verification

> Run after PR 6, on the dev stack (`docker-compose -f docker-compose.dev.yml up`). Two
> browser profiles: **GM** (Matt's dev user) and **Player** (a second dev user; create one
> through the magic-link flow with a second email if none exists). Paste the outcome of
> every step into the final report. A failed step stops the report at that step with the
> observed behaviour.

## Fixtures — the mock's data

Use exactly these. They are also the fixtures the api-site and contracts tests use.

**Config v1** (what the GM builds in step 3):

```json
{ "version": 1, "components": [
  { "type": "name", "id": "name_1", "label": "Name", "secret": false, "max_length": 60, "required": true },
  { "type": "hit_points", "id": "hit_points_1", "label": "Vitality", "secret": false,
    "rules": { "representation": "int", "minimum": 0, "maximum": 20, "starting": 10 } },
  { "type": "hit_points", "id": "hit_points_2", "label": "Resolve", "secret": true,
    "rules": { "representation": "weighted", "starting_weight": 1.0,
               "scale": [ {"weight":1.0,"label":"Full"}, {"weight":0.8,"label":"High"},
                          {"weight":0.6,"label":"Mid"}, {"weight":0.3,"label":"Low"}, {"weight":0.0,"label":"Zero"} ] } },
  { "type": "attribute", "id": "attribute_1", "label": "Strength", "secret": false, "minimum": 1, "maximum": 20, "default": 10 },
  { "type": "attribute", "id": "attribute_2", "label": "Agility",  "secret": false, "minimum": 1, "maximum": 20, "default": 10 },
  { "type": "attribute", "id": "attribute_3", "label": "Wits",     "secret": false, "minimum": 1, "maximum": 20, "default": 10 }
]}
```

Note `Resolve` is **secret** in the fixture (the mock shows the toggle; this exercises it).

**Brannoc Vell's values** (step 13):

```json
{ "name_1": {"type":"name","component_id":"name_1","text":"Brannoc Vell"},
  "hit_points_1": {"type":"hit_points","component_id":"hit_points_1","state":{"representation":"int","current":10}},
  "hit_points_2": {"type":"hit_points","component_id":"hit_points_2","state":{"representation":"weighted","current_weight":1.0}},
  "attribute_1": {"type":"attribute","component_id":"attribute_1","score":14},
  "attribute_2": {"type":"attribute","component_id":"attribute_2","score":10},
  "attribute_3": {"type":"attribute","component_id":"attribute_3","score":8} }
```

**Config v2** (step 21): Vitality `maximum` 25; Wits removed; new attribute
`attribute_4` "Nerve" 1–20 default 10. Expected diff, in order:
`hit_points_1 changed [rules.maximum]`, `attribute_3 removed`, `attribute_4 added`.

## Backend by curl (after PR 2 and PR 3)

0. The character created through the old wizard before PR 2 (`02-api-site.md` §5.0) still
   exists: `GET /api/characters/<old id>` returns its old name as `display_name`,
   `is_keepsake: true`, `session_id`, `campaign_id` and `config_version_id` all null, and a
   snapshot with Name, Hit points and one Attribute per ability score. The campaign it was
   seated in shows an empty seat for that user. Its `slot`, avatar and colour are unchanged.
2. As GM: `POST /api/campaigns/` "Secret to Bear"; `PUT …/character-config/draft` with
   config v1; `GET …/character-config` shows `draft`, no `latest`, `pending_changes` = six
   `added`. `POST …/publish` → `latest.version == 1`, `draft == null`, `versions` has one.
3. `POST …/publish` again → 400 "No changes since v1".
4. As Player (after accepting the invite): `POST /api/characters/` with the session id and
   Brannoc's values → 201, `display_name == "Brannoc Vell"`, `config_version_id` set,
   `config_snapshot.version == 1`. `GET /api/sessions/{id}/party` shows Brannoc seated with
   no `values` key. Second `POST` with the same session → 400 "already have a living
   character".
5. As GM: `POST /api/games/` (Start). `GET` the api-game room (`/api/game/{game_id}`) as
   Player: `character_configs` has one key; Player's `values` has six entries. As a **third**
   user (or the GM's second tab acting as another player — if no third user, skip and say
   so): `hit_points_2` is **absent** from Brannoc's values. As GM: present.
6. As Player: `PUT /api/game/{game_id}/players/{player_uid}/components/hit_points_1` with
   `current: 7` → 200; a websocket client on the GM sees `player_component_changed`; the
   room shows 7; a system log line reads `Brannoc Vell — Vitality: 10 → 7`.
7. `PUT` with `{"type":"attribute","component_id":"hit_points_1","score":3}` → 400 (type
   mismatch). `PUT` `attribute_1` with `score: 99` → 200 (out of range is allowed).

## Campaign builder (after PR 4)

8. GM opens `/campaign/new`: rail with three vertical tabs, Overview active, band reads
   "unpublished". Type the title and description, pick a tile, set seats to 6, Save
   campaign → URL becomes `/campaign/<id>?section=overview`, toast shown.
9. Character tab: palette lists Name, Hit points, Attribute. Build config v1 through the
   UI (add each, set labels and rules, tick Secret on Resolve). Band shows "unsaved
   changes". Save campaign → hint clears; `GET …/character-config` shows the draft.
10. Versions sub-tab: pending changes list six additions; **Publish v1** → toast, list shows
    v1, band reads `v1`.
11. Reload the page; the draft is gone, the Components sub-tab shows v1's components (seeded
    from `latest`). Edit Vitality maximum to 25 → "unsaved changes" reappears.

## Character create flow (after PR 5)

12. Player opens `/character/new` with no campaigns → empty state with the two buttons.
    Accept the invite (from Home or the chooser's "Waiting on you"), open `/character/new`
    again → "Secret to Bear · v1" row enabled.
13. Click it → the form: plate reads "Built against v1 · run by <GM>", six inputs in GM
    order with attributes grouped. Enter Brannoc's values, Take a seat → toast "Seated at
    Secret to Bear", lands on `/character/<id>` showing the name, `v1`, and the values.
14. Characters tab shows Brannoc with "Secret to Bear"; Home hand shows Brannoc. GM's
    campaign drawer shows Brannoc in the party.
15. Player: campaign drawer → Eject character → party shows the seat empty; `/character/new?session_id=…`
    → creating a second character succeeds only after ejecting (try before ejecting → 400
    toast naming the rule).
16. GM edits a value on Brannoc from `/character/<id>` (as host) → saved. Start a game,
    try again → toast "A game is running: edit this character in the game".

## Game runtime (after PR 6)

17. Both enter the game. Player's seat card shows "Brannoc Vell" and **one** bar
    (Vitality, 10/20) on the GM's screen it shows **two** (Vitality and Resolve = Full).
18. Player opens the character tab: sheet shows Name, then Vitality and Resolve, then
    Strength/Agility/Wits; no other sections. Step Vitality to 7 → both screens update;
    log line appears. GM picks Player from the sheet's member picker and sets Resolve to
    Mid → Player's bar shows 60% and "Mid".
19. Set Vitality to 0 → empty bar, caption `0 / 20`, nothing else happens. No death saves,
    no prompt.
20. GM types "Roll for the storm" and presses Prompt all → Player sees the banner with that
    text; GM clears it → banner gone. Single-target dice prompt still works.
21. End the game (GM). `GET /api/characters/<brannoc>` shows Vitality 0 and Resolve 0.6
    persisted. GM publishes config v2 (edit per fixtures). Versions sub-tab showed the
    three expected pending changes before publishing.
22. Start a new game. Brannoc enters on v1: room `character_configs` has one key (v1);
    seat card and sheet unchanged; `GET …/character-config` as GM lists v2 as latest.
    A new Player character created now builds against v2 and shows Nerve, not Wits; in the
    same game the room holds two config keys.
23. GM deletes the campaign. Player's Characters tab shows Brannoc marked Keepsake; the
    detail page renders every value from the snapshot; Seat/Eject actions absent. Brannoc
    and the migrated character from step 0 now look identical in state: both keepsakes, both
    without a version tag, both listed with no campaign title.
24. Copy sweep: with the game open, search the DOM text (browser find) for "initiative",
    "AC", "class", "level", "spell" — none present.

## Suites

- `docker exec api-site-dev python -m pytest /rollplay-shared-contracts/tests/ -q`
- `docker exec api-site-dev python -m pytest modules/ -q`
- `docker exec api-game-dev python -m pytest tests/ -q`
- The contracts CI loop from `01-contracts.md`.

All green, all 24 steps passed, and the dead-code sweeps listed per PR, is done.
