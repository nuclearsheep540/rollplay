# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""api-site's one voice into a running game.

It lives in shared/services rather than a module because three callers in two modules need
it — CreateCharacter and EjectCharacterFromParty in characters, AcceptCampaignInvite in
campaign — and a module may not import another module's application layer. It carries no
business logic: it is an HTTP client for one service, which is what this package is for.
"""

import logging
from typing import Dict
from uuid import UUID

import httpx
from pydantic import TypeAdapter

from shared_contracts.components import ComponentValue

logger = logging.getLogger(__name__)

LOG_TAG = "GAME_NOTIFY"
API_GAME_BASE_URL = "http://api-game:8081"
REQUEST_TIMEOUT_SECONDS = 5.0

COMPONENT_VALUE_ADAPTER = TypeAdapter(ComponentValue)


class GameNotifierUnavailable(RuntimeError):
    """api-game could not be reached, or answered with an error.

    Raised by the read only. Endpoints map it to 503 so the caller can retry rather than
    lose data.
    """


class GameNotifier:
    """Two operations against a live room, with deliberately different failure policies.

    Raises:
        GameNotifierUnavailable: from fetch_player_values only. sync_player never raises —
            a room that missed an update is re-read on reconnect, so a notify failure must
            not fail the command that caused it.
    """

    async def sync_player(self, game_id: UUID, update) -> None:
        """Send the whole of what the room should know about one player.

        ``update`` is a PlayerCharacterUpdate. No character half means the player holds no
        character, which is how a late joiner and an ejection share one call. Best effort
        by design; see the class docstring.
        """
        payload = update.model_dump(mode="json")
        try:
            async with httpx.AsyncClient() as client:
                response = await client.put(
                    f"{API_GAME_BASE_URL}/game/{game_id}/player/character",
                    json=payload,
                    timeout=REQUEST_TIMEOUT_SECONDS,
                )
            if response.status_code != 200:
                logger.warning(
                    f"{LOG_TAG} player sync to game {game_id} failed "
                    f"({response.status_code}): {response.text}"
                )
        except httpx.HTTPError as unreachable:
            # Anticipated and deliberately swallowed: the room re-reads on reconnect, and
            # the cold write that preceded this call already stands.
            logger.warning(f"{LOG_TAG} player sync to game {game_id} failed (non-fatal): {unreachable}")

    async def fetch_player_values(self, game_id: UUID, user_id: UUID) -> Dict[str, ComponentValue]:
        """Read a player's component values out of a running room.

        Unfiltered by design: this is a server-to-server read feeding a cold write, so
        secret values must come back — running it through the viewer filter would silently
        drop exactly the values the GM and the player agreed were private.

        Raises:
            GameNotifierUnavailable: the room could not be read. The caller must abort
                rather than continue, because continuing discards the night's play.
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{API_GAME_BASE_URL}/game/{game_id}/players/{user_id}/values",
                    timeout=REQUEST_TIMEOUT_SECONDS,
                )
        except httpx.HTTPError as unreachable:
            raise GameNotifierUnavailable(
                "Couldn't save this character's current state from the running game; try again"
            ) from unreachable

        if response.status_code == 404:
            # The room has no such player: nothing was held hot, so there is nothing to save.
            return {}
        if response.status_code != 200:
            raise GameNotifierUnavailable(
                "Couldn't save this character's current state from the running game; try again"
            )

        raw_values = response.json().get("values", {})
        return {
            component_id: COMPONENT_VALUE_ADAPTER.validate_python(value)
            for component_id, value in raw_values.items()
        }


def get_game_notifier() -> GameNotifier:
    """FastAPI dependency."""
    return GameNotifier()
