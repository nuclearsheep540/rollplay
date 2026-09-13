# 03 — api-game: configs in the room, component writes, secret filtering, removals, prompt-all

> Read `00-agent-brief.md` first. Depends on PR 1. Contracts installs by path and is not
> pinned; rebuild the api-game image after PR 1 so the container has the new package.
> Paths are relative to `api-game/`. Every database call is awaited; every write is a
> dotted `$set`.

## What api-game knows after this PR

Three generic facts, and nothing about any component's meaning:

1. The room holds every `CharacterConfig` version in play, keyed by version id.
2. Each player holding a character has `config_version_id` and a `values` map.
3. A component value is valid iff it pairs with that player's config (via
   `CharacterSheet`), and it is visible to a viewer iff the viewer is its owner, the GM, or
   the configuration is not `secret`.

## 1. Room document shape

`active_sessions` document additions (written by `create_session`, §2):

```
character_configs: { "<version_id>": <CharacterConfig as dict> }
player_metadata.<user_id>:
  user_id, player_name, campaign_role, character_id, display_name, color, avatar_asset_id,
  config_version_id: str,
  values: { "<component_id>": <ComponentValue as dict> }
```

Removed from `player_metadata`: `character_name`, `character_class`, `character_race`,
`level`, `hp_current`, `hp_max`, `ac`. Grep each across `api-game/` and
`rollplay/app/` after the change; none may remain.

`GameService.create_room` (`gameservice.py:81`) initialises `character_configs: {}`.

## 2. Start / End ETL (`app.py`)

**`create_session` (526-673)**: after the per-user flatten at 560-572 (which already
iterates `SessionUser.character.model_dump()` field-agnostically and therefore now writes
`display_name`, `config_version_id`, `values` without change), add one write:
`$set {"character_configs": {key: config.model_dump() for key, config in payload.character_configs.items()}}`.
Read `payload.character_configs` from the validated `SessionStartPayload`.

**`end_session` (674-852)**: the `PlayerState` build at 708-725 adds
`config_version_id=meta.get("config_version_id")` and `values=meta.get("values", {})`.
Because `PlayerState.values` is typed `Dict[str, ComponentValue]`, building it validates
each stored value; a corrupt one raises `ValidationError` — catch it per player, log
`CHARACTER_ETL` with the user id, and send that player with `values={}` so End never fails
for one bad document.

## 3. New module `character_values.py`

```python
"""Component-value operations on a room: pairing, visibility, and the one write shape.

api-game never interprets a component. It pairs a value with the player's config through
shared_contracts.CharacterSheet, strips secret values per viewer, and writes by path.
"""

COMPONENT_VALUE_ADAPTER = TypeAdapter(ComponentValue)

def config_for_player(room: dict, user_id: str) -> Optional[CharacterConfig]:
    """The CharacterConfig this player was built against, or None when they hold no
    character, or are unknown to the room."""

def validate_value_for_player(room: dict, user_id: str, value: ComponentValue) -> None:
    """Raises ValueError when the player has no config, or when CharacterSheet pairing fails
    (message = the ValidationError's first error message)."""

def secret_component_ids(config: CharacterConfig) -> Set[str]

def filter_values_for_viewer(room: dict, viewer_user_id: Optional[str]) -> dict:
    """A copy of room['player_metadata'] with secret values removed for every player who is
    not the viewer, unless the viewer is the GM (room['dungeon_master']['user_id']).
    Never mutates the room. Unknown viewer (None) sees no secret values at all."""

def filter_component_change_for_viewer(room: dict, owner_user_id: str, component_id: str,
                                       viewer_user_id: Optional[str]) -> bool:
    """True when this viewer may receive this one value change."""
```

Apply `filter_values_for_viewer` everywhere `player_metadata` leaves the process for a
specific socket or requester: the per-socket room payload in
`websocket_handlers/app_websocket.py:77-95` (next to the hidden-token filtering, same
DM check), `GET /game/{room_id}` (`app.py:326`), and `get_player_roles` if it returns
values (read it; it should not). Broadcasts of a single value change use
`filter_component_change_for_viewer` per recipient (§4).

## 4. Component write

**New route** in `app.py`:

```python
@app.put("/game/{room_id}/players/{user_id}/components/{component_id}")
async def update_player_component(room_id: str, user_id: str, component_id: str,
                                  body: ComponentValueBody, requester = <same dependency
                                  update_player_character uses at app.py:907 to identify the caller>):
    """The only way a value changes during a game.

    Allowed: the owner (requester == user_id) or the GM. Validates body.value against the
    player's config (400 on failure, message from validate_value_for_player), writes
    $set player_metadata.<user_id>.values.<component_id> = value.model_dump(), then
    broadcasts `player_component_changed` {user_id, component_id, value} to every socket in
    the room that filter_component_change_for_viewer allows.
    """
```

`schemas/session_schemas.py` gains `class ComponentValueBody(BaseModel): value: ComponentValue`.

Read how `update_player_character` (907) authenticates the caller and reuse exactly that.
If it has no caller identity (it is called by api-site over the Docker network), the new
route needs one: the WebSocket connection already knows `user_id`; expose the write as a
WebSocket event instead? **No** — server-authoritative rule: client → HTTP → Mongo → WS.
The route takes the caller from the same header/query the map routes use for the acting
user (`app.py:181 update_map` reads it); copy that.

After a successful write the route appends one system log line through the existing log
helper the seat/colour handlers use, with a new template
`component_changed: "{display_name} — {label}: {before} → {after}"`. `label` is the
configuration's label; `before`/`after` are rendered generically from the value shape:
`name` → the text, `attribute` → the score, `hit_points` int → `current`, `hit_points`
weighted → the scale step's label for that weight (a dict lookup on the config, not an
interpretation). Put that rendering in `character_values.py` as
`render_value_for_log(configuration, value) -> str`. The frontend's `describeChange` must
produce identical text.

`GameService.update_player_component(room_id, user_id, component_id, value_dict)` does the
`$set` and returns `matched_count`; `update_player_character` (387-449) is unchanged in
mechanism and keeps iterating whatever fields arrive — **delete the docstring's D&D field
list** and describe the identity + values shape instead.

## 5. Character changes during a game

("Seat" below means what it has always meant in api-game — a place in `seat_layout` where a
player's meta is drawn. api-site has no seats; see `02-api-site.md` §0.)

**`PUT /game/{room_id}/player/character` (907-985)** is the **only** way a player's
character changes from outside the room, and it carries the player's whole state. The body is
`PlayerCharacterUpdate` (api-site declares it, §3.4 of `02-api-site.md`; declare a copy in
`schemas/session_schemas.py` — same duplication note as `CharacterRuntimeBundle`, recorded
in `08-followups.md`): identity always, character half optional. Three callers, one shape —
a late joiner accepting an invite mid-game (identity only), a player creating a character
and joining the party (identity + character), a player being ejected from the party
(identity only).

Behaviour, in this order:

1. **Identity fields** (`player_name`, `campaign_role`, and `color` when present) are
   written by path every time.
2. **`character_id` absent** → `$unset` `character_id`, `display_name`,
   `config_version_id`, `values`, `avatar_asset_id`. Keep `color`, `player_name`,
   `campaign_role` — the person is still in the room, they just hold no character.
   Broadcast `player_character_changed` with `character_id: null`.
3. **`character_id` equal to what the room already holds** → write identity only.
   **Never overwrite `values`**: the room is authoritative while the game is open, and this
   call cannot know what has happened tonight.
4. **`character_id` new** → write identity + `config_version_id` + `values`, and
   `$set character_configs.<config_version_id>` when that key is absent. Broadcast
   `player_character_changed` with identity + `config_version_id` + the values filtered per
   recipient.

Delete the explicit D&D field list at 958-970. There is **no** DELETE route: a player with
no character is a PUT with no character half, which is what makes "send the complete object"
true here rather than a slogan.

### 5.1 Reading a player's values back — `GET /game/{room_id}/players/{user_id}/values`

New route, returning `{"values": {<component_id>: <ComponentValue as dict>}}`, `404` when
the room or the player is unknown. api-site calls it before ejecting a player from a
running game, because the room owns their values and End will not see them once the player
holds no character (`02-api-site.md` §3.3).

**It must not filter secret values.** This is a server-to-server read whose only purpose is
a cold write; running it through `filter_values_for_viewer` would silently drop exactly the
values the GM and player agreed were private. Say so in the docstring, next to the note
that this is the one place `player_metadata.<uid>.values` leaves the process unfiltered,
and keep it on the Docker network the way `/internal/*` routes are kept (nginx 404s it).

**Reconnect (`websocket_handlers/websocket_events.py:320-331`)**: today a `seat_change`
carrying a `character_id` fetches a summary from api-site and overwrites the player. New
rule: if the room already has this `character_id` for this user, do nothing; otherwise
call `site_client.fetch_character_bundle(character_id)` (rename of
`fetch_character_summary`, new path `/api/characters/internal/{id}/runtime-bundle`) and
apply step 2 above. `site_client.py:70-89` returns the bundle validated as
`CharacterRuntimeBundle` — declare that model in `schemas/session_schemas.py` as a copy
of api-site's (it is not a shared contract because it never crosses to the browser; note
the duplication in a comment and in `08-followups.md`).

## 6. Removals

Delete, then grep every symbol to prove nothing references it:

| What | Where |
|---|---|
| `combat_state` handler + `EVENT_HANDLERS` entry | `websocket_events.py:571-595`, `app_websocket.py` |
| `initiative_prompt_all` handler (replaced by `group_prompt`, §7) | `websocket_events.py:379-430` |
| initiative prompt clear-by-name/id branches that only served initiative | `websocket_events.py:435-472, 554` — keep `dice_prompt_clear` for the single-target prompt |
| `combat_started`, `combat_ended`, `initiative_prompt` templates | `message_templates.py` |
| `combat_active` in the room document and any `$set` of it | grep `combat_active` in `gameservice.py`, `app.py` |
| `fetch_character_summary` | `site_client.py` (renamed, §5) |
| D&D field names in docstrings and broadcasts | `gameservice.py:395-402`, `app.py:958-970` |

`api-game/tests/test_event_dispatch.py` asserts the `EVENT_HANDLERS` table is declared, not
derived; update its expected set.

## 7. Prompt-all, repurposed

Replace `initiative_prompt_all` with a `group_prompt` event, same dispatch shape:

- Wire event `group_prompt`, payload `{ "prompt_text": str }` (1–120 chars after strip;
  `WebsocketEventResult.error("Say what the roll is for")` when empty). GM only (same check
  the old handler used).
- Handler composes one system log line through `message_templates`:
  `group_prompt: "{gm_name} asks everyone: {prompt_text}"` and broadcasts
  `group_prompt` `{ prompt_id, prompt_text, from: gm_name }` so every client shows a
  prompt banner; the existing `dice_prompt_clear` clears it by `prompt_id`.
- The single-target `dice_prompt` (341-372) is unchanged except its composed sentence must
  not name a D&D roll type by default; it already takes free text — verify, and change
  nothing if so.

## 8. Tests (`api-game/tests/`, write first, show failing)

- `test_character_values.py`: `filter_values_for_viewer` strips secret values for a
  non-owner non-GM, keeps them for the owner, keeps them for the GM, strips all for `None`;
  `validate_value_for_player` rejects an unknown component, a type mismatch, a
  representation mismatch, and a player with no config; accepts an out-of-range score.
- `test_component_route.py` (pattern of `test_map_config_route.py`): owner PUT writes one
  dotted path (assert the `$set` key is exactly `player_metadata.<uid>.values.<cid>`);
  GM PUT allowed; third player 403; invalid value 400; broadcast reaches the owner and GM
  but not a third player for a secret component.
- `test_seat_bundle.py`: `PUT player/character` with the same `character_id` leaves
  `values` untouched; with a new one writes values and adds the config key; **with no
  character half unsets the five fields and keeps colour, player_name and campaign_role**;
  with identity only against a player who never had a character is a clean no-op on the
  character fields; a body with `character_id` but no `config` is rejected 422 by the
  all-or-nothing validator. `GET players/{uid}/values` returns secret values unfiltered and
  404s for an unknown player.
- `test_services_roundtrip.py` (extend, skip without Mongo): `create_session` writes
  `character_configs` and per-player `values`; `end_session` returns them in `PlayerState`.
- `test_event_dispatch.py`: `group_prompt` present, `combat_state` and
  `initiative_prompt_all` absent.

Run: `docker exec api-game-dev python -m pytest tests/ -q`.
