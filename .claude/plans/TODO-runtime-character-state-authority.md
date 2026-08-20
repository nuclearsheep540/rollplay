# TODO — Runtime character state: two stores, one writer (HP/XP authority)

> **Status: found during notes R&D (2026-08-19), not scheduled.** Captures a live bug plus the
> design question behind it. Nothing here blocks the notes feature — notes were the thing that
> made us trace this path, and they deliberately do *not* follow it (see "Why notes are different").

## Verdict up front

Runtime character state (HP, XP, death saves, inventory…) is **written to PostgreSQL only**, while a
**stale copy of some of it sits in the hot Mongo doc** and is what other players actually look at.
There is no dual-write and no broadcast. The intended pattern — *api-site owns the rules, the hot doc
carries the live value* — is implemented for **character colour** and not for HP.

Consequence: **when a player takes damage, every other client keeps showing the old HP** until an
unrelated `seat_change` event happens to refresh it. Almost certainly reproducible in under a minute.

Not yet hit in practice because the group is tracking HP/XP on hand-managed sheets; the in-app
feature was built early and has never been leaned on.

## Current state (evidence — all verified 2026-08-19)

**The hot doc carries HP.** `PlayerCharacter` in
`rollplay-shared-contracts/shared_contracts/character.py` includes `level`, `hp_current`, `hp_max`,
`ac`. So they ride the ETL into Mongo at session start and are present in `player_metadata`.

**The write path never touches Mongo.**
- `rollplay/app/game/components/CharacterSheet.js:391` → `useRuntimePatch`
- `rollplay/app/game/hooks/useCharacterRuntime.js:72` → `PATCH /api/characters/{id}/runtime`
  (optimistic cache write, revert on error)
- api-site persists to PostgreSQL. **No WebSocket emit, no api-game call.**
- `useRuntimePatch` has exactly one call site (`CharacterSheet.js`). Nothing else writes runtime state.

**api-game has no HP logic at all.** A grep for hp/xp/hit_point across `api-game/**.py` (excluding
tests) returns exactly one hit — a comment:
```
# Phase I: pull this player's latest character snapshot from api-site so runtime changes
# (level-up, HP, AC) flow into player_metadata on the next seat interaction. Best-effort.
```
`api-game/websocket_handlers/websocket_events.py:290`, inside the **`seat_change`** handler. That is
the only mechanism that ever refreshes hot HP, and it is triggered by an unrelated user action.

**The pattern we want already exists for colour.** `_extract_and_sync_game_state`
(`api-site/modules/session/application/commands.py:896`) syncs character colour hot → cold, with the
comment: *"Color is character-owned: the hot session carries it on player_metadata and the character
row is its durable home — the seat never stores it."* Two character-owned fields, two opposite
patterns.

**Fields currently on the direct-to-Postgres path** (`RuntimePatchRequest`,
`api-site/modules/characters/api/schemas.py`): `hp_current`, `hp_temp`, `xp`, `inspiration`,
`status_effects`, `death_save_successes`, `death_save_failures`, `is_alive`, `ac`,
`exhaustion_level`, `resource_usage`, `currency`, `inventory`.

## The options

### A — Keep PostgreSQL authoritative, add the broadcast (small)
api-site stays the rules authority exactly as intended. After a successful runtime PATCH, the value
also lands in the hot doc and broadcasts to the room — mirroring what colour does. Nothing moves;
the missing half gets built.

**Cost:** a write path from api-site (or the client) into api-game after a successful patch, plus a
`character_runtime_update` broadcast event. Retains today's durability: a runtime change is in cold
storage the moment the 200 comes back.

### B — Hot-only during play, ETL at session end (Matt's preference, 2026-08-19)
api-site is consulted for *permission* ("can HP be set to this?") and returns 200 **without
persisting**. api-game writes to Mongo and broadcasts. Cold storage catches up at ETL.

**Why it's attractive:** it removes the "update on the fly AND then ETL" duality, and makes runtime
state behave like every other piece of live session state.

**Three things to resolve before this is safe** (see next section) — this is not a rejection, it is
the actual work.

### C — Drop HP from the hot doc entirely
Remove `hp_current`/`hp_max`/`ac` from the `PlayerCharacter` contract; every client reads HP from
api-site. Kills the dual-source problem outright and is the smallest change, but there is then no
live "the fighter just took 12 damage" broadcast. Listed for completeness; probably not what we want.

## What must be resolved before option B

1. **The expiry sweeper skips the character sync — today.**
   `expired_session_cleanup.py:49` constructs `PauseSession(character_repository=None, # pause
   doesn't use it)`, and `_extract_and_sync_game_state` guards the colour sync with
   `if character_repo:`. So an **auto-paused session silently drops character state**. Right now
   that costs a colour change. Under option B it would cost **the entire session's HP, XP and
   inventory**. This is a one-line fix and should be made regardless of which option wins.

2. **Draw the line at the ruleset registry, not at "ephemeral vs structural".** The field split
   option B needs is real, but the boundary is about *what can be validated without api-site's
   ruleset registry*. Three tiers:

   - **Tier 1 — field bounds.** `hp_current >= 0`, `ac` 1-50, `exhaustion_level` 0-6, death saves
     0-3. Stateless. A shared contract owns these outright — exactly what `map_token.py:36` already
     does with `footprint: int = Field(default=1, ge=1, le=4)`, and `audio.py` with its `ge`/`le`
     volume and mix bounds.
   - **Tier 2 — intra-object invariants.** `hp_current <= hp_max`; dropping to 0 flips `is_alive`.
     Needs only the object itself, so it is shareable as a `grid_math`-style function. The logic
     already exists in `character_aggregate.py:462-496` (`apply_damage` / `heal` clamp with
     `min(self.hp_max, ...)`).
   - **Tier 3 — rules-derived, NOT shareable.** `hp_max` is not a constant: it grows on level-up
     (`character_aggregate.py:637`) and is recomputed against `compute_hp_max` when CON changes
     (`:712`). That derivation comes from `shared/rulesets/` — the `RulesetRegistry` that loads SRD
     seed JSON at api-site boot, keyed by edition. Inventory is the same shape:
     `character_inventory_model.py` notes the catalogue has "no FK — catalogue lives in the ruleset
     registry". Moving tier 3 to api-game means porting the ruleset engine there. Nobody wants that.

   **Tiers 1-2 cover all of combat** — damage, healing, temp HP, death saves, `is_alive`,
   exhaustion, AC. Those can go hot-only with a shared contract. Tier 3 is level-up and
   inventory/currency, which stay on the api-site path.

   This framing rescues **`xp`**, which the earlier ephemeral/structural cut sent the wrong way:
   validating `xp` is just `ge=0`, and only *level-up* consults the registry. XP can sit hot.

3. **The api-site round trip probably is not needed at all.** Nothing in api-site does dry-run
   validation today, and building a validate-without-persist endpoint would be a new shape for us.
   Given tiers 1-2 above, option B collapses to "api-game owns combat state, validated against a
   shared contract" with **no api-site call** — simpler than the version originally described, and
   squarely in the pattern the contracts package exists for (`ContractModel` sets `extra="forbid"`
   precisely so the boundary fails loudly rather than silently; `grid_math.py` is the precedent for
   sharing behaviour rather than just shapes). Per the contracts CI gate, any such addition needs a
   matching extension to `rollplay-shared-contracts/tests/test_contracts.py`.

## Implementation steps (option A — the small one, if we want the bug gone first)

1. `api-game`: add a `character_runtime_update` WS event + a `GameService.update_player_character`
   call for the changed fields (the function already exists and is used by the `seat_change`
   refresh).
2. `api-site`: after a successful `UpdateRuntimeState`, POST the changed fields to api-game. Extend
   the shared contract with a small `RuntimePatch` payload (per the contracts CI gate, this needs a
   matching addition to `rollplay-shared-contracts/tests/test_contracts.py`).
3. Frontend: handle `character_runtime_update` → update `player_metadata` so party cards re-render.
4. Delete the best-effort refresh bolted onto `seat_change` (`websocket_events.py:290`) — it exists
   only to paper over this gap.
5. Fix `expired_session_cleanup.py:49` to pass a real `character_repository`.
6. Verify: two browsers, one takes damage, the other's party card updates without a seat change.

## Why notes are different (so nobody "fixes" notes into this path later)

The defect here is not *"it writes to PostgreSQL"* — it is that **two stores both hold the value and
only one of them is written**. Notes are private, single-writer, non-diegetic, and broadcast to
nobody, so there is never a second copy to go stale. That is why notes go straight to api-site and
never enter the ETL or the shared contract. See the notes plan.

## Out of scope / open

- Which tier-2 invariants are worth sharing as functions vs re-implementing in api-game.
- Whether the party panel should show other players' HP at all — a product question that may make
  option C viable.
- `websocket user_id is unauthenticated` (pre-existing, noted in tokens v2) — relevant if api-game
  starts accepting character-state writes.
