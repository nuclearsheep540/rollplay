# TODO — One user, two tabs: duplicate game WebSocket connections

> **Status: found 2026-08-19 during notes conflict discussion, not scheduled.** Unrelated to notes
> — it surfaced while asking "can a user even open a session in two places?". The answer is yes,
> and it misbehaves silently.

## Verdict up front

`ConnectionManager` tracks **one socket per user per room**. A second tab silently displaces the
first, and closing the *stale* tab evicts the *live* one. Neither path errors; both look like a
flaky connection.

The second bug does not require duplicate tabs to reach — any reconnect that interleaves badly
(laptop sleeping and waking, network flap) can produce the same ordering.

## Current state (evidence, verified 2026-08-19)

`api-game/websocket_handlers/connection_manager.py`:

- **`room_users` is keyed `[room_id][user_id]`** (`:11`) — one slot per user, no notion of multiple
  sessions for the same person.
- **`connect` overwrites the slot** (`:30`): the new socket replaces the old entry wholesale. The
  first tab's socket stays open and stays in `self.connections` (appended at `:17`, never removed
  on overwrite), but is no longer reachable through `room_users` — a zombie that receives nothing
  while the user still appears connected.
- **`remove_connection` does not check socket identity** (`:39-52`). It takes the closing
  `websocket` but never compares it against `room_users[room_id][user_id]["websocket"]`. So closing
  the stale tab marks the user `"disconnecting"`, nulls the **live** tab's socket, and calls
  `schedule_user_removal` — dropping a player who is sitting right there, 30 seconds later.

## Two fixes, different ambition

### A — Make disconnect identity-aware (small, strictly a bug fix)
In `remove_connection`, only mark the user disconnecting when the closing socket *is* the stored
one:

```python
entry = self.room_users[room_id].get(user_id)
if entry and entry["websocket"] is websocket:
    ...existing disconnecting/timeout logic...
```

Stops the live tab being evicted by a dead one. Does not stop the zombie tab existing.

### B — Actively close the older connection (the behaviour Matt described wanting)
On `connect`, if a socket is already stored for this user in this room, send it a
`session_opened_elsewhere` event and close it before storing the new one. The displaced tab shows
"This game is open in another tab" rather than sitting mute.

B subsumes A but needs a frontend piece (handling the event, rendering the state). **Do A regardless
— it is correct on its own and independent of whether we ever build B.**

## Why it matters beyond tidiness

- A player evicted this way is removed from `room_users`, which drives the lobby and party display —
  so other players watch them vanish for no reason.
- `self.connections` accumulates zombie sockets that are never pruned until the client closes them.
- It is a plausible cause of "I got disconnected for no reason" reports that would otherwise be
  blamed on the network.

## Out of scope / open

- Whether two tabs on the *same* game should be allowed at all (B says no) or merely survivable
  (A says yes, quietly).
- The websocket `user_id` is unauthenticated and spoofable (pre-existing, noted in tokens v2). Any
  work here should not deepen that assumption.
- Cross-device (phone + laptop on the same game) behaves identically and would be affected by B —
  worth a deliberate decision rather than a side effect.
