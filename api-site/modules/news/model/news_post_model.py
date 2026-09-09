# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Boolean, Column, DateTime, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func
from uuid import uuid4

from shared.dependencies.db import Base


class NewsPost(Base):
    """
    SQLAlchemy ORM model for the news_posts table.

    An authored editorial post shown on Home. Platform-level content, not user
    content: it has no owner, no campaign, and no library media. The author is a
    plain ``author_name`` string rather than a user FK — posts come from the
    person running the platform, not from an account, and that also keeps the
    S3 restore path clean (see NewsPostAggregate.to_document).

    Banner keys are per-SURFACE: the Home card and the full article can carry
    different art, so a post holds up to four (top/bottom for each). Values are
    S3 object keys under ``news_media/``; URLs are signed at read time, never
    stored, so a stored document never expires.
    """

    __tablename__ = "news_posts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    title = Column(Text, nullable=False)
    author_name = Column(String(80), nullable=False)

    # TipTap/ProseMirror document, as produced by editor.getJSON().
    doc = Column(JSONB, nullable=False)

    banner_home_top = Column(Text, nullable=True)
    banner_home_bottom = Column(Text, nullable=True)
    banner_article_top = Column(Text, nullable=True)
    banner_article_bottom = Column(Text, nullable=True)

    published = Column(Boolean, nullable=False, default=False)
    published_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        # Home asks for "the latest published post" on every dashboard load.
        Index('ix_news_posts_published_published_at', 'published', 'published_at'),
    )
