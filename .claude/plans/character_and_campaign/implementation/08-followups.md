# 08 — Deliberately not in this work

> Append to this file when you find something out of scope. Never pull from it into a PR
> without Matt's instruction.

## Decided later, recorded now

- **Framework preset (D&D SRD as a copyable config).** Needs `Number`, `Text`, `Choice`
  primitive components and an authoring pass that expresses the SRD as configurations.
  The dormant `shared/rulesets/`, `seed_data/`, `edition_endpoints.py` and the `editions`
  table are its raw material; nothing else keeps them alive.
- **Overview story fields** (Starting the adventure, Important characters, Key locations,
  Secrets and clues, tags): **cut from the UI, not shipped unplumbed** (2026-09-13). They
  were briefly rendered as local state with a "not saved" caption; once the builder gained
  autosave that became a trap — every other box on the page saves itself, so four that
  silently don't read as a bug rather than a limitation. Bring them back with a
  `campaigns.story` JSONB to live in, plus a decision on which are player-visible. The
  mock still draws them; that is the design intent, not the current build.
- **World section**: stub only. Reference tables are display-only when they come.
- **Rename `DungeonMaster` / `dungeon_master`** in contracts, api-game and the room
  document to `GameMaster` / `game_master`. Cross-service; do it as its own PR with a
  contracts bump.
- **`CharacterRuntimeBundle` is declared twice** (api-site schema, api-game schema). If a
  third consumer appears, promote it to a shared contract.
- **`is_alive` in the room.** Dead characters are expected to be ejected before a game.
  If a character dies mid-game, the runtime shows the zero point; marking dead is a
  dashboard action. Carry `is_alive` into `PlayerCharacter` if the table asks for it in-game.
- **Several characters at one table, and swapping between them.** Ejection unbinds, so a
  character leaves for good and there is never a second one to choose between. Bringing back
  a chooser needs the deleted `SelectCharacterForSession` command and endpoint, a decision
  about what the party means when a user has two characters bound (the partial unique index
  forbids it today), and a UI that is not the old modal. Don't half-build it by making eject
  stop unbinding — that is the design this replaced.
- **Invites move from campaign to session.** Agreed in principle 2026-09-12 and deliberately
  deferred: a campaign is the published truth of a world and may one day be run by several
  groups, so you invite to a *session*, not a campaign. Sized during planning: `campaign_members`
  carries invite state and role in one row (4 migrations of history), so the move takes the
  whole table to the session — ~17 aggregate methods, 7 commands, 7 endpoints, 10 event
  factories, Start's role read, 4 test files and a backfill, plus ~24 frontend files
  (`CampaignManager`, `CampaignInviteModal`, `InviteDeck`, `SocialPanel`, `eventConfig`,
  `useAuthenticatedEvents`), 10 event types and 7 API paths. Roughly PR 2's size, as two PRs.
  Worth doing when "one campaign, many sessions" stops being the deliberately-unused
  capability. **This epic must not deepen the coupling**: `CreateCharacter` checks the
  session roster, never campaign membership.
- **`campaign_members.role` still allows `'player'`** in its CHECK constraint though nothing
  writes it after PR 2 (the role is derived at Start). Tidy the constraint and the stale
  rows whenever that table is next migrated — which is the invites move, above.
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
  one-character-per-party changes; the v1 publish flow in that file stays parked.
