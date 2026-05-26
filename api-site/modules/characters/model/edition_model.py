# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Boolean, Column, Integer, String

from shared.dependencies.db import Base


class Edition(Base):
    """Lookup table for ruleset editions (D&D 2024, future editions).

    The ``code`` column matches the directory name under
    ``modules/characters/seed_data/<code>/`` and is what the
    :class:`shared.rulesets.registry.RulesetRegistry` keys on at startup.
    """
    __tablename__ = "editions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(50), unique=True, nullable=False)
    name = Column(String(100), nullable=False)
    version = Column(String(20), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")

    def __repr__(self):
        return f"<Edition(id={self.id}, code='{self.code}', name='{self.name}')>"
