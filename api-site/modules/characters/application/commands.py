# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Character commands.

Creating a character against a campaign's published config IS joining that session's
party; ejecting it IS leaving. There is no separate seat write, because a character's
session_id is its party membership — see the plan's vocabulary section.
"""

import logging
from typing import Dict, Optional
from uuid import UUID

from modules.characters.domain.character_aggregate import CharacterAggregate
from shared.services.game_notifier import GameNotifier
from shared_contracts.components import ComponentValue

logger = logging.getLogger(__name__)

LOG_TAG = "CHARACTER_ETL"


def _free_slot_for(user, character_repository) -> int:
    """The lowest slot below the user's capacity, or raise.

    The database's unique (user_id, slot) constraint is the hard enforcement — two
    concurrent creates racing for the same slot lose one to an IntegrityError; this is the
    friendly answer for the common case.
    """
    occupied = set(character_repository.get_occupied_slots(user.id))
    for candidate in range(user.max_slots):
        if candidate not in occupied:
            return candidate
    raise ValueError(
        f"Character limit reached ({user.max_slots} slots on this account). "
        f"Delete a character to make room."
    )


def _check_avatar_asset(asset_repository, asset_id: UUID, user_id: UUID) -> None:
    """An avatar must be an image in the user's own library. Shared by creating a
    character with one and changing one later, so the rule cannot drift between them."""
    if asset_repository is None:
        raise ValueError("Image not found in your library")
    asset = asset_repository.get_by_id(asset_id)
    # is_owned_by, not a field compare: the aggregate owns that rule. The old code
    # compared against `uploaded_by`, which the aggregate has never had — every avatar
    # set to a library image raised AttributeError, and the test for this path found it.
    if asset is None or not asset.is_owned_by(user_id):
        raise ValueError("Image not found in your library")
    if getattr(asset.asset_type, "value", asset.asset_type) != "image":
        raise ValueError("Character avatars must be images")


async def _player_identity(user_repository, user_id: UUID, campaign, character=None):
    """Build the PlayerCharacterUpdate a running room needs for one player.

    Imported here rather than at module scope only because the schema lives in this
    module's own api package and importing it at the top would close a cycle through
    endpoints.py. The class is stable; this is a package-layout concession, not a lazy
    import for performance.
    """
    from modules.characters.api.schemas import PlayerCharacterUpdate

    user = user_repository.get_by_id(user_id) if user_repository else None
    role = campaign.get_role(user_id) if campaign else None
    identity = {
        "user_id": str(user_id),
        "player_name": (user.screen_name if user else "") or "",
        # 'player' is derived from having a character, never stored — see the campaign
        # module's role handling.
        "campaign_role": "player" if character is not None else (role.value if role else "spectator"),
    }
    if character is None:
        return PlayerCharacterUpdate(**identity)
    return PlayerCharacterUpdate(
        **identity,
        character_id=str(character.id),
        display_name=character.display_name,
        config_version_id=str(character.config_version_id) if character.config_version_id else None,
        config=character.config_snapshot,
        values=character.values,
        color=character.color,
        avatar_asset_id=str(character.avatar_asset_id) if character.avatar_asset_id else None,
    )


def _refuse_while_game_runs(character, game_repository) -> None:
    """The cold-side rule for a seated character: while its table has an open game the
    room owns the character, and cold writes would either be lost at End or overwrite
    what the room wrote back. Create and eject are the exceptions, each with its own ETL."""
    if character.session_id is None or game_repository is None:
        return
    if game_repository.get_open_game_for_session(character.session_id):
        raise ValueError("A game is running: edit this character in the game")


class CreateCharacter:
    """A roster member builds against the campaign's latest published config.

    Creating the character is joining the party: its session_id IS the membership, so
    nothing else is written.
    """

    def __init__(self, character_repository, user_repository, session_repository,
                 campaign_repository, version_repository, game_repository,
                 game_notifier: Optional[GameNotifier] = None, asset_repository=None):
        self.repository = character_repository
        self.user_repository = user_repository
        self.session_repository = session_repository
        self.campaign_repository = campaign_repository
        self.version_repository = version_repository
        self.game_repository = game_repository
        self.game_notifier = game_notifier
        self.asset_repository = asset_repository

    async def execute(self, *, user_id: UUID, session_id: UUID,
                      values: Dict[str, ComponentValue],
                      avatar_asset_id: Optional[UUID] = None) -> CharacterAggregate:
        session = self.session_repository.get_by_id(session_id)
        if session is None:
            raise ValueError("Session not found")
        if not session.has_user(user_id):
            raise PermissionError("Join the campaign before creating a character for it")

        latest = self.version_repository.get_latest(session.campaign_id)
        if latest is None:
            raise ValueError("This campaign has no published character config yet")

        if self.repository.get_party_character(session_id, user_id) is not None:
            raise ValueError("You already have a character at this table: eject it first")

        user = self.user_repository.get_by_id(user_id)
        if user is None:
            raise ValueError("User not found")

        if avatar_asset_id is not None:
            _check_avatar_asset(self.asset_repository, avatar_asset_id, user_id)

        character = CharacterAggregate.create(
            user_id=user_id,
            campaign_id=session.campaign_id,
            session_id=session_id,
            config_version_id=latest.id,
            config=latest.config,
            values=values,
            slot=_free_slot_for(user, self.repository),
            avatar_asset_id=avatar_asset_id,
        )
        self.repository.save(character)

        open_game = self.game_repository.get_open_game_for_session(session_id) if self.game_repository else None
        if open_game and self.game_notifier:
            campaign = self.campaign_repository.get_by_id(session.campaign_id)
            await self.game_notifier.sync_player(
                open_game.id, await _player_identity(self.user_repository, user_id, campaign, character))

        return character


class EjectCharacterFromParty:
    """Leave the table for good.

    The character is unbound — session, campaign and version pointers all go NULL — which
    is exactly the state a character reaches when its campaign is deleted or when the
    backfill migrated it. One orphan state, reached three ways. The user is then free to
    build another, and an ejected character never rejoins a party.

    The session is NOT written: the party is a query over character rows, so clearing
    session_id IS leaving the party.
    """

    def __init__(self, character_repository, session_repository, campaign_repository,
                 user_repository, game_repository, game_notifier: GameNotifier):
        self.repository = character_repository
        self.session_repository = session_repository
        self.campaign_repository = campaign_repository
        self.user_repository = user_repository
        self.game_repository = game_repository
        self.game_notifier = game_notifier

    async def execute(self, *, character_id: UUID, requested_by: UUID) -> CharacterAggregate:
        character = self.repository.get_by_id(character_id)
        if character is None:
            raise ValueError("Character not found")
        if character.session_id is None:
            raise ValueError("This character isn't at a table")

        session = self.session_repository.get_by_id(character.session_id)
        host_id = session.host_id if session else None
        if requested_by != character.user_id and requested_by != host_id:
            raise PermissionError("Only the player or the host can eject a character")

        open_game = self.game_repository.get_open_game_for_session(character.session_id) if self.game_repository else None
        if open_game:
            # One-off ETL, and it must come first: api-game owns the values while a game is
            # open, and EndGame skips players who hold no character — so unbinding before
            # reading the room would silently discard everything that happened tonight.
            # A failure here raises GameNotifierUnavailable and aborts the eject.
            values = await self.game_notifier.fetch_player_values(open_game.id, character.user_id)
            if values:
                try:
                    character.replace_values(values)
                except Exception as invalid:
                    # The room was reachable; one stored value is malformed. Keep what is
                    # cold rather than trapping the player at a table.
                    logger.error(f"{LOG_TAG} eject could not apply hot values for {character_id}: {invalid}")

        campaign_id = character.campaign_id
        owner_id = character.user_id
        character.unbind_from_table()
        self.repository.save(character)

        if open_game:
            campaign = self.campaign_repository.get_by_id(campaign_id) if campaign_id else None
            await self.game_notifier.sync_player(
                open_game.id, await _player_identity(self.user_repository, owner_id, campaign))

        return character


class UpdateCharacterComponent:
    """The owner, or the campaign's host, edits one component value outside a game."""

    def __init__(self, character_repository, campaign_repository, game_repository):
        self.repository = character_repository
        self.campaign_repository = campaign_repository
        self.game_repository = game_repository

    def execute(self, *, character_id: UUID, requesting_user_id: UUID,
                value: ComponentValue) -> CharacterAggregate:
        character = self.repository.get_by_id(character_id)
        if character is None:
            raise ValueError("Character not found")

        if not self._may_edit(character, requesting_user_id):
            raise PermissionError("Only the owner or the campaign host can edit this character")

        _refuse_while_game_runs(character, self.game_repository)

        character.set_component_value(value)
        self.repository.save(character)
        return character

    def _may_edit(self, character, requesting_user_id: UUID) -> bool:
        if character.is_owned_by(requesting_user_id):
            return True
        if character.campaign_id is None:
            return False
        campaign = self.campaign_repository.get_by_id(character.campaign_id)
        return campaign is not None and campaign.created_by == requesting_user_id


class SetCharacterAlive:
    """Mark a character dead or alive.

    Does not remove it from the party — leaving is always explicit, so a dead character
    stays at the table, rendered at its zero point, until someone ejects it.
    """

    def __init__(self, character_repository, campaign_repository, game_repository=None):
        self.repository = character_repository
        self.campaign_repository = campaign_repository
        self.game_repository = game_repository

    def execute(self, *, character_id: UUID, requesting_user_id: UUID, is_alive: bool) -> CharacterAggregate:
        character = self.repository.get_by_id(character_id)
        if character is None:
            raise ValueError("Character not found")
        if not UpdateCharacterComponent(self.repository, self.campaign_repository, None)._may_edit(
                character, requesting_user_id):
            raise PermissionError("Only the owner or the campaign host can change this character")
        _refuse_while_game_runs(character, self.game_repository)
        character.set_alive(is_alive)
        self.repository.save(character)
        return character


class SetCharacterAvatar:
    """Attach a library image as the character's avatar, or clear it."""

    def __init__(self, character_repository, asset_repository, game_repository=None):
        self.repository = character_repository
        self.asset_repository = asset_repository
        self.game_repository = game_repository

    def execute(self, *, character_id: UUID, user_id: UUID, asset_id: Optional[UUID]) -> CharacterAggregate:
        character = self.repository.get_by_id(character_id)
        if character is None:
            raise ValueError("Character not found")
        if not character.is_owned_by(user_id):
            raise PermissionError("You do not own this character")
        _refuse_while_game_runs(character, self.game_repository)

        if asset_id is not None:
            _check_avatar_asset(self.asset_repository, asset_id, user_id)

        character.set_avatar_asset(asset_id)
        self.repository.save(character)
        return character


class DeleteCharacter:
    """Soft-delete, freeing the user's slot. Refused while the character is in a party."""

    def __init__(self, character_repository):
        self.repository = character_repository

    def execute(self, *, character_id: UUID, user_id: UUID) -> bool:
        character = self.repository.get_by_id(character_id)
        if character is None:
            raise ValueError("Character not found")
        if not character.is_owned_by(user_id):
            raise PermissionError("You do not own this character")
        if character.session_id is not None:
            raise ValueError("Eject this character from its table first")

        character.soft_delete()
        self.repository.save(character)
        return True


class WriteCharacterValuesFromGame:
    """Internal: the End ETL hands back every value api-game held. No auth; called by EndGame."""

    def __init__(self, character_repository):
        self.repository = character_repository

    def execute(self, *, character_id: UUID, values: Dict[str, ComponentValue],
                color: Optional[str] = None) -> None:
        character = self.repository.get_by_id(character_id)
        if character is None:
            logger.warning(f"{LOG_TAG} end-of-game values for unknown character {character_id}; skipped")
            return

        if values:
            try:
                character.replace_values(values)
            except Exception as invalid:
                # One player's bad document must not cost the rest of the table their night.
                logger.error(f"{LOG_TAG} could not write values for character {character_id}: {invalid}")

        if color is not None:
            character.set_color(color)

        self.repository.save(character)


class AdoptConfigVersion:
    """Move a character to the campaign's latest config version with the values its
    player confirmed.

    Owner only — the character is theirs to carry forward, and the confirmation is the
    point. Refused while a game is running: the room holds this character's config and
    values, and swapping them under a live game is runtime work (see 06).
    """

    def __init__(self, character_repository, version_repository, game_repository):
        self.repository = character_repository
        self.version_repository = version_repository
        self.game_repository = game_repository

    def execute(self, *, character_id: UUID, requesting_user_id: UUID, values: Dict[str, ComponentValue]) -> CharacterAggregate:
        character = self.repository.get_by_id(character_id)
        if character is None:
            raise ValueError("Character not found")
        if not character.is_owned_by(requesting_user_id):
            raise PermissionError("Only the owner can update their character")
        if character.session_id is None or character.campaign_id is None:
            raise ValueError("A keepsake has no table to update against")
        latest = self.version_repository.get_latest(character.campaign_id)
        if latest is None or latest.version <= character.config_snapshot.version:
            raise ValueError("This character is already on the latest version")
        if self.game_repository.get_open_game_for_session(character.session_id) is not None:
            raise ValueError("Cannot update a character while a game is running")
        character.adopt_config_version(latest.config, latest.id, values)
        self.repository.save(character)
        return character
