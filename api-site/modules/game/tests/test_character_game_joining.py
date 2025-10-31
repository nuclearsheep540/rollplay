# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Tests for character-game joining flow.

Covers the complete flow of:
1. User gets invited to game
2. User accepts invite
3. User selects character
4. Character locks to game
5. Player can be removed
6. Character unlocks when removed
"""

import pytest
from uuid import UUID

from modules.game.application.commands import (
    InviteUserToGame,
    AcceptGameInvite,
    SelectCharacterForGame,
    RemovePlayerFromGame,
    ChangeCharacterForGame
)


class TestCharacterGameJoining:
    """Tests for character joining games"""

    def test_user_can_join_game_and_select_character(
        self,
        create_user,
        create_campaign,
        create_game,
        create_character,
        user_repo,
        game_repo,
        character_repo,
        db_session
    ):
        """
        GIVEN: DM creates a game and invites a player
        WHEN: Player accepts invite and selects character
        THEN: Player is in joined_users
        AND: Character is locked to game
        AND: game_joined_users.selected_character_id is set
        """
        # GIVEN: DM and player exist
        dm = create_user("dm@example.com", "DungeonMaster")
        player = create_user("player@example.com", "Player1")

        # GIVEN: Campaign and game exist
        campaign = create_campaign(host_id=dm.id, title="Test Campaign")
        game = create_game(campaign_id=campaign.id, host_id=dm.id, name="Test Game")

        # GIVEN: Player has a character
        character = create_character(user_id=player.id, name="Hero")

        # GIVEN: Player is invited
        invite_cmd = InviteUserToGame(game_repo, user_repo)
        game = invite_cmd.execute(
            game_id=game.id,
            user_id=player.id,
            invited_by=dm.id
        )

        assert player.id in game.invited_users

        # WHEN: Player accepts invite
        accept_cmd = AcceptGameInvite(game_repo, user_repo)
        game = accept_cmd.execute(game_id=game.id, user_id=player.id)

        # THEN: Player is in joined_users
        assert player.id in game.joined_users
        assert player.id not in game.invited_users

        # WHEN: Player selects character
        select_cmd = SelectCharacterForGame(game_repo, character_repo)
        selected_char = select_cmd.execute(
            game_id=game.id,
            user_id=player.id,
            character_id=character.id
        )

        # THEN: Character is locked to game
        refreshed_char = character_repo.get_by_id(character.id)
        assert refreshed_char.active_game == game.id
        assert refreshed_char.is_locked()

        # THEN: game_joined_users.selected_character_id is set
        from modules.campaign.model.game_model import GameJoinedUser
        roster_entry = db_session.query(GameJoinedUser).filter_by(
            game_id=game.id,
            user_id=player.id
        ).first()
        assert roster_entry is not None
        assert roster_entry.selected_character_id == character.id

    def test_cannot_select_character_before_accepting_invite(
        self,
        create_user,
        create_campaign,
        create_game,
        create_character,
        user_repo,
        game_repo,
        character_repo
    ):
        """
        GIVEN: User is invited to a game but hasn't accepted
        WHEN: User tries to select character
        THEN: Raises ValueError "User has not joined this game"
        """
        # GIVEN: DM and player exist
        dm = create_user("dm@example.com", "DM")
        player = create_user("player@example.com", "Player")

        # GIVEN: Game exists and player invited
        campaign = create_campaign(host_id=dm.id)
        game = create_game(campaign_id=campaign.id, host_id=dm.id)

        invite_cmd = InviteUserToGame(game_repo, user_repo)
        game = invite_cmd.execute(game_id=game.id, user_id=player.id, invited_by=dm.id)

        # GIVEN: Player has character
        character = create_character(user_id=player.id)

        # WHEN: Player tries to select character without accepting invite
        select_cmd = SelectCharacterForGame(game_repo, character_repo)

        # THEN: Raises error
        with pytest.raises(ValueError, match="User has not joined this game"):
            select_cmd.execute(
                game_id=game.id,
                user_id=player.id,
                character_id=character.id
            )

    def test_cannot_select_character_already_locked(
        self,
        create_user,
        create_campaign,
        create_game,
        create_character,
        user_repo,
        game_repo,
        character_repo
    ):
        """
        GIVEN: Character is locked to Game A
        WHEN: User tries to select same character for Game B
        THEN: Raises ValueError "Character already locked to game"
        """
        # GIVEN: DM and player
        dm = create_user("dm@example.com")
        player = create_user("player@example.com")

        # GIVEN: Two games
        campaign = create_campaign(host_id=dm.id)
        game_a = create_game(campaign_id=campaign.id, host_id=dm.id, name="Game A")
        game_b = create_game(campaign_id=campaign.id, host_id=dm.id, name="Game B")

        # GIVEN: Player joins both games
        for game in [game_a, game_b]:
            invite = InviteUserToGame(game_repo, user_repo)
            invite.execute(game_id=game.id, user_id=player.id, invited_by=dm.id)

            accept = AcceptGameInvite(game_repo, user_repo)
            accept.execute(game_id=game.id, user_id=player.id)

        # GIVEN: Character locked to Game A
        character = create_character(user_id=player.id)
        select = SelectCharacterForGame(game_repo, character_repo)
        select.execute(game_id=game_a.id, user_id=player.id, character_id=character.id)

        # WHEN: Try to select same character for Game B
        # THEN: Raises error
        with pytest.raises(ValueError, match="Character already locked"):
            select.execute(game_id=game_b.id, user_id=player.id, character_id=character.id)

    def test_cannot_select_someone_elses_character(
        self,
        create_user,
        create_campaign,
        create_game,
        create_character,
        user_repo,
        game_repo,
        character_repo
    ):
        """
        GIVEN: User A joins game
        WHEN: User A tries to select User B's character
        THEN: Raises ValueError "Character not owned by user"
        """
        # GIVEN: DM, Player A, Player B
        dm = create_user("dm@example.com")
        player_a = create_user("playera@example.com")
        player_b = create_user("playerb@example.com")

        # GIVEN: Game with Player A joined
        campaign = create_campaign(host_id=dm.id)
        game = create_game(campaign_id=campaign.id, host_id=dm.id)

        invite = InviteUserToGame(game_repo, user_repo)
        invite.execute(game_id=game.id, user_id=player_a.id, invited_by=dm.id)

        accept = AcceptGameInvite(game_repo, user_repo)
        accept.execute(game_id=game.id, user_id=player_a.id)

        # GIVEN: Player B has a character
        player_b_character = create_character(user_id=player_b.id, name="B's Character")

        # WHEN: Player A tries to select Player B's character
        select = SelectCharacterForGame(game_repo, character_repo)

        # THEN: Raises error
        with pytest.raises(ValueError, match="Character not owned by user"):
            select.execute(
                game_id=game.id,
                user_id=player_a.id,
                character_id=player_b_character.id
            )

    def test_removing_player_unlocks_character(
        self,
        create_user,
        create_campaign,
        create_game,
        create_character,
        user_repo,
        game_repo,
        character_repo,
        db_session
    ):
        """
        GIVEN: Player joined game with character selected
        WHEN: DM removes player from game
        THEN: Player removed from joined_users
        AND: Character.active_game is None (unlocked)
        AND: game_joined_users row deleted
        """
        # GIVEN: DM and player
        dm = create_user("dm@example.com")
        player = create_user("player@example.com")

        # GIVEN: Game with player joined and character selected
        campaign = create_campaign(host_id=dm.id)
        game = create_game(campaign_id=campaign.id, host_id=dm.id)

        invite = InviteUserToGame(game_repo, user_repo)
        invite.execute(game_id=game.id, user_id=player.id, invited_by=dm.id)

        accept = AcceptGameInvite(game_repo, user_repo)
        accept.execute(game_id=game.id, user_id=player.id)

        character = create_character(user_id=player.id)
        select = SelectCharacterForGame(game_repo, character_repo)
        select.execute(game_id=game.id, user_id=player.id, character_id=character.id)

        # Verify character is locked
        assert character_repo.get_by_id(character.id).is_locked()

        # WHEN: DM removes player
        remove = RemovePlayerFromGame(game_repo, character_repo)
        game = remove.execute(game_id=game.id, user_id=player.id, removed_by=dm.id)

        # THEN: Player removed from game
        assert player.id not in game.joined_users

        # THEN: Character unlocked
        refreshed_char = character_repo.get_by_id(character.id)
        assert refreshed_char.active_game is None
        assert not refreshed_char.is_locked()

        # THEN: game_joined_users row deleted
        from modules.campaign.model.game_model import GameJoinedUser
        roster_entry = db_session.query(GameJoinedUser).filter_by(
            game_id=game.id,
            user_id=player.id
        ).first()
        assert roster_entry is None

    def test_can_change_character_when_game_inactive(
        self,
        create_user,
        create_campaign,
        create_game,
        create_character,
        user_repo,
        game_repo,
        character_repo,
        db_session
    ):
        """
        GIVEN: Player in game with Character A selected (game INACTIVE)
        WHEN: Player changes to Character B
        THEN: Character A is unlocked
        AND: Character B is locked to game
        AND: game_joined_users.selected_character_id updated
        """
        # GIVEN: DM and player
        dm = create_user("dm@example.com")
        player = create_user("player@example.com")

        # GIVEN: Game with player joined
        campaign = create_campaign(host_id=dm.id)
        game = create_game(campaign_id=campaign.id, host_id=dm.id)

        invite = InviteUserToGame(game_repo, user_repo)
        invite.execute(game_id=game.id, user_id=player.id, invited_by=dm.id)

        accept = AcceptGameInvite(game_repo, user_repo)
        accept.execute(game_id=game.id, user_id=player.id)

        # GIVEN: Two characters
        char_a = create_character(user_id=player.id, name="Character A")
        char_b = create_character(user_id=player.id, name="Character B")

        # GIVEN: Character A selected
        select = SelectCharacterForGame(game_repo, character_repo)
        select.execute(game_id=game.id, user_id=player.id, character_id=char_a.id)

        # WHEN: Player changes to Character B
        change = ChangeCharacterForGame(game_repo, character_repo)
        change.execute(
            game_id=game.id,
            user_id=player.id,
            old_character_id=char_a.id,
            new_character_id=char_b.id
        )

        # THEN: Character A unlocked
        refreshed_a = character_repo.get_by_id(char_a.id)
        assert refreshed_a.active_game is None
        assert not refreshed_a.is_locked()

        # THEN: Character B locked
        refreshed_b = character_repo.get_by_id(char_b.id)
        assert refreshed_b.active_game == game.id
        assert refreshed_b.is_locked()

        # THEN: game_joined_users updated
        from modules.campaign.model.game_model import GameJoinedUser
        roster_entry = db_session.query(GameJoinedUser).filter_by(
            game_id=game.id,
            user_id=player.id
        ).first()
        assert roster_entry.selected_character_id == char_b.id

    def test_user_can_join_without_selecting_character(
        self,
        create_user,
        create_campaign,
        create_game,
        user_repo,
        game_repo,
        db_session
    ):
        """
        GIVEN: User invited to game
        WHEN: User accepts invite (no character selected yet)
        THEN: User in joined_users
        AND: game_joined_users.selected_character_id is NULL
        AND: Roster shows username with "No character selected"
        """
        # GIVEN: DM and player
        dm = create_user("dm@example.com")
        player = create_user("player@example.com", "TestPlayer")

        # GIVEN: Game exists
        campaign = create_campaign(host_id=dm.id)
        game = create_game(campaign_id=campaign.id, host_id=dm.id)

        # GIVEN: Player invited
        invite = InviteUserToGame(game_repo, user_repo)
        invite.execute(game_id=game.id, user_id=player.id, invited_by=dm.id)

        # WHEN: Player accepts without selecting character
        accept = AcceptGameInvite(game_repo, user_repo)
        game = accept.execute(game_id=game.id, user_id=player.id)

        # THEN: User in joined_users
        assert player.id in game.joined_users

        # THEN: selected_character_id is NULL
        from modules.campaign.model.game_model import GameJoinedUser
        roster_entry = db_session.query(GameJoinedUser).filter_by(
            game_id=game.id,
            user_id=player.id
        ).first()
        assert roster_entry is not None
        assert roster_entry.selected_character_id is None

    def test_cannot_accept_invite_when_game_full(
        self,
        create_user,
        create_campaign,
        create_game,
        user_repo,
        game_repo
    ):
        """
        GIVEN: Game has max_players=4 and 4 users already joined
        WHEN: 5th user tries to accept invite
        THEN: Raises ValueError "Game is full"
        """
        # GIVEN: DM
        dm = create_user("dm@example.com")

        # GIVEN: Game with max 4 players
        campaign = create_campaign(host_id=dm.id)
        game = create_game(campaign_id=campaign.id, host_id=dm.id, max_players=4)

        # GIVEN: 4 players already joined
        invite_cmd = InviteUserToGame(game_repo, user_repo)
        accept_cmd = AcceptGameInvite(game_repo, user_repo)

        for i in range(4):
            player = create_user(f"player{i}@example.com")
            invite_cmd.execute(game_id=game.id, user_id=player.id, invited_by=dm.id)
            accept_cmd.execute(game_id=game.id, user_id=player.id)

        # GIVEN: 5th player invited
        player_5 = create_user("player5@example.com")
        invite = InviteUserToGame(game_repo, user_repo)
        invite.execute(game_id=game.id, user_id=player_5.id, invited_by=dm.id)

        # WHEN: 5th player tries to accept
        accept = AcceptGameInvite(game_repo, user_repo)

        # THEN: Raises error
        with pytest.raises(ValueError, match="Game is full"):
            accept.execute(game_id=game.id, user_id=player_5.id)
