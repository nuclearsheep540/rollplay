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

from uuid import UUID, uuid4

import pytest
from botocore.exceptions import ClientError

from modules.news.application.commands import (
    CreateNewsPost,
    DeleteNewsImage,
    ImageInUseError,
    InvalidImageKeyError,
    DeleteNewsPost,
    MarkNewsPostRead,
    MoveNewsImage,
    PublishNewsPost,
    RestoreNewsFromBackup,
    ToggleNewsPostLike,
    UpdateNewsPost,
    SHARED_IMAGE_PREFIX,
    article_document_key,
    article_prefix,
    is_news_image_key,
)
from modules.news.api.endpoints import displayed_like_count
from modules.news.application.queries import GetAllNewsPosts, GetLatestPublishedPost
from modules.news.model.news_post_model import NewsPost
from modules.news.repositories.news_repository import NewsRepository


class FakeS3:
    """Records what would have been written, so tests can assert on the mirror.

    Documents and image objects are held separately because tests assert on the
    mirrored documents by name, but the bucket does not distinguish them — an
    article's folder holds both, which is exactly what the folder delete and
    the listing filters have to cope with. `list_objects` therefore walks both.
    """

    def __init__(self):
        self.documents = {}
        self.blobs = set()
        self.deleted = []

    def put_object_json(self, key, payload):
        self.documents[key] = payload

    def get_object_json(self, key):
        return self.documents[key]

    def put_blob(self, key):
        """Seed a non-document object (an image), as an upload would."""
        self.blobs.add(key)

    def object_exists(self, key):
        return key in self.documents or key in self.blobs

    def copy_object(self, source_key, destination_key):
        if source_key in self.blobs:
            self.blobs.add(destination_key)
        else:
            self.documents[destination_key] = self.documents[source_key]

    def list_objects(self, prefix):
        objects = []
        for key in list(self.documents) + sorted(self.blobs):
            if key.startswith(prefix):
                objects.append({"key": key, "size": 0, "last_modified": None})
        return objects

    def delete_object(self, key):
        self.deleted.append(key)
        self.documents.pop(key, None)
        self.blobs.discard(key)


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

        assert article_document_key(post.id) in s3.documents

    def test_the_mirrored_document_carries_the_content(self, news_repo, s3):
        post = CreateNewsPost(news_repo, s3).execute("Weather effects", "The Tavern Keeper")

        UpdateNewsPost(news_repo, s3).execute(
            post.id,
            doc={"type": "doc", "content": [{"type": "paragraph"}]},
            banners={"banner_home_top": "news_media/shared_images/top.png"},
        )

        document = s3.documents[article_document_key(post.id)]
        assert document["doc"]["type"] == "doc"
        assert document["banner_home_top"] == "news_media/shared_images/top.png"

    def test_publishing_updates_the_mirror(self, news_repo, s3):
        post = CreateNewsPost(news_repo, s3).execute("Weather effects", "The Tavern Keeper")

        PublishNewsPost(news_repo, s3).execute(post.id, published=True)

        assert s3.documents[article_document_key(post.id)]["published"] is True

    def test_a_failing_backup_does_not_fail_the_save(self, news_repo):
        """The user's write already succeeded in PostgreSQL. Failing it after
        the fact because a backup hiccuped would be the worse outcome — the
        next save, or restore-news, reconciles."""
        post = CreateNewsPost(news_repo, FailingS3()).execute("Weather", "Keeper")

        assert news_repo.get_by_id(post.id) is not None

    def test_deleting_removes_the_backup_too(self, news_repo, s3):
        post = CreateNewsPost(news_repo, s3).execute("Weather effects", "The Tavern Keeper")

        DeleteNewsPost(news_repo, s3).execute(post.id)

        assert article_document_key(post.id) in s3.deleted
        assert news_repo.get_by_id(post.id) is None

    def test_deleting_a_post_takes_its_own_images_with_it(self, news_repo, s3):
        """The article's folder IS its private storage, so emptying it can
        only ever remove art nothing else could have been rendering."""
        post = CreateNewsPost(news_repo, s3).execute("Weather effects", "Keeper")
        own_image = f"{article_prefix(post.id)}/hero.png"
        s3.put_blob(own_image)

        DeleteNewsPost(news_repo, s3).execute(post.id)

        assert own_image in s3.deleted

    def test_deleting_a_post_leaves_shared_images_alone(self, news_repo, s3):
        post = CreateNewsPost(news_repo, s3).execute("Weather effects", "Keeper")
        s3.put_blob("news_media/shared_images/mascot.png")

        DeleteNewsPost(news_repo, s3).execute(post.id)

        assert "news_media/shared_images/mascot.png" not in s3.deleted

    def test_deleting_a_post_leaves_another_articles_folder_alone(self, news_repo, s3):
        """The prefix delete must not catch a folder whose id merely starts
        with the same characters."""
        doomed = CreateNewsPost(news_repo, s3).execute("Doomed", "Keeper")
        survivor = CreateNewsPost(news_repo, s3).execute("Survivor", "Keeper")
        survivor_image = f"{article_prefix(survivor.id)}/hero.png"
        s3.put_blob(survivor_image)

        DeleteNewsPost(news_repo, s3).execute(doomed.id)

        assert survivor_image not in s3.deleted


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

    def test_images_are_not_mistaken_for_posts(self, news_repo, s3, db_session):
        """Every kind of object shares the news prefix. Only the documents one
        level deep, in a folder named by an article id, are posts."""
        post = CreateNewsPost(news_repo, s3).execute("Weather effects", "Keeper")
        s3.put_blob("news_media/shared_images/mascot.png")
        s3.put_blob(f"{article_prefix(post.id)}/hero.png")

        db_session.query(NewsPost).delete()
        db_session.commit()

        result = RestoreNewsFromBackup(news_repo, s3).execute()

        assert result["restored"] == 1

    def test_a_pre_folder_document_stays_inert(self, news_repo, s3, db_session):
        """Documents from the flat layout sit at the news root. They are left
        where they are rather than resurrecting posts that were moved on."""
        post = CreateNewsPost(news_repo, s3).execute("Weather effects", "Keeper")
        stale = dict(s3.documents[article_document_key(post.id)])
        stale["id"] = str(uuid4())
        stale["title"] = "An older layout"
        s3.documents[f"news_media/{stale['id']}.json"] = stale

        db_session.query(NewsPost).delete()
        db_session.commit()

        result = RestoreNewsFromBackup(news_repo, s3).execute()

        assert result["restored"] == 1
        assert news_repo.get_by_id(UUID(stale["id"])) is None


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


class TestDeletingImages:
    """News images live only in S3 — no row, no FK, nothing to cascade.

    That makes a post's own references the ONLY record that an image is in
    use, and it makes the check load-bearing: S3 has no undo, so an image
    deleted while a published article still points at it leaves a permanent
    hole in that article.
    """

    def test_an_unused_image_is_deleted(self, news_repo, s3):
        DeleteNewsImage(news_repo, s3).execute('news_media/shared_images/orphan.png')

        assert 'news_media/shared_images/orphan.png' in s3.deleted

    def test_an_image_used_as_a_banner_is_refused(self, news_repo, s3):
        post = CreateNewsPost(news_repo, s3).execute('Weather', 'Keeper')
        UpdateNewsPost(news_repo, s3).execute(
            post.id, banners={'banner_home_top': 'news_media/shared_images/card.png'}
        )

        with pytest.raises(ImageInUseError) as refusal:
            DeleteNewsImage(news_repo, s3).execute('news_media/shared_images/card.png')

        assert refusal.value.post_titles == ['Weather']
        assert 'news_media/shared_images/card.png' not in s3.deleted

    def test_an_image_used_in_the_body_is_refused(self, news_repo, s3):
        post = CreateNewsPost(news_repo, s3).execute('Weather', 'Keeper')
        UpdateNewsPost(news_repo, s3).execute(
            post.id,
            doc={
                'type': 'doc',
                'content': [
                    {'type': 'paragraph'},
                    {'type': 'image', 'attrs': {'src': 'news_media/shared_images/inline.png'}},
                ],
            },
        )

        with pytest.raises(ImageInUseError):
            DeleteNewsImage(news_repo, s3).execute('news_media/shared_images/inline.png')

    def test_the_refusal_names_every_post_using_it(self, news_repo, s3):
        for title in ('First', 'Second'):
            post = CreateNewsPost(news_repo, s3).execute(title, 'Keeper')
            UpdateNewsPost(news_repo, s3).execute(
                post.id, banners={'banner_article_top': 'news_media/shared_images/shared.png'}
            )

        with pytest.raises(ImageInUseError) as refusal:
            DeleteNewsImage(news_repo, s3).execute('news_media/shared_images/shared.png')

        assert sorted(refusal.value.post_titles) == ['First', 'Second']

    def test_an_unused_article_scoped_image_is_deleted(self, news_repo, s3):
        post = CreateNewsPost(news_repo, s3).execute('Weather', 'Keeper')
        key = f'{article_prefix(post.id)}/hero.png'

        DeleteNewsImage(news_repo, s3).execute(key)

        assert key in s3.deleted

    def test_an_article_scoped_image_in_use_is_refused(self, news_repo, s3):
        """The scan runs for private art too. The folder says who SHOULD be
        using an image; only the references say who does."""
        post = CreateNewsPost(news_repo, s3).execute('Weather', 'Keeper')
        key = f'{article_prefix(post.id)}/hero.png'
        UpdateNewsPost(news_repo, s3).execute(post.id, banners={'banner_home_top': key})

        with pytest.raises(ImageInUseError) as refusal:
            DeleteNewsImage(news_repo, s3).execute(key)

        assert refusal.value.post_titles == ['Weather']
        assert key not in s3.deleted

    def test_keys_outside_the_news_image_directory_are_rejected(self, news_repo, s3):
        """This endpoint must never become a lever for deleting other media."""
        with pytest.raises(ValueError):
            DeleteNewsImage(news_repo, s3).execute('map/some-user/private-map.png')

        assert s3.deleted == []

    def test_an_article_document_cannot_be_deleted_as_an_image(self, news_repo, s3):
        """The document shares the folder with the images, so the delete path
        is one keystroke away from destroying the article itself."""
        post = CreateNewsPost(news_repo, s3).execute('Weather', 'Keeper')

        with pytest.raises(ValueError):
            DeleteNewsImage(news_repo, s3).execute(article_document_key(post.id))

        assert s3.deleted == []


class TestNewsImageKeyGuard:
    """What counts as a news image.

    One predicate guards every destructive image operation, so its edges are
    worth stating outright rather than inferring from the commands that use it.
    """

    def test_a_shared_image_is_one(self):
        assert is_news_image_key('news_media/shared_images/mascot.png') is True

    def test_an_article_scoped_image_is_one(self):
        assert is_news_image_key(f'news_media/{uuid4()}/hero.png') is True

    def test_an_article_document_is_not(self):
        assert is_news_image_key(f'news_media/{uuid4()}/article.json') is False

    def test_a_key_outside_the_news_directory_is_not(self):
        assert is_news_image_key('map/some-user/private-map.png') is False

    def test_a_key_loose_at_the_news_root_is_not(self):
        assert is_news_image_key('news_media/stray.png') is False

    def test_a_key_nested_deeper_is_not(self):
        assert is_news_image_key('news_media/shared_images/nested/deep.png') is False

    def test_a_folder_that_is_not_an_article_is_not(self):
        """The UUID parse is what separates an article folder from any other
        name that might appear beside shared_images."""
        assert is_news_image_key('news_media/scratch/hero.png') is False


class TestMovingImagesBetweenScopes:
    """An image is private to one article or shared with all of them, and the
    move is how it changes sides.

    Sharing is always safe — it only widens who may use the image. Claiming is
    the direction with a rule: it is refused while a DIFFERENT article still
    renders the image, because moving it into this article's folder would leave
    that one pointing into a folder it does not own.
    """

    def _document_with(self, key):
        return {
            'type': 'doc',
            'content': [
                {'type': 'paragraph'},
                {'type': 'image', 'attrs': {'src': key}},
            ],
        }

    def test_sharing_moves_the_object(self, news_repo, s3):
        post = CreateNewsPost(news_repo, s3).execute('Weather', 'Keeper')
        key = f'{article_prefix(post.id)}/hero.png'
        s3.put_blob(key)

        new_key = MoveNewsImage(news_repo, s3).execute(key, None)

        assert new_key == f'{SHARED_IMAGE_PREFIX}/hero.png'
        assert s3.object_exists(new_key)
        assert key in s3.deleted

    def test_sharing_rewrites_a_banner_reference(self, news_repo, s3):
        post = CreateNewsPost(news_repo, s3).execute('Weather', 'Keeper')
        key = f'{article_prefix(post.id)}/hero.png'
        s3.put_blob(key)
        UpdateNewsPost(news_repo, s3).execute(post.id, banners={'banner_home_top': key})

        new_key = MoveNewsImage(news_repo, s3).execute(key, None)

        assert news_repo.get_by_id(post.id).banner_home_top == new_key

    def test_sharing_rewrites_a_document_reference(self, news_repo, s3):
        post = CreateNewsPost(news_repo, s3).execute('Weather', 'Keeper')
        key = f'{article_prefix(post.id)}/hero.png'
        s3.put_blob(key)
        UpdateNewsPost(news_repo, s3).execute(post.id, doc=self._document_with(key))

        new_key = MoveNewsImage(news_repo, s3).execute(key, None)

        assert news_repo.get_by_id(post.id).uses_image(new_key) is True
        assert news_repo.get_by_id(post.id).uses_image(key) is False

    def test_every_referencing_post_is_rewritten(self, news_repo, s3):
        """The move follows the references, not the folder. A restored or
        hand-edited document can name any key, so assuming only the owning
        article could point at it would leave the other one broken."""
        owner = CreateNewsPost(news_repo, s3).execute('Owner', 'Keeper')
        stranger = CreateNewsPost(news_repo, s3).execute('Stranger', 'Keeper')
        key = f'{article_prefix(owner.id)}/hero.png'
        s3.put_blob(key)
        UpdateNewsPost(news_repo, s3).execute(owner.id, banners={'banner_home_top': key})
        UpdateNewsPost(news_repo, s3).execute(stranger.id, banners={'banner_home_top': key})

        new_key = MoveNewsImage(news_repo, s3).execute(key, None)

        assert news_repo.get_by_id(stranger.id).banner_home_top == new_key

    def test_the_mirrored_document_follows_the_move(self, news_repo, s3):
        post = CreateNewsPost(news_repo, s3).execute('Weather', 'Keeper')
        key = f'{article_prefix(post.id)}/hero.png'
        s3.put_blob(key)
        UpdateNewsPost(news_repo, s3).execute(post.id, banners={'banner_home_top': key})

        new_key = MoveNewsImage(news_repo, s3).execute(key, None)

        assert s3.documents[article_document_key(post.id)]['banner_home_top'] == new_key

    def test_a_move_does_not_re_date_the_post(self, news_repo, s3):
        """updated_at orders the editor index. Relocating an image is not an
        authorial edit and must not shuffle a draft up the list."""
        post = CreateNewsPost(news_repo, s3).execute('Weather', 'Keeper')
        key = f'{article_prefix(post.id)}/hero.png'
        s3.put_blob(key)
        UpdateNewsPost(news_repo, s3).execute(post.id, banners={'banner_home_top': key})
        before = news_repo.get_by_id(post.id).updated_at

        MoveNewsImage(news_repo, s3).execute(key, None)

        assert news_repo.get_by_id(post.id).updated_at == before

    def test_claiming_an_image_only_this_article_uses(self, news_repo, s3):
        post = CreateNewsPost(news_repo, s3).execute('Weather', 'Keeper')
        key = f'{SHARED_IMAGE_PREFIX}/hero.png'
        s3.put_blob(key)
        UpdateNewsPost(news_repo, s3).execute(post.id, banners={'banner_home_top': key})

        new_key = MoveNewsImage(news_repo, s3).execute(key, post.id)

        assert new_key == f'{article_prefix(post.id)}/hero.png'
        assert news_repo.get_by_id(post.id).banner_home_top == new_key

    def test_claiming_an_image_nothing_references(self, news_repo, s3):
        """A shared image nobody uses has no article to strand, so taking it
        is the natural way to tidy one that only ever suited a single post."""
        post = CreateNewsPost(news_repo, s3).execute('Weather', 'Keeper')
        key = f'{SHARED_IMAGE_PREFIX}/orphan.png'
        s3.put_blob(key)

        new_key = MoveNewsImage(news_repo, s3).execute(key, post.id)

        assert new_key == f'{article_prefix(post.id)}/orphan.png'
        assert key in s3.deleted

    def test_claiming_an_image_another_article_uses_is_refused(self, news_repo, s3):
        """One user is not enough — it has to be THIS user. An image used
        solely by another article is "used in one place" and still must not be
        pulled into a folder that article does not own."""
        claimant = CreateNewsPost(news_repo, s3).execute('Claimant', 'Keeper')
        other = CreateNewsPost(news_repo, s3).execute('Other', 'Keeper')
        key = f'{SHARED_IMAGE_PREFIX}/hero.png'
        s3.put_blob(key)
        UpdateNewsPost(news_repo, s3).execute(other.id, banners={'banner_home_top': key})

        with pytest.raises(ImageInUseError) as refusal:
            MoveNewsImage(news_repo, s3).execute(key, claimant.id)

        assert refusal.value.post_titles == ['Other']
        assert key not in s3.deleted
        assert news_repo.get_by_id(other.id).banner_home_top == key

    def test_a_taken_destination_is_refused(self, news_repo, s3):
        """S3's copy overwrites in silence, so this check is the only thing
        between a move and destroying an unrelated image."""
        post = CreateNewsPost(news_repo, s3).execute('Weather', 'Keeper')
        key = f'{article_prefix(post.id)}/hero.png'
        s3.put_blob(key)
        s3.put_blob(f'{SHARED_IMAGE_PREFIX}/hero.png')

        with pytest.raises(ValueError):
            MoveNewsImage(news_repo, s3).execute(key, None)

        assert s3.object_exists(key)
        assert s3.deleted == []

    def test_a_failed_copy_leaves_everything_where_it_was(self, news_repo, s3):
        """Copy first, then rewrite, then delete — so a copy that never lands
        cannot leave a published article pointing at nothing."""
        post = CreateNewsPost(news_repo, s3).execute('Weather', 'Keeper')
        key = f'{article_prefix(post.id)}/hero.png'
        s3.put_blob(key)
        UpdateNewsPost(news_repo, s3).execute(post.id, banners={'banner_home_top': key})

        def refuse_copy(source_key, destination_key):
            raise ClientError({'Error': {'Code': '500', 'Message': 'boom'}}, 'CopyObject')

        s3.copy_object = refuse_copy

        with pytest.raises(ClientError):
            MoveNewsImage(news_repo, s3).execute(key, None)

        assert s3.object_exists(key)
        assert s3.deleted == []
        assert news_repo.get_by_id(post.id).banner_home_top == key

    def test_an_article_document_cannot_be_moved(self, news_repo, s3):
        post = CreateNewsPost(news_repo, s3).execute('Weather', 'Keeper')

        with pytest.raises(ValueError):
            MoveNewsImage(news_repo, s3).execute(article_document_key(post.id), None)

    def test_moving_into_the_scope_it_is_already_in_is_refused(self, news_repo, s3):
        key = f'{SHARED_IMAGE_PREFIX}/hero.png'
        s3.put_blob(key)

        with pytest.raises(ValueError):
            MoveNewsImage(news_repo, s3).execute(key, None)


class TestRejectingForeignImageReferences:
    """A post may only point at images in the news store.

    Every key a post carries is signed on read and served to every reader, so
    an unchecked one is a way to hand out a signed URL for any object in the
    bucket — which holds users' maps and audio, not just news media. Only
    admins can reach this endpoint, so the guard is against a mistake rather
    than an attack, but the exposure is identical either way.

    It also catches what a browser paste produces: an <img> pasted from a web
    page carries a remote URL, and the editor's key-recovery turns that into a
    plausible key for an object that never existed.
    """

    def _document_with(self, src):
        return {
            'type': 'doc',
            'content': [
                {'type': 'paragraph'},
                {'type': 'image', 'attrs': {'src': src}},
            ],
        }

    def test_a_banner_pointing_at_library_media_is_refused(self, news_repo, s3):
        post = CreateNewsPost(news_repo, s3).execute('Weather', 'Keeper')

        with pytest.raises(InvalidImageKeyError):
            UpdateNewsPost(news_repo, s3).execute(
                post.id, banners={'banner_home_top': 'map/some-user/private-map.png'}
            )

    def test_a_document_pointing_outside_the_news_store_is_refused(self, news_repo, s3):
        post = CreateNewsPost(news_repo, s3).execute('Weather', 'Keeper')

        with pytest.raises(InvalidImageKeyError):
            UpdateNewsPost(news_repo, s3).execute(
                post.id, doc=self._document_with('audio/some-user/private-track.png')
            )

    def test_a_pasted_remote_image_is_refused(self, news_repo, s3):
        """What a paste from a web page leaves behind once the editor has
        recovered a 'key' from the remote URL's path."""
        post = CreateNewsPost(news_repo, s3).execute('Weather', 'Keeper')

        with pytest.raises(InvalidImageKeyError):
            UpdateNewsPost(news_repo, s3).execute(
                post.id, doc=self._document_with('wp-content/uploads/2026/08/dragon.png')
            )

    def test_the_refusal_leaves_the_post_untouched(self, news_repo, s3):
        post = CreateNewsPost(news_repo, s3).execute('Weather', 'Keeper')
        good_key = f'{SHARED_IMAGE_PREFIX}/hero.png'
        UpdateNewsPost(news_repo, s3).execute(post.id, banners={'banner_home_top': good_key})

        with pytest.raises(InvalidImageKeyError):
            UpdateNewsPost(news_repo, s3).execute(
                post.id, banners={'banner_home_top': 'map/some-user/private-map.png'}
            )

        assert news_repo.get_by_id(post.id).banner_home_top == good_key

    def test_an_article_document_is_not_an_image(self, news_repo, s3):
        post = CreateNewsPost(news_repo, s3).execute('Weather', 'Keeper')

        with pytest.raises(InvalidImageKeyError):
            UpdateNewsPost(news_repo, s3).execute(
                post.id, banners={'banner_home_top': article_document_key(post.id)}
            )

    def test_both_scopes_are_accepted(self, news_repo, s3):
        post = CreateNewsPost(news_repo, s3).execute('Weather', 'Keeper')

        saved = UpdateNewsPost(news_repo, s3).execute(
            post.id,
            banners={'banner_home_top': f'{SHARED_IMAGE_PREFIX}/hero.png'},
            doc=self._document_with(f'{article_prefix(post.id)}/inline.png'),
        )

        assert saved.banner_home_top == f'{SHARED_IMAGE_PREFIX}/hero.png'

    def test_clearing_a_banner_is_still_allowed(self, news_repo, s3):
        """None is how REMOVE works in the editor — it must not be mistaken
        for a key that failed validation."""
        post = CreateNewsPost(news_repo, s3).execute('Weather', 'Keeper')
        UpdateNewsPost(news_repo, s3).execute(
            post.id, banners={'banner_home_top': f'{SHARED_IMAGE_PREFIX}/hero.png'}
        )

        saved = UpdateNewsPost(news_repo, s3).execute(post.id, banners={'banner_home_top': None})

        assert saved.banner_home_top is None
