# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Command and repository behaviour for news.

The theme is the WRITE-THROUGH: PostgreSQL serves reads, but every save also
mirrors a complete document to S3, and that copy is what survives a dropped
database. Two properties matter — the mirror must carry the whole post, and a
failing mirror must never fail the user's save.

Each test builds its own repository over the function-scoped db_session and
its own fake S3, so nothing observes another test's writes.
"""

from uuid import uuid4

import pytest
from botocore.exceptions import ClientError

from modules.news.application.commands import (
    CreateNewsPost,
    DeleteNewsPost,
    MarkNewsPostRead,
    PublishNewsPost,
    RestoreNewsFromBackup,
    ToggleNewsPostLike,
    UpdateNewsPost,
    post_document_key,
)
from modules.news.api.endpoints import displayed_like_count
from modules.news.application.queries import GetAllNewsPosts, GetLatestPublishedPost
from modules.news.model.news_post_model import NewsPost
from modules.news.repositories.news_repository import NewsRepository


class FakeS3:
    """Records what would have been written, so tests can assert on the mirror."""

    def __init__(self):
        self.documents = {}
        self.deleted = []

    def put_object_json(self, key, payload):
        self.documents[key] = payload

    def get_object_json(self, key):
        return self.documents[key]

    def list_objects(self, prefix):
        objects = []
        for key in self.documents:
            if key.startswith(prefix):
                objects.append({"key": key, "size": 0, "last_modified": None})
        return objects

    def delete_object(self, key):
        self.deleted.append(key)
        self.documents.pop(key, None)


class FailingS3(FakeS3):
    """An S3 that refuses writes — the backup is down, the app is not."""

    def put_object_json(self, key, payload):
        raise ClientError({"Error": {"Code": "500", "Message": "boom"}}, "PutObject")


@pytest.fixture
def news_repo(db_session):
    return NewsRepository(db_session)


@pytest.fixture
def s3():
    return FakeS3()


class TestWriteThrough:
    def test_creating_a_post_mirrors_it_to_s3(self, news_repo, s3):
        post = CreateNewsPost(news_repo, s3).execute("Weather effects", "The Tavern Keeper")

        assert post_document_key(post.id) in s3.documents

    def test_the_mirrored_document_carries_the_content(self, news_repo, s3):
        post = CreateNewsPost(news_repo, s3).execute("Weather effects", "The Tavern Keeper")

        UpdateNewsPost(news_repo, s3).execute(
            post.id,
            doc={"type": "doc", "content": [{"type": "paragraph"}]},
            banners={"banner_home_top": "news_media/images/top.png"},
        )

        document = s3.documents[post_document_key(post.id)]
        assert document["doc"]["type"] == "doc"
        assert document["banner_home_top"] == "news_media/images/top.png"

    def test_publishing_updates_the_mirror(self, news_repo, s3):
        post = CreateNewsPost(news_repo, s3).execute("Weather effects", "The Tavern Keeper")

        PublishNewsPost(news_repo, s3).execute(post.id, published=True)

        assert s3.documents[post_document_key(post.id)]["published"] is True

    def test_a_failing_backup_does_not_fail_the_save(self, news_repo):
        """The user's write already succeeded in PostgreSQL. Failing it after
        the fact because a backup hiccuped would be the worse outcome — the
        next save, or restore-news, reconciles."""
        post = CreateNewsPost(news_repo, FailingS3()).execute("Weather", "Keeper")

        assert news_repo.get_by_id(post.id) is not None

    def test_deleting_removes_the_backup_too(self, news_repo, s3):
        post = CreateNewsPost(news_repo, s3).execute("Weather effects", "The Tavern Keeper")

        DeleteNewsPost(news_repo, s3).execute(post.id)

        assert post_document_key(post.id) in s3.deleted
        assert news_repo.get_by_id(post.id) is None


class TestHomeQuery:
    def test_only_published_posts_reach_home(self, news_repo, s3):
        CreateNewsPost(news_repo, s3).execute("A draft", "Keeper")

        assert GetLatestPublishedPost(news_repo).execute() is None

    def test_home_shows_the_most_recently_published(self, news_repo, s3):
        older = CreateNewsPost(news_repo, s3).execute("Older news", "Keeper")
        newer = CreateNewsPost(news_repo, s3).execute("Newer news", "Keeper")
        PublishNewsPost(news_repo, s3).execute(older.id)
        PublishNewsPost(news_repo, s3).execute(newer.id)

        latest = GetLatestPublishedPost(news_repo).execute()

        assert latest.id == newer.id

    def test_the_index_lists_drafts_before_published_posts(self, news_repo, s3):
        published = CreateNewsPost(news_repo, s3).execute("Published", "Keeper")
        PublishNewsPost(news_repo, s3).execute(published.id)
        CreateNewsPost(news_repo, s3).execute("Draft", "Keeper")

        posts = GetAllNewsPosts(news_repo).execute()

        assert posts[0].title == "Draft"


class TestLikes:
    def test_liking_then_unliking_returns_to_zero(self, news_repo, s3):
        post = CreateNewsPost(news_repo, s3).execute("Weather effects", "Keeper")
        user_id = uuid4()
        command = ToggleNewsPostLike(news_repo)

        liked = command.execute(post.id, user_id)
        assert liked == {"liked": True, "like_count": 1}

        unliked = command.execute(post.id, user_id)
        assert unliked == {"liked": False, "like_count": 0}

    def test_likes_are_per_user(self, news_repo, s3):
        post = CreateNewsPost(news_repo, s3).execute("Weather effects", "Keeper")
        command = ToggleNewsPostLike(news_repo)

        command.execute(post.id, uuid4())
        result = command.execute(post.id, uuid4())

        assert result["like_count"] == 2

    def test_liking_a_missing_post_is_an_error(self, news_repo):
        with pytest.raises(ValueError):
            ToggleNewsPostLike(news_repo).execute(uuid4(), uuid4())


class TestReadReceipts:
    def test_a_new_post_is_unread(self, news_repo, s3):
        post = CreateNewsPost(news_repo, s3).execute("Weather effects", "Keeper")

        assert news_repo.has_read(post.id, uuid4()) is False

    def test_opening_the_article_records_the_receipt(self, news_repo, s3):
        post = CreateNewsPost(news_repo, s3).execute("Weather effects", "Keeper")
        user_id = uuid4()

        MarkNewsPostRead(news_repo).execute(post.id, user_id)

        assert news_repo.has_read(post.id, user_id) is True

    def test_reading_twice_is_harmless(self, news_repo, s3):
        """Opening an article again is normal — the receipt records THAT it was
        read, so a second write must not collide on the composite key."""
        post = CreateNewsPost(news_repo, s3).execute("Weather effects", "Keeper")
        user_id = uuid4()
        command = MarkNewsPostRead(news_repo)

        command.execute(post.id, user_id)
        command.execute(post.id, user_id)

        assert news_repo.has_read(post.id, user_id) is True

    def test_receipts_are_per_user(self, news_repo, s3):
        post = CreateNewsPost(news_repo, s3).execute("Weather effects", "Keeper")
        reader = uuid4()
        MarkNewsPostRead(news_repo).execute(post.id, reader)

        assert news_repo.has_read(post.id, uuid4()) is False


class TestRestore:
    def test_restores_posts_the_database_has_lost(self, news_repo, s3, db_session):
        post = CreateNewsPost(news_repo, s3).execute("Weather effects", "Keeper")
        PublishNewsPost(news_repo, s3).execute(post.id)
        original_title = news_repo.get_by_id(post.id).title

        # Simulate the wipe: the row goes, the S3 document stays.
        db_session.query(NewsPost).delete()
        db_session.commit()

        result = RestoreNewsFromBackup(news_repo, s3).execute()

        assert result["restored"] == 1
        assert news_repo.get_by_id(post.id).title == original_title

    def test_is_safe_to_rerun(self, news_repo, s3):
        post = CreateNewsPost(news_repo, s3).execute("Weather effects", "Keeper")

        result = RestoreNewsFromBackup(news_repo, s3).execute()

        assert result == {"restored": 0, "skipped": 1}
        assert news_repo.get_by_id(post.id) is not None


class TestDisplayedLikeCount:
    """A post is never shown with zero likes.

    The floor is presentation, not data: the tables still record exactly the
    likes people gave, so `toggle_like` returning 0 is correct and this is the
    only place the offset is applied. Keeping it at the boundary is what lets
    the command tests above assert real counts.
    """

    def test_a_post_nobody_liked_still_shows_one(self):
        assert displayed_like_count(0) == 1

    def test_each_real_like_moves_the_number_by_one(self):
        assert displayed_like_count(1) == 2
        assert displayed_like_count(2) == 3

    def test_the_offset_never_hides_a_like(self):
        """Adding a like must always change what the reader sees — a floor
        implemented as max(1, n) would leave the first like invisible."""
        for actual in range(0, 5):
            assert displayed_like_count(actual + 1) == displayed_like_count(actual) + 1
