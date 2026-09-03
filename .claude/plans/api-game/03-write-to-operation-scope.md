# api-game 03 — Write to the Operation's Scope

**Status:** PLANNED 2026-09-03, not built. Same branch/PR as 01 (async driver) and 02
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

### D2 — `update_seat_layout` writes only the indices that changed
The validation read already exists; keep every check. Then diff against the current layout
and `$set` only `seat_layout.<i>` for changed indices, in one update. Two players sitting
simultaneously touch two indices and both land. Length changes stay in `update_seat_count`.
The client still sends the full array — the complete object on the wire — and the server
writes its scope.

### D3 — `PUT /game/{room}/map` writes `map_config.pc_token_scale` and `update_complete_map` is deleted
The route's only caller changes one field but sends its whole cached map. Write that field
through the existing narrow shape (`update_map_config` already writes
`map_config.grid_config` / `map_config.map_image_config` by path). The grid re-snap detection
in the route stays. `update_complete_map` then has no callers and goes (delete-superseded-code).

### D4 — Client payloads are unchanged
"Send complete objects" still governs the wire. The frontend is untouched.

### D5 — No versioning, no transactions
Optimistic locks and multi-document transactions are the next tool up and nothing here needs
them; disjoint `$set` paths are sufficient for every case in §2.

## 4. Proof

Round-trip tests in `tests/test_services_roundtrip.py`, each owning its room, **run against
the unfixed code first and shown failing**:
- Two `update_player_character` calls for different users via `asyncio.gather`; assert both
  entries present. (Fails today: whole-map write.)
- Two concurrent updates to the *same* user with disjoint fields (name vs `hp_current`); assert
  both fields present.
- Two concurrent `update_seat_layout` calls seating different users at different indices;
  assert both seated.
- A fog write, then a `PUT /map` carrying a pre-fog copy; assert fog survives.
Manual: two players select characters at session start; both nameplates correct.

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
