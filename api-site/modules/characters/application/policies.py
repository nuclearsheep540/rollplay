# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from modules.characters.domain.character_aggregate import CharacterAggregate
from modules.session.domain.session_aggregate import SessionStatus
from modules.session.repositories.session_repository import SessionRepository


def assert_character_is_editable(
    session_repository: SessionRepository,
    character: CharacterAggregate,
) -> None:
    """Raise when the character's campaign has a live or transitional session."""
    if not character.is_locked():
        return

    if character.active_campaign is None:
        # This should never happen since the above guard ensures the character is unlocked.
        raise AssertionError("Invariant violation: locked character has no active_campaign")

    sessions = session_repository.get_by_campaign_id(character.active_campaign)
    if any(session.is_locked for session in sessions):
        raise AssertionError("Cannot edit character while campaign session is active or transitioning")
