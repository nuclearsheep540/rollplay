# Tokens 05 — Drag-End Stranding & Hold Liveness

**Status:** Revised 2026-09-02. Root cause re-identified after Matt's clarification and a
three-thread research pass; **not yet built**. Supersedes the 2026-08-31 "expired-hold steal"
analysis, which is retained condensed in §7 because the flaw it found is real, just not the one
Matt is seeing.
**Follow-on to:** `.claude/debreifs/map-token-rubber-banding.md` (commit `462fcb5`, PR #161). The
debrief's §5 reserve solution and §7 "own-token signature" note both predicted this bug.
**Decisions:** 53–58, continuing the token plans' numbering (04 ends at 52). **PRs:** 16–18.
**Research:** `.claude/plans/tokens/05-token-research.md` holds the React-library findings in
full; the VTT and liveness findings are summarised in §4.

---

## 1. Reported symptom (corrected 2026-09-02)

> grab token at A → drag to B → hold still at B → release → the token is back at A on my
> screen → click-and-hold it again → it **jumps to B** (where it really was) and drags with a
> constant cursor offset.

Constraints, as Matt now states them:

1. **Only in multiplayer**, when other players are also click-and-holding their own tokens.
2. **Only when the hand is still** at the destination. Moving while holding is fine.
3. **Gridless map** — confirmed.
4. **Nobody else touches the token.** The other players are on their own pieces.
5. ~~Never on DM tokens~~ — withdrawn. DM tokens rarely move in these sessions; no signal.

The 2026-08-31 write-up transcribed "the token resets while the hold is still active" and built a
theory around that (§7). Matt's clarification: the reset is noticed at release and on the next
pick-up; nobody grabbed the token. Everything below follows from that.

## 2. Root cause — two writers on one property

A token disc is one element, and its on-screen position is the element's `left`/`top` style.
Five pieces of code write those two values today (all `MapTokenLayer.js`):

| Writer | Where | When |
|---|---|---|
| React, from state | `style={{ left, top }}` at 537–538 | every render |
| Local drag | `handleTokenPointerMove` 309–310 | every pointermove |
| Drag-end reset | `endDrag` 216–219 | release |
| Remote steer loop | `animate` 445–446 | every rAF while others hold |
| Remote settle | `settleToCommitted` 388–389 | a remote hold clears |

React never reads the DOM. It remembers the last `style` object it rendered and writes a key
only when the new value differs from that memory (`setValueForStyles` diffs against
`prevStyles`; see the research file, part A0). Every imperative write above makes that memory
stale, and whenever the value React next wants happens to equal its stale memory, it writes
nothing.

**The timeline of Matt's symptom:**

1. Pointer-down renders once (`setDraggingTokenId`), recording the disc at A.
2. Dragging to B causes no renders (moves live in refs). React's memory still says A.
3. Holding still, another player grabs, releases or commits. Each of those re-renders the layer
   (`heldTokensForActiveMap` / `tokensForActiveMap` get a fresh identity, flowing
   `GameContent.js:2475` → `MapDisplay.js:394` → the layer). That render computes
   `left = drag.currentLeft` (512–513) = **B**, and React records B as what it drew.
4. Release: `endDrag` writes **A** to the DOM, then `commitTokenMove` sets state to B (gridless,
   so `snapTokenCenter` returns B unchanged — `useMapTokens.js:271`).
5. React renders `left = B`, compares with its memory B, **skips the write**. DOM at A, state
   at B. The server's board fragment arrives with B: same comparison, same skip.
6. Second grab: `startLeft = token.x × renderScale` = B (266). The first pointermove past the
   3 px threshold writes B + δ — the jump — and the drag continues offset by |B − A|.

**Why the constraints fit:**

| Constraint | Reason |
|---|---|
| Multiplayer only | Step 3 needs a mid-drag render; solo, nothing renders between pointer-down and release, memory stays A, React repaints correctly |
| Still hand | The recorded value must equal the release value; a moving hand leaves a stale recording that differs, so React repaints |
| Gridless | With a grid the snapped commit differs from the dragged value, so React repaints |
| Nobody grabs it | Nothing else is required; no other user's hand is involved at any step |

The `endDrag` docstring (203–208) states the false assumption outright: "On commit the
optimistic state lands in the same tick, so React paints the new position before this reset is
visible." It does not, whenever a mid-drag render already recorded the destination.

**Single-handed reproduction** (two browser windows, two users, gridless map):

1. Window 1: drag a token from A to B and hold still.
2. Window 2: click any *other* token (grab + release relays re-render window 1).
3. Window 1: release. Token shows at A in window 1, at B in window 2.
4. Window 1: grab it again and move — it jumps to B and drags offset.

This is also the before/after proof for PR 16.

## 3. Ruled out (don't re-tread)

- **Server / Mongo / atomic updates** — debrief §2 still holds. The server has B the whole time
  and the fragment it sends carries B. Only the dragger's screen is wrong.
- **Echo filter** — sound (`mapTokenWebSocketEvents.js:48` compares the same `thisUserId` the
  socket connected with, `useWebSocket.js:60`). A broken filter would show "held by <you>" on
  your own token every drag; it doesn't.
- **The expired-hold steal as the cause of *this* symptom** — moving a disc under a still hand
  requires a `grab` relay for that token from another user id; there is no other path in the
  code. Matt's sessions had no such grab. The chain is real but latent → §7.
- **10 s → 30 s staleness bump; frame-staleness timers** — both moot once §5 D54 deletes idle
  expiry entirely.

## 4. What the research established (2026-09-02)

Three parallel threads: React drag libraries + collaborative canvases, open-source VTTs, and
presence-liveness systems. Full React findings in `05-token-research.md`.

**One writer per position property is universal.** tldraw, Framer Motion, dnd-kit,
react-draggable, React Flow, Liveblocks, Owlbear Rodeo — none lets React and imperative code set
the same property. react-konva hit our exact bug (issue #271: shapes "jump back to prior
positions on drag end"); its author diagnosed it as "similar to how react-dom updates DOM nodes"
and fixed it by comparing against the live node instead of React's memory. React DOM has no such
switch. Three shapes are in production use:

1. **React never positions the element**; one owning code path writes position in every case
   (tldraw `Shape.tsx`, Motion's transform stripping).
2. **React positions everything**, state per pointermove, CSS `transition` for remote motion
   (React Flow, Liveblocks whiteboard).
3. **The dragged thing is a separate object** — Foundry's preview clone, AboveVTT's ghost,
   MapTool drawing the token twice, dnd-kit's DragOverlay.

"Write the destination imperatively at drop" was ranked lowest: it patches this symptom and
leaves the trap armed for any future path that commits a value React already remembers.

**No VTT surveyed has a per-token hold.** Foundry, Owlbear, PlanarAlly, MapTool, AboveVTT,
Roll20 and Fantasy Grounds all run last-write-wins with a visible social signal. Figma likewise:
two people can drag one object; the outline shows whose hand is on it. Our hold (decision 11) is
our own invention — kept, see D58 — and the **10 s idle expiry has no precedent anywhere**.

**No system infers liveness from user activity.** Yjs, Liveblocks, Socket.IO, Colyseus all run a
heartbeat on a fixed timer (15–30 s typical) independent of what the user does; explicit
disconnect is cleaned up immediately; idle is cosmetic (Excalidraw's "away" badge after 60 s
never releases anything); a staleness sweep exists only as the widest backstop. MapTool is the
mirror image of our bug — a drag is cleared *only* by an explicit stop, so a client that dies
mid-drag leaves a permanent ghost (#595). Two pitfalls: Chrome throttles hidden-tab timers to
once a minute after five minutes, which broke SignalR's own heartbeat; and Foundry learned that
lossy presence frames are fine but the *terminal* frame must be reliable (#9617). Our transport
is plain TCP WebSocket with no volatile lane, so the second is already satisfied.

## 5. Decisions

### D53 — One writer for disc position: React never renders `left`/`top`

React draws each disc (size, centring transform, lift scale, z-index, pointer-events, colour,
labels) but **not its position**. `MapTokenLayer`'s own code is the only writer, through three
call sites that all write unconditionally:

- **Local drag**: `handleTokenPointerMove` keeps writing the element directly, as now.
- **Remote steer**: the rAF loop keeps writing steered discs directly, as now.
- **Committed position**: a `useLayoutEffect` (layout, not passive — a newly placed disc must be
  positioned before first paint) writes `token.x × renderScale` for every disc that is neither
  locally dragged (`draggingTokenId`) nor remotely held (`heldTokens`). Deps: `tokens`,
  `renderScale`, `heldTokens`, `draggingTokenId`.

The invariant that makes stranding impossible: **nothing diffs a position against a memory**.
React holds no memory because it never renders the property; our writers write whether or not
the value changed. The handoffs then fall out for free:

- Drag end (any outcome): `endDrag` sets `draggingTokenId` null and, on commit, the optimistic
  state — one batched render, the layout effect writes the committed (snapped) position. The
  imperative reset at 216–219 and its docstring are deleted.
- Remote hold clears: `heldTokens` changes, the effect writes the committed position (the
  provisional release position from Fix B, then the snapped fragment). `settleToCommitted`
  keeps only its bookkeeping (drop the lerp entry and the spent frame); its DOM write goes.
- The effect cleanup's settle-all writes (454–461) go for the same reason.

`lerpInputsRef` and its render-time assignment stay — the loop still needs committed positions
as its no-frame target.

**Rejected alternatives**, recorded so they aren't re-proposed:
- *Nested inner element / drag ghost* (research shape 3): legitimate and the VTT norm, but it
  adds a node per token and a second coordinate system permanently, and it moves the handoff
  rather than removing it. Not needed once React stops writing position.
- *React positions everything* (shape 2): least code, but live positions currently live at
  GameContent level, so state-per-frame would re-render the whole game unless first moved into
  the layer. Worth measuring some day; not this fix.
- *Write the destination at drop*: symptom patch, see §4.

### D54 — Delete hold idle expiry; a hold lives until release or disconnect

The premise "no movement for 10 s means the hand is gone" is wrong for real tables and has no
precedent. Remove it on both sides:

- **Server** `api-game/map_token_holds.py`: delete `HOLD_STALENESS_SECONDS`, the
  `staleness_seconds` / `clock` constructor parameters, and the lazy expiry in `holder()`
  (50–54). Entries become `(asset_id, token_id) → holder_user_id`. `try_grab`'s same-user
  branch stays as an idempotent re-grab. The module docstring's staleness paragraph is rewritten
  to state the new lifetime.
- **Server** `websocket_events.py` move handler (1989–1992): the "refresh the hold" `try_grab`
  call and its comment go — there is no clock to refresh. The holder check above it stays.
- **Client** `config.js`: delete `HELD_STALENESS_MS` and rewrite the frame comment (35–41) to
  point at disconnect rather than expiry.
- **Client** `useMapTokens.js`: delete the sweep effect (160–199), `heldAtMs` (99) and frame
  `atMs` (111). Holds become `{ holderUserId }`, frames `{ x, y }`.
- **Tests** `api-game/tests/test_map_token_holds.py`: delete `TestStaleness` and `FakeClock`;
  `make_holds` loses its parameter. No replacement test — the removed behaviour has nothing to
  assert against; the docstring carries the lifetime rule.

Cost accepted: a browser that vanishes without a clean close keeps its hold until the transport
notices (D55), roughly 40 s worst case instead of 10 s. That is the rare case; the still hand is
the common one.

### D55 — The transport ping is the zombie backstop, and it is made explicit

api-game runs uvicorn 0.25 with `websockets` 12 installed, so uvicorn's websockets
implementation is in use. Its defaults send a protocol ping every 20 s and close the socket 20 s
after a missed pong; the close surfaces as `WebSocketDisconnect` in `app_websocket.py:500`,
which runs `player_disconnect` → `release_all_for_user` (`websocket_events.py:777`) and
broadcasts `player_disconnected` → every client's `clearHoldsForUser`. That chain already exists
and is what replaces idle expiry.

Per the explicit-library-behaviour rule, a default we rely on is passed explicitly: add
`--ws-ping-interval 20 --ws-ping-timeout 20` to the uvicorn command in both
`docker/dev/api-game/Dockerfile:20` and `docker/prod/api-game/Dockerfile:23`, with a one-line
comment naming what depends on it.

### D56 — Close the one silent gesture-end path that now matters

With no idle expiry, a granted hold that never sends a release dangles until disconnect. Audit
of `MapTokenLayer` gesture ends:

| Path | Hold state | Verdict |
|---|---|---|
| `endDrag('denied')` | never granted | correct as is |
| `handleTokenPointerUp` with `dragRef` null | already ended by `endDrag` | correct as is |
| `pointercancel` → `putback` | granted | releases already |
| Release send fails (`isConnected` false) | granted | socket is down; D55 cleans up |
| **Layer unmounts mid-drag** (map switch, panel teardown) | **granted, never released** | **fix** |

Fix: an unmount effect in `MapTokenLayer` that, if `dragRef.current` is alive, sends a release at
the token's committed position (putback semantics — never commit a position the user didn't
drop). `releaseToken` is already a prop.

### D57 — Identity-aware disconnect lands with this work

`connection_manager.remove_connection` (39–52) never checks that the closing socket is the one
stored for the user, so a stale duplicate socket closing evicts the live one and — via
`player_disconnect` — wipes the live hand's holds and broadcasts it. After D54 this is the **only
remaining way a live hand can lose its hold**, so fix A from
`.claude/plans/TODO-duplicate-websocket-connections.md` ships in this sequence (PR 18), verbatim:
only run the disconnecting logic when `entry["websocket"] is websocket`. Fix B (actively closing
the older tab) stays out of scope.

### D58 — The hold model itself is unchanged

Decision 11 stands: anyone may move any token, but not one in someone else's hand; first grab
wins; a competing grab is denied. The research shows every other VTT chose last-write-wins with
a social signal instead. We keep the hold for the nameplate and the absence of tug-of-war, and
we now know it is a choice rather than a norm. Revisit only if the signal proves insufficient at
real tables.

## 6. PR sequence

### PR 16 — Single-writer disc position (D53) — client only

`rollplay/app/map_tokens/components/MapTokenLayer.js`:
- Remove `left`/`top` from the disc's `style` prop; remove the `left`/`top` render-time
  computation (512–513) and the `drag` lookup it exists for.
- Add the committed-position `useLayoutEffect`.
- Delete the imperative reset in `endDrag` (216–219) and rewrite its docstring.
- `settleToCommitted`: keep bookkeeping, drop the DOM write; drop the cleanup's settle-all
  writes.
- Update the file header comment (30–33) which still describes the reset model.

Dead-code sweep afterwards (delete-superseded-code rule): `startLeft`/`startTop` remain in use
by the pointer handler; check nothing else referenced the removed render values.

**Proof:** the §2 two-window reproduction, failing before and passing after. Also re-run the
debrief's Fix B/C checks (release snap, still-hand drift in the *other* window) since the settle
path changed.

### PR 17 — Hold liveness is the connection (D54, D55, D56)

Server: `api-game/map_token_holds.py`, `api-game/websocket_handlers/websocket_events.py`,
`api-game/tests/test_map_token_holds.py`, both api-game Dockerfiles.
Client: `config.js`, `useMapTokens.js`, `MapTokenLayer.js` (unmount release).

**Proof** (two windows):
1. Hold a token still for 30 s+ in window 1 — window 2 keeps the "held by" nameplate throughout
   (fails today at ~10–12 s).
2. Close window 1's tab hard mid-drag — window 2's nameplate clears (immediately if the browser
   sends a close frame; within ~40 s if not).
3. Switch maps / navigate away mid-drag in window 1 — window 2's nameplate clears at once
   (D56).
4. `docker exec api-game-dev python -m pytest tests/test_map_token_holds.py -q` green.

### PR 18 — Identity-aware disconnect (D57)

`api-game/websocket_handlers/connection_manager.py`. Unit test: `remove_connection` with a
socket that is not the stored one leaves the user connected and schedules no removal.

### Deferred (real, independent, not blocking)

- **Stale provisional adopt**: an unmoved release carries the position captured at grab time
  (`endDrag` → `releaseToken(drag.token.x, drag.token.y)`); arriving after a newer commit, the
  Fix B adopt overwrites newer state until the next fragment. Guard candidates: compare
  `updated_at`, or only adopt when the token's committed position still equals the grab-time
  position.
- **Faded ghost at committed + solid disc at hand** while held (MapTool / AboveVTT / Foundry all
  converged on it): a stalled remote drag then looks stalled instead of free. Rendering polish.
- **Measure React-positions-everything** (research shape 2) if the layer is ever restructured;
  it would delete the rAF loop and lerp refs outright.
- **Hold model** (D58) — last-write-wins with social signal, if wanted later.

## 7. The expired-hold steal (demoted, kept for the record)

The 2026-08-31 analysis found a real chain, verified at the code, that produces a *different*
version of the same visible outcome: with idle expiry, a hand held still for 10 s loses its hold;
everyone else's sweep settles the disc to its origin and drops the lift affordance; the token
looks free; a grab from any other user is granted over the expired entry (`holder()` evicts on
access; `test_stale_hold_is_grabbable` enshrined it); that grab relay reaches the dragger's
client, lands in `heldTokens`, and the steer loop glides the dragger's own disc to its origin
under the still hand. Release still commits B, and the same reconciler skip as §2 strands the
disc.

It needs a second user's grab on the token. Matt's sessions had none, so it is not what he saw.
D54 deletes step one, which makes the whole chain unreachable; D57 closes the one other way a
live hold can vanish. If a held disc ever again glides home *while the button is down*, the
tell is the nameplate: it will read "held by" someone else's name.

## 8. What we will NOT invent

- **No heartbeat message and no new drag phase.** The transport ping already answers "is this
  client alive" (D55). A client heartbeat spelled as a re-grab would also trip the grab-branch
  frame clear on observers (`useMapTokens.js:92–94`) and recreate the old drift-home.
- **No server-side expiry sweep or expiry broadcast.** Nothing expires any more.
- **No nested element, drag ghost or second coordinate system.** D53 gets one writer without
  them.
- **No JS test suite.** Proof is the two-window reproduction, as for the rubber-band fixes.
- **No change to the hold model, and no WebSocket auth work** (the unauthenticated `user_id`
  remains a separate, known item).

## 9. References

- `.claude/plans/tokens/05-token-research.md` — React-library research in full.
- `.claude/debreifs/map-token-rubber-banding.md` — prior fix, §5 reserve solution, §7 note.
- `.claude/plans/TODO-duplicate-websocket-connections.md` — fix A shipped here as PR 18.
- External anchors: react-konva #271 (same bug, same diagnosis); tldraw `Shape.tsx` (React
  never writes transform); Owlbear Rodeo legacy `Token.tsx` (`immediate` on own echo);
  Foundry #9617 (terminal frame must be reliable), #10538 (no hold → double tokens);
  MapTool #595 (no cleanup → permanent ghosts); Yjs `awareness.js` (30 s timeout as backstop,
  15 s timer renewal); Chrome 88 timer throttling.
- Key files: `rollplay/app/map_tokens/components/MapTokenLayer.js`,
  `rollplay/app/map_tokens/hooks/useMapTokens.js`, `rollplay/app/map_tokens/config.js`,
  `api-game/map_token_holds.py`, `api-game/websocket_handlers/websocket_events.py`,
  `api-game/websocket_handlers/connection_manager.py`, `docker/{dev,prod}/api-game/Dockerfile`.
