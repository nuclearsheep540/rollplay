# api-game 03 — Write to the Operation's Scope

**Status:** IMPLEMENTED 2026-09-03. D1 (player metadata) built and verified. D2 was withdrawn
as planned, then **fixed properly via the wire change it needed** (D2b below). D3 remains open.
A fourth bug surfaced while tracing D1 and is fixed here too (D6, character colour). Same branch/PR as 01 (async driver) and 02
(dispatch table), which are what exposed this.
**Scope:** three write paths in api-game, one deletion, one CLAUDE.md refinement. No wire
change: clients keep sending complete objects.

---

## 1. Why

CLAUDE.md's "Atomic State Updates" rule was written against **field drift**: api-game's local
models hand-copied contract fields and silently dropped new ones four-plus times
(`cine_config.style` most recently). The cure was to compose the contract and spread rather
than whitelist, so a field nobody listed still travels. That is a rule about how an object is
**built**. It was never a claim about concurrency, and it did not need to be: the blocking
driver made every handler an accidental critical section, so two read-modify-write cycles
could not interleave.

01 removed that block. Now a handler that reads a container, changes one member, and writes
the whole container back is a race: the second writer's copy predates the first's write, so
the write erases it. Nothing errors.

**The refinement (Matt, 2026-09-03):** the unit of atomicity is the *operation's own scope*,
not a level of the document. A character swap must land its six character fields together; a
damage tick touches one. MongoDB applies one `update_one` atomically, so a multi-key `$set` in
a single update is atomic over exactly the keys the operation touches and no others. That keeps
the principle (send/write a complete object) and fixes the bug (the object was the wrong one —
the container, not the member the caller owns).

## 2. Audit — every write in api-game, 2026-09-03

| Site | Writes | Writers | Verdict |
|---|---|---|---|
| `update_player_character` (gameservice:385) | whole `player_metadata` map, after a read | every player (api-site on character select, WS seat refresh) | **FIX** — the outlier; the other three metadata writers already write `player_metadata.<uid>.<field>` |
| `update_seat_layout` (gameservice:140) | whole `seat_layout` array, after a validation read | every player | **FIX** — two players sitting at session start; second erases the first's seat |
| `PUT /game/{room}/map` → `update_complete_map` (mapservice:233) | `replace_one` of the DM's *client copy* of the map doc | DM only, but over HTTP while the same DM's fog/grid edits arrive over WS — two tasks | **FIX** — the one caller (`PlayerTokenSizeControl`) changes one field; a stale copy overwrites fog |
| `replace_map_token_board` (gameservice:525) | whole board `$set` on grid re-snap | DM re-snap vs any player's concurrent move | **note, defer** — a move in the same instant as a grid save is lost; fix is a `bulk_write` of per-token positional `$set`s; grid tuning mid-play is rare and the fragment reconciles clients |
| `update_spotify_state`, `set_dm`/`unset_dm` | whole object | DM only, `is_dm`-gated / rare | leave |
| `remote_audio_batch` handler | per-channel (narrow) from one stale snapshot | mixer is DM-only client-side; no server gate (that is the gating TODO) | leave |
| `update_player_color`, `update_player_role`, `update_audio_state`, `save/remove_track_config`, `update_map_config`, `update_fog_config`, `update_image_config`, `set_active_display`, `apply_map_token_op` | one path / positional | — | already correct |

Adjacent, **not this plan**: `set_active_map`/`set_active_image` are two writes that need
*more* atomicity (one document per room or a filtered upsert), the opposite shape; the log
retention `$nin` race; the lobby `KeyError`; DM gating on map/image/audio.

## 3. Decisions

### D1 — `update_player_character` writes the fields it was given, nothing else
```python
provided = {k: v for k, v in character_data.items() if v is not None}
update_fields = {f"player_metadata.{user_id}.{field}": value for field, value in provided.items()}
update_fields[f"player_metadata.{user_id}.user_id"] = user_id
await collection.update_one(filter_criteria, {"$set": update_fields})
```
- One `update_one`, multi-key: a character swap's fields land together; a damage tick and a
  rename on the same player are disjoint keys and both survive.
- The read goes: room existence comes from `matched_count`, as `apply_map_token_op` does.
- Drift-proof by the same mechanism as before — it iterates what arrived rather than listing
  fields. The spread-merge comment moves onto this loop.
- **Field-path safety, made explicit:** reject any key containing `.` or starting with `$`
  before building paths (`map_token_ops` has the precedent and a hostile-key test). `user_id`
  is the connection's / api-site's UUID, never the payload's, at the WS call site; the HTTP
  route takes it from the body today — validate it as a UUID there.

### D2 — WITHDRAWN. `update_seat_layout` keeps its whole-array write
Planned as a per-index diff. **Built, tested, and it does not work.** The failing test made
the reason obvious: writer B reads the layout *after* writer A's write, so B's diff sees
index 0 as changed (stored `alice` vs its own stale `empty`) and faithfully writes `empty`
over Alice. The diff cannot tell "I am vacating this seat" from "my copy predates someone
sitting there". Reverted, with the reasoning left in the code so nobody retries it.

### D3 — WITHDRAWN. `PUT /game/{room}/map` unchanged
Planned on the premise that the route had one caller changing one field. **It has two**:
`MapControlsPanel` (grid save — the path the grid re-snap comment says the app actually uses)
and `PlayerTokenSizeControl` (`pc_token_scale`). Both spread their whole cached map. A
hardcoded narrow write would have broken grid saving, and diffing fails for D2's reason.
`update_complete_map` therefore stays.

### D2b — DONE. Seat changes send the seat, not the layout
The wire change D2a called for, built. `GameService.set_seat_occupant(room_id, seat_index,
user_id)` validates the layout the change would PRODUCE (a seating rule is about the whole
party) and writes a single `seat_layout.<i>` `$set`. `PUT /game/{room}/seat-layout` now takes
`{seat_index, user_id}`; `update_seat_layout` survives for server-initiated whole-array writes
(disconnect cleanup) and says so.

**The broadcast had the same flaw and needed the same fix.** The `seat_change` handler
re-broadcast the client's array, so under two simultaneous joins each client published a
picture missing the other's seat and the last to arrive won on every screen. It now reads the
authoritative layout for both the party-status update and the broadcast, so the WebSocket event
only announces *which* seat changed.

Frontend: `sendSeatChange(newSeats, seatIndex)`; all three callers (kick, role change, taking a
seat) already had or could derive the index — every one of them was only ever changing one seat.

All four seating rules now raise `ValueError`, so the route maps them uniformly to 409 (the
duplicate-seat and DM checks previously raised bare `Exception` and surfaced as 500s).

### D6 — DONE. Character colour no longer rides the runtime re-sync
Found while tracing D1, and **not a clobber** — a stale read. Colour is character-owned but
edited inside the hot session and synced back to PostgreSQL only at session end. api-site's
`/internal/{id}/summary`, which api-game re-reads on every seat change to refresh HP/level/AC,
also returned `color` — so any seat interaction overwrote a player's live choice with the value
the character row held when the session began. Colour removed from that endpoint (its only
consumer is this sync); session start still seeds colour by the ETL's separate
`SessionUser`/`PlayerCharacter` path. Regression test asserts colour is absent from the summary.

This is one symptom of a wider issue recorded in
`.claude/plans/TODO-runtime-character-state-authority.md`: runtime state is written to
PostgreSQL only, the hot copy goes stale, and the seat-change re-sync exists to paper over it.
That refactor is out of this PR's scope.

### D3a — what would still fix D3 (not scoped here)
Both payloads *are* the container, and no server-side strategy can narrow what the client
widened. The fix is at the wire: send the intent, not the resulting state — the seat index and
its occupant, the map_config keys being changed. That is a frontend + backend change per
route and wants its own plan. Note this does **not** violate the field-drift rule: that rule
is about not dropping fields while *constructing* an object, not about sending state the
caller did not change.

### D4 — Client payloads are unchanged
"Send complete objects" still governs the wire. The frontend is untouched.

### D5 — No versioning, no transactions
Optimistic locks and multi-document transactions are the next tool up and nothing here needs
them; disjoint `$set` paths are sufficient for every case in §2.

## 3a. The distinction that decides which writes are fixable server-side

**`update_player_character` was fixable because its payload is already scoped to one player.**
The caller says "these fields, this user"; only the *server* widened that to the whole
`player_metadata` map. Narrowing it back needs no wire change and loses nothing.

**Seat layout and map config are not fixable server-side because the payload is the
container.** The client sends the whole array / whole `map_config`, so stale members arrive
looking exactly like intentional changes. Every server-side strategy either clobbers (write it
whole) or writes stale values over fresh ones (diff it).

**Test for the next case:** does the payload describe one thing the caller owns, or a
collection others also write? Only the first can be fixed behind the wire.

## 4. Proof

`tests/test_services_roundtrip.py::TestConcurrentWrites`, each test owning its room,
`asyncio.gather` forcing the interleave. **Run against the unfixed code first:**

| Test | Unfixed | Fixed |
|---|---|---|
| Two players select characters at once | **failed** — Alice's entry erased | passes |
| Same player, disjoint fields (rename vs damage) | passed (see below) | passes |
| Two players sit down at once (stale copy, sequential) | **failed** — Alice's seat erased | passes via `set_seat_occupant` |
| Two players sit down at once (concurrent) | — | passes; disjoint indexed writes |
| Seat rules on the resulting layout | — | passes; duplicate/no-character/out-of-range all refused |
| Colour survives a seat change | **failed** — reverted to the session-start value | passes |

The disjoint-fields test **passed against the unfixed code** — `gather` did not force those
two to interleave — so it proves nothing about the bug and is kept only as a guarantee that
the fixed shape holds. Labelled as such rather than cited as evidence.

The seat xfail is gone: the gap it held open is closed. A/B on the same stale-copy sequence,
one run: the old whole-array writer loses Alice, `set_seat_occupant` keeps both. Live over the
real route and sockets, two players take seats and **both clients see `[A, B, empty, empty]`**;
409 for a duplicate seat and an out-of-range index, 400 for the old array payload.

Live, through the real HTTP route (`PUT /game/{room}/player/character`): full character sync,
then an `hp_current`-only update that **kept** `character_name` (the merge guarantee now comes
from absent fields simply not being written), a second player unaffected, and both injection
attempts (`user_id` containing `.`, a `$`-prefixed field name) refused rather than silently
written elsewhere.

## 5. CLAUDE.md — replace "### Atomic State Updates (Game Service Only)"

Keep the heading. Replace the body with:

> **Send complete objects; write only the operation's scope.**
>
> *Payloads:* the client sends the whole object it is changing, never a fragment
> (`{ grid_config: newConfig }` alone is the field-drift bug this rule was written for).
> Drift protection lives in **construction** — compose the contract, spread rather than
> whitelist — not in writing the whole document.
>
> *Writes:* api-game writes the fields the operation owns, by path, in one `update_one`. A
> multi-key `$set` is atomic over exactly those keys, so coupled fields (a character swap)
> land together while unrelated fields (another player's entry, the DM's fog) are untouched.
>
> ✅ `{"$set": {"player_metadata.<uid>.hp_current": 12}}`
> ✅ character swap: all six character fields in one `$set`
> ❌ `{"$set": {"player_metadata": whole_map}}` — read-modify-write of a container other
>    people also write; since api-game went async (2026-09-03) handlers interleave at every
>    `await`, and the second writer erases the first
> ❌ `replace_one` with a client's cached copy of a document others edit
>
> The unit of atomicity is the operation, not a level of the document.

Also add one sentence to "### api-game (Game Session Service)" after the interleaving
paragraph: *"Concretely: never read a container, change one member, and write the container
back — write the member by path (plan `api-game/03`)."*

## 6. Not invented
No optimistic locking, no transactions, no per-field wire protocol, no change to token ops
(already correct), no touching the single-writer DM paths.
