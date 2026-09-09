# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import logging
from typing import Dict, List, Optional, Set
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from modules.news.domain.news_post_aggregate import NewsPostAggregate
from modules.news.model.news_post_like_model import NewsPostLike
from modules.news.model.news_post_model import NewsPost
from modules.news.model.news_post_read_model import NewsPostRead

logger = logging.getLogger(__name__)


class NewsRepository:
    """Persistence for news posts, likes and read receipts."""

    def __init__(self, db_session: Session):
        self.db = db_session

    def get_by_id(self, post_id: UUID) -> Optional[NewsPostAggregate]:
        model = self.db.query(NewsPost).filter(NewsPost.id == post_id).first()
        return self._model_to_aggregate(model) if model else None

    def get_latest_published(self) -> Optional[NewsPostAggregate]:
        """The single post Home shows. Never a feed — one card, dated."""
        model = (
            self.db.query(NewsPost)
            .filter(NewsPost.published.is_(True))
            .order_by(NewsPost.published_at.desc())
            .first()
        )
        return self._model_to_aggregate(model) if model else None

    def get_all(self) -> List[NewsPostAggregate]:
        """
        Every post for the editor index — drafts first (they are the work in
        progress), then published newest-first.
        """
        models = (
            self.db.query(NewsPost)
            .order_by(
                NewsPost.published.asc(),
                NewsPost.published_at.desc().nullslast(),
                NewsPost.updated_at.desc(),
            )
            .all()
        )
        return [self._model_to_aggregate(model) for model in models]

    def save(self, aggregate: NewsPostAggregate) -> NewsPostAggregate:
        model = self.db.query(NewsPost).filter(NewsPost.id == aggregate.id).first()

        if model is None:
            model = NewsPost(id=aggregate.id)
            self.db.add(model)

        model.title = aggregate.title
        model.author_name = aggregate.author_name
        model.doc = aggregate.doc
        model.banner_home_top = aggregate.banner_home_top
        model.banner_home_bottom = aggregate.banner_home_bottom
        model.banner_article_top = aggregate.banner_article_top
        model.banner_article_bottom = aggregate.banner_article_bottom
        model.published = aggregate.published
        model.published_at = aggregate.published_at
        model.created_at = aggregate.created_at
        model.updated_at = aggregate.updated_at

        self.db.commit()
        self.db.refresh(model)
        return self._model_to_aggregate(model)

    def delete(self, post_id: UUID) -> bool:
        model = self.db.query(NewsPost).filter(NewsPost.id == post_id).first()
        if not model:
            return False

        # Likes and reads cascade in the database (ON DELETE CASCADE).
        self.db.delete(model)
        self.db.commit()
        return True

    # ── Likes ────────────────────────────────────────────────────────────

    def count_likes(self, post_id: UUID) -> int:
        return (
            self.db.query(func.count(NewsPostLike.user_id))
            .filter(NewsPostLike.post_id == post_id)
            .scalar()
        ) or 0

    def has_liked(self, post_id: UUID, user_id: UUID) -> bool:
        return self.db.query(
            self.db.query(NewsPostLike)
            .filter(NewsPostLike.post_id == post_id, NewsPostLike.user_id == user_id)
            .exists()
        ).scalar()

    def toggle_like(self, post_id: UUID, user_id: UUID) -> bool:
        """
        Add or remove this user's like.

        Returns:
            True if the post is now liked by the user, False if the like was removed.
        """
        existing = (
            self.db.query(NewsPostLike)
            .filter(NewsPostLike.post_id == post_id, NewsPostLike.user_id == user_id)
            .first()
        )

        if existing:
            self.db.delete(existing)
            self.db.commit()
            return False

        self.db.add(NewsPostLike(post_id=post_id, user_id=user_id))
        self.db.commit()
        return True

    # ── Read receipts ────────────────────────────────────────────────────

    def has_read(self, post_id: UUID, user_id: UUID) -> bool:
        return self.db.query(
            self.db.query(NewsPostRead)
            .filter(NewsPostRead.post_id == post_id, NewsPostRead.user_id == user_id)
            .exists()
        ).scalar()

    def mark_read(self, post_id: UUID, user_id: UUID) -> None:
        """
        Record that this user has opened the post.

        Idempotent: opening an article twice is normal, and the receipt records
        THAT it was read, not how often.
        """
        if self.has_read(post_id, user_id):
            return

        self.db.add(NewsPostRead(post_id=post_id, user_id=user_id))
        self.db.commit()

    def _model_to_aggregate(self, model: NewsPost) -> NewsPostAggregate:
        return NewsPostAggregate.from_persistence(
            id=model.id,
            title=model.title,
            author_name=model.author_name,
            doc=model.doc,
            banner_home_top=model.banner_home_top,
            banner_home_bottom=model.banner_home_bottom,
            banner_article_top=model.banner_article_top,
            banner_article_bottom=model.banner_article_bottom,
            published=model.published,
            published_at=model.published_at,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )
