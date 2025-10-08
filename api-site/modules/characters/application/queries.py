# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List, Optional
from uuid import UUID

from modules.characters.repositories.character_repository import CharacterRepository
from modules.characters.domain.character_aggregate import CharacterAggregate


class GetCharactersByUser:
    def __init__(self, repository: CharacterRepository):
        self.repository = repository

    def execute(self, user_id: UUID) -> List[CharacterAggregate]:
        """Get all characters for a user"""
        return self.repository.get_by_user_id(user_id)


class GetCharacterById:
    def __init__(self, repository: CharacterRepository):
        self.repository = repository

    def execute(self, character_id: UUID) -> Optional[CharacterAggregate]:
        """Get character by ID"""
        return self.repository.get_by_id(character_id)
