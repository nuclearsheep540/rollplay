# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from shared.dependencies.db import Base


class NewsPostRead(Base):
    """
    Per-user read receipt for a post, written when the article is opened.

    Drives the NEW! flair in Home's UPDATES section header: no receipt for the
    latest published post means the flair shows. Read state lives here rather
    than as a column on ``users`` so the news module owns its own read tracking
    — and so it disappears cleanly with the module if news ever does.

    Same FK asymmetry as likes: cascade on the post, plain column for the user.
    """

    __tablename__ = "news_post_reads"

    post_id = Column(
        UUID(as_uuid=True),
        ForeignKey("news_posts.id", ondelete="CASCADE"),
        primary_key=True
    )
    user_id = Column(UUID(as_uuid=True), primary_key=True)
    read_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        Index('ix_news_post_reads_user_id', 'user_id'),
    )
