# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, Text, Integer, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from uuid import uuid4

from shared.dependencies.db import Base


class Note(Base):
    """
    SQLAlchemy ORM model for the notes table.

    A note is a private, user-authored document scoped to a campaign. Notes are
    never shared, never broadcast, and never enter the game service or the session
    ETL — see .claude/plans/notes/01-in-game-notes.md §2.

    ``campaign_id`` is nullable with ON DELETE SET NULL: deleting a campaign must
    not destroy the notes people wrote for it. ``campaign_name`` is stamped once at
    creation so an orphaned note is still nameable; the UI prefers the live campaign
    name while ``campaign_id`` is set, so renames never go stale.
    """

    __tablename__ = "notes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="SET NULL"), nullable=True)
    campaign_name = Column(Text, nullable=False)

    # NULL means "derive the display title from the first line of content_text".
    title = Column(Text, nullable=True)

    # ProseMirror document JSON, as produced by editor.getJSON().
    content_delta = Column(JSONB, nullable=False)
    # Flat projection of the same document (editor.getText()). Groundwork for a
    # tsvector index if search is ever wanted; nothing reads it today.
    content_text = Column(Text, nullable=False, default="", server_default="")

    # Bumped server-side on every content write. Clients send the rev they loaded;
    # a mismatch is a 409 rather than a silent clobber (two tabs, one note).
    rev = Column(Integer, nullable=False, default=0, server_default="0")

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        Index("idx_notes_user_campaign", "user_id", "campaign_id", "updated_at"),
    )

    def __repr__(self):
        return f"<Note {self.id} user={self.user_id} campaign={self.campaign_id}>"
