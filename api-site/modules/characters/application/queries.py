# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Character reads."""

from dataclasses import dataclass, field
from typing import List, Optional
from uuid import UUID

from shared_contracts.character_config import CharacterConfig, ComponentChange, Reconciliation, diff_configs, reconcile_values

from modules.campaign.repositories.character_config_version_repository import (
    CharacterConfigVersionRepository,
)

from modules.characters.domain.character_aggregate import CharacterAggregate


class GetCharacterById:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, character_id: UUID) -> Optional[CharacterAggregate]:
        return self.repository.get_by_id(character_id)


class GetCharactersByUser:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, user_id: UUID) -> List[CharacterAggregate]:
        return self.repository.get_by_user_id(user_id)


@dataclass
class VersionDrift:
    """How far the campaign has moved on since this character was built."""

    latest_version: Optional[int] = None
    changes: List[ComponentChange] = field(default_factory=list)


class GetCharacterVersionDrift:
    """What has changed in the campaign's character config since this character was built.

    Information for the player and the GM ("built on v6; v7 removed Wits"), never a
    verdict — a character keeps playing on the version it was built against. Empty for a
    keepsake (no table to drift from) and for a character on the latest version.
    """

    def __init__(self, version_repository: CharacterConfigVersionRepository):
        self.version_repository = version_repository

    def execute(self, character: CharacterAggregate) -> VersionDrift:
        if character.session_id is None or character.campaign_id is None:
            return VersionDrift()
        latest = self.version_repository.get_latest(character.campaign_id)
        if latest is None or latest.version <= character.config_snapshot.version:
            return VersionDrift()
        return VersionDrift(
            latest_version=latest.version,
            changes=diff_configs(character.config_snapshot, latest.config),
        )


@dataclass
class UpgradePreview:
    """The move to the campaign's latest version, as the player will see it before
    confirming: the target, what the diff says changed, and the values carried over."""

    latest_version_id: UUID
    latest_version: int
    config: CharacterConfig
    changes: List[ComponentChange]
    reconciliation: Reconciliation


class GetCharacterUpgradePreview:
    """What updating this character to the latest version would mean. None when there is
    nothing newer, or the character is a keepsake."""

    def __init__(self, version_repository: CharacterConfigVersionRepository):
        self.version_repository = version_repository

    def execute(self, character: CharacterAggregate) -> Optional[UpgradePreview]:
        if character.session_id is None or character.campaign_id is None:
            return None
        latest = self.version_repository.get_latest(character.campaign_id)
        if latest is None or latest.version <= character.config_snapshot.version:
            return None
        return UpgradePreview(
            latest_version_id=latest.id,
            latest_version=latest.version,
            config=latest.config,
            changes=diff_configs(character.config_snapshot, latest.config),
            reconciliation=reconcile_values(character.config_snapshot, latest.config, character.values),
        )
