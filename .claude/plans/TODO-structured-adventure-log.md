# TODO — Structured Adventure-Log Entries (compose display text client-side)

> **Status: planned / out of scope for the current identity PR.** Captures the follow-up that
> finishes the "front-end owns identity resolution" principle for the one surface that still
> can't: server-composed log/prompt sentences.

## Motivation

Identity everywhere else is resolved **client-side** from structured data (`player_metadata` →
`resolveDisplayName`/`resolveName`: character → screen → neutral default, never UUID/email). The
**adventure log is the exception**: api-game composes a finished *sentence* server-side and stores
it as a flat string, which the front-end renders verbatim. Because the name is baked into the
sentence, the FE can't re-resolve it.

Consequences:
1. **Name collision** — the server must supply a fallback string (`"Unknown Adventurer"`) when a
   name is missing; a user who literally names themselves that is indistinguishable.
2. **Permanent artifacts** — a log line composed during a data gap (e.g. the old enrollment-gap
   window) keeps its stale/wrong text forever; it can't re-resolve after the data is fixed.
3. **Split resolution** — identity rendering lives in two places (FE resolver + server
   `message_templates`), which drift.

The fix: store log entries as **structured payloads** (event type + `user_id`s + params) and compose
the display text in the FE, reusing `resolveDisplayName`. The server stops baking names.

## Current state (evidence)

- **Templates + composition:** `api-game/message_templates.py` (`MESSAGE_TEMPLATES`, `format_message`).
- **Server bakes names into the sentence** via `_display_name` / `_character_name_for_prompt`
  (`api-game/websocket_handlers/websocket_events.py:130,144`) then `format_message(...)`:
  - `player_connected` → `websocket_events.py:163`
  - `dice_prompt` → `:226` (also broadcasts structured `prompted_player` at `:241`)
  - `initiative_prompt_all`, kick/role events, etc.
  - `party_updated` → `api-game/app.py` (seat user_ids → names → message string)
- **Storage:** `api-game/adventure_log_service.py:add_log_entry(message=…, from_player=…, log_type=…, prompt_id=…)`
  stores the finished `message` string. `from_player` is inconsistent — sometimes a **name**
  (`dice_prompt` passes `prompted_by_name`, `app.py:219` passes `"System"`) and sometimes a
  **user_id** (`party_updated` passes `updated_by`).
- **FE renders verbatim:** `rollplay/app/game/components/AdventureLog.js` renders `entry.message`
  as-is; only the entry **author** is resolved (`GameContent.js:848` maps `log.from_player` → name).
- **FE resolver to reuse:** `rollplay/app/game/resolveDisplayName.js` (`resolveDisplayName` / `resolveName`).

## Target model

Each log entry becomes a structured record:

```jsonc
{
  "id": "...",
  "type": "dice_prompt",            // routing key → a client-side template
  "actor_id": "<user_id>",          // was `from_player`; ALWAYS a user_id (or "system")
  "params": {                       // structured, name-free
    "target_id": "<user_id>",
    "roll_type": "Perception"
  },
  "timestamp": "...",
  "prompt_id": "..."                 // unchanged
}
```

- **Server:** stop calling `_display_name`/`format_message` for stored text. Persist `type` +
  `actor_id` (user_id) + `params` (user_ids, not names). The live broadcast can keep sending the
  same structured payload (several already do, e.g. `dice_prompt`).
- **Client:** a `renderLogEntry(entry, { characterNameMap, displayNameMap })` that maps `type` → a
  JS template and fills it with `resolveDisplayName(params.<id>, …)`. Author avatar/name already
  resolves via the maps.
- **Result:** names are resolved once, client-side, from live data → no baked strings, no collision,
  and old gaps self-heal on next render.

## Backward compatibility

Existing rows have a flat `message` string and no `type`/`params`. Options:
1. **Dual-read (recommended):** the FE renderer falls back to `entry.message` when `type`/`params`
   are absent (legacy rows), and uses the structured path when present. No data migration; old lines
   keep their (already-baked) text, new lines are structured.
2. Backfill/parse legacy strings — not worth it; they're historical.

Also normalise `from_player` → `actor_id` as a **user_id** everywhere (fixes the name-vs-id
inconsistency); the FE already treats `from_player` as a user_id for author resolution.

## Implementation steps

1. **Schema:** add `type` + `params` (JSON) + normalise `actor_id` to `adventure_log` entries
   (`adventure_log_service.py`); keep `message` nullable for legacy dual-read.
2. **Server handlers:** in `websocket_events.py` + `app.py`, replace `format_message(...)` stored
   text with `add_log_entry(type=…, actor_id=<user_id>, params={…ids…})`. Delete the
   `_display_name`/`_character_name_for_prompt` *log* usages (keep nothing that bakes names into
   stored text). `message_templates.py` moves to the FE (or is duplicated there).
3. **Client renderer:** `renderLogEntry(entry, maps)` in `rollplay/app/game/` — `type` → template,
   filled via `resolveDisplayName`. Legacy fallback to `entry.message`.
4. **AdventureLog.js:** render via `renderLogEntry` instead of raw `entry.message`.
5. **Verify:** new prompts/connects/party-updates show correct names that update live when a
   character is (re)selected; legacy lines still render; nothing emits `"Unknown Adventurer"` for a
   user who has a name.

## Out of scope / open
- Whether `message_templates` should be a shared package (contract) vs duplicated FE-side.
- Localisation (structured templates make it trivial later — noted, not required).
- The transient session-end `PlayerState.player_name` default is a *separate* one-line fix (ship
  `""`), not part of this refactor.
