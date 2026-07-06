# Spotify Integration — Phase 2: Game-Runtime Sync (DM BGM source)

**Goal:** In a live game session, let the DM choose **Spotify as a background-music source**
alongside the existing S3 mixer + SFX (both work simultaneously). Playback is **synced to every
player** using our existing server-authoritative, event-driven model — not a polling loop.

Builds directly on Phase 1 (`.claude/plans/spotify/01-oauth-foundation.md`): per-user account link +
token store + refresh primitive already exist.

---

## Hard constraints (why the design is shaped this way)

These are Spotify-platform facts, verified, not preferences:

1. **No raw audio.** The Web Playback SDK decrypts inside a Widevine/EME sandbox — audio **cannot**
   be routed into Web Audio API, mixed through our `EffectChain`, or captured/re-broadcast. So the
   S3 "everyone fetches the file and seeks" approach is impossible; Spotify is a separate, opaque
   output the OS mixes alongside our Web-Audio mixer.
2. **Every listener needs their own Spotify Premium account, connected.** There is no free-tier
   playback via any Spotify API. Non-Premium/unconnected players simply don't hear the Spotify bed
   (they still hear the S3 mixer — clean fallback, not a failure).
3. **No webhooks.** Spotify never pushes state to our backend. This is fine: control **originates in
   our UI**, so we're the source of truth. The only Spotify→us signal we need is client-side — the
   SDK's `player_state_changed` event, used by the DM's own browser to detect track changes.
4. **SDK transitions are modest.** No crossfade (native-app-only), imperfect gapless. So we must NOT
   drive track changes with a fresh `play()` per track (worst-case hard cut) — we let Spotify
   auto-advance a playlist context and only re-anchor at boundaries.

---

## The sync model — event-driven anchor snapshot (no polling loop)

The active session holds a **self-sufficient snapshot** from which ANY client (fresh, late-joining,
or page-refreshed) reconstructs the playhead in one step. This is our atomic-complete-state rule.

```
active_session.spotify = {
  context_uri,        # the playlist being played (null when nothing chosen)
  current_track_uri,  # the track playing right now
  track_meta,         # { name, artist, art_url } — for display on every client
  is_playing,         # bool
  position_ms,        # playhead AT the anchor moment
  anchor_ts           # server time (ms) when position_ms was captured
}

# Any client computes where it should be, one-shot — no history replay, no polling:
playhead = is_playing ? position_ms + (server_now - anchor_ts) : position_ms
client SDK: play({ uris:[current_track_uri], position_ms: playhead })
```

**Events** — each one rewrites the WHOLE `spotify` block (atomic), then broadcasts. That's the
entire sync mechanism:

| Event | Origin | Effect on the snapshot |
|---|---|---|
| `play` | DM UI | `is_playing=true`, `anchor_ts=now` (position_ms unchanged) |
| `pause` | DM UI | `is_playing=false`, `position_ms=current`, `anchor_ts=now` |
| `skip` (next/prev) | DM UI | new `current_track_uri` + `track_meta`, `position_ms=0`, `anchor_ts=now` |
| `change-playlist` | DM UI | new `context_uri` + first track, `position_ms=0`, `anchor_ts=now` |
| `seek` (v1.1) | DM UI | `position_ms=new`, `anchor_ts=now` |
| `track-advanced` | DM **client** (SDK `player_state_changed`) | new `current_track_uri` + `track_meta`, `position_ms=0`, `anchor_ts=now` |

`track-advanced` is the one non-obvious event: when Spotify auto-rolls to the next song, the DM's
browser detects it via the SDK and re-anchors — otherwise the snapshot goes stale and late-joiners
compute a playhead past the end of a track that's no longer playing. It fires a handful of times per
playlist (at boundaries), NOT continuously — still fully event-driven.

**Leader role** shrinks to exactly this: the DM's client reports SDK-observed track changes. All
other events originate from DM UI actions straight to the backend.

### Player-side volume — the ONE control players get (local, not synced)

Volume is categorically different from transport: it's a **personal, per-client** setting, so it is
**not** server state and is **never** broadcast. This is why players can have it without breaking the
DM-authoritative transport model.

- The SDK exposes `player.setVolume(0..1)` / `getVolume()` — each client controls its own Spotify
  output locally.
- **Mirror the existing master volume slider to it:** on master change, also
  `spotifyPlayer.setVolume(value)`. One slider scales both the S3 Web-Audio master gain and the
  Spotify output → the illusion that it's all one output (it's actually two separate pipes).
- Composition: `spotify effective = master × spotifyLevel` (`spotifyLevel = 1` for now; a dedicated
  music-vs-SFX fader can slot in later as that multiplier, no rework).
- Guards: only call `setVolume` once the SDK player is ready; apply the current master value on SDK
  init so Spotify doesn't start at full blast.

**Late-join / refresh:** read the snapshot, compute `playhead`, one-shot `play()`. Solved for free.

**Precision:** Spotify's variable command→sound latency gives a couple-hundred-ms wobble (looser
than Web Audio's sub-100ms) — inaudible for a music bed across remote players. No correction loop.

---

## Architecture — split along the existing hot/cold line

### api-site (the integration — cold / account)
- **Widen OAuth scopes:** add `streaming user-read-playback-state user-modify-playback-state
  playlist-read-private` to `integrations/spotify/client.py:SCOPES`. ⚠️ Users who linked in Phase 1
  must **re-connect once** to grant the new scopes (the connect flow already re-consents).
- `GET /api/spotify/token` → `{ access_token, expires_in }` — short-lived token for the SDK's
  `getOAuthToken` callback, via the existing `GetValidAccessToken` refresh primitive.
- `GET /api/spotify/search?q=&type=track,playlist` → thin proxy over `/v1/search`.
- `GET /api/spotify/playlists` (+ `GET /api/spotify/playlists/{id}/tracks`) → the DM's own playlists.
  (Result-shaping proxies so the client deals in small DTOs.)

### api-game (the live session — hot / authoritative)
Per server-authoritative rule: DM action → HTTP → MongoDB → game WebSocket broadcast, whole-object writes.
- Add the `spotify` block to the `active_session` document.
- Control endpoints that rewrite the block + broadcast: `play`, `pause`, `skip`, `change-playlist`,
  `track-advanced` (v1.1: `seek`). Each writes the complete block atomically.
- **The backend never calls Spotify's playback API.** It only owns state + broadcasts; each client
  drives its OWN SDK device from the broadcasted snapshot.
- New game WebSocket event type, e.g. `spotify_state`.

### Frontend (`rollplay/app/audio_management/`)
- **`useSpotifyPlayback` hook** — loads `https://sdk.scdn.co/spotify-player.js`, mints the token
  (`/api/spotify/token`), creates the player, subscribes to the session `spotify` block from the
  game WebSocket, and on each snapshot computes `playhead` and issues one `play()/pause()/seek()`.
  On the DM's client only: watches `player_state_changed` → posts `track-advanced`. Coexists with
  `useUnifiedAudio` (S3) — separate output paths, both run. Exposes `setVolume` and subscribes to the
  master-volume value so the master slider drives Spotify locally (guarded on SDK-ready; applied on init).
- **`SpotifyBgmPanel`** — the DM-only control surface in the audio tab (see UI below).
- **Premium/connection gate** — uses `product` from `/api/spotify/profile` (already captured). DM
  must be Premium+connected to drive; players must be Premium+connected to hear, else a small
  "Connect Spotify Premium to hear the music" note + S3 fallback.
- **CSP additions** (`docker/*/nginx/nginx.conf`): `script-src` + `connect-src` for
  `sdk.scdn.co` / `api.spotify.com` / `*.spotify.com` (wss), and the SDK's `encrypted-media` iframe
  (`frame-src`/`media-src` for scdn/spotify). Finalize exact directives during build.

---

## UI placement — the audio tab

The audio tab keeps everything it has (S3 channel strips A–F + SFX soundboard) untouched. We add a
**Spotify BGM** section. Nothing is disabled → "both simultaneously": DM runs Spotify as the music
bed AND fires S3 SFX cues over it.

```
Audio Tab
├── [existing] Channel strips A–F (S3 BGM)     ← untouched
├── [existing] SFX soundboard                   ← untouched, sample-accurate, works for EVERYONE
└── [NEW] Spotify BGM   (DM-only controls; players auto-follow silently)
      • connect / Premium status
      • 🔍 search        (GET /api/spotify/search)
      • ▾ Your Playlists (GET /api/spotify/playlists)
      • Now playing: <art> <track — artist>  ▸ play / pause / ⏭ skip   [ ▂▃▄ volume ]
        (v1.1: a scrubbable progress bar → `seek`)
```

**How the DM navigates Spotify for music:** you can't embed Spotify's own browser. We build it from
Web API reads — a **search box + a "Your Playlists" list** (the standard third-party-controller
pattern). Pick a playlist → it becomes `context_uri`; Spotify auto-advances through it.

**Players** get no *transport* controls — their client silently follows the snapshot. The one thing
they do get is **local volume**: the game-runtime **master volume slider also drives Spotify's
`setVolume`** on their own client (see "Player-side volume" above), so the music bed feels like part
of the single master output. DM-only gating on the *control surface* mirrors existing DM tools (role
check); the volume slider is available to everyone because it's purely local.

---

## Scope: v1 vs v1.1

**v1 (the PoC):**
- Single track, synced, **loops** (or stops at end). Proves the whole anchor/broadcast/late-join
  loop end-to-end. **Zero track transitions → zero cut problem.**
- Controls: play / pause. Pick a track via search or from a playlist.
- Events: `play`, `pause`, `change-track`, plus late-join/refresh snapshot read.

**v1.1 (continuous BGM):**
- Playlist **context** playback — Spotify owns transitions natively (best-available smoothness); we
  only re-anchor on `track-advanced`. Adds `skip`, `change-playlist`, `track-advanced`.
- `seek` event + scrub progress bar.

---

## Out of scope (this phase)
- Any player-side **transport** control (players only follow transport). NOTE: player-side **volume**
  IS in scope — it's local/non-synced, see "Player-side volume" above.
- A dedicated Spotify-vs-SFX balance fader (master mirror only for now; the `spotifyLevel` multiplier
  is the future hook).
- Effects/EQ on Spotify audio (DRM — impossible; it bypasses our mixer).
- Non-Premium playback (platform-impossible).
- api-game reading Spotify tokens (never needed — clients drive their own SDK).

## Risks / costs to accept
- **Everyone needs Premium.** Biggest product constraint; non-Premium = S3-only fallback.
- **One-time re-consent** for Phase-1 users (new scopes).
- **Mobile browsers**: SDK autoplay policies are stricter; players may need a tap to start audio.
- **Transition smoothness** is bounded by the SDK (no crossfade, imperfect gapless) — a platform
  ceiling we can't exceed, only avoid making worse.

## Rough build order
1. api-site: widen scopes + `GET /api/spotify/token` (+ verify SDK can auth).
2. Frontend: `useSpotifyPlayback` — SDK load, token, single hard-coded track play/pause behind a
   Premium gate, + `setVolume` wired to the master slider. (Prove the SDK plays in-app + master
   volume scales it.)
3. api-game: `spotify` block + `play`/`pause`/`change-track` endpoints + `spotify_state` broadcast.
4. Frontend: wire the hook to the broadcast; verify sync across two browsers + late-join/refresh.
5. api-site: `search` + `playlists` proxies.
6. Frontend: `SpotifyBgmPanel` (search + playlists + now-playing) in the audio tab.
7. CSP + polish + Premium/fallback messaging.
8. → v1.1: context playback, `track-advanced`, `skip`, `change-playlist`, `seek` + scrub UI.
