# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from unittest.mock import Mock
from uuid import uuid4

import pytest

from modules.characters.application.commands import UpdateAbilityScores, UpdateCharacter
from modules.session.domain.session_aggregate import SessionStatus


class TestCharacterEditPolicy:
    def test_update_character_blocked_when_campaign_session_active(self):
        character_id = uuid4()
        user_id = uuid4()
        campaign_id = uuid4()

        character = Mock()
        character.active_campaign = campaign_id
        character.is_owned_by.return_value = True

        character_repo = Mock()
        character_repo.get_by_id.return_value = character

        session_repo = Mock()
        active_session = Mock()
        active_session.status = SessionStatus.ACTIVE
        session_repo.get_by_campaign_id.return_value = [active_session]

        command = UpdateCharacter(character_repo, session_repo)

        with pytest.raises(ValueError, match="Cannot edit character while campaign session is active or transitioning"):
            command.execute(
                character_id=character_id,
                user_id=user_id,
                character_name="Aelwyn",
                character_classes=[Mock()],
                character_race=Mock(),
                level=5,
                ability_scores=Mock(),
                hp_max=30,
                hp_current=22,
                ac=14,
            )

        character.update_character.assert_not_called()
        character.update_ability_scores.assert_not_called()
        character_repo.save.assert_not_called()

    def test_update_ability_scores_blocked_when_campaign_session_transitioning(self):
        character_id = uuid4()
        user_id = uuid4()
        campaign_id = uuid4()

        character = Mock()
        character.active_campaign = campaign_id
        character.is_owned_by.return_value = True

        character_repo = Mock()
        character_repo.get_by_id.return_value = character

        session_repo = Mock()
        starting_session = Mock()
        starting_session.status = SessionStatus.STARTING
        session_repo.get_by_campaign_id.return_value = [starting_session]

        command = UpdateAbilityScores(character_repo, session_repo)

        with pytest.raises(ValueError, match="Cannot edit character while campaign session is active or transitioning"):
            command.execute(
                character_id=character_id,
                user_id=user_id,
                ability_scores=Mock(),
            )

        character.update_ability_scores.assert_not_called()
        character_repo.save.assert_not_called()

    def test_update_character_allowed_when_campaign_has_no_live_sessions(self):
        character_id = uuid4()
        user_id = uuid4()
        campaign_id = uuid4()

        character = Mock()
        character.active_campaign = campaign_id
        character.is_owned_by.return_value = True

        character_repo = Mock()
        character_repo.get_by_id.return_value = character

        session_repo = Mock()
        inactive_session = Mock()
        inactive_session.status = SessionStatus.INACTIVE
        finished_session = Mock()
        finished_session.status = SessionStatus.FINISHED
        session_repo.get_by_campaign_id.return_value = [inactive_session, finished_session]

        command = UpdateCharacter(character_repo, session_repo)

        command.execute(
            character_id=character_id,
            user_id=user_id,
            character_name="Aelwyn",
            character_classes=[Mock()],
            character_race=Mock(),
            level=5,
            ability_scores=Mock(),
            hp_max=30,
            hp_current=22,
            ac=14,
        )

        character.update_character.assert_called_once()
        character.update_ability_scores.assert_called_once()
        character_repo.save.assert_called_once_with(character)
