Plan: Session Character ETL
Add campaign-bound character metadata to the session start ETL so api-game hot state contains authoritative player character data at hydration time, then update the game UI to read that hot-state metadata instead of using frontend fallbacks like Adventurer. Assume the current invariant of one active character per user per campaign holds for now, and keep enforcement of that invariant out of scope.

Steps

Phase 1: Extend the shared ETL contract in rollplay-shared-contracts/shared_contracts/session.py and add a new DTO module at rollplay-shared-contracts/shared_contracts/character.py.

Create a transport DTO for session character metadata with the fields needed across the boundary: user_id, player_name, character_id, character_name, character_class, character_race, level, hp_current, hp_max, ac.

Update SessionStartPayload to include a list of those DTOs while keeping joined_user_ids, max_players, and the empty-seat concept intact.

Verify shared-contract imports/exports so both api-site and api-game can consume the new DTO cleanly.

Phase 2: Add an api-site query/helper to assemble ETL character metadata from existing cold-store data.

Source session roster membership from session_joined_users, player identity from User.screen_name or User.email, and character binding from Character.active_campaign == session.campaign_id.

Prefer a dedicated query/helper near api-site/modules/session/application/queries.py rather than embedding ORM joins directly in StartSession.execute.

Keep session aggregate changes minimal; the issue is data exposure/querying, not a missing storage table.

Phase 3: Update api-site start ETL payload construction.

Modify api-site/modules/session/application/commands.py so StartSession.execute calls the new query/helper and includes character DTOs in SessionStartPayload.

Ensure outgoing player_name values match the normalization expected by api-game and websocket handling.

Reuse existing multi-class formatting patterns from the campaign/session query layer so the DTO already contains frontend-usable class strings.

Phase 4: Hydrate api-game hot state with ETL character metadata while preserving seat availability logic.

Update api-game/app.py session start handling to accept and persist the new ETL character data.

Preserve max_players and empty-seat initialization; do not remove the current templated seat availability model.

Store character metadata separately from seat_layout if that is the least disruptive path. A player_metadata map keyed by normalized player_name is the safest design because many existing paths still assume string-based seat entries.

Expose the new hot-state metadata in both /game/{room_id} and websocket initial_state.

Phase 5: Update frontend game hydration and Party drawer rendering.

Replace the fallback-only getCharacterData(...) path in rollplay/app/game/page.js and rollplay/app/game/hooks/webSocketEvent.js so initial room load, websocket initial state, seat changes, and seat-count changes all use authoritative hot-state metadata.

Keep spectator and empty-seat behavior unchanged.

Update rollplay/app/game/components/PlayerCard.js so occupied seats render character_name as the title and Level {level} {character_class} as the subtitle.

Remove or demote the Adventurer fallback from the seated-player path once hot-state metadata is available.

Phase 6: Verify continuity across initial load, websocket updates, and reconnects.

Confirm HTTP room fetch and websocket initial_state expose the same character metadata shape.

Confirm seat updates do not wipe the stored character metadata.

Treat any missing metadata for a seated player as a data-quality issue rather than silently masking it with defaults.

Relevant files

rollplay-shared-contracts/shared_contracts/session.py — extend SessionStartPayload.
rollplay-shared-contracts/shared_contracts/character.py — new ETL DTO module.
api-site/modules/session/application/commands.py — populate ETL character data during StartSession.execute.
api-site/modules/session/application/queries.py — reference/query home for roster + character enrichment.
api-site/modules/campaign/application/queries.py — reference for campaign-bound character lookup and class formatting.
api-site/modules/campaign/model/session_model.py — session roster storage.
api-site/modules/characters/model/character_model.py — campaign binding and combat stats fields.
api-site/modules/characters/repositories/character_repository.py — campaign-bound character lookup.
api-game/app.py — accept/persist ETL character data and expose it in game fetch responses.
api-game/gameservice.py — hot-state storage/retrieval.