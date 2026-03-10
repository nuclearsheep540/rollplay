# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, String, Integer
from shared.dependencies.db import Base


class DndClass(Base):
    """Lookup table for D&D 5e character classes. Seeded via migration."""
    __tablename__ = 'dnd_classes'

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(20), unique=True, nullable=False)

    def __repr__(self):
        return f"<DndClass(id={self.id}, name='{self.name}')>"
