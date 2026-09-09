# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from shared.dependencies.db import Base


class NewsPostLike(Base):
    """
    One row per (post, user) like. Presence of the row IS the like; unliking
    deletes it, so there is no state to keep consistent.

    The post FK cascades — likes for a deleted post are meaningless. The user
    reference is a plain column with no FK: news survives a database wipe via
    the S3 restore path, and a dangling FK would block re-importing posts whose
    likers no longer exist.
    """

    __tablename__ = "news_post_likes"

    post_id = Column(
        UUID(as_uuid=True),
        ForeignKey("news_posts.id", ondelete="CASCADE"),
        primary_key=True
    )
    user_id = Column(UUID(as_uuid=True), primary_key=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        Index('ix_news_post_likes_user_id', 'user_id'),
    )
