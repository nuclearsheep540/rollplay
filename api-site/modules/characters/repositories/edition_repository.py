# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Read-only edition lookup. The list is small and rarely changes."""

from typing import List, Optional

from sqlalchemy.orm import Session

from modules.characters.model.edition_model import Edition


class EditionRepository:
    def __init__(self, db_session: Session):
        self.db = db_session

    def list_active(self) -> List[Edition]:
        return (
            self.db.query(Edition)
            .filter(Edition.is_active == True)  # noqa: E712
            .order_by(Edition.id)
            .all()
        )

    def get_by_code(self, code: str) -> Optional[Edition]:
        return self.db.query(Edition).filter(Edition.code == code).first()
