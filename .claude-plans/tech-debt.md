# Tech Debt Registry

Catalogue of code smells, architectural inconsistencies, and patterns that contradict the intended design. These aren't bugs — the app works — but they create confusion when reasoning about architecture and make refactors harder than they should be.

**Purpose:** When a pattern in the codebase contradicts what we're trying to build towards, document it here so we don't lose confidence in the plan or get derailed mid-implementation.

---

## Session Module

### 1. `_to_session_response` — endpoint doing query-layer work

**Location:** [endpoints.py:56-112](api-site/modules/session/api/endpoints.py#L56-L112)

**Smell:** The endpoint helper `_to_session_response` takes a raw `db: Session` and runs SQL joins across User and Character tables to enrich roster data. This is read-side query work that belongs in the application layer (`queries.py`), not in the API layer.

**Why it matters:** Every session endpoint passes `db: Session` as a dependency just to feed this helper. FastAPI's `response_model` should handle serialization on its own — the fact that we need a manual conversion function means the application layer isn't returning enriched-enough data.

**What "fixed" looks like:** `GetSessionById` (and similar queries) return an already-enriched object with host name, roster details, and character info. Endpoints return the query result directly, `response_model` serializes it. No `_to_session_response`, no `db` dependency on endpoints.

**Blocked by:** Nothing — independent cleanup.

---

### 2. Over-returning on session action endpoints

**Location:** [endpoints.py:223-264](api-site/modules/session/api/endpoints.py#L223-L264) (start), also pause/finish

**Smell:** Start, pause, and finish endpoints all return the full `SessionResponse` (roster, host name, joined users, etc.) when the frontend only needs `active_game_id` and `status` for the start action. The same `_to_session_response` + full response pattern is used everywhere regardless of what the consumer actually needs.

**Why it matters:** Couples all mutation endpoints to the same heavy response shape. Makes it look like the frontend needs all that data after every action, when it doesn't.

**What "fixed" looks like:** Action endpoints return a lean response (`SessionActionResponse` with `status` + `active_game_id`). TanStack Query invalidates the session cache to trigger a refetch if the full shape is needed.

**Blocked by:** Frontend changes to handle leaner responses.

---

## ETL Boundary (api-site → api-game)

### 3. api-site builds raw dicts for ETL payloads

**Location:** [commands.py:453-465](api-site/modules/session/application/commands.py#L453-L465)

**Smell:** The `StartSession` command builds the api-game payload as a raw `dict` literal — no Pydantic model, no validation, no type safety. Fields are hand-assembled with string keys and manual `str()` conversions.

**Why it matters:** If a field is misspelled, missing, or the wrong type, it silently passes through `httpx.post(json=payload)` and api-game receives garbage. This is the exact gap shared contracts are designed to close.

**What "fixed" looks like:** PR 3 of shared-contracts-acl — `StartSession` constructs a `SessionStartPayload` (contract type) instead of a raw dict. Pydantic validates at construction time, before the HTTP call.

**Blocked by:** shared-contracts-acl PR 1 (package exists) then PR 3 (api-site integration).

---

### 4. api-game's session schema types nested data as `dict`

**Location:** [session_schemas.py:25-29](api-game/schemas/session_schemas.py#L25-L29)

**Smell:** `SessionStartRequest` has `audio_config: dict = {}`, `map_config: dict = {}`, `image_config: dict = {}`. Pydantic validates the envelope (session_id is a string, max_players is an int) but everything interesting is typed as "it's a dict, whatever."

**Why it matters:** api-game accepts structurally invalid nested data without complaint. The data goes straight into MongoDB unvalidated. If api-site sends malformed audio config, it's stored and broadcast to all clients.

**What "fixed" looks like:** PR 2 of shared-contracts-acl — `SessionStartRequest` imports contract types (`Dict[str, AudioChannelState]`, `Optional[MapConfig]`, etc.). Pydantic rejects malformed nested data at the HTTP boundary.

**Blocked by:** shared-contracts-acl PR 1 (package exists) then PR 2 (api-game ACL).

---

## Patterns to Watch For

As we find more, add them here. Good candidates:

- [ ] Endpoints that take `db: Session` directly instead of going through queries
- [ ] Manual dict construction where Pydantic models should be used
- [ ] Response schemas that return more data than any consumer needs
- [ ] Business logic in API layer that belongs in application/domain layer
- [ ] Raw `.get()` chains on untyped dicts (especially in api-game)
