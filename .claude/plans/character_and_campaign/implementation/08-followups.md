# 08 — Deliberately not in this work

> Append to this file when you find something out of scope. Never pull from it into a PR
> without Matt's instruction.

## Decided later, recorded now

- **Framework preset (D&D SRD as a copyable config).** Needs `Number`, `Text`, `Choice`
  primitive components and an authoring pass that expresses the SRD as configurations.
  The dormant `shared/rulesets/`, `seed_data/`, `edition_endpoints.py` and the `editions`
  table are its raw material; nothing else keeps them alive.
- **Overview story fields** (Starting the adventure, Important characters, Key locations,
  Secrets and clues, tags): rendered in PR 4 as local state, not persisted. Needs columns
  or a `campaign_story` JSONB and an explicit decision on which are player-visible.
- **World section**: stub only. Reference tables are display-only when they come.
- **Rename `DungeonMaster` / `dungeon_master`** in contracts, api-game and the room
  document to `GameMaster` / `game_master`. Cross-service; do it as its own PR with a
  contracts bump.
- **`CharacterRuntimeBundle` is declared twice** (api-site schema, api-game schema). If a
  third consumer appears, promote it to a shared contract.
- **`is_alive` in the room.** Dead characters are expected to be ejected before a game.
  If a character dies mid-game, the runtime shows the zero point; marking dead is a
  dashboard action. Carry `is_alive` into `PlayerCharacter` if the table asks for it in-game.
- **Per-component seat-card pinning** (GM chooses what shows on the seat card).
  `SEAT_CARD_TYPES` is a constant until then.
- **Player visibility of other players' cold sheets.** Cold `GET /api/characters/{id}` is
  owner + host only. A read-only party sheet view on the dashboard, with secret filtering,
  is a later feature.
- **Create-form drafts.** Refreshing `/character/new` loses input. A draft column returns
  only if players ask.
- **Notifying players on publish.** `PublishCharacterConfigVersion` emits no event. A
  `campaign_config_published` event (toast + notification) is cheap once wanted.
- **Structured adventure log.** `existing_plans/../TODO-structured-adventure-log.md`'s
  client-side composition. api-game composes the component-change line server-side for
  now.
- **Config-driven runtime prompts.** Matt: far-fetched for now.
- **Copy sweep for the literal "D&D" and "Dungeon Master"** across the whole app and
  CLAUDE.md's opening line. Cheap; outside this epic; still not done.

## Closed by this work (delete the files when the PRs land)

- `existing_plans/TODO-runtime-character-state-authority.md` — hot-only during play, End
  writes cold (`00-high-level.md`).
- `existing_plans/TODO-character-enrollment-and-identity.md` — session-scoped creation
  supersedes enrollment; the identity leak was fixed earlier (screen_name only in ETL).
- `existing_plans/character_v2/` and `existing_plans/character-v2.md` — superseded in full.
- `home/05` §"Where players and characters live" — adopted with the session binding and
  one-per-seat changes; the v1 publish flow in that file stays parked.
