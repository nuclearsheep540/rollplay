# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Tests for character-session joining flow.

Covers the complete flow of:
1. User is a campaign member (auto-enrolled in sessions)
2. User selects character for session
3. Character locks to session
4. Player can be removed
5. Character unlocks when removed

Note: Session-level invite/accept flow has been removed.
Players are added to campaigns, and when a session is created,
all campaign players are automatically added to joined_users.
"""

import pytest
from uuid import UUID

from modules.session.application.commands import (
    CreateSession,
    SelectCharacterForSession,
    RemovePlayerFromSession
)


class TestCharacterSessionJoining:
    """Tests for character joining sessions"""

    def test_user_can_select_character_after_auto_enrollment(
        self,
        create_user,
        create_campaign,
        create_character,
        user_repo,
        game_repo,
        campaign_repo,
        character_repo,
        db_session
    ):
        """
        GIVEN: DM creates a campaign with a player, then creates a session
        WHEN: Player (auto-enrolled) selects character
        THEN: Player is in joined_users
        AND: Character is locked to session
        AND: session_joined_users.selected_character_id is set
        """
        # GIVEN: DM and player exist
        dm = create_user("dm@example.com", "DungeonMaster")
        player = create_user("player@example.com", "Player1")

        # GIVEN: Campaign exists with player as member
        campaign = create_campaign(host_id=dm.id, title="Test Campaign")
        campaign.add_player(player.id)
        campaign_repo.save(campaign)

        # GIVEN: Player has a character
        character = create_character(user_id=player.id, name="Hero")

        # WHEN: DM creates a session (player auto-enrolled from campaign)
        from modules.events.event_manager import EventManager
        event_manager = EventManager()
        create_session = CreateSession(game_repo, campaign_repo, event_manager)
        session = create_session.execute(
            name="Test Session",
            campaign_id=campaign.id,
            host_id=dm.id,
            max_players=6
        )

        # THEN: Player is in joined_users (auto-enrolled)
        assert player.id in session.joined_users

        # WHEN: Player selects character
        select_cmd = SelectCharacterForSession(game_repo, character_repo)
        selected_char = select_cmd.execute(
            session_id=session.id,
            user_id=player.id,
            character_id=character.id
        )

        # THEN: Character is locked to session
        refreshed_char = character_repo.get_by_id(character.id)
        assert refreshed_char.active_session == session.id
        assert refreshed_char.is_locked()

        # THEN: session_joined_users.selected_character_id is set
        from modules.campaign.model.session_model import SessionJoinedUser
        roster_entry = db_session.query(SessionJoinedUser).filter_by(
            session_id=session.id,
            user_id=player.id
        ).first()
        assert roster_entry is not None
        assert roster_entry.selected_character_id == character.id

    def test_cannot_select_character_if_not_campaign_member(
        self,
        create_user,
        create_campaign,
        create_character,
        user_repo,
        game_repo,
        campaign_repo,
        character_repo
    ):
        """
        GIVEN: User is NOT a campaign member
        WHEN: User tries to select character for session
        THEN: Raises ValueError "User has not joined this session"
        """
        # GIVEN: DM and non-member player exist
        dm = create_user("dm@example.com", "DM")
        non_member = create_user("nonmember@example.com", "NonMember")

        # GIVEN: Campaign exists (non_member is NOT added)
        campaign = create_campaign(host_id=dm.id)

        # GIVEN: Session is created (only DM has access)
        from modules.events.event_manager import EventManager
        event_manager = EventManager()
        create_session = CreateSession(game_repo, campaign_repo, event_manager)
        session = create_session.execute(
            name="Test Session",
            campaign_id=campaign.id,
            host_id=dm.id,
            max_players=6
        )

        # GIVEN: Non-member has a character
        character = create_character(user_id=non_member.id)

        # WHEN: Non-member tries to select character
        select_cmd = SelectCharacterForSession(game_repo, character_repo)

        # THEN: Raises error
        with pytest.raises(ValueError, match="User has not joined this session"):
            select_cmd.execute(
                session_id=session.id,
                user_id=non_member.id,
                character_id=character.id
            )

    def test_cannot_select_character_already_locked(
        self,
        create_user,
        create_campaign,
        create_character,
        user_repo,
        game_repo,
        campaign_repo,
        character_repo
    ):
        """
        GIVEN: Character is locked to Session A
        WHEN: User tries to select same character for Session B (different campaign)
        THEN: Raises ValueError "Character already locked to session"

        Note: Business rule allows only one session per campaign at a time,
        so we need two separate campaigns to test cross-session character locking.
        """
        # GIVEN: DM and player
        dm = create_user("dm@example.com")
        player = create_user("player@example.com")

        # GIVEN: Two campaigns (each with player as member)
        campaign_a = create_campaign(host_id=dm.id, title="Campaign A")
        campaign_a.add_player(player.id)
        campaign_repo.save(campaign_a)

        campaign_b = create_campaign(host_id=dm.id, title="Campaign B")
        campaign_b.add_player(player.id)
        campaign_repo.save(campaign_b)

        # GIVEN: Two sessions (one per campaign - business rule constraint)
        from modules.events.event_manager import EventManager
        event_manager = EventManager()
        create_session = CreateSession(game_repo, campaign_repo, event_manager)

        session_a = create_session.execute(
            name="Session A",
            campaign_id=campaign_a.id,
            host_id=dm.id,
            max_players=6
        )
        session_b = create_session.execute(
            name="Session B",
            campaign_id=campaign_b.id,
            host_id=dm.id,
            max_players=6
        )

        # GIVEN: Character locked to Session A
        character = create_character(user_id=player.id)
        select = SelectCharacterForSession(game_repo, character_repo)
        select.execute(session_id=session_a.id, user_id=player.id, character_id=character.id)

        # WHEN: Try to select same character for Session B
        # THEN: Raises error
        with pytest.raises(ValueError, match="Character already locked to session"):
            select.execute(session_id=session_b.id, user_id=player.id, character_id=character.id)

    def test_cannot_select_someone_elses_character(
        self,
        create_user,
        create_campaign,
        create_character,
        user_repo,
        game_repo,
        campaign_repo,
        character_repo
    ):
        """
        GIVEN: User A joins session (via campaign membership)
        WHEN: User A tries to select User B's character
        THEN: Raises ValueError "Character not owned by user"
        """
        # GIVEN: DM, Player A, Player B
        dm = create_user("dm@example.com")
        player_a = create_user("playera@example.com")
        player_b = create_user("playerb@example.com")

        # GIVEN: Campaign with Player A as member
        campaign = create_campaign(host_id=dm.id)
        campaign.add_player(player_a.id)
        campaign_repo.save(campaign)

        # GIVEN: Session created (Player A auto-enrolled)
        from modules.events.event_manager import EventManager
        event_manager = EventManager()
        create_session = CreateSession(game_repo, campaign_repo, event_manager)
        session = create_session.execute(
            name="Test Session",
            campaign_id=campaign.id,
            host_id=dm.id,
            max_players=6
        )

        # GIVEN: Player B has a character (Player B is NOT in the campaign)
        player_b_character = create_character(user_id=player_b.id, name="B's Character")

        # WHEN: Player A tries to select Player B's character
        select = SelectCharacterForSession(game_repo, character_repo)

        # THEN: Raises error
        with pytest.raises(ValueError, match="Character not owned by user"):
            select.execute(
                session_id=session.id,
                user_id=player_a.id,
                character_id=player_b_character.id
            )

    def test_removing_player_unlocks_character(
        self,
        create_user,
        create_campaign,
        create_character,
        user_repo,
        game_repo,
        campaign_repo,
        character_repo,
        db_session
    ):
        """
        GIVEN: Player joined session with character selected
        WHEN: DM removes player from session
        THEN: Player removed from joined_users
        AND: Character.active_session is None (unlocked)
        AND: session_joined_users row deleted
        """
        # GIVEN: DM and player
        dm = create_user("dm@example.com")
        player = create_user("player@example.com")

        # GIVEN: Campaign with player
        campaign = create_campaign(host_id=dm.id)
        campaign.add_player(player.id)
        campaign_repo.save(campaign)

        # GIVEN: Session created (player auto-enrolled)
        from modules.events.event_manager import EventManager
        event_manager = EventManager()
        create_session = CreateSession(game_repo, campaign_repo, event_manager)
        session = create_session.execute(
            name="Test Session",
            campaign_id=campaign.id,
            host_id=dm.id,
            max_players=6
        )

        # GIVEN: Player selects character
        character = create_character(user_id=player.id)
        select = SelectCharacterForSession(game_repo, character_repo)
        select.execute(session_id=session.id, user_id=player.id, character_id=character.id)

        # Verify character is locked
        assert character_repo.get_by_id(character.id).is_locked()

        # WHEN: DM removes player
        remove = RemovePlayerFromSession(game_repo, character_repo)
        session = remove.execute(session_id=session.id, user_id=player.id, removed_by=dm.id)

        # THEN: Player removed from session
        assert player.id not in session.joined_users

        # THEN: Character unlocked
        refreshed_char = character_repo.get_by_id(character.id)
        assert refreshed_char.active_session is None
        assert not refreshed_char.is_locked()

        # THEN: session_joined_users row deleted
        from modules.campaign.model.session_model import SessionJoinedUser
        roster_entry = db_session.query(SessionJoinedUser).filter_by(
            session_id=session.id,
            user_id=player.id
        ).first()
        assert roster_entry is None

    def test_user_auto_enrolled_without_selecting_character(
        self,
        create_user,
        create_campaign,
        user_repo,
        game_repo,
        campaign_repo,
        db_session
    ):
        """
        GIVEN: User is campaign member
        WHEN: Session is created (user auto-enrolled)
        THEN: User in joined_users
        AND: session_joined_users.selected_character_id is NULL
        """
        # GIVEN: DM and player
        dm = create_user("dm@example.com")
        player = create_user("player@example.com", "TestPlayer")

        # GIVEN: Campaign with player
        campaign = create_campaign(host_id=dm.id)
        campaign.add_player(player.id)
        campaign_repo.save(campaign)

        # WHEN: Session is created (player auto-enrolled)
        from modules.events.event_manager import EventManager
        event_manager = EventManager()
        create_session = CreateSession(game_repo, campaign_repo, event_manager)
        session = create_session.execute(
            name="Test Session",
            campaign_id=campaign.id,
            host_id=dm.id,
            max_players=6
        )

        # THEN: User in joined_users
        assert player.id in session.joined_users

        # THEN: selected_character_id is NULL
        from modules.campaign.model.session_model import SessionJoinedUser
        roster_entry = db_session.query(SessionJoinedUser).filter_by(
            session_id=session.id,
            user_id=player.id
        ).first()
        assert roster_entry is not None
        assert roster_entry.selected_character_id is None

    def test_max_players_enforced_at_campaign_level(
        self,
        create_user,
        create_campaign,
        user_repo,
        game_repo,
        campaign_repo
    ):
        """
        Note: With auto-enrollment, max_players is enforced when players
        join the campaign, not the session. This test verifies that session
        max_players is set correctly from create_session.

        The actual enforcement happens at campaign level (not tested here).
        """
        # GIVEN: DM
        dm = create_user("dm@example.com")

        # GIVEN: Campaign with 4 players
        campaign = create_campaign(host_id=dm.id)
        for i in range(4):
            player = create_user(f"player{i}@example.com")
            campaign.add_player(player.id)
        campaign_repo.save(campaign)

        # WHEN: Session created with max_players=4
        from modules.events.event_manager import EventManager
        event_manager = EventManager()
        create_session = CreateSession(game_repo, campaign_repo, event_manager)
        session = create_session.execute(
            name="Test Session",
            campaign_id=campaign.id,
            host_id=dm.id,
            max_players=4
        )

        # THEN: Session has max_players=4
        assert session.max_players == 4

        # THEN: All 4 campaign players are auto-enrolled
        assert len(session.joined_users) == 4
