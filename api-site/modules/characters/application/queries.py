# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Character read-side queries."""

from typing import List, Optional
from uuid import UUID

from modules.characters.domain.character_aggregate import CharacterAggregate
from modules.characters.repositories.character_repository import CharacterRepository


class GetCharacterById:
    def __init__(self, repository: CharacterRepository):
        self.repository = repository

    def execute(self, character_id: UUID) -> Optional[CharacterAggregate]:
        return self.repository.get_by_id(character_id)


class GetCharactersByUser:
    def __init__(self, repository: CharacterRepository):
        self.repository = repository

    def execute(self, user_id: UUID) -> List[CharacterAggregate]:
        return self.repository.get_by_user_id(user_id)
