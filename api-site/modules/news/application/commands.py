# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import logging
from datetime import datetime
from typing import Any, Dict, Optional
from uuid import UUID

from botocore.exceptions import ClientError

from modules.news.domain.news_post_aggregate import NewsPostAggregate
from modules.news.repositories.news_repository import NewsRepository
from shared.services.s3_service import S3Service

logger = logging.getLogger(__name__)

NEWS_LOG_TAG = "NEWS"

# Post documents live at the root of the news directory; images share a
# subdirectory so they can be reused across posts.
NEWS_PREFIX = "news_media"
NEWS_IMAGE_PREFIX = f"{NEWS_PREFIX}/images"


def post_document_key(post_id: UUID) -> str:
    """S3 key for a post's backup document."""
    return f"{NEWS_PREFIX}/{post_id}.json"


def _write_through(post: NewsPostAggregate, s3_service: S3Service) -> None:
    """
    Mirror a saved post to S3.

    PostgreSQL is the runtime source; this copy exists so a dropped database
    (routine in dev) does not destroy authored content — `admin.py restore-news`
    reads these documents back.

    A failure here is logged and swallowed: the user's save already succeeded,
    and failing it afterwards would be a worse outcome than a stale backup that
    the next save (or a restore run) reconciles.
    """
    try:
        s3_service.put_object_json(post_document_key(post.id), post.to_document())
    except ClientError as e:
        logger.error(f"{NEWS_LOG_TAG}: write-through failed for post {post.id}: {e}")


class CreateNewsPost:
    """Start a new draft."""

    def __init__(self, news_repo: NewsRepository, s3_service: S3Service):
        self.news_repo = news_repo
        self.s3_service = s3_service

    def execute(self, title: str, author_name: str) -> NewsPostAggregate:
        post = NewsPostAggregate.create(title=title, author_name=author_name)
        saved = self.news_repo.save(post)
        _write_through(saved, self.s3_service)
        logger.info(f"{NEWS_LOG_TAG}: created draft {saved.id}")
        return saved


class UpdateNewsPost:
    """Apply an edit to an existing post."""

    def __init__(self, news_repo: NewsRepository, s3_service: S3Service):
        self.news_repo = news_repo
        self.s3_service = s3_service

    def execute(
        self,
        post_id: UUID,
        title: Optional[str] = None,
        author_name: Optional[str] = None,
        doc: Optional[Dict[str, Any]] = None,
        banners: Optional[Dict[str, Optional[str]]] = None,
    ) -> NewsPostAggregate:
        post = self.news_repo.get_by_id(post_id)
        if not post:
            raise ValueError(f"News post {post_id} not found")

        post.update_content(title=title, author_name=author_name, doc=doc, banners=banners)
        saved = self.news_repo.save(post)
        _write_through(saved, self.s3_service)
        return saved


class PublishNewsPost:
    """Seal a draft as published, or return a published post to draft."""

    def __init__(self, news_repo: NewsRepository, s3_service: S3Service):
        self.news_repo = news_repo
        self.s3_service = s3_service

    def execute(self, post_id: UUID, published: bool = True) -> NewsPostAggregate:
        post = self.news_repo.get_by_id(post_id)
        if not post:
            raise ValueError(f"News post {post_id} not found")

        if published:
            post.publish()
        else:
            post.unpublish()

        saved = self.news_repo.save(post)
        _write_through(saved, self.s3_service)
        logger.info(f"{NEWS_LOG_TAG}: post {post_id} published={published}")
        return saved


class DeleteNewsPost:
    """Remove a post, its backup document, and (by cascade) its likes and reads."""

    def __init__(self, news_repo: NewsRepository, s3_service: S3Service):
        self.news_repo = news_repo
        self.s3_service = s3_service

    def execute(self, post_id: UUID) -> bool:
        deleted = self.news_repo.delete(post_id)
        if not deleted:
            return False

        # The backup must go too, or a later restore would resurrect the post.
        try:
            self.s3_service.delete_object(post_document_key(post_id))
        except ClientError as e:
            logger.error(f"{NEWS_LOG_TAG}: could not delete backup for {post_id}: {e}")

        logger.info(f"{NEWS_LOG_TAG}: deleted post {post_id}")
        return True


class ToggleNewsPostLike:
    """Add or remove the current user's like."""

    def __init__(self, news_repo: NewsRepository):
        self.news_repo = news_repo

    def execute(self, post_id: UUID, user_id: UUID) -> Dict[str, Any]:
        post = self.news_repo.get_by_id(post_id)
        if not post:
            raise ValueError(f"News post {post_id} not found")

        liked = self.news_repo.toggle_like(post_id, user_id)
        return {"liked": liked, "like_count": self.news_repo.count_likes(post_id)}


class MarkNewsPostRead:
    """Record that the current user opened the article."""

    def __init__(self, news_repo: NewsRepository):
        self.news_repo = news_repo

    def execute(self, post_id: UUID, user_id: UUID) -> None:
        post = self.news_repo.get_by_id(post_id)
        if not post:
            raise ValueError(f"News post {post_id} not found")

        self.news_repo.mark_read(post_id, user_id)


class RestoreNewsFromBackup:
    """
    Rebuild the news tables from the S3 documents.

    The other half of the write-through: run after a database wipe to bring
    authored posts back. Likes and read receipts are NOT restored — they
    reference users who no longer exist after a wipe, and inventing them would
    be worse than losing them.
    """

    def __init__(self, news_repo: NewsRepository, s3_service: S3Service):
        self.news_repo = news_repo
        self.s3_service = s3_service

    def execute(self) -> Dict[str, int]:
        objects = self.s3_service.list_objects(f"{NEWS_PREFIX}/")

        restored = 0
        skipped = 0
        for item in objects:
            key = item["key"]
            # Images live under news_media/images/; only root .json files are posts.
            if not key.endswith(".json") or key.startswith(f"{NEWS_IMAGE_PREFIX}/"):
                continue

            document = self.s3_service.get_object_json(key)
            post = _document_to_aggregate(document)

            if self.news_repo.get_by_id(post.id):
                skipped += 1
                continue

            self.news_repo.save(post)
            restored += 1

        logger.info(f"{NEWS_LOG_TAG}: restore complete — {restored} restored, {skipped} already present")
        return {"restored": restored, "skipped": skipped}


def _document_to_aggregate(document: Dict[str, Any]) -> NewsPostAggregate:
    """Rebuild an aggregate from the S3 backup shape written by to_document()."""
    def parse_timestamp(value):
        return datetime.fromisoformat(value) if value else None

    return NewsPostAggregate.from_persistence(
        id=UUID(document["id"]),
        title=document["title"],
        author_name=document["author_name"],
        doc=document["doc"],
        banner_home_top=document.get("banner_home_top"),
        banner_home_bottom=document.get("banner_home_bottom"),
        banner_article_top=document.get("banner_article_top"),
        banner_article_bottom=document.get("banner_article_bottom"),
        published=document["published"],
        published_at=parse_timestamp(document.get("published_at")),
        created_at=parse_timestamp(document.get("created_at")),
        updated_at=parse_timestamp(document.get("updated_at")),
    )
