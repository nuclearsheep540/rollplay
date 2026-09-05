# Auth 01 — Refresh Token Ownership and Rotation

**Status:** IMPLEMENTED 2026-09-04, awaiting Matt's QA and commit. api-auth 15 tests green,
api-site 1003 green, middleware compiles, refresh verified end to end through NGINX (rotation,
401-clears-cookies, and the api-site-down 503 that keeps them). Line numbers below were accurate
at `5e4e63e` and have since drifted — re-grep before relying on one.

**Two deviations from the plan as written, both forced by what the code actually does:**

1. **§7.3's "import main at module top" was wrong and has been reverted to the lazy import the
   characters conftest already used.** The project conftest's `db_session` fixture rewrites every
   PostgreSQL UUID/JSONB column type to a SQLite-safe equivalent *at fixture time*, while
   `main.py` calls `configure_mappers()` at import. Importing main at conftest module scope
   therefore freezes the mappers against the unpatched types, after which every insert commits
   but no post-commit reload can find its row — `create_user` fails with "Could not refresh
   instance" in every test in the directory, whether or not it uses the client. Bisected to that
   single import line. The existing lazy import is load-bearing, not a style lapse; its comment
   cited FastAPI boot cost, which is why the plan mistook it for one. The no-lazy-imports rule
   yields here, and the new conftest says why at the import.
2. **`api-auth/__init__.py` had to be deleted** (78 bytes, licence header only, zero importers,
   added in 5d8543e). With it present, pytest treats the container's `/app` working directory as
   a package, so `import app` resolves to the *directory* rather than `app.py` and the FastAPI
   instance is unreachable from any test. api-site and api-game carry the same file harmlessly
   because their container paths do not collide with a module name. Verified afterwards that
   uvicorn still boots and `import app` resolves to `/app/app.py`.
**Revisions:** 2026-09-04 — audited against CLAUDE.md and Matt's standing feedback (§0 rules
13–15 and §3b added; harness imports, build procedure and sweep scope corrected). Same day, D13
flipped to include the six `utcnow()` replacements at Matt's request. 2026-09-04 — implemented;
see the two deviations recorded in the status block above.

**§6.3 runtime check result:** `typeof new Headers().getSetCookie` is `"function"` in the Next
middleware runtime, so the verbatim `Set-Cookie` forwarding path shipped and the body-echo
fallback was not needed. The probe was removed after the check.
**Scope:** move token refresh from api-site to api-auth; re-issue the refresh token on every
refresh so the 7-day window restarts on use; make token and cookie lifetimes single-sourced in
api-auth; delete the superseded api-site code; give api-auth its first test harness and CI job;
update the three frontend callers and the docs. No nginx change. No migration. One new
dependency (pytest, in api-auth only).
**Not in scope (decided, not forgotten):** an absolute session ceiling (Matt, 2026-09-04: "no
sensitive data in the app, just campaigns"); a server-side refresh-token store or revocation;
the api-auth dead-code sweep, which is recorded in §11 for a separate PR.

---

## 0. Ground rules for the implementing agent

These come from CLAUDE.md and from Matt's standing feedback. They are not optional.

1. **Never run a git write command** (`add`, `commit`, `push`, `checkout -b`, `stash`, tag).
   Propose the exact command in chat and let Matt run it. Read-only git is fine.
2. **Test-driven, with proof.** Write the test, run it against the unfixed code, show it
   failing, then implement, then show it passing. A test written after the fix proves nothing.
   Run tests in the container that owns the code (`docker exec api-auth-dev …`,
   `docker exec api-site-dev …`). See §7 for the exact order and commands.
3. **Every test owns its state.** Factories, function-scoped fixtures, no module-level mutable
   objects, assert only on what the test created.
4. **Delete superseded code in the same change.** When the api-auth endpoint lands, the api-site
   endpoint and its two helper methods go in the same PR. Sweep for dead references before
   review (`grep -rn "create_access_token\|verify_refresh_token\|users/auth/refresh"`), and in
   every file you touch grep each import and declared symbol for a second reference — lint will
   not catch an unused one. Do not extend that sweep into files the PR does not touch.
5. **Extend, don't invent.** Every addition below is modelled on something that already exists
   next to it (a sibling flow, a sibling internal endpoint, a sibling conftest). If you find
   yourself designing a new abstraction, stop and re-read the sibling. §3b lists every addition
   with the code it extends, and what this PR will not invent.
6. **Explicit library behaviour.** Name the exception you catch at I/O boundaries
   (`httpx.RequestError`, `jwt.ExpiredSignatureError`), pass defaults you rely on
   (`timeout=5.0`), and put a one-line comment at any point where the design leans on an
   implicit semantic. State deliberate non-handling in a `Raises:` docstring section.
7. **Naming.** Recognisable words, no initialisms, no single-character loop variables.
8. **Logging.** Text prefixes only, never emoji.
9. **License headers** on every new file (`# Copyright (C) 2025 Matthew Davey` /
   `# SPDX-License-Identifier: GPL-3.0-or-later`; JS uses the `/* … */` form).
10. **Images.** Dependencies install at image build; code is bind-mounted. After editing
    `api-auth/requirements.txt` you must rebuild that image
    (`docker-compose -f docker-compose.dev.yml build api-auth`) or pytest will not exist in the
    container. Do not rebuild anything else reflexively.
11. **Frontend HMR is unreliable in Docker.** If a middleware or hook change does not take,
    clear the cache and restart before assuming the code is wrong:
    `docker exec rollplay-dev rm -rf /app/.next && docker-compose -f docker-compose.dev.yml restart app`.
    **Never run `npm run build` (host or in-container) while `rollplay-dev` is up** — it
    clobbers the dev server's `.next` and nginx starts answering 504. See §7.5 for the safe
    compile check and the one sanctioned production build.
12. **One PR.** The three services change together and must ship in one release (§10).
13. **Questions are not instructions.** If Matt asks a question mid-implementation, including a
    closed "should we…?", answer it and end the turn. Edit only after an explicit "do it".
14. **No unrequested memory or CLAUDE.md writes.** The CLAUDE.md edits in §8 are part of this
    plan; anything beyond them, mention the intent and wait. Do not write memory files.
15. **No JavaScript test suite.** This repo has none and Matt does not want one created
    unprompted. Frontend verification is the manual checklist in §9 plus the compile check in §7.5.

---

## 1. Why

### 1.1 Incident
On the evening of 2026-09-03 two players were bounced to the login page mid-session. Both had
last logged in roughly one week earlier. Nothing was wrong with their network or the game
socket; their refresh tokens had simply reached their 7-day expiry, and the next api-site call
from inside the game (character-runtime save, campaign fetch, notes) got a 401, tried a refresh,
got another 401, and `authFetch` performed a hard redirect to `/auth/magic`.

### 1.2 Root cause
The refresh endpoint issues a new **access** token but never issues a new **refresh** token.
The refresh token's JWT `exp` and its cookie `max_age` are both fixed at login + 7 days and are
never extended. Activity keeps the 15-minute access token alive indefinitely; it does nothing
for the refresh token. The design is "sliding access, fixed refresh", which behaves exactly as
observed: a hard logout one week after login regardless of use.

The reason the endpoint only mints half a pair is structural, not an oversight in one
function: the endpoint lives in api-site, which can create access tokens and verify refresh
tokens, while the ability to create refresh tokens lives only in api-auth. The service holding
the endpoint has half the tools.

### 1.3 Design conclusion
api-auth owns token *generation* according to CLAUDE.md (§2.10) and its own docstrings.
api-site's helper is documented as verification-only. The refresh endpoint in api-site was
added inside a "bulky commit" (PR #71, 2e7223a: "claude also went ahead and implemented our
stage 2 refresh token plan") and was never a deliberate placement. Moving refresh to api-auth
puts the endpoint where every tool it needs already exists, and returns api-site to the role it
documents for itself. **The narrow alternative** (about 50 lines: teach the api-site endpoint to
mint a refresh token as well, copy one more cookie in the middleware) was offered first in chat
on 2026-09-04. Matt declined it in favour of fixing the ownership, on the explicit condition of
no duplicated code and no dead code left behind. That condition is why §5 deletes as much as
§4 adds, and why §3b exists.

---

## 2. Audit — what the code does today

### 2.1 Token issue at login (api-auth)
- `api-auth/auth/passwordless.py:113-143` (`verify_magic_link`) and `:145-198`
  (`verify_otp_token`) both end by calling `self.jwt_handler.create_tokens(user_data)`
  (`:127`, `:182`) and returning `{"user", "access_token", "refresh_token", "token_type"}`.
- `api-auth/auth/jwt_handler.py:222-231` `create_tokens` returns both tokens.
  `:27-51` `create_token` (access, `type: "access"`, exp at `:37`);
  `:199-220` `create_refresh_token` (`type: "refresh"`, exp at `:207`).
- `api-auth/app.py:116-161` (`GET /auth/verify/{token}`) and `:163-208` (`POST /auth/verify-otp`)
  each contain an identical pair of `response.set_cookie` blocks: `auth_token` with
  `max_age=900` (`:130-139`, `:177-186`) and `refresh_token` with `max_age=604800`
  (`:141-149`, `:188-196`). Flags: `httponly=True, secure=True, samesite="lax", path="/"`.
- `api-auth/app.py:239-277` (`POST /auth/logout`) clears both with `set_cookie(..., max_age=0)`
  (`:246-265`).
- The frontend's login path is `rollplay/app/auth/verify/page.js:19` → `POST /api/auth/verify-otp`
  (the magic link URL points at the Next page, which posts the token). `GET /auth/verify/{token}`
  has zero frontend callers (§11).

### 2.2 Refresh (api-site) — the endpoint being moved
- `api-site/modules/user/api/endpoints.py:171-246` `POST /auth/refresh`, mounted under
  `/api/users` by `api-site/main.py:88`, so the public path is `/api/users/auth/refresh`.
- Reads `refresh_token` cookie (`:188`), verifies with `jwt_helper.verify_refresh_token`
  (`:196`), validates UUID (`:210-216`), DB check `user_repo.get_by_id` (`:220`) which excludes
  soft-deleted users by default (`user_repository.py:30-35`), mints an access token with
  `jwt_helper.create_access_token` (`:231-234`), sets only the `auth_token` cookie with
  `max_age=900` (`:236-244`), returns `{"message", "access_token"}` (`:246`).
- **Never touches the refresh cookie.** That is the bug.
- **Latent bug worth knowing:** `:222-228` calls `response.delete_cookie(...)` on the injected
  `Response` and then `raise HTTPException(...)`. In FastAPI, cookies/headers set on the injected
  `response` parameter are only sent when the handler *returns*; raising an `HTTPException`
  builds a fresh response, so those two `delete_cookie` calls never reach the browser. The new
  endpoint must set cookies on the object it actually returns (§4.6).
- Module-level `jwt_helper = JWTHelper()` at `:38-39` ("Initialize JWT helper for refresh token
  operations") is used only by this endpoint. `ws-token` (`:338-366`) builds its own local
  instance at `:349`.
- The two helper methods that exist only for this endpoint:
  `api-site/shared/jwt_helper.py:130-159` `verify_refresh_token` and `:161-181`
  `create_access_token`. The class docstring at `:13-17` says "JWT token verification for
  api-site service — Validates tokens created by api-auth service", which these two contradict.
  Also note `create_access_token` omits the `display_name` claim that api-auth's `create_token`
  includes; nothing reads it, but the two services currently mint slightly different access
  tokens.

### 2.3 Callers of refresh (frontend) — three, two of them duplicates
| Caller | File | What it does | Cookie handling |
|---|---|---|---|
| Reactive, on any 401 | `rollplay/app/shared/utils/authFetch.js:26-56` (`refreshAccessToken`), URL at `:35`; used by `authFetch` at `:65-92`, hard redirect at `:85` | `POST` with `credentials: 'include'`, returns boolean; dedupes concurrent refreshes via `isRefreshing`/`refreshPromise` (`:19-20`) | Browser applies `Set-Cookie` automatically |
| Proactive timer, every 12 min + on tab visible | `rollplay/app/shared/hooks/useTokenRefresh.js:20-84`, inline fetch at `:23-37`, URL at `:25` | Same fetch written a second time; warns on failure, never redirects | Browser applies `Set-Cookie` automatically |
| Page-load gate | `rollplay/middleware.js:29-48` (`tryRefreshToken`), URL at `:31`; called at `:74` and `:110` | Runs on the Next server. Builds a `Cookie` header by hand (`:35`), reads `access_token` from the JSON body (`:44`), and hand-writes an `auth_token` cookie with `maxAge: 900` on its own response (`:80-86`, `:115-121`). Upstream `Set-Cookie` headers are discarded. | Manual copy — this is why the middleware is the one frontend file that needs logic changes |

- The timer is mounted only through `useAuth` (`rollplay/app/dashboard/hooks/useAuth.js:21`),
  which is called by the `(authenticated)` route-group layout
  (`rollplay/app/(authenticated)/layout.js:16,25`) covering `account`, `character`, `dashboard`,
  `notes`, `workshop`. The game page (`rollplay/app/game/`) is outside the group by design
  (`.claude/plans/shared-authenticated-layout.md`, "Game is excluded"), so in-game refresh is
  purely reactive via `authFetch` (`GameContent.js:659,754`, `hooks/useCharacterRuntime.js:29`,
  `hooks/useFinishSession.js:39`, `notes/hooks/useNotes.js:34`). That is fine once tokens
  rotate: any of those calls slides the window.
- Middleware protected routes (`middleware.js:10-17`) include `/game`, so an in-game reload takes
  the middleware path.

### 2.4 Where lifetimes are declared today — five places, none connected
| Place | Value | Read by |
|---|---|---|
| `api-auth/config/settings.py:39` `jwt_access_token_expire_minutes = 60 * 24 * 7` | 7 days | **nothing** (added in 5d8543e alongside a hardcoded duplicate; the handler was changed to 15 min in PR #71 and this field was left behind) |
| `api-auth/auth/jwt_handler.py:23` `access_token_expire_minutes = 15` | 15 min | access JWT `exp` |
| `api-auth/auth/jwt_handler.py:24` `refresh_token_expire_days = 7` | 7 days | refresh JWT `exp` |
| `api-auth/app.py:136,183` `max_age=900`; `:147,194` `max_age=604800` | 15 min / 7 days | cookie lifetimes |
| `api-site/shared/jwt_helper.py:177` `timedelta(minutes=15)`; `endpoints.py:242` `max_age=900`; `middleware.js:84,119` `maxAge: 900` | 15 min | refreshed access JWT / cookie |

Related but **out of scope**: `settings.py:38` `jwt_algorithm = "HS256"` is declared, documented
in `env.example:54` as `JWT_ALGORITHM`, and read by nobody — both services hardcode `"HS256"`
(`jwt_handler.py:22`, `api-site/shared/jwt_helper.py:23`). Also the magic-link lifetime is
declared four times (`jwt_handler.py:25`, `passwordless.py:58` `expire_minutes=15`, the two
`expiry_minutes=15` email calls, `email_service.py:14` `EXPIRY_MINUTES = 15`). Both recorded in
§11.

### 2.5 The two JWT helpers — capabilities split down the middle
| Capability | api-auth `JWTHandler` | api-site `JWTHelper` |
|---|---|---|
| create access | `create_token` `:27` | `create_access_token` `:161` (to be deleted) |
| create refresh | `create_refresh_token` `:199` | — |
| create pair | `create_tokens` `:222` | — |
| verify access | `verify_token` `:79` | `verify_auth_token` `:25`, `extract_user_id_from_token` `:69` |
| verify refresh | — (**to be added**, moved from api-site) | `verify_refresh_token` `:130` (to be deleted) |
| verify magic | `verify_magic_token` `:153` | — |
| Bearer-header helpers | `get_token_from_header` `:111`, `get_current_user` `:132` (only the dead profile endpoints use these) | `get_token_from_cookie` `:109` |

Both sign/verify with the shared `JWT_SECRET_KEY` and `HS256`. Time handling differs:
api-auth uses `datetime.utcnow()` (naive; emits `DeprecationWarning` on the image's Python 3.12,
`api-auth/Dockerfile:4`), api-site uses `datetime.now(timezone.utc)`. PyJWT accepts either.

### 2.6 Service-to-service direction — one way, api-auth → api-site
- api-auth already calls api-site over the Docker network from `passwordless.py`:
  `_get_screen_name` (`:30-42`, `GET /api/users/internal/check-email`, `httpx` timeout 5.0) and
  `_resolve_user_for_token` (`:200-235`, `POST /api/users/internal/resolve-user`, timeout 10.0,
  catches `httpx.RequestError` at `:232`). Base URL from `settings.API_SITE_INTERNAL_URL`
  (`settings.py:56`, default `http://api-site:8082`).
- api-site **never** calls api-auth (`grep -rn "API_AUTH\|api-auth:8083" api-site` is empty), and
  CLAUDE.md:567 states "JWT validation (shared secret, no call to api-auth)".
- The api-site internal endpoints: `endpoints.py:114-149` `resolve-user` (**get-or-create; it
  reactivates soft-deleted accounts** via `user_repository.py:333-370` `reactivate`, so it must
  never be used from a refresh path) and `:152-165` `check-email` (read-only, returns
  `{"screen_name": ...}`; a `null` means either "unknown" or "known but no name set", so it
  cannot answer "is this account active"). Both are blocked at the edge by
  `docker/dev/nginx/nginx.conf:115-117` and `docker/prod/nginx/nginx.conf:109-111`
  (`location /api/users/internal/ { return 404; }`).
- api-auth has a `config/database.py` and SQLAlchemy/psycopg2 in `requirements.txt`, but no
  `DATABASE_URL` is supplied anywhere (`grep DATABASE_URL docker-compose*.yml env.example` is
  empty) and nothing imports the module. It cannot check users directly and should not start.

### 2.7 Routing — no change needed for the new endpoint
- `location /api/auth/ { proxy_pass http://api-auth:8083/auth/; … proxy_set_header Cookie $http_cookie; }`
  exists in both `docker/dev/nginx/nginx.conf:67-75` and `docker/prod/nginx/nginx.conf:429-437`.
  A request to `/api/auth/refresh` therefore already reaches `POST /auth/refresh` in api-auth
  with cookies intact and `Set-Cookie` passing back (the verify endpoints prove this path in prod).
- The old refresh path rode the generic `/api/users/` block (`prod:120`); there is no dedicated
  nginx block to delete.
- A second, older URL convention also reaches api-auth: bare `/auth/validate`, `/auth/logout`,
  `/auth/magic-link`, `/auth/verify-otp` via `rollplay/next.config.js:13-33` rewrites in dev and
  dedicated blocks at `prod nginx:455,479,503,527`. Used by `auth/magic/page.js:36` and
  `dashboard/hooks/useAuth.js:27`. Do **not** add a bare `/auth/refresh`; the refresh callers
  already use the `/api/...` convention. Standardising the two conventions is a follow-up (§11).
- The middleware calls services directly over the Docker network using
  `rollplay/app/shared/config.js:15-16` (`API_SITE_INTERNAL_URL`, `API_AUTH_INTERNAL_URL`); it
  already uses the api-auth one for `/auth/validate` (`middleware.js:98,151`).

### 2.8 Who checks tokens per request
- api-site: `shared/dependencies/auth.py:19-62` `get_current_user_id` decodes the JWT only (no
  DB); `:64-125` `get_current_user_from_token` also does `user_repo.get_by_id` and 401s on a
  soft-deleted user (`:117-123`). Endpoints on the lightweight dependency will accept a valid
  access token from a soft-deleted account until it expires. The refresh-time "is the user still
  active" check bounds that exposure to one access-token lifetime, which is why the check must
  survive the move (D8).
- api-game: **no token check at all**. The game socket is opened with a bare `user_id` query
  parameter (`api-game/websocket_handlers/app_websocket.py:63-69`), and the HTTP routes have no
  auth dependency. This is why an expired token does not drop the game; only an api-site call
  from inside the game surfaces it.

### 2.9 Tests and CI per service
| Service | pytest in requirements | tests | CI |
|---|---|---|---|
| api-site | `requirements.txt:13` | `conftest.py` at root (`db_session:135`, `user_repo:218`, `create_user:255`), per-module `tests/`; TestClient harness at `modules/characters/tests/api/conftest.py:33-66`; `pytest.ini` present; `modules/user/tests/test_user.py` is an empty placeholder | `.github/workflows/api-site.yml` (paths `api-site/**`, `cd api-site && python -m pytest -v`) |
| api-game | `requirements.txt:9` | root `conftest.py` is a sys.path anchor; `tests/` without `__init__.py` | none |
| api-auth | **none** | **none** | **none** |

### 2.10 Documentation describing the current shape (must be updated)
- `CLAUDE.md:356` lists `/api/users/auth/refresh` as the authFetch exception.
- `CLAUDE.md:535` service map: "api-auth (8083): Magic links, OTP, JWT generation".
- `CLAUDE.md:561-563` api-auth "Does: JWT generation, magic link emails, OTP verification".
- `CLAUDE.md:566-567` api-site "Does: … JWT validation (shared secret, no call to api-auth)".
- `.claude/plans/PARTauthfetch-migration.md:80-81` names the old URL (historical plan).
- `authFetch.js:7-16` doc comment names the old URL.

---

## 3. Decisions

- **D1 — api-auth owns refresh.** New `POST /auth/refresh` in api-auth. api-site loses its
  refresh endpoint and the two helper methods that existed only for it.
- **D2 — The browser calls api-auth directly.** Not "api-site calls api-auth". The dependency
  arrow stays api-auth → api-site (§2.6). The middleware, which runs server-side, calls api-auth
  over the internal URL it already uses for validate.
- **D3 — Rotation, no ceiling.** Every successful refresh mints a new pair via the existing
  `create_tokens` and re-sets both cookies. The refresh lifetime restarts on every use, so a
  user seen at least once per 7 days is never asked to log in again. There is no absolute
  maximum, no server-side store, and a superseded refresh token stays valid until its own `exp`.
  All three are Matt's explicit call for this app's threat model; do not add them.
- **D4 — Public URL `/api/auth/refresh`.** Nginx already routes it (§2.7). No nginx change.
- **D5 — Lifetimes single-sourced in api-auth `Settings`.** The dead
  `jwt_access_token_expire_minutes` is repurposed (default 15) and
  `jwt_refresh_token_expire_days` (default 7) is added beside it. `JWTHandler` reads both from
  the `settings` object it already receives. Cookie `max_age` is computed from the same two
  handler attributes inside `set_auth_cookies` (§4.5) — no new properties. After this PR the
  only places a lifetime appears are `settings.py` and tests.
- **D6 — Two cookie helpers in `api-auth/app.py`.** `set_auth_cookies(response, tokens)` and
  `clear_auth_cookies(response)` replace the four identical hand-written blocks (two verify
  endpoints, logout, plus the new refresh). They live in `app.py` next to the module-level
  `jwt_handler` they read lifetimes from.
- **D7 — The refresh flow is a third method on `PasswordlessAuth`**, beside `verify_magic_link`
  and `verify_otp_token`, which have the same shape (verify a credential → confirm the account
  with api-site → `create_tokens`). Its api-site call is a private `_is_user_active` beside
  `_get_screen_name`. Do not create a new class or module for this.
- **D8 — api-site gains one read-only internal endpoint:** `GET /api/users/internal/check-active?user_id=<uuid>`
  → `{"active": bool}`, modelled on `check-email`, backed by a `CheckUserActive` query modelled
  on `CheckUserEmailExists`. Blocked at the edge by the existing `/api/users/internal/` 404.
  `resolve-user` must not be used here (it get-or-creates and reactivates deleted accounts).
- **D9 — Failure semantics are explicit.** `401` means the presented credential is unusable
  (missing, expired, wrong type, bad signature, malformed user id, or account inactive) and
  **both cookies are cleared** on that response so the 12-minute timer cannot loop on a dead
  token. `503` means api-site could not confirm the account (network error or non-200) and
  **cookies are kept**, because an api-site restart or deploy must not log every user out at
  their next refresh. The 401 response must be a returned `JSONResponse` carrying the cleared
  cookies, not a raised `HTTPException` (§2.2 latent bug).
- **D10 — Tokens travel only as cookies.** The refresh response body is
  `{"success": true, "user": {...}, "message": "..."}` like the verify endpoints; it does not
  echo tokens. The middleware forwards api-auth's `Set-Cookie` headers verbatim rather than
  rebuilding cookies from the body, which removes its hardcoded `maxAge` and closes the small
  hole where the old endpoint handed an httpOnly cookie's value to page JavaScript. See §6.3 for
  the one runtime check and the fallback if it fails.
- **D11 — One refresh function on the frontend.** `refreshAccessToken` is exported from
  `authFetch.js` and used by `useTokenRefresh`. The timer inherits the concurrency guard for
  free (timer and 401-retry can no longer race two refreshes).
- **D12 — api-auth gets pytest, a root `conftest.py` anchor (api-game pattern), a `tests/`
  directory, and a CI workflow cloned from `api-site.yml`.**
- **D13 — Replace the six `datetime.utcnow()` calls in `jwt_handler.py` with
  `datetime.now(timezone.utc)`** (`:37,38,60,61,207,208`) and import `timezone`. Matt opted in
  on 2026-09-04 ("it's a change of plan — let's include a fix on the six utcnow calls"), so this
  is a requested change, not an unasked sweep. Python 3.12 deprecates `utcnow`; PyJWT turns both
  forms into the same integer timestamp, so encoded tokens are byte-for-byte unchanged and
  nothing downstream can tell the difference. Scope is this one file: the `utcnow()` at
  `app.py:57` (health-check timestamp) is not part of the request and stays in §11.
- **D14 — Ship `app`, `api_site`, `api_auth` in one release** (§10).

### 3b. Pattern fit — and what we will NOT invent

Every addition, with the existing code it extends. If a row's "extends" column were empty, the
addition would need re-justifying before it is written.

| Addition | Extends / mirrors | New file? |
|---|---|---|
| `Settings.jwt_refresh_token_expire_days` | the existing (dead) `jwt_access_token_expire_minutes` at `settings.py:39`, now given a reader | no |
| `JWTHandler.verify_refresh_token` | `verify_token` at `jwt_handler.py:79-109`; the body is `api-site/shared/jwt_helper.py:130-159` moved, not rewritten | no |
| `PasswordlessAuth._is_user_active` | `_get_screen_name` at `passwordless.py:30-42` (same `httpx` shape, same timeout) | no |
| `PasswordlessAuth.refresh_tokens` | `verify_magic_link` / `verify_otp_token` (`:113-198`): verify → confirm with api-site → `create_tokens` | no |
| `UserServiceUnavailable` | the bare `raise Exception(...)` calls in `_resolve_user_for_token` (`:200-235`), given a name so the endpoint can tell "api-site down" (503, keep cookies) from "token bad" (401, clear cookies). D9 needs that distinction; a bare `Exception` cannot carry it | no |
| `set_auth_cookies` / `clear_auth_cookies` | the four identical `set_cookie` pairs in `app.py` (`:130-149`, `:177-196`, `:246-265`, plus the new endpoint). The "repeats twice, then generalise" bar is met four times over | no |
| `_refresh_rejected` | two return sites in one endpoint; inline it if a reviewer prefers, it is six lines | no |
| `POST /auth/refresh` | the two verify endpoints (`app.py:116-208`): same body shape, same cookie helper | no |
| `CheckUserActive` | `CheckUserEmailExists` at `queries.py:28-39` | no |
| `InternalUserActiveResponse` | `InternalUserResolveResponse` at `schemas.py:106-114` | no |
| `GET /internal/check-active` | `check_email_exists` at `endpoints.py:152-165` | no |
| `api-auth/conftest.py` | `api-game/conftest.py` (sys.path anchor) | yes — D12, agreed with Matt |
| `api-auth/tests/*` | api-game's `tests/` layout | yes — D12, agreed with Matt |
| `.github/workflows/api-auth.yml` | `api-site.yml`, cloned | yes — D12, agreed with Matt |
| `api-site/modules/user/tests/conftest.py` | `modules/characters/tests/api/conftest.py:33-53` | yes — first endpoint test in the user module |
| `export refreshAccessToken` | the function already at `authFetch.js:26`, made importable | no |

Considered and declined, with the reason:
- **A shared `_get_from_site` helper in `passwordless.py`** for its three `httpx` calls. They
  differ in verb, timeout, and error contract (one swallows, one raises bare, the new one raises
  typed); forcing them through one function would muddy each one's responsibility. Three clear
  siblings beat one mangled helper.
- **Cookie-lifetime properties on `JWTHandler`.** Two attributes already exist; multiplying them
  out inside `set_auth_cookies` needs no new names.
- **A `Depends`-injected service in api-auth** so tests could use `dependency_overrides` like
  api-site does. api-auth has no such pattern for its services; tests patch the module singleton
  through pytest's `monkeypatch` instead (§7.1), which is restored at teardown.

We will NOT invent:
- a token module, service class, or package shared between api-auth and api-site;
- a refresh-token store, revocation list, or absolute session ceiling (D3);
- a JavaScript test suite, or any test tooling under `rollplay/`;
- a bare `/auth/refresh` nginx block or Next rewrite (§2.7);
- an Alembic migration (nothing in PostgreSQL changes);
- any change to api-game, to `rollplay-shared-contracts`, or to the game WebSocket's `user_id`
  handling;
- a "generic" cookie or token helper reachable from more than one service.

---

## 4. api-auth changes

### 4.1 `api-auth/config/settings.py`
Replace `:39` and add the refresh lifetime:
```python
    # JWT Settings - required, no defaults for secrets
    JWT_SECRET_KEY: str
    jwt_algorithm: str = "HS256"
    # Token lifetimes. JWTHandler reads these for the JWT `exp` claims and derives the
    # matching cookie max-age from them, so this is the only place a lifetime is defined.
    # Env override: JWT_ACCESS_TOKEN_EXPIRE_MINUTES / JWT_REFRESH_TOKEN_EXPIRE_DAYS
    # (pydantic-settings matches env vars case-insensitively).
    jwt_access_token_expire_minutes: int = 15
    jwt_refresh_token_expire_days: int = 7
```
History note for the commit message: the old default of `60 * 24 * 7` was never read by anything
(added in 5d8543e next to a hardcoded copy; the handler was changed to 15 minutes in PR #71 and
the field was orphaned), so changing the default is behaviour-preserving.

### 4.2 `env.example`
Under the JWT block (`:52-54`) add two commented optional lines documenting the overrides and
their defaults. Do not add them to `dev.env`/`prod.env` (gitignored; defaults apply).

### 4.3 `api-auth/auth/jwt_handler.py`
1. `__init__` (`:19-25`): read lifetimes from settings; keep the magic lifetime as-is (out of
   scope):
   ```python
   self.access_token_expire_minutes = settings.jwt_access_token_expire_minutes
   self.refresh_token_expire_days = settings.jwt_refresh_token_expire_days
   self.magic_token_expire_minutes = 15  # magic links: unchanged this PR, see plans/auth §11
   ```
2. No cookie-lifetime properties (§3b): `set_auth_cookies` in `app.py` computes seconds from
   the two attributes above.
3. Add `verify_refresh_token`, placed directly after `verify_token` (`:79-109`) and written in
   the same style. It is the api-site method (`api-site/shared/jwt_helper.py:130-159`) moved
   here, with two changes: it validates the `user_id` claim is a UUID (the old endpoint did that
   separately at `endpoints.py:209-216`) and it returns the `{"id", "email"}` shape that
   `create_tokens` consumes, so the refresh flow can hand the result straight back in.
   ```python
   def verify_refresh_token(self, token: str) -> Optional[Dict[str, Any]]:
       """
       Verify a refresh token and return the user data needed to mint a new pair.

       Returns {"id": <uuid str>, "email": <str>} — the shape create_tokens() takes —
       or None when the token is expired, tampered, signed with another key, not of
       type "refresh", or carries a malformed user_id. All of those are expected
       inputs at this boundary and are reported as None, never raised: the caller
       answers 401 and clears cookies.
       """
       try:
           # PyJWT enforces `exp` only because verify_exp is on (its default); `require`
           # additionally rejects a token that carries no exp at all. Both are spelled out
           # because expiry enforcement is the whole point of this check. A missing claim
           # raises MissingRequiredClaimError, a subclass of InvalidTokenError.
           payload = jwt.decode(
               token,
               self.secret_key,
               algorithms=[self.algorithm],
               options={"verify_exp": True, "require": ["exp"]},
           )
       except jwt.ExpiredSignatureError:
           logger.warning("Refresh token has expired")
           return None
       except jwt.InvalidTokenError as error:
           logger.warning(f"Invalid refresh token: {error}")
           return None

       if payload.get("type") != "refresh":
           logger.warning(f"Invalid token type for refresh: {payload.get('type')}")
           return None

       user_id = payload.get("user_id")
       email = payload.get("email")
       if not user_id or not email:
           logger.warning("Refresh token missing user_id or email")
           return None
       try:
           UUID(user_id)
       except (ValueError, TypeError):
           logger.warning("Refresh token user_id is not a UUID")
           return None

       return {"id": user_id, "email": email}
   ```
   (`from uuid import UUID` at the top.)
4. D13: replace all six `datetime.utcnow()` calls (`:37,38,60,61,207,208`) with
   `datetime.now(timezone.utc)` and extend `:6` to
   `from datetime import datetime, timedelta, timezone`. Mechanical; the `exp - iat` assertions
   in `tests/test_jwt_handler.py` (§7.2) exercise every one of them.
5. Touched-file sweep: `import os` (`:4`) and `from fastapi.security import HTTPBearer,
   HTTPAuthorizationCredentials` (`:9`) look unused today — grep each name for a second
   reference and remove the ones that have none. Do not extend this into untouched files.

### 4.4 `api-auth/auth/passwordless.py`
1. Module-level exception, near the top after the logger:
   ```python
   class UserServiceUnavailable(Exception):
       """api-site could not be reached or answered with an error while confirming an account."""
   ```
2. `_is_user_active`, placed directly after `_get_screen_name` (`:30-42`) and written in the same
   style:
   ```python
   async def _is_user_active(self, user_id: str) -> bool:
       """
       Ask api-site whether the account behind a refresh token still exists and is not
       soft-deleted. Read-only, no side effects. Never use resolve-user here: it
       get-or-creates, and would resurrect a deleted account on refresh.

       Raises:
           UserServiceUnavailable: network failure or a non-200 answer. Deliberately not
               swallowed — "unknown" must not be reported as "inactive", or an api-site
               restart would log every user out at their next refresh. The endpoint
               turns this into a 503 and keeps the cookies.
       """
       try:
           async with httpx.AsyncClient(timeout=5.0) as client:
               response = await client.get(
                   f"{self.api_site_url}/api/users/internal/check-active",
                   params={"user_id": user_id},
               )
       except httpx.RequestError as error:
           raise UserServiceUnavailable(f"api-site unreachable: {error}") from error

       if response.status_code != 200:
           raise UserServiceUnavailable(
               f"api-site check-active returned {response.status_code}: {response.text}"
           )
       return bool(response.json().get("active"))
   ```
3. `refresh_tokens`, placed directly after `verify_otp_token` (`:145-198`), the third sibling:
   ```python
   async def refresh_tokens(self, refresh_token: str) -> Optional[Dict[str, Any]]:
       """
       Exchange a valid refresh token for a new access + refresh pair (rotation).

       Same shape as verify_magic_link / verify_otp_token: verify the presented
       credential, confirm the account with api-site, mint a pair. Because the new
       refresh token restarts the refresh lifetime, a user seen at least once per
       lifetime is never asked to log in again. There is no absolute ceiling and no
       server-side record: a superseded refresh token stays valid until its own exp.
       (Decision D3, plans/auth/01.)

       Returns None when the token is unusable or the account is gone — the caller
       answers 401 and clears both cookies.

       Raises:
           UserServiceUnavailable: propagated from _is_user_active, see there.
       """
       user_data = self.jwt_handler.verify_refresh_token(refresh_token)
       if not user_data:
           return None

       if not await self._is_user_active(user_data["id"]):
           logger.info(f"Refresh refused: user {user_data['id']} is not active")
           return None

       tokens = self.jwt_handler.create_tokens(user_data)
       logger.info(f"Rotated tokens for {user_data['email']}")
       return {
           "user": user_data,
           "access_token": tokens["access_token"],
           "refresh_token": tokens["refresh_token"],
           "token_type": "bearer",
       }
   ```

### 4.5 `api-auth/app.py` — cookie helpers (D6)
Directly after `jwt_handler = JWTHandler(settings)` (currently `:46-47`, just above `/health`):
```python
def set_auth_cookies(response: Response, tokens: Dict[str, str]) -> None:
    """
    Set the access + refresh httpOnly cookies from a token pair (any dict with
    'access_token' and 'refresh_token' — create_tokens() output or an auth_result).

    Cookie max-age mirrors each JWT's exp so the browser drops a cookie at the moment
    its token stops verifying. Lifetimes come from JWTHandler, which reads Settings —
    the one place they are defined (plans/auth/01 D5).
    """
    response.set_cookie(
        key="auth_token",
        value=tokens["access_token"],
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=jwt_handler.access_token_expire_minutes * 60,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=tokens["refresh_token"],
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=jwt_handler.refresh_token_expire_days * 24 * 60 * 60,
        path="/",
    )


def clear_auth_cookies(response: Response) -> None:
    """Expire both auth cookies. Same attributes as when set, so the browser matches them."""
    for cookie_name in ("auth_token", "refresh_token"):
        response.set_cookie(
            key=cookie_name,
            value="",
            httponly=True,
            secure=True,
            samesite="lax",
            max_age=0,
            path="/",
        )
```
Then replace: the two blocks in `verify_magic_link` (`:130-149`) and `verify_otp_token`
(`:177-196`) with `set_auth_cookies(response, auth_result)`; the two blocks in `logout`
(`:246-265`) with `clear_auth_cookies(response)`. Imports: `Dict` from `typing`, `JSONResponse`
from `fastapi.responses`, `UserServiceUnavailable` from `auth.passwordless`. Leave `:18`
(`from models.user import User, UserCreate, UserResponse`) alone — the profile endpoints still
use two of them until the §11 sweep. Touched-file sweep: `import os` (`:4`) and `timedelta`
(`:10`) appear to have no reference in `app.py` — grep each and remove the ones that have none.

### 4.6 `api-auth/app.py` — the endpoint (D1, D9, D10)
Place after `/auth/validate` (`:210-237`) and before `/auth/logout`:
```python
def _refresh_rejected(detail: str) -> JSONResponse:
    """
    401 that also clears both cookies, so a caller holding a dead refresh token stops
    retrying it. Cookies must be set on the object that is actually returned: anything
    set on FastAPI's injected `response` is dropped when an HTTPException is raised.
    """
    rejected = JSONResponse(status_code=401, content={"detail": detail})
    clear_auth_cookies(rejected)
    return rejected


@app.post("/auth/refresh")
async def refresh_tokens(request: Request, response: Response):
    """
    Exchange the refresh_token cookie for a new access + refresh pair.

    Rotation: every success re-issues BOTH cookies, so the refresh lifetime restarts on
    use. Tokens travel only as httpOnly cookies; the body never carries them.

    401, both cookies cleared: no cookie, or the token is expired / invalid / not a
        refresh token, or the account is no longer active.
    503, cookies kept: api-site could not confirm the account. A transient outage must
        not log every user out.
    """
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        return _refresh_rejected("No refresh token")

    try:
        auth_result = await passwordless_auth.refresh_tokens(refresh_token)
    except UserServiceUnavailable as error:
        logger.error(f"Refresh could not confirm account with api-site: {error}")
        raise HTTPException(status_code=503, detail="Account service unavailable")

    if not auth_result:
        return _refresh_rejected("Invalid or expired refresh token")

    set_auth_cookies(response, auth_result)
    return {"success": True, "user": auth_result["user"], "message": "Tokens refreshed"}
```
Note the existing endpoints wrap everything in `try/except Exception → 500`; the new one
deliberately does not, so an unexpected error surfaces as a 500 with a traceback in the logs
rather than a swallowed one. Keep it that way.

### 4.7 `api-auth/requirements.txt`
Add `pytest==8.0.0` (the version api-site and api-game pin). Rebuild the image (§0.10).

---

## 5. api-site changes

### 5.1 Add — `api-site/modules/user/application/queries.py`
After `CheckUserEmailExists` (`:28-39`), mirror it:
```python
class CheckUserActive:
    """
    Read-only: does a user with this id exist and remain active (not soft-deleted)?

    Serves api-auth's refresh flow via /internal/check-active. get_by_id excludes
    soft-deleted rows by default, so "found" is exactly "active".
    """

    def __init__(self, repository: UserRepository):
        self.repository = repository

    def execute(self, user_id: UUID) -> bool:
        return self.repository.get_by_id(user_id) is not None
```

### 5.2 Add — `api-site/modules/user/api/schemas.py`
After `InternalUserResolveResponse` (`:106-114`):
```python
class InternalUserActiveResponse(BaseModel):
    """
    Internal API response for api-auth's refresh flow: is this account still active?

    Read-only contract. NOT exposed via NGINX — /api/users/internal/ returns 404 at the edge.
    """
    active: bool
```

### 5.3 Add — `api-site/modules/user/api/endpoints.py`
After `check_email_exists` (`:152-165`), mirror it:
```python
@router.get("/internal/check-active", response_model=InternalUserActiveResponse)
async def check_user_active(
    user_id: UUID,
    user_repo: UserRepository = Depends(user_repository)
):
    """
    Internal endpoint for api-auth's token refresh: does this account still exist and
    remain active (not soft-deleted)?

    Read-only — no side effects. NOT exposed via NGINX (/api/users/internal/ → 404).
    Only accessible within Docker network (http://api-site:8082).
    """
    query = CheckUserActive(user_repo)
    return InternalUserActiveResponse(active=query.execute(user_id))
```
Extend the imports at `:10-19` (schema) and `:23` (`CheckUserActive`). A malformed `user_id`
yields FastAPI's 422, which api-auth reports as `UserServiceUnavailable` → 503; that cannot
happen for a token api-auth minted (§4.3 validates the claim first).

### 5.4 Delete — `api-site/modules/user/api/endpoints.py`
- `:171-246` the whole `refresh_access_token` endpoint.
- `:38-39` the comment and `jwt_helper = JWTHelper()`.
- Keep `:9` `from shared.jwt_helper import JWTHelper` (`ws-token` at `:349` still uses it) and
  the `Response`/`Request` imports (`/me`, `/me/hard`, `ws-token` use them).

### 5.5 Delete — `api-site/shared/jwt_helper.py`
- `:130-159` `verify_refresh_token` and `:161-181` `create_access_token`.
- `:6` `from datetime import datetime, timedelta, timezone` becomes unused → remove.
- `:7` `from typing import Optional, Dict, Any` → `from typing import Optional` (verify with grep
  that `Dict`/`Any` have no remaining use in the file).
- The class docstring at `:13-17` is now accurate; leave it.

### 5.6 Sweep
`grep -rn "create_access_token\|verify_refresh_token\|refresh_access_token\|users/auth/refresh" api-site rollplay CLAUDE.md .claude/plans`
must return only the historical mention in `PARTauthfetch-migration.md` (which §8 updates).

---

## 6. Frontend changes

### 6.1 `rollplay/app/shared/utils/authFetch.js`
- `:26` → `export async function refreshAccessToken()`.
- `:35` URL → `'/api/auth/refresh'`.
- Doc comment `:7-16`: update the URL and add one line: "The response carries both cookies
  (access + rotated refresh); the browser stores them, nothing here reads the body."
- No other logic change. The `!response.ok → false` branch already covers both 401 and 503;
  `authFetch` redirects to `/auth/magic` on either, which is acceptable: on a 503 the cookies
  survive, so the middleware refreshes successfully on the next navigation once api-site is back.

### 6.2 `rollplay/app/shared/hooks/useTokenRefresh.js`
- Import `refreshAccessToken` from `@/app/shared/utils/authFetch`.
- Replace the body of the `refreshToken` callback (`:23-37`) with a call to it, preserving the
  existing `console.warn` on `false` and the "do not redirect here" comment. The `try/catch` can
  go: `refreshAccessToken` never throws.
- Update the interval comment at `:10` only if the wording references the old URL (it does not;
  leave the 12-minute value — it is 80 % of the access lifetime, which is unchanged).

### 6.3 `rollplay/middleware.js` (D10)
1. `:7` → `import { API_AUTH_INTERNAL_URL } from './app/shared/config'` (`API_SITE_INTERNAL_URL`
   has no other use in this file; keep its export in `config.js`).
2. Rewrite `tryRefreshToken` (`:29-48`):
   ```js
   /**
    * Attempt a refresh against api-auth using the refresh cookie from the incoming request.
    * Returns api-auth's Set-Cookie headers (access + rotated refresh) on success, null otherwise.
    *
    * This runs on the Next server, where there is no cookie jar: the Cookie header is built
    * by hand, and the Set-Cookie headers must be copied onto our own response by hand.
    * They are forwarded verbatim so the browser receives exactly the cookies api-auth decided
    * on — lifetimes, flags and all — and this file never has to know a lifetime.
    * getSetCookie() is the only safe way to read several Set-Cookie headers: a joined string
    * cannot be split on commas because Expires values contain commas.
    */
   async function tryRefreshToken(refreshToken) {
     try {
       const refreshResponse = await fetch(`${API_AUTH_INTERNAL_URL}/auth/refresh`, {
         method: 'POST',
         headers: { 'Cookie': `refresh_token=${refreshToken}` }
       })
       if (!refreshResponse.ok) {
         return null
       }
       return refreshResponse.headers.getSetCookie()
     } catch (error) {
       console.error(`Token refresh failed: ${error.message}`)
     }
     return null
   }
   ```
   (Drop the `Content-Type: application/json` header: the request has no body.)
3. Both call sites (`:74-88` and `:110-124`): replace `response.cookies.set('auth_token', …)`
   with
   ```js
   const response = NextResponse.next()
   for (const setCookieHeader of refreshedCookies) {
     response.headers.append('set-cookie', setCookieHeader)
   }
   return response
   ```
   where `refreshedCookies` is the array returned above.
4. **Runtime check (do this first, before rewriting):** in dev, temporarily log
   `typeof upstreamResponse.headers.getSetCookie` from inside the middleware and hit a protected
   route with the `auth_token` cookie deleted. Expected: `"function"` (Next 15's runtime carries
   the WHATWG `getSetCookie`). Record the result in the PR description, then **delete the
   probe** — it must not survive into the diff. Any diagnostic logging you do keep in the
   middleware takes a text tag (`AUTHREFRESH`), never an emoji.
   **Fallback only if it is not a function:** have the api-auth endpoint also return
   `access_token`, `refresh_token`, `access_max_age`, `refresh_max_age` in its body, and set both
   cookies via `response.cookies.set(...)` with those values. Do not hand-parse a joined
   `set-cookie` string. Whichever path is taken, the middleware must no longer contain a literal
   `900` or `604800`.
5. Leave the cookie-clearing lines (`:129-130`, `:142`, `:167`, `:174`) as they are; their
   inconsistency is recorded in §11.

### 6.4 No change
`useAuth.js`, `(authenticated)/layout.js`, `useEvents.js` (`ws-token`), the game page. The
timer stays out of the game page by design (§2.3).

---

## 7. Tests — order, harness, and commands

### 7.1 api-auth harness (D12) — build this first
- `api-auth/conftest.py` (root anchor, modelled on `api-game/conftest.py`):
  ```python
  """Pytest anchor for api-auth.

  Loading this conftest puts the api-auth root on sys.path, so tests import application
  modules (`from auth.jwt_handler import ...`) identically under `pytest` and
  `python -m pytest`, matching how uvicorn resolves them at runtime.

  It also pins the environment Settings() needs BEFORE app.py is imported anywhere:
  app.py constructs Settings() and the auth services at import time. setdefault keeps
  the container's real dev.env values when present and supplies stand-ins in CI.
  """
  import os

  import pytest

  # Settings is only a class here — importing it reads no environment. Instantiation
  # (in app.py, and in make_settings below) is what needs the values pinned next.
  from config.settings import Settings

  os.environ.setdefault("JWT_SECRET_KEY", "test-secret")
  os.environ.setdefault("MAIL_TRAP_API_TOKEN", "test-token")  # MailtrapClient(token) stores it; nothing is sent at construction (checked in the container before this harness was written)
  os.environ.setdefault("NEXT_PUBLIC_API_URL", "http://localhost:3000")
  os.environ.setdefault("REDIS_URL", "redis://localhost:6379")  # unreachable in CI → RedisClient._connect falls back to its in-memory dict
  os.environ.setdefault("ENVIRONMENT", "development")
  os.environ["SENTRY_DSN_API_AUTH"] = ""  # init_sentry() skips on an empty DSN


  @pytest.fixture
  def make_settings():
      """Factory: a fresh Settings per call, sharing the secret the app was booted with."""

      def _make(**overrides):
          values = {
              "JWT_SECRET_KEY": os.environ["JWT_SECRET_KEY"],
              "MAIL_TRAP_API_TOKEN": "test-token",
              "NEXT_PUBLIC_API_URL": "http://localhost:3000",
              "REDIS_URL": "redis://localhost:6379",
          }
          values.update(overrides)
          return Settings(**values)

      return _make
  ```
- `api-auth/tests/` with no `__init__.py` (api-game layout).
- Before writing tests, confirm the two import-time side effects are harmless in the container:
  `docker exec api-auth-dev python -c "import mailtrap as mt; mt.MailtrapClient(token='x')"`
  (expected: constructs lazily) and that `import app` completes with the conftest env. If
  `MailtrapClient` validates eagerly, monkeypatch `auth.email_service.mt.MailtrapClient` in the
  conftest before the app import and note it.
- **Shared-state caveat, stated up front.** `app.py` builds `app`, `passwordless_auth` and
  `jwt_handler` once at import, so the endpoint tests touch module singletons they did not
  create — the same class of thing as api-site's `app.dependency_overrides` harness. Keep it
  contained: patch only through pytest's `monkeypatch` fixture (restored at teardown), build a
  fresh `TestClient` per test, and never assert on the singleton's own state. Do not introduce a
  `Depends`-based service layer in api-auth to avoid this (§3b).

### 7.2 api-auth tests
`api-auth/tests/test_jwt_handler.py` (pure, no I/O):
- lifetimes come from settings: `JWTHandler(make_settings(jwt_access_token_expire_minutes=3, jwt_refresh_token_expire_days=2))`;
  decode each token and assert `exp - iat` is 180 and 172800. (Cookie max-age is asserted at the
  endpoint level in `test_refresh_endpoint.py`, where the numbers actually leave the process.)
- `create_tokens` → `verify_refresh_token` round-trips to `{"id", "email"}`.
- `verify_refresh_token` returns `None` for: an access token; a refresh token minted with
  `jwt_refresh_token_expire_days=-1`; a token signed with another secret; a refresh token whose
  `user_id` is not a UUID; a refresh-type token encoded with no `exp` claim at all (the
  `require` option in §4.3). Encode the last two by hand with PyJWT.

`api-auth/tests/test_refresh_endpoint.py` (FastAPI `TestClient`, function-scoped, one client per
test; api-site is never called — monkeypatch `app_module.passwordless_auth._is_user_active` with
a tiny `async def` returning the value the test needs):
- **The proof test, written and run first:** mint a refresh token with a handler built from
  `make_settings(jwt_refresh_token_expire_days=6)` (same secret as the app), set it as the
  `refresh_token` cookie, `POST /auth/refresh`. Assert 200; assert the response has two
  `Set-Cookie` headers (`response.headers.get_list("set-cookie")`), one for `auth_token` with
  `Max-Age=900` and one for `refresh_token` with `Max-Age=604800`, both `HttpOnly`, `Secure`,
  `SameSite=lax`; decode the new refresh cookie's value and assert its `exp` is strictly greater
  than the presented token's `exp`; assert the body has no `access_token` key.
  Against the unfixed tree this fails with **404** (no such route). Show that output.
- Missing cookie → 401, and the response carries `Set-Cookie` for both names with `Max-Age=0`.
- Expired refresh token → 401 + both cleared.
- Access token presented as refresh → 401 + both cleared.
- `_is_user_active` returns `False` → 401 + both cleared.
- `_is_user_active` raises `UserServiceUnavailable` → 503, and **no** `Set-Cookie` header.
- The verify-otp and logout endpoints still set/clear both cookies via the helpers: one test
  each is enough, using `monkeypatch` on `passwordless_auth.verify_otp_token` to return a fixed
  auth_result (this also guards the helper refactor of §4.5).

### 7.3 api-site tests
- `api-site/modules/user/tests/conftest.py`: a `client` fixture copied from
  `modules/characters/tests/api/conftest.py:33-53` minus `seed_default_edition` and minus the
  registry fixture (the app lifespan initialises the registry itself on `TestClient` startup,
  from the seed files on disk). No auth override is needed: the internal endpoint has none.
  One deliberate deviation from the copied file: put `from main import app` at module top, not
  inside the fixture. The original defers it to skip FastAPI boot cost for tests that never use
  the client; every test in this directory uses it, and the no-lazy-imports rule wins.
- `api-site/modules/user/tests/test_internal_check_active.py`:
  - active user (`create_user`) → 200 `{"active": true}`;
  - soft-deleted user (`user_repo.soft_delete(user.id)`, `user_repository.py:372`) → `false`;
  - unknown UUID → `false`;
  - malformed id → 422;
  - `client.post("/api/users/auth/refresh")` → 404 (documents the move; written before the
    deletion it will fail with 401 "No refresh token", which is the "show it failing" step).
- Leave `modules/user/tests/test_user.py` exactly as it is; do not add unrelated tests to it.

### 7.4 CI
`.github/workflows/api-auth.yml`, cloned from `api-site.yml` with: name "API Auth Tests";
`paths: ['api-auth/**']` for both triggers; no shared-contracts step; install
`api-auth/requirements.txt`; env `JWT_SECRET_KEY`, `MAIL_TRAP_API_TOKEN`, `NEXT_PUBLIC_API_URL`,
`REDIS_URL`; `run: cd api-auth && python -m pytest -v`.

### 7.5 Commands
```bash
# Rebuild api-auth so pytest exists, then bring the stack up
docker-compose -f docker-compose.dev.yml build api-auth
docker-compose -f docker-compose.dev.yml up -d

# Proof, against the unfixed tree (expect 404 on the rotation test)
docker exec api-auth-dev python -m pytest "tests/test_refresh_endpoint.py::test_refresh_rotates_refresh_token" -q

# After implementing
docker exec api-auth-dev python -m pytest -q
docker exec api-site-dev python -m pytest -q

# Frontend compile check while the dev server is up — NEVER `npm run build` here: it clobbers
# the dev .next (host and in-container are the same bind mount) and nginx starts 504ing.
# Restart the app container and request a protected route: the middleware compiles on the
# first request, and any import error lands in the container log.
docker-compose -f docker-compose.dev.yml restart app
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/dashboard   # 307 to /auth/magic is the expected answer
docker logs rollplay-dev --since 2m | grep -i "compiled\|error"

# Production build — ONLY as the final pre-commit checkpoint, with the dev app stopped first:
docker-compose -f docker-compose.dev.yml stop app
(cd rollplay && npm run build && rm -rf .next)
docker-compose -f docker-compose.dev.yml start app
```

---

## 8. Docs

- `CLAUDE.md:356` → `/api/auth/refresh`.
- `CLAUDE.md:535` → "api-auth (8083): Magic links, OTP, JWT generation and refresh".
- `CLAUDE.md:561-563` → "Does: JWT generation and refresh (the refresh token is re-issued on
  every refresh, so the lifetime restarts on use), magic link emails, OTP verification. Does
  NOT: Create users, read PostgreSQL, know about campaigns/games — it asks api-site through the
  read-only internal endpoints `resolve-user`, `check-email`, `check-active`."
- `CLAUDE.md:566-567` keep "JWT validation (shared secret, no call to api-auth)"; append
  "serves read-only internal user checks to api-auth (`/api/users/internal/…`, 404 at the edge)".
- `.claude/plans/PARTauthfetch-migration.md:80-81` → new URL, with "(moved to api-auth,
  plans/auth/01)".
- This file: set **Status** to IMPLEMENTED with the date, and record the §6.3 runtime-check
  result and which cookie-forwarding path shipped.

---

## 9. Verification checklist (manual, dev stack, browser devtools open)

1. Log in via OTP. Application → Cookies shows `auth_token` (Max-Age 900) and `refresh_token`
   (Max-Age 604800), both HttpOnly/Secure/Lax. Note the refresh cookie's expiry timestamp.
2. Stay on `/dashboard` ≥ 12 minutes. Network shows `POST /api/auth/refresh` → 200 with **two**
   `Set-Cookie` headers; the refresh cookie's expiry has moved forward by the elapsed time.
   Body contains no tokens.
3. Delete the `auth_token` cookie by hand; navigate to `/dashboard`. Page renders (middleware
   path); both cookies are present again and the refresh expiry moved forward.
4. Open a game. Wait ≥ 15 minutes without touching anything. Change a character's HP (an
   api-site call through `authFetch`). Network: 401 → `POST /api/auth/refresh` 200 → retried
   call 200. Refresh expiry moved forward. No redirect.
5. Reload the game page after step 4: middleware path, page renders.
6. Logout: both cookies gone; `/dashboard` redirects to `/auth/magic`.
7. Log in, then `DELETE /api/users/me` (soft delete) from devtools; delete `auth_token` by hand;
   navigate to `/dashboard`. Redirected to login and **both** cookies are cleared (proves the
   401-clears-cookies path end to end).
8. Log in. `docker stop api-site-dev`. Delete `auth_token`; navigate to `/dashboard`: redirect
   to login but the `refresh_token` cookie **survives** (503 path). `docker start api-site-dev`;
   navigate to `/dashboard`: renders without logging in again.
9. Compatibility: log in on the *old* build, then switch to the new build without clearing
   cookies. Step 3 succeeds. (Same secret, same claims; nobody is logged out by the deploy.)
10. Both suites green in their containers; the §7.5 compile check shows no error; the final
    production build (dev app stopped first, per §7.5) is clean.

---

## 10. Release and deploy

- Versions are pinned per service in `releases.json` (`services.app`, `services.api_site`,
  `services.api_auth`, …) and written to `.env` by `scripts/set-release.sh`;
  `.github/workflows/deploy.yml:101` requires all services up. Cut **one** release entry that
  bumps `app`, `api_site`, and `api_auth` together (latest at planning time: 0.64.5 → app
  0.47.4, api_site 0.43.1, api_auth 0.3.2). `nginx` is unchanged and keeps its pin.
- Ordering inside the deploy is not a concern: old cookies verify under the new code (§9.9),
  and the old api-site endpoint is deleted in the same release the frontend stops calling it.
- The agent does not cut releases or run the deploy; propose the `releases.json` change in chat.

---

## 11. Recorded follow-ups (out of scope for this PR)

Write these up as `plans/auth/02-api-auth-dead-code.md` when Matt asks; do not act on them here.

**api-auth dead code** (all verified 2026-09-04 by grep of `rollplay/app`, `rollplay/middleware.js`,
and both nginx configs):
- `api-auth/config/database.py` — never imported; no `DATABASE_URL` supplied anywhere. With it go
  `sqlalchemy==2.0.23` and `psycopg2-binary==2.9.9` in `requirements.txt` (only that file uses them).
- `python-jose[cryptography]==3.4.0` in `requirements.txt` — never imported (PyJWT is the library in use).
- `GET /auth/profile` (`app.py:279`) and `PUT /auth/profile` (`:297`) — zero callers; the only users
  of the Bearer-header helpers `get_token_from_header`/`get_current_user` (`jwt_handler.py:111-151`);
  contain "In a production system, you'd update the database". Delete together with
  `models/user.py` (`User` is imported at `app.py:18` and never used; `UserCreate`/`UserResponse`
  only serve these two endpoints).
- `POST /auth/login-request` (`app.py:96`) — zero callers; duplicate of `/auth/magic-link`.
- `GET /auth/verify/{token}` (`app.py:116`) — zero callers (the magic link targets the Next page,
  which posts to `verify-otp`); plus its prod nginx block `location ~ ^/auth/verify/(.+)$`
  (≈ `docker/prod/nginx/nginx.conf:552`).
- `models/session.py:27-32` `TokenResponse` — unused.
- `settings.py:38` `jwt_algorithm` and `env.example:54` `JWT_ALGORITHM` — declared, never read;
  both services hardcode HS256. Either wire it on both sides or delete it on both.
- `api-auth/.env.example` — stale (SMTP_*, FRONTEND_URL, DATABASE_URL: none are read by `Settings`).
- Magic-link lifetime declared four times (§2.4). Fold into `Settings` the same way this PR does
  for access/refresh.
- `datetime.utcnow()` at `app.py:57` (health-check timestamp) — Python 3.12 deprecation. The
  six `jwt_handler.py` sites are fixed by D13; Matt scoped that request to those six, so this
  one line waits for the dead-code PR.

**Frontend**
- Two URL conventions for api-auth (§2.7). Standardise on `/api/auth/…`, then delete the four
  `next.config.js` rewrites and the four bare prod nginx blocks.
- `middleware.js` cookie clearing is inconsistent: `:129-130` clears both, `:142`, `:167`, `:174`
  clear only `auth_token`. Make the failure branches use one helper that clears both.
- `.claude/plans/PARTauthfetch-migration.md` is a completed plan; consider deleting it once its
  URL note is updated.

**api-site**
- `get_current_user_id` (no DB) accepts a soft-deleted user's access token until it expires (§2.8).
  Acceptable today because refresh re-checks; note it if the access lifetime is ever raised.

---

## 12. File-by-file summary

| File | Change |
|---|---|
| `api-auth/config/settings.py` | repurpose `jwt_access_token_expire_minutes` (15), add `jwt_refresh_token_expire_days` (7) |
| `api-auth/auth/jwt_handler.py` | read lifetimes from settings; add `verify_refresh_token` (moved from api-site, explicit `exp` enforcement); six `utcnow()` → `now(timezone.utc)` (D13); remove dead imports found by grep |
| `api-auth/auth/passwordless.py` | `UserServiceUnavailable`; `_is_user_active`; `refresh_tokens` |
| `api-auth/app.py` | `set_auth_cookies`/`clear_auth_cookies`; use them in verify ×2 and logout; `_refresh_rejected`; `POST /auth/refresh`; remove dead imports found by grep |
| `api-auth/requirements.txt` | `pytest==8.0.0` |
| `api-auth/conftest.py`, `api-auth/tests/test_jwt_handler.py`, `api-auth/tests/test_refresh_endpoint.py` | new |
| `.github/workflows/api-auth.yml` | new, cloned from `api-site.yml` |
| `api-site/modules/user/application/queries.py` | add `CheckUserActive` |
| `api-site/modules/user/api/schemas.py` | add `InternalUserActiveResponse` |
| `api-site/modules/user/api/endpoints.py` | add `/internal/check-active`; delete `/auth/refresh` and the module-level `jwt_helper` |
| `api-site/shared/jwt_helper.py` | delete `verify_refresh_token`, `create_access_token`; trim imports |
| `api-site/modules/user/tests/conftest.py`, `.../test_internal_check_active.py` | new |
| `rollplay/app/shared/utils/authFetch.js` | export `refreshAccessToken`; new URL; doc comment |
| `rollplay/app/shared/hooks/useTokenRefresh.js` | call the exported function |
| `rollplay/middleware.js` | api-auth URL; forward `Set-Cookie` headers at both call sites; drop `API_SITE_INTERNAL_URL` import |
| `env.example` | document the two optional lifetime overrides |
| `CLAUDE.md`, `.claude/plans/PARTauthfetch-migration.md` | URL and boundary text (§8) |
| nginx (dev + prod) | **no change** |
