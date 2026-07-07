# Spotify Integration — Phase 1: OAuth Foundation

> **BUILT (2026-07-06):** Scope narrowed to **"just link accounts"** with a concrete PoC deliverable:
> connect Spotify on the account page and see your live profile there. Final shape differs from the
> original plan below:
> - Scopes: `user-read-email user-read-private` only (no forward-looking playback scopes).
> - Lean layout (no DDD ceremony): `integrations/spotify/{client,models,repository,schemas,endpoints,dependencies}.py`.
> - Routes: `authorize`, `callback`, `GET profile` (live /me, folds in "status"), `DELETE disconnect`. No `/me` smoke route.
> - Frontend: Connect button + live profile card in `ProfileManager.js` (renders on `/account`).
> - Dev redirect URI: `http://127.0.0.1:80/api/spotify/callback` (Spotify bans `localhost`; loopback needs explicit port).
>   nginx dev config bounces `localhost → 127.0.0.1` so the login cookie + callback share a host.
> Migration `dd27eba5ec3a` creates `spotify_accounts`. Verified: routes live/auth-gated, authorize URL
> matches the registered redirect, table + CASCADE FK present, `/account` compiles. Interactive OAuth
> click-through is the remaining user test.

---


**Goal:** Get the app able to *communicate with Spotify's API* — nothing more. A user can link their
Spotify account, we securely store + auto-refresh their tokens server-side, and we can prove an
authenticated call to Spotify works. No playback UI yet.

**Decisions locked in:**
- OAuth flow: **Backend Authorization Code** (client secret server-side, refresh tokens in Postgres)
- Connection model: **Per-user linked account** (each user links their own Spotify)
- Placement: **new top-level `api-site/integrations/` category**, NOT `modules/`. `modules/` is
  reserved for core business aggregates; Spotify is an external-service anti-corruption layer (ACL),
  not a domain aggregate. Precedent for "external integration lives outside `modules/`" is
  `shared/services/s3_service.py` — we're formalising that instinct into a dedicated bucket.
  (`modules/stream/` LiveKit was sandbox work and is NOT the pattern to follow.)

---

## Architecture

New top-level `integrations/` sibling to `modules/` and `shared/`. Self-contained slice that reuses
the familiar api/application/domain/model/repository layering, but its parent folder signals
"this is an ACL, not a core aggregate." The OAuth/HTTP plumbing (the actual anti-corruption layer)
lives *inside* the slice as `client.py`, keeping everything Spotify cohesive in one place.

```
api-site/
├── modules/                     # core domain aggregates ONLY (unchanged)
├── integrations/                # NEW: external-service ACLs
│   └── spotify/
│       ├── api/
│       │   ├── endpoints.py      # authorize / callback / status / me / disconnect
│       │   └── schemas.py
│       ├── application/
│       │   ├── commands.py       # ConnectSpotify, DisconnectSpotify, GetValidAccessToken
│       │   └── queries.py        # GetSpotifyStatus
│       ├── domain/
│       │   └── spotify_connection_aggregate.py   # is_expired, apply_refresh
│       ├── model/
│       │   └── spotify_account_model.py          # spotify_accounts table
│       ├── repositories/
│       │   └── spotify_account_repository.py
│       ├── client.py             # OAuth + HTTP client (the ACL plumbing)
│       └── dependencies/
│           └── providers.py      # spotify_account_repository(), get_spotify_client()
└── shared/                       # unchanged
```

Correct flow (per-user, cookie-authenticated — Spotify's redirect back is a top-level `lax`
navigation, so the `auth_token` httpOnly cookie rides along):
```
Browser → GET /api/spotify/authorize      (auth_token cookie identifies the user)
   ↳ set signed state cookie, 302 → accounts.spotify.com/authorize?...&state=...
Spotify → GET /api/spotify/callback?code=&state=
   ↳ verify state cookie, exchange code+SECRET for tokens, upsert spotify_accounts row
   ↳ 302 → /account?spotify=connected
Frontend → GET /api/spotify/status         (shows connected + display name)
Frontend → GET /api/spotify/me             (verification: proxies Spotify /v1/me)
```

---

## Work items

### 1. Config & env
- `.env`: add `SPOTIFY_CLIENT_SECRET=`, `SPOTIFY_REDIRECT_URI=http://localhost/api/spotify/callback`
  under the existing `#### SPOTIFY` block.
- `config/settings.py`: add `SPOTIFY_CLIENT_ID: str`, `SPOTIFY_CLIENT_SECRET: str`,
  `SPOTIFY_REDIRECT_URI: str` fields so startup validates their presence (currently
  `SPOTIFY_CLIENT_ID` is dropped by `extra='ignore'`).

### 2. The ACL client — `integrations/spotify/client.py`
- `SpotifyClient(settings)` + `get_spotify_client()` singleton helper (mirrors `S3Service`).
- `build_authorize_url(state)` → accounts.spotify.com/authorize URL with our scopes.
- `exchange_code(code)` → POST `/api/token` (grant_type=authorization_code, Basic auth header).
- `refresh(refresh_token)` → POST `/api/token` (grant_type=refresh_token).
- `get_me(access_token)` → GET `/v1/me`.
- Uses `httpx` (add to `api-site/requirements.txt` if absent).
- Scopes requested now (forward-looking so no re-consent when playback lands):
  `user-read-email user-read-private streaming user-read-playback-state user-modify-playback-state playlist-read-private playlist-read-collaborative`

### 3. Persistence — `spotify_accounts` table
- `model/spotify_account_model.py` — SQLAlchemy `SpotifyAccount`:
  `id (UUID PK)`, `user_id (UUID FK users.id, unique)`, `spotify_user_id (str)`,
  `access_token (str)`, `refresh_token (str)`, `scope (str)`, `expires_at (datetime)`,
  `display_name (str, nullable)`, `created_at`, `updated_at`.
- `domain/spotify_connection_aggregate.py` — `SpotifyConnectionAggregate` with `is_expired` and
  `apply_refresh(new_access, expires_in)` (token math stays in the domain).
- `repositories/spotify_account_repository.py` — `get_by_user_id`, `upsert`, `delete`, manual
  ORM↔aggregate mapping like `UserRepository`.
- `dependencies/providers.py` — `spotify_account_repository(db=Depends(get_db))`.
- Register the model import in `alembic/env.py`; add `spotify_accounts` to the soft-delete cascade
  in `user_repository.soft_delete()` so deleting a user cleans up their link.
- Generate the migration via **`alembic revision --autogenerate`** in Docker (never hand-written).

### 4. Application layer — `integrations/spotify/application/`
- `commands.py`:
  - `ConnectSpotify` — exchange code, call `/v1/me`, upsert the account row.
  - `DisconnectSpotify` — delete the row.
  - `GetValidAccessToken` — return a non-expired access token, auto-refreshing + persisting if
    expired. The reusable primitive every future Spotify call (incl. api-game playback) goes through.
- `queries.py`: `GetSpotifyStatus(user_id)` → connected bool + display name + scope.

### 5. API — `integrations/spotify/api/{endpoints.py,schemas.py}`
All gated by `Depends(get_current_user_id)` (the existing cookie-JWT dependency):
- `GET  /api/spotify/authorize` → set state cookie, 302 to Spotify.
- `GET  /api/spotify/callback`  → verify state, `ConnectSpotify`, 302 back to `/account`.
- `GET  /api/spotify/status`    → `{ connected, display_name, scope }`.
- `GET  /api/spotify/me`        → **verification endpoint**: `GetValidAccessToken` → `get_me`.
- `DELETE /api/spotify/disconnect`.
- Register in `main.py`: `app.include_router(spotify_router, prefix="/api/spotify")`.

### 6. NGINX
- Add `location /api/spotify { → api-site:8082 }` to **both** `docker/dev/nginx/nginx.conf` and
  `docker/prod/nginx/nginx.conf`. Restart nginx.

### 7. Frontend — `dashboard/components/ProfileManager.js`
- On mount, `authFetch('/api/spotify/status')`.
- Disconnected: "Connect Spotify" button → `window.location = '/api/spotify/authorize'` (top-level
  nav so cookies + redirect work).
- Connected: "Connected as {display_name}" + Disconnect button
  (`authFetch('/api/spotify/disconnect', {method:'DELETE'})`).
- Read `?spotify=connected` on the account page to refresh status after the redirect back.

### 8. Verify
- Rebuild api-site, run the migration, connect a real Spotify account end-to-end, confirm
  `GET /api/spotify/me` returns the profile. Report the actual result.

---

## Deliberately NOT in this phase
- Web Playback SDK / actually playing music (needs Premium + the `streaming` token handed to the
  browser) — next phase, hooks into `audio_management/hooks/useUnifiedAudio.js`. api-game will get a
  valid access token by calling api-site's `GetValidAccessToken` over HTTP (same cold→hot pattern as
  the existing ETL), so the token authority stays in one place.
- Playlist browsing UI, DM playback controls, WebSocket sync of Spotify state.
- Refresh-token encryption at rest (hardening follow-up — nothing in the repo encrypts secrets today;
  tokens stored plainly for now to match current posture).

## What you need to do (outside the code)
1. In the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard), open the app for
   client ID `41949dce…`, copy the **Client Secret** into `.env`.
2. Add redirect URIs in the dashboard: `http://localhost/api/spotify/callback` (dev) and
   `https://tabletop-tavern.uk/api/spotify/callback` (prod). Must match exactly.
3. If you want playback later, test with a **Premium** account (not needed for this phase).
