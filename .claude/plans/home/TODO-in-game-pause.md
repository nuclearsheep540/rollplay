# TODO — In-game pause button (HIGH PRIORITY)

> Captured 2026-08-30, mid-QA on `feature/home-page-shell`, out of the session-lifecycle
> failure-handling conversation (retry/abort_stop work, shipped that day). Placed in
> plans/home/ deliberately: not Home-epic scope, but Matt wants it shipped as high
> priority. Not scheduled into the epic's delivery sequence — its own PR after the
> home-shell branch lands.

## The ask (Matt, 2026-08-30)

A pause-session button INSIDE the game runtime. Today the GM must leave the game, hunt
down the campaign in the dashboard drawer, and press pause there — while the natural
moment and place to pause is at the table itself.

Target flow:

1. GM presses Pause in the game runtime.
2. The game shows the pausing state while the session runs STOPPING (the ETL — a few
   seconds).
3. When the stop lands (hot game cleaned up), the existing "this game has ended" modal
   pops and sends everyone out.
4. If the pause fails, the error surfaces IN the game — to the person who pressed the
   button, at the moment they care — instead of only in a dashboard drawer they are not
   looking at. (The campaign drawer keeps its own error surface too.)

## Why the game is the right surface

- The GM is already there; the drawer flow is a scavenger hunt mid-session.
- The runtime can render the transition honestly: STOPPING is seconds long and the game
  is the only surface that can show "pausing…" to everyone at the table.
- Failure surfacing: after the 2026-08-30 work, a failed phase-2 write retries through
  a 1s/2s/3s backoff, then rolls the session back to ACTIVE and raises "still live and
  can be paused again" — an error built to be shown to the GM who pressed the button.
  The game is where that GM is.
- The eviction UX already exists: the game runtime already has an end-of-game modal and
  forced exit to `/dashboard` — this flow reuses it rather than inventing anything.

## Plumbing sketch (all pieces verified to exist)

- **Button** in the game runtime's nav/menu (GameContent) — GM/host only. The runtime
  already knows the viewer's role (moderator/DM checks exist).
- **Call**: `POST /api/sessions/{session_id}/pause` via `authFetch` — the same endpoint
  the drawer and the expiry sweeper use; retry + abort_stop semantics come free. The
  game knows its session id (room_id == session id, established 2026-08-30).
- **Pausing state**: local "pausing…" overlay/disabled UI while the request runs (the
  request spans the whole ETL — seconds; consider disabling board input during it).
- **Success**: phase 3 deletes the hot game; the existing end-of-game path evicts
  everyone. Verify which signal the runtime reacts to today (api-game WS close /
  game-deleted handling in webSocketEvent.js) — the pause flow should ride that, not
  add a parallel one.
- **Failure**: show the raised error in-game (toast/modal). The message already
  distinguishes "still live, try again" from "needs admin attention".

## Open questions for scoping

1. What exactly does the runtime do today when the hot game disappears mid-connection
   (the sweeper can already pause a live game out from under players)? That answer
   defines how much of step "evict everyone" is free.
2. Player-facing copy while STOPPING: do non-GM players see "the GM is pausing the
   game" or just the end modal when it lands?
3. Does Finish deserve the same in-game button while we're there, or pause only?
4. Placement: which game-runtime menu owns it (the nav bar with the Dashboard exit
   button is the obvious candidate).

## Relation to other work

- Builds directly on the 2026-08-30 session-lifecycle hardening (retry backoff,
  abort_stop rollback, boot reconciliation) — that work is what makes an in-game pause
  button safe to offer: it can no longer strand the session where the button's user
  can't see it.
- Independent of the Home epic's remaining steps; no ordering constraint against them.
- Epic's step-5 hero work (pause state on the hero) is related UI but separate scope —
  the hero deliberately has no pause until game-runtime pause support exists (decision
  2026-08-30, recorded in the epic's SHIPPED section). THIS is that support.
