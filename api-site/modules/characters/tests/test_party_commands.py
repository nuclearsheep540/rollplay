# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Joining and leaving a party.

Creating a character against a campaign's published config IS joining; ejecting IS leaving.
Neither writes the session — a character's session_id is its membership.

The eject-with-a-running-game path has two deliberate asymmetries, both tested here: the
value read aborts the eject when it fails (losing the night's play is worse than a retry),
while the room notify does not (a stale room is re-read on reconnect).
"""

import uuid
import asyncio
from unittest.mock import AsyncMock

import pytest

from modules.campaign.application.commands import (
    PublishCharacterConfigVersion,
    SaveCharacterConfigDraft,
)
from modules.campaign.repositories.character_config_version_repository import (
    CharacterConfigVersionRepository,
)
from modules.characters.application.commands import CreateCharacter, EjectCharacterFromParty
from shared.services.game_notifier import GameNotifierUnavailable
from shared_contracts.components.hit_points import HitPointsValue, IntHitPointsState


@pytest.fixture
def version_repo(db_session):
    return CharacterConfigVersionRepository(db_session)


@pytest.fixture
def host(create_user):
    return create_user(email="gm@example.com", screen_name="Matt")


@pytest.fixture
def player(create_user):
    return create_user(email="player@example.com", screen_name="Bran")


@pytest.fixture
def campaign(create_campaign, host, seed_default_edition):
    return create_campaign(host_id=host.id, title="Secret to Bear")


@pytest.fixture
def session(create_session, session_repo, campaign, host, player):
    session = create_session(campaign_id=campaign.id, host_id=host.id)
    session.joined_users.extend([host.id, player.id])
    session_repo.save(session)
    return session_repo.get_by_id(session.id)


@pytest.fixture
def published(campaign_repo, version_repo, campaign, host, make_character_config):
    SaveCharacterConfigDraft(campaign_repo, version_repo).execute(
        campaign_id=campaign.id, host_id=host.id, config=make_character_config())
    return PublishCharacterConfigVersion(campaign_repo, version_repo).execute(
        campaign_id=campaign.id, host_id=host.id)


@pytest.fixture
def notifier():
    stub = AsyncMock()
    stub.fetch_player_values.return_value = {}
    return stub


def make_create(character_repo, user_repo, session_repo, campaign_repo, version_repo, game_repo, notifier):
    return CreateCharacter(character_repo, user_repo, session_repo, campaign_repo,
                           version_repo, game_repo, notifier)


class TestJoiningTheParty:
    def test_creating_joins_without_writing_the_session(
            self, character_repo, user_repo, session_repo, campaign_repo, version_repo,
            game_repo, notifier, session, published, player, make_character_values):
        character = asyncio.run(make_create(character_repo, user_repo, session_repo, campaign_repo,
                                      version_repo, game_repo, notifier).execute(
            user_id=player.id, session_id=session.id, values=make_character_values(name="Brannoc Vell")))

        assert character.display_name == "Brannoc Vell"
        assert character.config_version_id == published.id
        assert character.config_snapshot.version == 1
        party = character_repo.get_party_for_session(session.id)
        assert [member.id for member in party] == [character.id]

    def test_a_non_roster_user_is_refused(
            self, character_repo, user_repo, session_repo, campaign_repo, version_repo,
            game_repo, notifier, session, published, create_user, make_character_values):
        outsider = create_user(email="nobody@example.com", screen_name="Nobody")
        with pytest.raises(PermissionError):
            asyncio.run(make_create(character_repo, user_repo, session_repo, campaign_repo,
                                    version_repo, game_repo, notifier).execute(
                user_id=outsider.id, session_id=session.id, values=make_character_values()))

    def test_refused_when_the_campaign_has_published_nothing(
            self, character_repo, user_repo, session_repo, campaign_repo, version_repo,
            game_repo, notifier, session, player, make_character_values):
        with pytest.raises(ValueError, match="no published character config"):
            asyncio.run(make_create(character_repo, user_repo, session_repo, campaign_repo, version_repo, game_repo, notifier).execute( user_id=player.id, session_id=session.id, values=make_character_values()))

    def test_a_second_character_at_one_table_is_refused_by_sentence(
            self, character_repo, user_repo, session_repo, campaign_repo, version_repo,
            game_repo, notifier, session, published, player, make_character_values):
        command = make_create(character_repo, user_repo, session_repo, campaign_repo,
                              version_repo, game_repo, notifier)
        asyncio.run(command.execute(user_id=player.id, session_id=session.id,
                              values=make_character_values(name="First")))
        with pytest.raises(ValueError, match="already have a character at this table"):
            asyncio.run(command.execute(user_id=player.id, session_id=session.id,
                                  values=make_character_values(name="Second")))


class TestLeavingTheParty:
    @pytest.fixture
    def seated(self, create_character, player, campaign, session):
        return create_character(user_id=player.id, name="Brannoc Vell",
                                campaign_id=campaign.id, session_id=session.id)

    def make_eject(self, character_repo, session_repo, campaign_repo, user_repo, game_repo, notifier):
        return EjectCharacterFromParty(character_repo, session_repo, campaign_repo,
                                       user_repo, game_repo, notifier)

    def test_owner_ejects_and_the_character_becomes_a_keepsake(
            self, character_repo, session_repo, campaign_repo, user_repo, game_repo,
            notifier, seated, session, player):
        result = asyncio.run(self.make_eject(character_repo, session_repo, campaign_repo,
                                       user_repo, game_repo, notifier).execute(
            character_id=seated.id, requested_by=player.id))

        assert result.is_keepsake is True
        assert (result.session_id, result.campaign_id, result.config_version_id) == (None, None, None)
        assert result.display_name == "Brannoc Vell"
        assert character_repo.get_party_for_session(session.id) == []

    def test_the_host_may_eject_someone_elses(
            self, character_repo, session_repo, campaign_repo, user_repo, game_repo,
            notifier, seated, host):
        result = asyncio.run(self.make_eject(character_repo, session_repo, campaign_repo,
                                       user_repo, game_repo, notifier).execute(
            character_id=seated.id, requested_by=host.id))
        assert result.is_keepsake is True

    def test_a_third_party_may_not(
            self, character_repo, session_repo, campaign_repo, user_repo, game_repo,
            notifier, seated, create_user):
        stranger = create_user(email="stranger@example.com", screen_name="Stranger")
        with pytest.raises(PermissionError):
            asyncio.run(self.make_eject(character_repo, session_repo, campaign_repo,
                                  user_repo, game_repo, notifier).execute(
                character_id=seated.id, requested_by=stranger.id))

    def test_ejecting_a_keepsake_is_refused(
            self, character_repo, session_repo, campaign_repo, user_repo, game_repo,
            notifier, create_character, player):
        keepsake = create_character(user_id=player.id, name="Already free")
        with pytest.raises(ValueError, match="isn't at a table"):
            asyncio.run(self.make_eject(character_repo, session_repo, campaign_repo, user_repo, game_repo, notifier).execute( character_id=keepsake.id, requested_by=player.id))

    def test_after_ejecting_the_user_may_build_another(
            self, character_repo, user_repo, session_repo, campaign_repo, version_repo,
            game_repo, notifier, seated, session, published, player, make_character_values):
        asyncio.run(self.make_eject(character_repo, session_repo, campaign_repo, user_repo, game_repo, notifier).execute( character_id=seated.id, requested_by=player.id))

        replacement = asyncio.run(make_create(character_repo, user_repo, session_repo, campaign_repo,
                                        version_repo, game_repo, notifier).execute(
            user_id=player.id, session_id=session.id, values=make_character_values(name="New Blood")))
        assert replacement.display_name == "New Blood"


class TestEjectDuringAGame:
    @pytest.fixture
    def seated(self, create_character, player, campaign, session):
        return create_character(user_id=player.id, name="Brannoc Vell",
                                campaign_id=campaign.id, session_id=session.id)

    @pytest.fixture
    def open_game(self, create_game, session, campaign, host):
        from modules.game.domain.game_aggregate import GameStatus
        return create_game(session_id=session.id, campaign_id=campaign.id,
                           host_id=host.id, status=GameStatus.ACTIVE)

    def make_eject(self, character_repo, session_repo, campaign_repo, user_repo, game_repo, notifier):
        return EjectCharacterFromParty(character_repo, session_repo, campaign_repo,
                                       user_repo, game_repo, notifier)

    def test_the_rooms_values_come_home_before_the_unbind(
            self, character_repo, session_repo, campaign_repo, user_repo, game_repo,
            notifier, seated, open_game, player):
        """The whole reason eject reads the room first: End skips players with no
        character, so unbinding before reading discards the night."""
        notifier.fetch_player_values.return_value = {
            "hit_points_1": HitPointsValue(component_id="hit_points_1",
                                           state=IntHitPointsState(current=3))
        }
        result = asyncio.run(self.make_eject(character_repo, session_repo, campaign_repo,
                                       user_repo, game_repo, notifier).execute(
            character_id=seated.id, requested_by=player.id))

        assert result.values["hit_points_1"].state.current == 3
        assert character_repo.get_by_id(seated.id).values["hit_points_1"].state.current == 3
        notifier.fetch_player_values.assert_awaited_once()
        notifier.sync_player.assert_awaited_once()

    def test_an_unreadable_room_aborts_the_whole_eject(
            self, character_repo, session_repo, campaign_repo, user_repo, game_repo,
            notifier, seated, open_game, player, session):
        notifier.fetch_player_values.side_effect = GameNotifierUnavailable("nope")

        with pytest.raises(GameNotifierUnavailable):
            asyncio.run(self.make_eject(character_repo, session_repo, campaign_repo, user_repo, game_repo, notifier).execute( character_id=seated.id, requested_by=player.id))

        # Nothing half-done: still in the party, still bound.
        unchanged = character_repo.get_by_id(seated.id)
        assert unchanged.session_id == session.id
        assert unchanged.is_keepsake is False

    def test_a_failed_notify_does_not_fail_the_eject(
            self, character_repo, session_repo, campaign_repo, user_repo, game_repo,
            notifier, seated, open_game, player):
        notifier.sync_player.side_effect = RuntimeError("room unreachable")

        with pytest.raises(RuntimeError):
            asyncio.run(self.make_eject(character_repo, session_repo, campaign_repo, user_repo, game_repo, notifier).execute( character_id=seated.id, requested_by=player.id))

        # The cold write already stands — the room re-reads on reconnect.
        assert character_repo.get_by_id(seated.id).is_keepsake is True



class TestCreateWithAvatar:
    """The avatar chosen on the create form. Through the real asset repository, because
    characters.avatar_asset_id is a foreign key and the test database enforces it — a fake
    would prove the rule and hide the row."""

    @pytest.fixture
    def asset_repo(self, db_session):
        from modules.library.repositories.asset_repository import MediaAssetRepository
        return MediaAssetRepository(db_session)

    def _image_owned_by(self, asset_repo, owner_id):
        from modules.library.domain.image_asset_aggregate import ImageAsset
        asset = ImageAsset.create(
            user_id=owner_id, filename="portrait.png", s3_key="images/portrait.png",
            content_type="image/png", file_size=1234)
        asset_repo.save(asset)
        return asset

    def test_an_owned_image_becomes_the_avatar(
            self, character_repo, user_repo, session_repo, campaign_repo, version_repo,
            game_repo, notifier, asset_repo, session, published, player, make_character_values):
        asset = self._image_owned_by(asset_repo, player.id)
        character = asyncio.run(CreateCharacter(
            character_repo, user_repo, session_repo, campaign_repo, version_repo,
            game_repo, notifier, asset_repo,
        ).execute(user_id=player.id, session_id=session.id,
                  values=make_character_values(name="Brannoc"), avatar_asset_id=asset.id))
        assert character.avatar_asset_id == asset.id
        assert character_repo.get_by_id(character.id).avatar_asset_id == asset.id

    def test_someone_elses_image_is_refused(
            self, character_repo, user_repo, session_repo, campaign_repo, version_repo,
            game_repo, notifier, asset_repo, session, published, player, host, make_character_values):
        asset = self._image_owned_by(asset_repo, host.id)
        with pytest.raises(ValueError, match="not found in your library"):
            asyncio.run(CreateCharacter(
                character_repo, user_repo, session_repo, campaign_repo, version_repo,
                game_repo, notifier, asset_repo,
            ).execute(user_id=player.id, session_id=session.id,
                      values=make_character_values(name="Brannoc"), avatar_asset_id=asset.id))

    def test_no_avatar_is_still_fine(
            self, character_repo, user_repo, session_repo, campaign_repo, version_repo,
            game_repo, notifier, session, published, player, make_character_values):
        character = asyncio.run(CreateCharacter(
            character_repo, user_repo, session_repo, campaign_repo, version_repo,
            game_repo, notifier, None,
        ).execute(user_id=player.id, session_id=session.id,
                  values=make_character_values(name="Brannoc")))
        assert character.avatar_asset_id is None
