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

NEWS_PREFIX = "news_media"

# Images an author chose to make reusable. Anything here may be referenced by
# any article — which is exactly why deleting one is never a local act.
SHARED_IMAGE_FOLDER = "shared_images"
SHARED_IMAGE_PREFIX = f"{NEWS_PREFIX}/{SHARED_IMAGE_FOLDER}"

# The document's name inside an article's own folder. The id is carried by the
# folder, and the restore path reads it from the document body regardless — so
# this name exists for whoever is reading the bucket, not for the code.
ARTICLE_DOCUMENT_FILENAME = "article.json"


def article_prefix(post_id: UUID) -> str:
    """An article's own folder: its document, and the images only it uses."""
    return f"{NEWS_PREFIX}/{post_id}"


def article_document_key(post_id: UUID) -> str:
    """S3 key for an article's backup document."""
    return f"{article_prefix(post_id)}/{ARTICLE_DOCUMENT_FILENAME}"


def image_prefix(post_id: Optional[UUID]) -> str:
    """
    Where an uploaded image belongs.

    The scope is chosen at upload and recorded nowhere but the key itself:
    an article's folder for art only that article uses, the shared directory
    for art meant to be reused. Nothing in PostgreSQL distinguishes them.
    """
    return article_prefix(post_id) if post_id else SHARED_IMAGE_PREFIX


def _news_key_segments(key: str):
    """The three parts of a well-formed news key, or None if it is not one."""
    segments = key.split("/")
    if len(segments) != 3:
        return None

    root, folder, filename = segments
    if root != NEWS_PREFIX or not folder or not filename:
        return None

    return root, folder, filename


def is_news_image_key(key: str) -> bool:
    """
    Whether a key names an image this module owns.

    The guard on every destructive image operation. Without it these endpoints
    would be a lever for deleting library media, another module's objects, or —
    the case that motivated it — an article's own document, which shares the
    folder with the images it uses.

    Accepted:
    - ``news_media/shared_images/{filename}``
    - ``news_media/{article_id}/{filename}`` — one level inside an article
      folder, with a parseable UUID naming it. That UUID parse is what
      separates an article folder from the shared one, so a folder named to
      look like the other can never be mistaken for it.

    Everything else is rejected: the article document, anything outside
    ``news_media/``, anything loose at its root, anything nested deeper.
    """
    parts = _news_key_segments(key)
    if parts is None:
        return False

    _root, folder, filename = parts

    if filename == ARTICLE_DOCUMENT_FILENAME:
        return False

    if folder == SHARED_IMAGE_FOLDER:
        return True

    try:
        UUID(folder)
    except ValueError:
        return False

    return True


def is_article_document_key(key: str) -> bool:
    """
    Whether a key names an article's backup document.

    Articles live one level deep in their own folder, so this is what the
    restore walk selects on. A stray root-level ``{id}.json`` from the
    pre-folder layout fails here, which is deliberate: old documents go inert
    rather than resurrecting as posts.
    """
    parts = _news_key_segments(key)
    if parts is None:
        return False

    _root, folder, filename = parts

    if filename != ARTICLE_DOCUMENT_FILENAME:
        return False

    try:
        UUID(folder)
    except ValueError:
        return False

    return True


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
        s3_service.put_object_json(article_document_key(post.id), post.to_document())
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
    """Remove a post, its whole S3 folder, and (by cascade) its likes and reads."""

    def __init__(self, news_repo: NewsRepository, s3_service: S3Service):
        self.news_repo = news_repo
        self.s3_service = s3_service

    def execute(self, post_id: UUID) -> bool:
        deleted = self.news_repo.delete(post_id)
        if not deleted:
            return False

        # The whole folder goes: the document (or a later restore would
        # resurrect the post) and the images only this article uses. That is
        # safe by construction — shared images are not in this folder, so
        # nothing another article renders can be caught by it.
        self._delete_folder(post_id)

        logger.info(f"{NEWS_LOG_TAG}: deleted post {post_id}")
        return True

    def _delete_folder(self, post_id: UUID) -> None:
        """
        Empty the article's folder, key by key.

        Failures are logged and swallowed — the post is already gone from
        PostgreSQL, and failing the caller afterwards would report a deletion
        that did happen as one that did not. Each failed key is named
        individually: what it leaves behind is an object nothing will ever
        reference again, and this log is the only record of which.
        """
        try:
            objects = self.s3_service.list_objects(f"{article_prefix(post_id)}/")
        except ClientError as e:
            logger.error(f"{NEWS_LOG_TAG}: could not list folder for {post_id}: {e}")
            return

        for item in objects:
            try:
                self.s3_service.delete_object(item["key"])
            except ClientError as e:
                logger.error(f"{NEWS_LOG_TAG}: could not delete {item['key']}: {e}")


class ImageInUseError(Exception):
    """An image cannot be deleted because posts still reference it."""

    def __init__(self, post_titles):
        self.post_titles = post_titles
        super().__init__(f"Image is used by {len(post_titles)} post(s)")


class DeleteNewsImage:
    """
    Remove a news image, in either scope.

    News images have no database row — they exist only in S3, deliberately
    outside the asset library — so a post's own references are the only record
    that an image is in use. Those are checked BEFORE the delete: S3 has no
    undo, and an image removed while a published article still points at it
    leaves a permanent hole in that article.

    The scan runs for article-scoped images too, rather than trusting the
    folder to prove exclusivity. A restored or hand-edited document can name
    any key it likes, and the scan is correct under any input — where an
    assumption about the folder would be correct only while the editor is the
    only thing that ever writes.

    The order is therefore: verify nothing uses it, then delete the object.
    There is no metadata row to clean up afterwards.
    """

    def __init__(self, news_repo: NewsRepository, s3_service: S3Service):
        self.news_repo = news_repo
        self.s3_service = s3_service

    def execute(self, image_key: str) -> None:
        """
        Args:
            image_key: The S3 key to remove

        Raises:
            ValueError: If the key does not name a news image — this endpoint
                must never be a lever for deleting other media, and least of
                all an article's own document (see is_news_image_key).
            ImageInUseError: If any post still references the image.
            ClientError: If S3 refuses the delete. Deliberately unhandled: the
                caller must not report a deletion that did not happen.
        """
        if not is_news_image_key(image_key):
            raise ValueError("Only news images can be deleted here")

        users = []
        for post in self.news_repo.get_all():
            if post.uses_image(image_key):
                users.append(post.title)

        if users:
            raise ImageInUseError(users)

        self.s3_service.delete_object(image_key)
        logger.info(f"{NEWS_LOG_TAG}: deleted image {image_key}")


class MoveNewsImage:
    """
    Move an image between the shared directory and an article's own folder.

    Promoting (article → shared) always proceeds: it widens who may use the
    image and breaks nothing. Claiming (shared → article X) is refused while a
    DIFFERENT article still renders it — the count of users is not the test,
    the identity is. An image used solely by article Y is "used in one place",
    but moving it into X's folder while Y renders it just relocates the
    problem. An image nothing references may be claimed freely.

    The order of operations is a choice about which failure to have. S3 offers
    no atomic move, so this copies, rewrites every reference, then deletes the
    original. A crash between the copy and the delete leaves a duplicate
    object, which is litter; deleting first would leave a published article
    pointing at nothing, which is a hole on a page readers can see.
    """

    def __init__(self, news_repo: NewsRepository, s3_service: S3Service):
        self.news_repo = news_repo
        self.s3_service = s3_service

    def execute(self, image_key: str, target_post_id: Optional[UUID]) -> str:
        """
        Args:
            image_key: The image to move
            target_post_id: The article claiming it, or None to share it

        Returns:
            The image's new key

        Raises:
            ValueError: If the key does not name a news image, if it is already
                in the target scope, or if the destination is taken.
            ImageInUseError: If a claim would strand another article.
            ClientError: If S3 refuses the copy. Deliberately unhandled — no
                reference may be rewritten to point at bytes that never landed.
        """
        if not is_news_image_key(image_key):
            raise ValueError("Only news images can be moved")

        destination_prefix = image_prefix(target_post_id)
        if image_key.startswith(f"{destination_prefix}/"):
            raise ValueError("This image is already in that scope")

        users = []
        for post in self.news_repo.get_all():
            if post.uses_image(image_key):
                users.append(post)

        if target_post_id is not None:
            strangers = []
            for post in users:
                if post.id != target_post_id:
                    strangers.append(post.title)

            if strangers:
                raise ImageInUseError(strangers)

        # S3's copy overwrites in silence, so the check is ours to make: a move
        # must never destroy an image that happens to share a filename.
        new_key = f"{destination_prefix}/{image_key.split('/')[-1]}"
        if self.s3_service.object_exists(new_key):
            raise ValueError("An image of that name is already in the target scope")

        self.s3_service.copy_object(image_key, new_key)

        for post in users:
            post.replace_image_key(image_key, new_key)
            saved = self.news_repo.save(post)
            _write_through(saved, self.s3_service)

        self.s3_service.delete_object(image_key)
        logger.info(f"{NEWS_LOG_TAG}: moved image {image_key} -> {new_key}")

        return new_key


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
            # Every kind of object shares this prefix — shared images, article
            # images, and the documents. Only the last are posts.
            if not is_article_document_key(key):
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
