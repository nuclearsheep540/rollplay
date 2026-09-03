# Debrief: Map Token Rubber Banding

**Commit:** `462fcb5` — "Fix map token rubber banding during concurrent drags"
**Branch:** `token-size-change`
**Period:** 2026-08-18 → 2026-08-19
**Files:** `rollplay/app/map_tokens/components/MapTokenLayer.js`, `rollplay/app/map_tokens/config.js`, `rollplay/app/map_tokens/hooks/useMapTokens.js`
**Status:** Three causes identified, all three fixed. **One of the three (Cause A) is fixed on inspection and has never been reproduced.** One contributing factor (MongoClient churn) identified and deliberately left alone.

This debrief is deliberately self-contained — no plan-file references — so it stands alone if the plans are cleaned up. Source file paths are safe to follow; the code is committed.

---

## 1. Problem Statement (as reported)

Matt, from live sessions with friends:

> "sometimes there's some 'rubber banding' (when the previous and current state of something rapidly fires between these two values creating a back-and-forth 'rubber band' looking visual effect) ... I assume something with our atomic updates mean that when more than 1 token is being moved, any additional tokens fight for the atomic state's values ... It's worth noting that positioning always ends up true, its just an artefact being produced during multiple click-and-hold token events."

Refined later, and this detail is what cracked it:

> "The token usually looks like it's flickering between where the token was before it was picked up, and to where it's being held (not released) when I drag when other users also are dragging."

**Two positions, oscillating: the pre-pickup committed position, and the live in-hand position.**

### The reproduction constraint

Matt has one mouse and one device, so he **cannot reproduce concurrent drags**. Pre-release QA was clean precisely because it was single-dragger. This shaped the whole investigation: everything had to be established by reading code, and only two of the three causes turned out to be demonstrable single-handed.

---

## 2. What Was Ruled Out — the server (Matt's hunch)

The reported hunch was that concurrent atomic updates were fighting. **They aren't.** Recording the evidence so nobody re-investigates this:

- **Single worker.** `api-game/Dockerfile` runs `uvicorn app:app --host 0.0.0.0 --port 8081` with no `--workers`, and `docker-compose.dev.yml` adds none. One process, one event loop.
- **Sequential handling per connection.** `api-game/websocket_handlers/app_websocket.py` is a plain `while True: data = await websocket.receive_json()` loop with handlers awaited inline.
- **pymongo is blocking.** `GameService.apply_map_token_op` does `update_one` then a separate `get_map_tokens` read. Because pymongo blocks the event loop, no other coroutine can interleave between them — the read-after-write is effectively atomic *within the process*.

  > **Addendum 2026-09-03 — this is no longer true.** api-game moved to PyMongo's async client, so every database call is awaited and handlers now interleave at each `await`. The read-after-write is no longer atomic. The conclusion of this section still holds for the other reasons listed (single process, per-token positional `$set`, ordered fan-out), and same-token races were always last-write-wins by design. The blocking behaviour described here was also the *cause* of a separate bug found in September: a token commit froze the loop for the length of its MongoDB round trip, so 20 Hz drag frames from every player queued behind it and replayed late. See `.claude/plans/api-game/01-async-mongo-driver.md`.
- **Ops are per-token array surgery, not whole-board writes.** `api-game/map_token_ops.py:build_map_token_update` builds a positional `$set` filtered on the token id, so two players committing different tokens cannot clobber each other. Same-token races are last-write-wins by design.
- **Broadcast fan-out is ordered.** `connection_manager` awaits `send_json` per recipient in a loop; no `gather`, no `create_task`.

**Conclusion: the server was never implicated.** All three causes are client-side rendering-lifecycle bugs.

---

## 3. The Three Causes

### Cause A — the rAF loop tore down and hard-snapped every in-flight disc

**The dominant cause, and the one matching the "when others are also dragging" condition.**

`MapTokenLayer` runs a `requestAnimationFrame` loop that steers remotely-held discs toward relayed drag frames, writing `element.style.left/top` directly to avoid a React re-render per frame. Before the fix:

```js
// BEFORE — MapTokenLayer.js
useEffect(() => {
  if (!LIVE_DRAG_STREAMING || !remoteDragFramesRef || !mapAssetId) return;
  const heldTokenIds = Object.keys(heldTokens);
  if (!heldTokenIds.length || renderScale <= 0) return;

  const committedByTokenId = {};
  tokens.forEach((token) => {
    committedByTokenId[token.id] = { left: token.x * renderScale, top: token.y * renderScale };
  });

  const lerpPositions = {};          // ← effect-local, discarded on every restart
  let frameHandle = null;

  const animate = () => { /* ... seeds from element.style.left ... */ };
  frameHandle = requestAnimationFrame(animate);

  return () => {
    cancelAnimationFrame(frameHandle);
    // Unconditional: writes committed position over EVERY held disc
    heldTokenIds.forEach((tokenId) => {
      const element = tokenElementsRef.current[tokenId];
      const committed = committedByTokenId[tokenId];
      if (element && committed) {
        element.style.left = `${committed.left}px`;
        element.style.top = `${committed.top}px`;
      }
    });
  };
}, [heldTokens, tokens, renderScale, remoteDragFramesRef, mapAssetId]);
```

**The mechanism, step by step:**

1. `tokens` gets a **fresh array identity on every committed op by anyone** — `applyTokenBoard` in `useMapTokens.js` spreads the wire array straight into state, so even a no-op fragment produces a new reference.
2. `heldTokens` gets a fresh identity on **every grab and every release by anyone**.
3. Either one changing tears the effect down. The cleanup then **unconditionally** writes the committed (pre-pickup) position onto every held disc — a hard, un-eased DOM write.
4. The effect restarts. Its seeding logic reads `element.style.left` specifically so a restart wouldn't visibly snap the disc — but the cleanup has just overwritten that value with the committed one. **The mitigation was cancelled by its own cleanup.**
5. `lerpPositions` was effect-local, so any accumulated position was thrown away too.
6. The loop then lerps back out toward the live frame at `DRAG_LERP_FACTOR = 0.3` — roughly 110ms to converge.

**Net: hard snap to origin, elastic ~110ms return.** That asymmetry — instant out, eased back — is precisely what reads as "rubber banding".

**Why single-dragger QA passed.** With one person dragging, nothing changes `tokens` or `heldTokens` mid-drag (move frames go into a ref, deliberately causing no re-render). No teardown, no snap. Add a second player and every grab, release and commit they make snaps your view of their disc, and vice versa.

**Why it also needs the other person to be *actively moving*.** After the snap, the loop lerps toward whatever the target is. Fresh frames → springs back out (visible band). Paused → target is already the committed position, so it just sits there.

### Cause B — release beat the commit down the wire

`endDrag` in `MapTokenLayer.js` sends two separate messages, in this order:

```js
releaseToken(drag.tokenId, nativeX, nativeY);   // lane 2 — presence, relayed immediately
commitTokenMove(drag.token, nativeX, nativeY);  // lane 1 — Mongo write, then broadcast
```

On every observing client the release lands first, clearing the hold. That triggered Cause A's cleanup with the **old** committed position, so the disc snapped back to where the drag started — then the board fragment arrived a Mongo round-trip later and it jumped to the destination.

**Widened by a latency issue:** `GameService._get_active_session` (`api-game/gameservice.py`) constructs a **fresh `MongoClient` on every call and never closes it**. A single commit path builds three (context read, update, read-back), each starting a topology-monitor thread. This is a real resource leak and a latency multiplier — **still unfixed, see §7**.

### Cause C — a paused hand made the disc drift home

```js
// BEFORE — config.js
// A remote drag with no frame for this long stops steering the disc — it
// reverts to its committed position (the lift stays until release/hold expiry).
export const DRAG_FRAME_STALENESS_MS = 2000;
```

```js
// BEFORE — MapTokenLayer.js
const frameFresh = frame && nowMs - frame.atMs <= DRAG_FRAME_STALENESS_MS;
const target = frameFresh ? { left: frame.x * renderScale, ... } : committed;
```

Move frames are only emitted from `handleTokenPointerMove`, so **a still mouse sends nothing at all**. Hold a mini in place for more than two seconds — talking, thinking, waiting for a ruling — and the frame goes stale, the target flips to `committed` (the pre-pickup position), and the disc drifts home while the nameplate still reads "✋ held by …". Nudge the mouse and it springs forward again.

The live window is 2s–10s: after 10s the hold itself expires (`HELD_STALENESS_MS`) and the disc renders at the committed position anyway.

**Matt reproduced this one by hand** (two browser windows, drag and hold still) and correctly observed it *"looks clean … it animates back nicely"*. That observation is the key diagnostic:

> **C is lerped in both directions → reads as an animation. A is a hard DOM write out and a lerp back → reads as a rubber band.** Same two positions, completely different motion.

---

## 4. What Shipped

### Fix C — no frame staleness cutoff at all

`DRAG_FRAME_STALENESS_MS` was **deleted**, not tuned. A stale frame now means "the hand stopped moving", not "the hand is gone":

```js
// AFTER — MapTokenLayer.js
const frame = remoteDragFramesRef.current[mapAssetId]?.[tokenId];
const target = frame
  ? { left: frame.x * scale, top: frame.y * scale }
  : committed;
```

**Rationale, from the discussion:** the timer only ever covered the 2s–10s window between "frames stopped" and "hold expired" — duplicating hold expiry eight seconds earlier while misfiring on every ordinary pause. Holding the last frame is at worst a *stale* position; reverting to committed is an actively *wrong* one, since it tells the table a mini is back at its origin while its owner's hand is visibly on it. `HELD_STALENESS_MS` (10s, client sweep, mirrored by `HOLD_STALENESS_SECONDS` server-side and refreshed by each move frame) is now the sole mechanism answering "is this hand alive".

The "no frame at all" case (a markers-only sender with `LIVE_DRAG_STREAMING` off) still degrades to `committed` — that was always handled by the null check, never by the timer.

**Important fact established during this discussion, worth not re-deriving:** when a hand goes dark, **nothing is committed**. Holds are presence-only (`api-game/map_token_holds.py`: *"never persisted, dies with the process, and can never become committed state without a lane-1 map_token_update"*), and the server never stores drag frames at all. So the token reverts to its pre-pickup position and the drag is simply lost. That is deliberate — the same rule as `pointercancel` → `putback`: never commit a position the user didn't deliberately drop.

### Fix A — the loop survives board churn

Three changes together:

**1. Positions hoisted to a ref**, so a disc's chase survives re-renders instead of restarting from committed:

```js
const lerpPositionsRef = useRef({});
```

**2. Dependencies reduced to a boolean.** `hasRemoteHolds` flips only on the *first* grab and the *last* release, so one player grabbing or releasing never restarts another's steering:

```js
lerpInputsRef.current = { tokens, heldTokens, renderScale };
const hasRemoteHolds = Object.keys(heldTokens).length > 0;
// ...
}, [hasRemoteHolds, remoteDragFramesRef, mapAssetId]);
```

**3. Blanket cleanup replaced with a per-token settle** that fires only when a token actually stops being held:

```js
const settleToCommitted = (tokenId, committedByTokenId) => {
  const element = tokenElementsRef.current[tokenId];
  const committed = committedByTokenId[tokenId];
  if (element && committed) {
    element.style.left = `${committed.left}px`;
    element.style.top = `${committed.top}px`;
  }
  delete lerpPositionsRef.current[tokenId];
  if (remoteDragFramesRef.current[mapAssetId]) {
    delete remoteDragFramesRef.current[mapAssetId][tokenId];
  }
};
```

**Non-obvious detail — `lerpInputsRef` is assigned during render, not in an effect.** This looks wrong and is deliberate: **React runs every effect *cleanup* before any effect *body***. An effect-updated ref would therefore lag one commit behind, and the teardown path would settle discs onto stale positions. Documented in the source comment; don't "fix" it into a `useEffect`.

### Fix B — the release frame becomes a provisional position

`releaseToken(tokenId, x, y)` already carried the final position; `applyRemoteDrag` was throwing it away. It's now adopted so the disc holds at the drop point until the authoritative fragment lands:

```js
// AFTER — useMapTokens.js, phase === 'release'
if (typeof x === 'number' && typeof y === 'number') {
  setMapTokenState((previousState) => {
    const board = previousState[assetId];
    if (!board) return previousState;
    let boardChanged = false;
    const nextBoard = board.map((existingToken) => {
      if (existingToken.id !== tokenId) return existingToken;
      if (existingToken.x === x && existingToken.y === y) return existingToken;
      boardChanged = true;
      return { ...existingToken, x, y };
    });
    return boardChanged ? { ...previousState, [assetId]: nextBoard } : previousState;
  });
}
```

The grid snap arrives with the fragment moments later — a sub-cell correction rather than a round trip across the map.

**Two subtleties that make it work:**
- The frame is **deliberately not deleted on release**. It keeps steering the disc through the render that clears the hold, making the handover seamless. `settleToCommitted` disposes of it once the disc lands. Deleting it at release re-introduces a one-frame lurch toward the origin.
- **Grab now clears any leftover frame** defensively. This is what makes removing the staleness cutoff safe — without it, a frame surviving a suppressed or lost release relay could steer a later grab of the same token.

---

## 5. Solutions Considered and Rejected

Recorded so a future attempt doesn't re-tread them.

**Swapping the order in `endDrag` (commit first, then release).** A genuine one-line fix for Cause B. Rejected because the existing ordering is a documented product decision ("Release first, then the lane-1 commit settles position") and flipping a deliberate ordering without understanding its original motivation is risky. The provisional-position approach achieves the same result using data already on the wire.

**Raising `DRAG_FRAME_STALENESS_MS` instead of deleting it.** Rejected: aligning it to `HELD_STALENESS_MS` would make it exactly redundant with hold expiry, so it would be doing nothing while still looking load-bearing.

**Deferring the hold clear on the remote side** until the board fragment for that token arrives. Viable, but introduces a timeout and a new "pending release" state; the provisional position is simpler.

**A structural decouple** — giving each disc an inner element that only the rAF loop writes via `transform`, so React and the loop touch different CSS properties and can never fight. This would let the imperative cleanup be deleted entirely (it exists *because* React's style diff skips writes when the rendered value is unchanged). **Held in reserve** — the bigger change, worth reaching for if QA still shows artefacts.

---

## 6. Verification Status — read this before trusting the fix

| Cause | Status | How |
|---|---|---|
| **C** — drift on pause | **Confirmed fixed by Matt** | Two browser windows, drag in one, hold still 3s+, watch the other |
| **B** — snap at release | **Observable single-handed** | Two windows, drag and release, watch for snap-back-then-jump |
| **A** — teardown snap | **NOT REPRODUCED** | Needs two people dragging simultaneously; no non-mouse path commits a token op |

Build and lint clean. **Cause A was fixed on inspection**, on the grounds that the old code is indefensible regardless: an unconditional write of committed positions onto every held element on every dependency change, plus a `lerpPositions` discard that contradicts the code's own stated intent ("seed from the element's current inline style so effect restarts don't visibly snap the disc").

**A real session with multiple players is still the only confirmation for Cause A.**

---

## 7. Open Items

**`_get_active_session` constructs a MongoClient per call.** `api-game/gameservice.py` builds a fresh `MongoClient` on every invocation and never closes it — three per token commit, each spawning a topology-monitor thread. It is not a cause of rubber banding, but it widens Cause B's window and slows every op. Deliberately kept out of this fix because it touches every `GameService` method and is a stability concern, not a rendering one. **Arguably the highest-value remaining fix in this area.**

**No instrumentation was left behind.** If artefacts persist, the suggested next step is a counter behind a debug flag logging rAF-loop teardowns and their trigger, so a real session yields an answer rather than a guess.

**WebSocket `user_id` is unauthenticated** (pre-existing, noted during investigation). The own-echo filter in `mapTokenWebSocketEvents.js` — `if (data.holder_user_id === thisUserId) return;` — is what stops a dragger's own frames steering their own disc. If that filter ever fails, a user's own token would flicker between its pre-pickup and live positions, which presents *identically* to Cause A. Worth checking first if the symptom recurs on a user's **own** token rather than someone else's.

---

## 8. How to Revert

All three fixes are in one commit, `462fcb5`, touching three files. `git revert 462fcb5` restores the prior behaviour wholesale.

To revert selectively:
- **Fix C only** — restore `DRAG_FRAME_STALENESS_MS = 2000` in `config.js` and re-add the `frameFresh` check in the loop's target selection.
- **Fix B only** — in `useMapTokens.js` `applyRemoteDrag`, drop the provisional `setMapTokenState` from the `release` branch and restore the frame deletion there.
- **Fix A only** — the largest of the three; revert `MapTokenLayer.js` to its pre-commit state. Note that reverting A alone while keeping B and C leaves the frame-disposal responsibility (`settleToCommitted`) unowned, so the `grab`-time defensive clear in `useMapTokens.js` becomes the only cleanup — acceptable, but the ref would then leak one entry per released token until the next grab.
