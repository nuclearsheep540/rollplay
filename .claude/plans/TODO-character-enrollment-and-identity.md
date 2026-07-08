# TODO — Character Enrollment Gap + Identity/PII Leak

## Original question (as posed)

> We loosened character creation to reduce guardrails, but the game runtime has certain
> requirements — I assume that's the contract. A user made a character, didn't fill their
> ability scores, and when they joined a campaign — even though they joined with the character —
> the game itself didn't recognise the character, so the user was not joined with their character,
> and the runtime showed their **UUID** (I thought we removed that entirely; we should only ever
> show account-name or character-name). Identify if this is a contract thing, and decide whether
> character-create is too loose (a character can't be complete without ability scores) or whether
> we loosen the contract.

## Verdict up front

**It is not a contract problem, and ability scores are a red herring.** Two independent, verified bugs share one root cause (the user was never in the session's ETL roster):

1. **Enrollment-timing gap** — a user who joins/accepts a campaign while the session is still
   `INACTIVE` is never added to the roster the ETL reads, so they're dropped from the game entirely.
2. **Identity/PII leak** — when a user has no resolved name, the runtime falls back to raw
   `user_id` (UUID) and, in one path, `email`. Both are PII and must never render.

Ability scores cannot cause this: the runtime contract has **no ability fields at all**, and a
"blank" character actually has all-10s (never null).

---

## Evidence

### Ability scores are not in the contract (red herring)
`rollplay-shared-contracts/shared_contracts/character.py:19-42`
- `PlayerCharacter` carries `character_class/race/level/hp/ac` — **no STR/DEX/…**.
- `SessionUser.character` is `Optional[PlayerCharacter] = None` — a character-less user is valid.
- Draft characters get `AbilityScores.default()` (all 10s) at `character_aggregate.py:339`; `finalize()`
  never checks abilities. "Unset" and "chose 10s" are indistinguishable.

### Root cause — the roster the ETL reads is a stale, frozen snapshot
- `CreateSession` **freezes** `joined_users` from campaign members *at creation time*:
  `api-site/modules/session/application/commands.py:103-108`.
- Late enrollment (accept-invite / select-character) only back-fills **if the session is `ACTIVE`**:
  `api-site/modules/campaign/application/commands.py:287`.
- `StartSession` uses the frozen snapshot **as-is** — never recomputes:
  `session/commands.py:512` (`joined_user_ids=[str(uid) for uid in session.joined_users]`).
- `_build_session_users` iterates `session.joined_users`, **not** the campaign, even though it already
  receives `campaign` (for roles) and already resolves characters campaign-wide:
  `session/commands.py:246`, `get_user_character_for_campaign(user_id, session.campaign_id)` at `:261`.

**Repro:** DM creates session (INACTIVE) → user accepts/join while still building → the `ACTIVE`
gate skips them → DM starts session → ETL iterates a roster missing that user → they open the game
URL (entry is a client-only redirect, no backend enrollment) → they're seated but have **no
`player_metadata`** → character-less, and identity falls back to UUID.

### Identity/PII leak — UUID and email in display paths
- **`player_name` falls back to email** (PII baked into the display name):
  `session/commands.py:252` → `player_name = user.screen_name or user.email or ""`.
- **`party_updated` adventure-log bakes raw seat UUIDs into text**, rendered verbatim on screen:
  `api-game/app.py:906-919` (`", ".join(non_empty_seats)`, `from_player=updated_by`).
- **`_display_name` / `_character_name_for_prompt` fall back to `user_id`**:
  `api-game/websocket_handlers/websocket_events.py:137,148` (used by player_connection, dice/initiative prompts).
- **Session-end** builder: `app.py:633` `display_name = meta.get("player_name", seat)` (`seat` is a UUID).

### `screen_name` is the deterministic identity — but the DB is loose (a regression)
- FE **enforces** it: `AccountNameModal` is shown when `screen_name` is missing and can't be submitted
  without one — `rollplay/app/dashboard/components/AccountNameModal.js:15,38,131`,
  `app/(authenticated)/dashboard/page.js:43`. So in practice every dashboard user has one.
- But the DB is `screen_name = Column(String, nullable=True)` (`user_model.py:22`) and the aggregate
  defaults it to `None` "to be set later" (`user_aggregate.py:100`). This predates the modal — a
  regression to tighten so the DB can't drift from the FE guarantee.

### The hot-push model already exists (no backfill needed)
- `PUT /game/{room_id}/player/character` — `api-game/app.py:764`.
- Called from api-site accept-invite (`campaign/commands.py:333`) and select-character
  (`campaign/commands.py:686`), gated on `ACTIVE`. So the model is: **ETL at session *start*
  (cold→hot from campaign); hot-push for anything created after.** Backfilling INACTIVE session
  rosters is against this model — INACTIVE sessions just need the ETL to read the campaign at start.

---

## The model (decisions)

| Concern | Rule |
|---|---|
| ETL cold path source | **Campaign membership** is the source of truth at session *start* — not the frozen `session.joined_users`. |
| Post-start new data | Existing hot-push (`/player/character`) — unchanged. No INACTIVE backfill. |
| Display identity resolution (FE) | `character_name` → `screen_name` → one deterministic app default (e.g. "Unknown Adventurer"). **Never** `user_id` or `email`. |
| `user_id` in the contract | Kept as a **structured lookup key** (seat targeting, prompt routing, player_metadata) — never rendered as text. |
| `screen_name` at the data layer | Non-nullable, matching the FE guarantee (backfill nulls → `set not null`). |
| Character creation | **Stays permissive** ("facilitate, don't enforce"). The runtime tolerates character-less users gracefully. |

**Open decision (flagged):** should `_build_session_users` iterate **campaign members** (clean
"campaign is source of truth") or the **union** of campaign members + `session.joined_users`
(defensive, if a session can legitimately hold a non-campaign spectator/mod)? Recommendation:
**campaign members**, unless sessions can contain non-campaign participants — confirm before building.

---

## Implementation steps

### Step 1 — ETL reads the campaign, not the frozen roster
**File:** `api-site/modules/session/application/commands.py`
- `_build_session_users(session, campaign)`: iterate `campaign.get_all_member_ids()` (or the agreed
  union) instead of `session.joined_users` (`:246`).
- `StartSession.execute`: build `joined_user_ids` for the payload from the same campaign-sourced set
  (`:512`), so api-game's `joined_user_ids` matches the DTOs.
- Keep the character lookup as-is (`get_user_character_for_campaign`) — already campaign-scoped.

### Step 2 — Remove the email PII fallback
**File:** `api-site/modules/session/application/commands.py:252`
- `player_name = user.screen_name` (drop `or user.email`). With Step 4, screen_name is guaranteed, so
  keep a defensive skip/log only if it's somehow empty (do **not** substitute email).
- Audit the two hot-push paths (`campaign/commands.py:665` uses `screen_name` only already) for
  consistency; ensure none emit email.

### Step 3 — Kill UUID-in-text leaks in api-game
**Files:** `api-game/app.py`, `api-game/websocket_handlers/websocket_events.py`
- `party_updated` log (`app.py:906-919`): resolve each seat `user_id` → `player_metadata` name before
  building the message; never join raw UUIDs. Same for `from_player`.
- `_display_name` / `_character_name_for_prompt` (`websocket_events.py:137,148`): resolve via
  `player_metadata` (screen_name); on miss, return a neutral non-PII default, **never** `user_id`.
- Session-end builder (`app.py:633`): default to a neutral name, not `seat`.

### Step 4 — Tighten `screen_name` to non-null (regression fix)
**Files:** `api-site/modules/user/model/user_model.py`, new Alembic migration
- Data migration: backfill any null `screen_name` (choose a policy — e.g. derive-once or flag for
  re-prompt) **before** the constraint.
- `alembic revision --autogenerate` after changing the column to `nullable=False`; run in Docker per
  repo convention. Update `user_aggregate.py` typing/defaults to match.

### Step 5 — Front-end single identity resolver
**Files:** `rollplay/app/game/` (seats, adventure log, player lists, prompts)
- One helper: `resolveDisplayName({ characterName, screenName }) => characterName || screenName || 'Unknown Adventurer'`.
- Route all identity rendering through it. Confirm no component renders `user_id`/`email`.
- Contract already carries both `player_name` and `character_name` — no contract change needed.

### Step 6 — Verify + tests
- Repro the enrollment gap (join while INACTIVE → start) and confirm the user is enrolled with their
  character and their **name** (never UUID/email) after the fix.
- Confirm the `party_updated` log shows names.
- Confirm the `selected_character_id` session column (`session_model.py:30`, written only by the
  deprecated `SelectCharacterForSession`, `session/commands.py:1071`) is genuinely dead and can be
  left alone / scheduled for removal — note it as tech debt.

---

## Secondary findings (tech debt, not blocking)
- **Dual source of truth** for character selection: `selected_character_id` (deprecated path only) vs
  `active_in_campaign_id` (what ETL reads). The session column is dead weight / a latent trap.
- **`get_user_character_for_campaign` uses `.first()`** with no draft filter/order
  (`character_repository.py:259-267`); the one-locked-character invariant is app-enforced only.
- **`_model_to_aggregate` silently defaults** missing ability rows to all-10s
  (`character_repository.py:99-101`) — masks data-integrity gaps.
