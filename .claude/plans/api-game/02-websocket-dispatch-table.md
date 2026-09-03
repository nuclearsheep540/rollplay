# api-game 02 — WebSocket Dispatch Table

**Status:** IMPLEMENTED 2026-09-03. Same branch/PR as the async migration
(`.claude/plans/api-game/01-async-mongo-driver.md`), which is what surfaced it.
**Scope:** `api-game/websocket_handlers/app_websocket.py` (rewritten receive loop),
two handler validations in `websocket_events.py`, one new test file. No wire, contract,
frontend, or handler-logic changes.

---

## 1. Why

Copilot's review of the async migration flagged that hold cleanup runs only inside
`except WebSocketDisconnect`, so any other escaping exception killed the socket without
releasing the player's map-token holds — permanent now that holds don't expire (tokens
decision 54). Fixing that in the old shape meant editing 29 branches.

Matt's read of the history: the loop began as adventure-log broadcasting with seat changes
coupled to it, and everything since has been appended to that switch. The handlers, their
uniform signature, and `WebsocketEventResult` already existed; what was missing was the
router. The frontend already dispatches through a registered-handler map.

Measured before the change: 29 branches, 27 of which were `await
WebsocketEvent.<same name>(...)` plus copying the result — nine identical lines each — and
2 inner `try` blocks for the whole thing.

## 2. What the loop absorbed

| Deviation | Events | Became |
|---|---|---|
| Identical call + result copy | 27 | one dispatch through `EVENT_HANDLERS` |
| Redundant "error → sender only" check | 3 | deleted; the generic check already did it, and null-checks first |
| Per-handler `try` | 2 (`map_load`, `image_load`) | one `try` around every dispatch |
| "No broadcast → skip" | 4 (token update/drag, map/image request) | `if result.broadcast_message is None: continue` |
| Pre-dispatch payload validation | 2 (`seat_change`, `initiative_prompt_all`) | moved into those handlers |
| Post-dispatch side effects | 3 | spelled out in the loop, not hidden in the table |
| Unknown event | 1 | a dict miss |

`app_websocket.py`: 526 → 243 lines.

## 3. Decisions

### D1 — The table is declared, never derived
`EVENT_HANDLERS` is 27 explicit entries. **Never `getattr(WebsocketEvent, event_type)`**:
the class also holds `player_connection`, `player_disconnect`, `player_displaced` and
`system_message`, which the server calls itself and no client may reach, plus the private
helpers. Reflection would expose all four to any client. The dict is therefore the wire
allowlist, and `tests/test_event_dispatch.py` fails if it is ever built reflectively.

### D2 — Validation belongs to the handler that owns the payload
`seat_change` now rejects a non-list layout itself via `WebsocketEventResult.error(...)`;
`initiative_prompt_all` returns no broadcast when `players` is empty, matching the router's
previous silence exactly. **One deliberate wire change**: seat-change's error payload moves
from a bare string to the `{"detail": ...}` shape every other handler already uses. The
frontend only `console.error`s the payload, so nothing parses it.

### D3 — Ordering preserved where clients depend on it
`seat_change`'s lobby refresh runs **before** its own broadcast, so clients still see
`lobby_update` then `seat_change`. The dice follow-ups (including the 0.5s delay, kept as-is
and not this change's business) run after. Both are explicit `if`s in the loop — two hooks
did not justify a hook abstraction.

### D4 — Cleanup in `finally`, on every exit path
`player_disconnect` runs first so a later failure in the lobby broadcast cannot strand a
token. A handler exception no longer escapes the loop at all (D5), so `finally` fires only on
a genuine socket end.

### D5 — Handler exceptions become an error reply
Previously only `map_load`/`image_load` were wrapped; anywhere else an exception broke the
loop and killed the socket.

### D6 — Dead code removed
`datetime`, `LogType`, and a third unused `AdventureLogService` instance — all already dead
before this change, all in the file being rewritten.

## 4. Proof

A/B: the same 16-event sequence (map load, token place/move/drag/remove, combat, seat change
valid and invalid, empty initiative, map/image clear, audio batch, a server-only method, an
unknown event) run against the old router and the new one, on a throwaway room created and
deleted over HTTP.

**Behaviour identical on 15 of 16**; the single diff is D2's error payload shape.

The `finally` fix, before and after, with a malformed frame (which makes `receive_json` raise
something other than `WebSocketDisconnect`) while player A holds a token:

| | Observer sees `player_disconnected` |
|---|---|
| Before | **no** — hold stranded for the life of the process |
| After | **yes** — hold released |

Suite: 84 passed in-container (77 + 7 new dispatch tests). The allowlist tests were run
against a deliberately reflection-built table first and failed naming all four server-only
methods, then passed once restored.

## 5. Deliberately not done

Server-side DM gating on `map_load`, `image_load` and the audio events, which currently have
none — now a one-line addition in the loop rather than 29 edits. The other Copilot findings
(player-metadata clobber, lobby-update `KeyError`, log-retention race) are separate. The
dice-roll `asyncio.sleep(0.5)` stays.
