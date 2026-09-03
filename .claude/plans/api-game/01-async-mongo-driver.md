# api-game 01 — Async MongoDB Driver

**Status:** Planned 2026-09-03, not built. Second work item after tokens 05 (the token
branch is complete and awaiting QA; the stall this plan removes is what has been masking
that QA). Ships as its own PR off `main`.
**Scope:** api-game only. api-site, the ETL contracts, the wire, and shared_contracts are
untouched.
**Decisions:** D1–D11 below. Numbering is local to this plan (api-game architecture), not a
continuation of the token plans.

---

## 1. Why (measured, not inferred)

api-game is one uvicorn process, one asyncio loop, serving every client in every room. The
database driver is `pymongo`, which is synchronous, called directly from `async def`
handlers. A blocking call inside a coroutine does not yield, so while `find_one` waits on
MongoDB the loop reads nothing and sends nothing to anyone.

Measured on the dev box on 2026-09-03 (`docker logs api-game-dev`, 500 messages):

| Inter-arrival gap between WebSocket messages | Value |
|---|---|
| p50 | 49 ms (the client's 20 Hz throttle, as intended) |
| p90 | 114 ms |
| p99 | 12 554 ms |

Seven of eleven stalls over one second landed immediately after `map_token_update`, the
committed token move, which does four driver round trips: a context read, the positional
update, a read-back, and an adventure-log insert. Mongo's slow-query log showed those taking
109–365 ms *each* against a 2.9 KB document with an optimal `IDHACK` plan, i.e. the box was
CPU-starved, not the query. At production speeds the same four operations are single-digit
milliseconds, which is why nobody has reported this from a real table. The freeze is real at
any speed; only its length is environmental.

Drag frames (`map_token_drag` phase `move`) never touch the database. They are collateral:
queued in the kernel behind whichever message is blocking the loop, then drained in a burst,
which the observer sees as the exact path replaying late.

**Why the native async client and not the alternatives:**

- **Motor** is end-of-life: deprecated 14 May 2025, critical fixes only from 14 May 2026,
  unsupported from 14 May 2027 (its own docs). Not an option.
- **`asyncio.to_thread` at the call sites** fixes the stall with four lines, but caps in-flight
  database work at the default executor size (`min(32, cpus + 4)` → 6 on production's 2 vCPU),
  and leaves a service that is `async` in name only. We would do the real migration later
  anyway. Matt's call: do the work once.
- **PyMongo's built-in `AsyncMongoClient`** (GA since 4.13; 4.17.0 is current) is MongoDB's
  designated successor to Motor, same driver package, no cap on concurrent operations. At the
  scale Matt is designing for — ten games of eight players — commits and grabs overlap in
  flight instead of serialising.

## 2. The surface (measured)

| Item | Count |
|---|---|
| Files touching the driver | 8: `mongo_service.py`, `gameservice.py`, `mapservice.py`, `imageservice.py`, `adventure_log_service.py`, `app.py`, `websocket_handlers/app_websocket.py`, `websocket_handlers/websocket_events.py` |
| Service classes → `async def` | 4 |
| Methods gaining `async def` | 59 (GameService 29, MapService 9, ImageService 8, AdventureLogService 13) |
| Driver operations gaining `await` inside services | 61 |
| Call sites gaining `await` (WS handlers, HTTP routes, service→service) | 190 |
| Sync helpers that call a service and must go async | 4: `grid_resnap_fragment`, `_get_player_metadata`, `_map_token_place_cell_suffix`, `_write_map_token_log` (13 call sites) |
| Cursor sites needing a real rewrite | 5: `gameservice.py:54`, `mapservice.py:226`, `adventure_log_service.py:194`, `:289`, `:372` |
| Import-time database I/O to relocate | the `ping` in `mongo_service.client`, and `create_indexes()` in three constructors — run **twice** today because `app.py:52-54` and `websocket_events.py:31-33` each build their own service instances (the doubled "Created indexes" lines at boot) |
| Startup hook in api-game today | none — `app = FastAPI()` with no lifespan |
| Automated tests touching the services | none (`test_map_token_ops.py` tests the pure update-spec builder) |
| pytest in the api-game image | not installed; the suite runs on the host |

Things that do **not** change: `GameService._get_active_session()` (collection access is
synchronous on the async client too); the `_id`-keyed document design; uvicorn flags; the
Dockerfile CMD; the `--ws-ping-*` settings; Sentry (`PyMongoIntegration` exists in
sentry-sdk 1.45.1 but is not enabled here, so there is nothing to migrate).

## 3. Decisions

### D1 — `pymongo==4.17.0`, `pymongo.asynchronous.AsyncMongoClient`
Bump the pin. Import `AsyncMongoClient`, `AsyncDatabase`, `AsyncCollection` from
`pymongo.asynchronous.*`; `pymongo.errors` is unchanged. Python 3.12 in the image satisfies
the driver's floor. Dev and prod images must be rebuilt (deps install at build; code is
mounted — the stale-deps rule).

### D2 — Boot moves into a FastAPI lifespan, mirroring api-site
api-site already has the pattern (`api-site/main.py:50-72`: `@asynccontextmanager async def
lifespan(app)` … `FastAPI(lifespan=lifespan)`). api-game gets the same shape, and it is
the only place database I/O may happen before the first request:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await mongo_service.client.admin.command('ping')   # forces a real round-trip
    except ServerSelectionTimeoutError:
        logger.critical("MongoDB unreachable — refusing to start")
        raise                                              # deliberate: boot must fail loud
    await adventure_log.create_indexes()
    await map_service.create_indexes()
    await image_service.create_indexes()
    yield
    await mongo_service.client.close()
```

This preserves the loud-crash-at-boot property CLAUDE.md's explicit-behaviour section was
written around (its origin story is this exact `ping`); it just moves from "first attribute
access" to "startup". `mongo_service.client` stays a lazily-built property, but it no longer
pings — construction proves nothing, the lifespan does. `serverSelectionTimeoutMS=5000` stays
explicit.

### D3 — One set of service instances
`websocket_events.py` already constructs `adventure_log`, `map_service`, `image_service` at
module level and `app.py` already imports from that module (`app.py:22`). `app.py:52-54`
stops constructing its own copies and imports those three instead. Constructors become
I/O-free (they only bind a collection), so a second instance would be harmless, but one set
is what the lifespan indexes and what the code reads.

### D4 — Services: every method `async def`, every driver call awaited
All 59 methods. `create_indexes()` becomes `async def` and is no longer called from
`__init__`. Type hints move to `AsyncDatabase` / `AsyncCollection`. `GameService` stays a
class of `@staticmethod`s; only the signatures change.

### D5 — Cursors: the one asymmetry to write down
On the async client, `collection.find(...)` returns an `AsyncCursor` **synchronously** (no
`await`), and `.sort()/.skip()/.limit()` still chain on it; materialise with
`await cursor.to_list()`. `collection.aggregate(...)` is itself a **coroutine** — `cursor =
await coll.aggregate(pipeline)`, then `await cursor.to_list()`. Five sites:

- `gameservice.py:54` — `find` + iteration → `to_list` or `async for`
- `mapservice.py:226` — `list(find(...).sort(...))` → `await find(...).sort(...).to_list()`
- `adventure_log_service.py:289` — paginated `find().sort().skip().limit()` → same, `to_list`
- `adventure_log_service.py:194`, `:372` — `list(aggregate(...))` → `await (await
  aggregate(...)).to_list()`

Per the explicit-behaviour rule, the `find`-is-sync / `aggregate`-is-awaited difference gets a
one-line comment at the first site of each.

### D6 — Callers: 190 `await`s and the four-helper cascade
The 31 async WS handlers and the 12 async HTTP routes gain `await` at each service call. The
four sync helpers become `async def` (their callers are all already async or become so in the
same sweep). `ConnectionManager.broadcast_lobby_update` is already `async` and just awaits
`GameService.get_room`. The ETL routes (`/game/session/start`, `/end`) are in the 190; their
request/response contracts do not change.

### D7 — Handlers become interleavable; write down what that means
Today a blocking driver call is an accidental mutex: a handler runs start-to-finish with
nothing interleaving, and the rubber-banding debrief §2 leaned on exactly that ("pymongo is
blocking … the read-after-write is effectively atomic within the process"). After this change
another message can run at every `await`. Rules, each stated in a comment at the site:

- **In-process state is loop-only and must not be assumed stable across an `await`.** The
  hold registry (`map_token_holds`), `_hidden_held_tokens`, and `manager.room_users` /
  `manager.connections` are read and mutated only between awaits, never inside a driver call,
  and a value read before an `await` is re-read after it if the decision depends on it.
- **`map_token_update`'s read → update → read-back is no longer atomic.** Accepted: ops are
  per-token positional `$set`s and same-token races are last-write-wins by design (tokens
  decision 11). A read-back that includes a concurrent commit broadcasts a *more* current
  board, not a wrong one.
- **The grab's ACL read may be milliseconds stale relative to `try_grab`.** Accepted, same
  class; `try_grab` itself stays synchronous and atomic on the loop.
- The debrief gets a dated addendum saying §2's atomicity statement stopped being true here.

### D8 — Lazy imports this work touches are removed (style rule)
`connection_manager.py:72` (`import asyncio`), `:142` (`from gameservice import
GameService`), `app_websocket.py:35` (same), `:487` (`import asyncio`) move to module top.
Verify no import cycle: `gameservice` imports `mongo_service` only, never the websocket
package, so top-level import from `connection_manager` is safe. The two `site_client` lazy
imports in `app.py:389/425` are pre-existing and not in this change's path — leave them.

### D9 — Thin round-trip tests, one per service, each owning its state
`api-game/tests/test_services_roundtrip.py`: for each of the four services, one test that
creates its own room/document, reads it back through the service, and deletes it (teardown
in the test; nothing shared; nothing left behind). Uses the `anyio` pytest marker that
Starlette already brings — **no new test dependency**. Skips with a clear message when Mongo
is unreachable. Two facts to settle at implementation: whether `mongo-dev` publishes 27017 to
the host (the suite runs on the host today because the image has no pytest), or whether to add
pytest to the dev image and run in-container as api-site does. Either way the command goes in
CLAUDE.md (§6). This is not a suite being invented; it is the minimum net for rewriting every
database path with no existing coverage.

### D10 — Sentry: verify, don't change
`sentry_sdk.integrations.pymongo` is present in 1.45.1 and not enabled; `FastApiIntegration`
is unaffected by the driver. One boot with a deliberate handled error confirms events still
arrive. No config change expected.

### D11 — Single loop stays single
No `--workers`. In-process presence state (holds, connections) is the reason, unchanged.
Throughput headroom comes from the loop no longer blocking, not from more processes.

## 4. Sequence (one PR; commits for review legibility — the service does not boot until
   steps 1–4 are all in, because sync methods calling the async client return coroutines)

1. **Driver + boot.** Bump pin; `mongo_service` to `AsyncMongoClient` with a ping-free lazy
   `client`; lifespan in `app.py` (D2); one service set (D3); constructors I/O-free.
2. **Services.** Four classes `async def`, 61 awaits, `create_indexes` async (D4).
3. **Cursors.** Five sites (D5).
4. **Callers.** 190 awaits, four helpers async, HTTP routes (D6). Sweep with
   `grep -nE "(GameService|adventure_log|map_service|image_service)\.[a-z_]+\(" | grep -v await`
   until it returns only definitions and docstrings.
5. **Interleaving comments** at the hold registry, `map_token_update`, `map_token_drag` grab
   (D7). Lazy-import cleanup (D8).
6. **Tests** (D9). Run on the unfixed side first is not meaningful here (nothing exists to
   fail); the value is the round trip passing against the async client.
7. **Docs** — §6, only after the above is implemented and QA'd.

## 5. Proof and QA

- `python3 -m pytest api-game/tests -q` green, including the four round trips.
- Boot: `docker logs api-game-dev` shows one "MongoDB connection established", one set of
  "Created indexes" (not two), and a hard failure with the critical log line when Mongo is
  stopped first.
- ETL: start and end a session from the dashboard (exercises every service and both HTTP
  routes).
- **The stall, before/after.** Change the current drag-log guard from "never" to "every
  20th frame", and log `map_token_update` duration at INFO with a text prefix
  (`MAPTOKENS commit ... ms`). Two windows, one dragging while the other drops a token.
  Before: sampled frames stop for the length of the commit. After: they keep arriving at
  ~1/s through it. Keep the sampled log; it is the instrument.
- Adventure log pagination (`GET /game/{room}/logs?skip=&limit=`), map list, image list —
  the cursor sites.
- Disconnect cleanup (close a tab mid-drag → other window's nameplate clears) — unchanged
  behaviour, re-checked because `player_disconnect` gains awaits.

## 6. Documentation work item — do AFTER implementation, not now

**`CLAUDE.md`** (line numbers as of 2026-09-03):

- **568–600, "Explicit Over Implicit — Library Behavior Must Be Visible".** The code sample at
  581 (`client.admin.command('ping')`) becomes `await client.admin.command('ping')` inside
  the lifespan; the `except ServerSelectionTimeoutError: … raise` and `Raises:` guidance stay
  word-for-word. 591–592 "pymongo's lazy connect, `create_index` idempotency, Mongo
  auto-creating collections on first write" → "`AsyncMongoClient` connects lazily —
  construction proves nothing, the lifespan ping does; `create_index` is idempotent; Mongo
  auto-creates collections on first write; `find()` returns a cursor synchronously while
  `aggregate()` must be awaited". 600 **Origin (2026-08-28)** stays as history with one added
  sentence: "moved into the FastAPI lifespan when api-game went async (this PR's date)".
- **518, "### api-game (Game Session Service)".** Add to Tech: "MongoDB via PyMongo's async
  client; every database call is awaited; boot (ping + indexes) runs in the FastAPI
  lifespan; a blocking call in a handler is a bug." Add to Does NOT: "block the event loop".
- **413–414, Development Commands.** `cd api-game && python app.py` is already stale
  (`app.py` has no `__main__`/`uvicorn.run`); replace with the Dockerfile's uvicorn command.
  Add how the api-game suite runs (host or in-container per D9's outcome) — the doc currently
  only shows `docker exec api-site-dev … pytest`.
- **Testing section.** No rule change; add the round-trip tests as the worked example of
  "creates everything it touches" against a real store, once they exist.

**`.claude/debreifs/map-token-rubber-banding.md` §2, line 37.** Dated addendum: the
"pymongo is blocking … effectively atomic" reasoning was true when written and is what this
plan removes; the server-was-clean conclusion stands for other reasons (per-token `$set`,
single process).

**Memory.** None requested; the tokens memory's "blocking driver" note is folded into
whatever Matt asks for after QA.

## 7. What we will NOT invent

- No Motor. No `asyncio.to_thread` layer. No repository/abstraction over the four services —
  they stay static-method classes with awaits added.
- No second event loop, no `--workers`, no message-queue between receive and handle.
- No broadcast fan-out rewrite (`update_room_data` still awaits `send_json` per recipient in
  turn; a slow client delays the rest — real, separate, later).
- No test suite beyond the four round trips.
- No changes to api-site, the ETL payloads, shared_contracts, nginx, or the WebSocket
  protocol.

## 8. Risks and how each is caught

- **A missed `await`** hands a coroutine where a dict was expected. Caught by the grep sweep
  in §4 step 4 and by exercising every path in §5; a forgotten await in an f-string logs
  `<coroutine object …>` instead of crashing — grep the logs for `coroutine object` after QA.
- **Import cycle** from un-lazying `GameService` in `connection_manager` — verified safe by
  inspection (D8); the boot in §5 is the check.
- **Boot ordering**: the lifespan must run before the first WebSocket accept. FastAPI
  guarantees it; `--reload` restarts run it again.
- **Prod deploy**: both images rebuild (new pin); no schema or data change; rollback is the
  previous image.
