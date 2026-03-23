# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from unittest.mock import Mock
from uuid import uuid4

import pytest

from modules.characters.application.commands import UpdateAbilityScores, UpdateCharacter
from modules.characters.domain.character_aggregate import (
    AbilityScores,
    CharacterAggregate,
    CharacterClass,
    CharacterClassInfo,
    CharacterRace,
)
from modules.session.domain.session_aggregate import SessionEntity, SessionStatus


def _make_character(user_id, campaign_id=None):
    """Build a real CharacterAggregate for testing."""
    character = CharacterAggregate.create(
        user_id=user_id,
        character_name="Aelwyn",
        character_classes=[CharacterClassInfo(character_class=CharacterClass.RANGER, level=5)],
        character_race=CharacterRace.ELF,
        level=5,
        ability_scores=AbilityScores(strength=10, dexterity=14, constitution=12, intelligence=10, wisdom=13, charisma=8),
        active_campaign=None,
        hp_max=30,
        hp_current=22,
        ac=14,
    )
    character.id = uuid4()  # Simulate repository-assigned ID
    if campaign_id:
        character.lock_to_campaign(campaign_id)
    return character


def _make_session(status):
    """Build a real SessionEntity with the given status."""
    return SessionEntity(
        id=uuid4(),
        campaign_id=uuid4(),
        host_id=uuid4(),
        status=status,
    )


class TestCharacterEditPolicy:
    def test_update_character_blocked_when_session_active(self):
        user_id = uuid4()
        campaign_id = uuid4()
        character = _make_character(user_id, campaign_id)
        original_name = character.character_name

        character_repo = Mock()
        character_repo.get_by_id.return_value = character

        session_repo = Mock()
        session_repo.get_by_campaign_id.return_value = [_make_session(SessionStatus.ACTIVE)]

        command = UpdateCharacter(character_repo, session_repo)

        with pytest.raises(AssertionError, match="Cannot edit character while campaign session is active or transitioning"):
            command.execute(
                character_id=character.id,
                user_id=user_id,
                character_name="New Name",
                character_classes=[CharacterClassInfo(character_class=CharacterClass.RANGER, level=5)],
                character_race=CharacterRace.ELF,
                level=5,
                ability_scores=AbilityScores(strength=10, dexterity=14, constitution=12, intelligence=10, wisdom=13, charisma=8),
                hp_max=30,
                hp_current=22,
                ac=14,
            )

        assert character.character_name == original_name
        assert not character_repo.save.called

    def test_update_ability_scores_blocked_when_session_starting(self):
        user_id = uuid4()
        campaign_id = uuid4()
        character = _make_character(user_id, campaign_id)
        original_scores = character.ability_scores

        character_repo = Mock()
        character_repo.get_by_id.return_value = character

        session_repo = Mock()
        session_repo.get_by_campaign_id.return_value = [_make_session(SessionStatus.STARTING)]

        command = UpdateAbilityScores(character_repo, session_repo)

        with pytest.raises(AssertionError, match="Cannot edit character while campaign session is active or transitioning"):
            command.execute(
                character_id=character.id,
                user_id=user_id,
                ability_scores=AbilityScores(strength=18, dexterity=14, constitution=12, intelligence=10, wisdom=13, charisma=8),
            )

        assert character.ability_scores == original_scores
        assert not character_repo.save.called

    def test_update_character_blocked_when_session_stopping(self):
        user_id = uuid4()
        campaign_id = uuid4()
        character = _make_character(user_id, campaign_id)
        original_name = character.character_name

        character_repo = Mock()
        character_repo.get_by_id.return_value = character

        session_repo = Mock()
        session_repo.get_by_campaign_id.return_value = [_make_session(SessionStatus.STOPPING)]

        command = UpdateCharacter(character_repo, session_repo)

        with pytest.raises(AssertionError, match="Cannot edit character while campaign session is active or transitioning"):
            command.execute(
                character_id=character.id,
                user_id=user_id,
                character_name="New Name",
                character_classes=[CharacterClassInfo(character_class=CharacterClass.RANGER, level=5)],
                character_race=CharacterRace.ELF,
                level=5,
                ability_scores=AbilityScores(strength=10, dexterity=14, constitution=12, intelligence=10, wisdom=13, charisma=8),
                hp_max=30,
                hp_current=22,
                ac=14,
            )

        assert character.character_name == original_name
        assert not character_repo.save.called

    def test_update_character_allowed_when_sessions_inactive_and_finished(self):
        user_id = uuid4()
        campaign_id = uuid4()
        character = _make_character(user_id, campaign_id)

        character_repo = Mock()
        character_repo.get_by_id.return_value = character

        session_repo = Mock()
        session_repo.get_by_campaign_id.return_value = [
            _make_session(SessionStatus.INACTIVE),
            _make_session(SessionStatus.FINISHED),
        ]

        command = UpdateCharacter(character_repo, session_repo)

        result = command.execute(
            character_id=character.id,
            user_id=user_id,
            character_name="Aelwyn the Bold",
            character_classes=[CharacterClassInfo(character_class=CharacterClass.RANGER, level=5)],
            character_race=CharacterRace.ELF,
            level=5,
            ability_scores=AbilityScores(strength=10, dexterity=14, constitution=12, intelligence=10, wisdom=13, charisma=8),
            hp_max=30,
            hp_current=22,
            ac=14,
        )

        assert result.character_name == "Aelwyn the Bold"
        assert character_repo.save.called

    def test_update_character_allowed_when_no_campaign(self):
        user_id = uuid4()
        character = _make_character(user_id, campaign_id=None)

        character_repo = Mock()
        character_repo.get_by_id.return_value = character

        session_repo = Mock()

        command = UpdateCharacter(character_repo, session_repo)

        result = command.execute(
            character_id=character.id,
            user_id=user_id,
            character_name="Renamed",
            character_classes=[CharacterClassInfo(character_class=CharacterClass.FIGHTER, level=5)],
            character_race=CharacterRace.HUMAN,
            level=5,
            ability_scores=AbilityScores(strength=16, dexterity=10, constitution=14, intelligence=8, wisdom=12, charisma=10),
            hp_max=28,
            hp_current=28,
            ac=16,
        )

        assert result.character_name == "Renamed"
        assert result.character_race == CharacterRace.HUMAN
        assert character_repo.save.called
        # Session repo should never be consulted for unlocked characters
        assert not session_repo.get_by_campaign_id.called
