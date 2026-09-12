# 00 — Brief for the implementing agent

> You are implementing the system-agnostic campaign and character redesign for Rollplay.
> Every decision has been made; this directory tells you what to build, where, and in
> what order. Where a file says "decided", do not re-open it. Where you find something
> the plan did not anticipate, finish everything else, then report the gap with a proposed
> resolution — do not pick one yourself.

## Read in this order

1. `../00-high-level.md` — the model, the vocabulary, every decision and its date.
2. `../design-mock.html` — open it in a browser. It is the structure and interaction
   contract for the campaign builder and the player's create flow. Pixels defer to the
   app's real tokens, which the mock already uses.
3. This file.
4. `01-contracts.md` through `06-game-runtime-ui.md`, one per PR, in order.
5. `07-verification.md` — the end-to-end proof you run at the end.
6. `08-followups.md` — what is deliberately not in this work. Add to it; never pull from it.
7. `../existing_plans/` — background only. Everything in there is superseded by this
   directory; read it if a comment in the code references it.

## What you are building, in one paragraph

A campaign owns a **character config**: an ordered list of platform-defined **components**
(Name, Hit points, Attribute) with GM-set parameters. The config is saved as a draft and
**published** as immutable integer **versions**. A player who is a member of a campaign's
session creates a character **against the latest published version**, producing a
**values** document keyed by component id; the character is user-owned, bound to that
session, and holds a snapshot of the config it was built with. The **game runtime**
renders and mutates those values by component type and knows nothing about any game
system. The D&D wizard, the D&D fields on the runtime, and the D&D prompts are removed;
the SRD ruleset code stays, dormant, for a later framework preset.

## Repository rules you must follow (from CLAUDE.md and the project's memory)

- **Never run git write commands** (`add`, `commit`, `push`, `stash`, `tag`, `gh pr
  create`). At the end of each PR, print the exact commands and the full commit message
  and stop. A repo hook blocks them anyway.
- **Never hand-write an Alembic migration.** Change the SQLAlchemy models, register new
  models in `api-site/alembic/env.py`, then run
  `docker exec api-site-dev alembic revision --autogenerate -m "<message>"` and read the
  generated file before restarting api-site. If Docker is unavailable, stop and say so.
- **Tests first, shown failing.** For every behaviour this plan names a test for: write
  the test, run it alone against the unbuilt code with the exact command in the file,
  paste the failure, then build, then paste the pass. A test must create everything it
  touches and touch nothing it did not create.
- **Run tests in the container that owns the code**: `docker exec api-site-dev python -m
  pytest <path> -q`, `docker exec api-game-dev python -m pytest <path> -q`, and for
  contracts `docker exec api-site-dev python -m pytest /rollplay-shared-contracts/tests/ -q`.
- **After changing `requirements.txt` or the contracts package version**, rebuild the
  service image: `docker-compose -f docker-compose.dev.yml build <service> &&
  docker-compose -f docker-compose.dev.yml up -d <service>`. Dev images install deps at
  build; a running container can hide a dead uvicorn worker.
- **Never run `npm run build` (or `npx next build` inside the container) while
  `rollplay-dev` is up.** It clobbers the dev server's `.next`. To compile-check, use the
  throwaway-page method in the project memory or restart `rollplay-dev` and read its logs.
  HMR is unreliable in Docker: new files need `docker restart rollplay-dev`.
- **All authenticated frontend calls use `authFetch`** from
  `app/shared/utils/authFetch.js`. All TanStack `queryFn`/`mutationFn` use it.
- **Server-authoritative game state**: client → HTTP → MongoDB → WebSocket broadcast.
  Never change game state from a WebSocket message directly.
- **Write by path**: every Mongo write is a dotted `$set` on the fields the operation
  owns. Never read a container, change a member, and write the container back.
- **Every api-game database call is awaited.**
- **Delete superseded code in the same PR** and do a deliberate dead-code sweep (grep
  every removed symbol) before calling a PR ready. Lint will not catch unused JS.
- **Naming**: no single-letter loop variables, no initialisms (`map_conf` fine, `mc` not),
  no lazy imports, plain loops over clever comprehensions.
- **Explicit library behaviour**: catch named exceptions at I/O boundaries even when the
  design is to re-raise; pass defaults you rely on explicitly; comment semantics you lean on.
- **License header** on every new source file (JS: `/* Copyright (C) 2025 Matthew Davey */`
  `/* SPDX-License-Identifier: GPL-3.0-or-later */`; Python: the `#` form).
- **No emoji in log prefixes**; use a SCREAMING-CASE text tag.
- **No user-facing copy may assume one game system.** No "class", "race", "AC",
  "initiative", "spell", "d20", "nat 1". Safe words: campaign, party, table, Game Master,
  adventure, character, seat, game.
- **UI styling**: Tailwind with the app's tokens (`surface-*`, `content-*`, `border-*`,
  `interactive-*`), Metamorphous for display text, Inter body, the 8° skew family from
  `app/styles/plateGeometry.js`, plate buttons from `globals.css` (`.home-plate-*`).
  Headless UI for dialogs and menus. No new colour values; no new fonts.
- **Facilitate, don't enforce** governs play mechanics only. It never argues an
  engineering decision.

## Decisions you must not re-open

All in `../00-high-level.md`. The ones you will be tempted to revisit:

- Characters are **bound to** a session by id, not contained by it. Own aggregate.
- **One seated character per user per session** (roster key). Many bound over time.
- Keepsakes: characters **survive** campaign deletion with a null session, campaign and
  version pointer, rendering from their embedded snapshot.
- Version is an **integer**. Save writes the draft; **Publish** mints the version.
- **Display name** = every Name value in config order, space-joined; fallback
  `"Unnamed character"`.
- `secret` on every configuration; **api-game strips** secret values per recipient.
- Runtime sheet order: **identity → hit points → attribute → others**, GM order within.
- The **zero point is rendered, never acted on**. No auto-death, no death saves.
- **api-game owns values while a game is open**; End writes them cold; reconnect reads
  the room.
- **Prompt-all stays**, generic, GM types the prompt text. Single-target dice prompt stays.
- **World tab is a stub.** Overview and Character carry the content.
- **Create and edit are one page.** The campaign create modal and the edit modal are deleted.
- **Existing characters are kept as keepsakes**, never discarded (decided 2026-09-12,
  reversing an earlier lean). The backfill in `02-api-site.md` §5 turns each old row into a
  keepsake: no campaign, no session, no version, a snapshot built from its name, hit
  points and ability scores. Current sessions end up with no seated characters. This is
  the same state a character reaches when its campaign is deleted, so no new code path
  exists for migrated rows.
- **Schema changes are two autogenerated migrations with a backfill script between
  them**, never a hand-written data migration. The prod runbook for that is in
  `02-api-site.md` §5 and must be printed in PR 2's notes.
- `DungeonMaster` / `dungeon_master` identifiers in contracts and api-game stay this
  round (cross-service rename; in `08-followups.md`). User-facing copy says "Game Master"
  or "GM".

## PR sequence and gates

| PR | File | Gate to open the next |
|---|---|---|
| 1 | `01-contracts.md` | contracts suite green; CI loop prints "All contract modules have test imports." |
| 2 | `02-api-site.md` | api-site suite green in container; migration autogenerated and applied; `07` steps 1–4 pass by curl |
| 3 | `03-api-game.md` | api-game suite green; `07` steps 5–7 pass by curl + a websocket client |
| 4 | `04-campaign-builder-ui.md` | the Overview and Character tabs of the mock work end to end in the browser against PR 2 |
| 5 | `05-character-create-flow-ui.md` | a second dev user creates and seats a character against a published version |
| 6 | `06-game-runtime-ui.md` | `07` in full |

PRs 1–3 are backend and may be developed against each other locally, but each is its own
PR with its own tests green. Pin the contracts version in `api-site/requirements.txt` and
`api-game/requirements.txt` in PRs 2 and 3 respectively (find the current pin line by
grepping `rollplay-shared-contracts`), and rebuild those images.

## When you finish each PR

Print, in this order: the test commands you ran and their last line; the dead-code sweep
you did (symbols grepped); anything you left out and why; the proposed commit command with
the full message ending in the attribution line from your system reminder. Then stop.
