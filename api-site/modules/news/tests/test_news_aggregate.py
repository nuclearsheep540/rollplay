# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Domain rules for news posts.

Two of these are load-bearing beyond the aggregate. Publishing is a SEAL, not
a timestamp refresh — Home orders by published_at, so if fixing a typo re-dated
a post it would jump back to the top of everyone's dashboard. And banner slots
distinguish "leave alone" from "clear", because the editor saves a title
without restating artwork.

DB-free: the aggregate is pure.
"""

from datetime import datetime

import pytest

from modules.news.domain.news_post_aggregate import NewsPostAggregate, empty_document


def make_post(title="Weather effects arrive", author="The Tavern Keeper"):
    """A fresh draft per call — never a shared module-level object."""
    return NewsPostAggregate.create(title=title, author_name=author)


class TestCreation:
    def test_starts_as_an_unpublished_draft(self):
        post = make_post()

        assert post.published is False
        assert post.published_at is None

    def test_title_is_required(self):
        with pytest.raises(ValueError, match="title"):
            NewsPostAggregate.create(title="   ", author_name="The Tavern Keeper")

    def test_author_name_is_required(self):
        with pytest.raises(ValueError, match="author"):
            NewsPostAggregate.create(title="Weather effects", author_name="")

    def test_title_and_author_are_trimmed(self):
        post = NewsPostAggregate.create(title="  Weather  ", author_name="  Keeper  ")

        assert post.title == "Weather"
        assert post.author_name == "Keeper"

    def test_every_post_gets_its_own_document(self):
        """The empty doc is built per call — a shared nested structure would
        hand every post the same content list, so one post's first edit would
        silently appear in all of them."""
        first = make_post()
        second = make_post()

        assert first.doc is not second.doc
        assert first.doc["content"] is not second.doc["content"]

    def test_empty_document_helper_never_returns_the_same_object(self):
        assert empty_document() is not empty_document()


class TestPublishing:
    def test_publishing_stamps_the_date(self):
        post = make_post()

        post.publish()

        assert post.published is True
        assert isinstance(post.published_at, datetime)

    def test_republishing_keeps_the_original_date(self):
        post = make_post()
        post.publish()
        first_published_at = post.published_at

        post.publish()

        assert post.published_at == first_published_at

    def test_unpublishing_clears_the_date(self):
        post = make_post()
        post.publish()

        post.unpublish()

        assert post.published is False
        assert post.published_at is None


class TestBannerSlots:
    def test_setting_a_slot(self):
        post = make_post()

        post.update_content(banners={"banner_home_top": "news_media/shared_images/top.png"})

        assert post.banner_home_top == "news_media/shared_images/top.png"

    def test_slots_not_mentioned_are_left_alone(self):
        post = make_post()
        post.update_content(banners={"banner_home_top": "news_media/shared_images/top.png"})

        post.update_content(title="A new title")

        assert post.banner_home_top == "news_media/shared_images/top.png"

    def test_an_explicit_none_clears_a_slot(self):
        post = make_post()
        post.update_content(banners={"banner_home_top": "news_media/shared_images/top.png"})

        post.update_content(banners={"banner_home_top": None})

        assert post.banner_home_top is None

    def test_home_and_article_slots_are_independent(self):
        post = make_post()

        post.update_content(banners={
            "banner_home_top": "news_media/shared_images/card.png",
            "banner_article_top": "news_media/shared_images/article.png",
        })

        assert post.banner_home_top == "news_media/shared_images/card.png"
        assert post.banner_article_top == "news_media/shared_images/article.png"

    def test_unknown_slot_is_rejected(self):
        post = make_post()

        with pytest.raises(ValueError, match="Unknown banner slot"):
            post.update_content(banners={"banner_sidebar": "news_media/shared_images/x.png"})


class TestBackupDocument:
    def test_carries_everything_needed_to_rebuild_without_the_database(self):
        post = make_post()
        post.update_content(
            doc={"type": "doc", "content": []},
            banners={"banner_article_top": "news_media/shared_images/a.png"},
        )
        post.publish()

        document = post.to_document()

        assert document["id"] == str(post.id)
        assert document["title"] == post.title
        assert document["author_name"] == post.author_name
        assert document["doc"] == post.doc
        assert document["published"] is True
        assert document["published_at"] is not None
        assert document["banner_article_top"] == "news_media/shared_images/a.png"

    def test_holds_no_signed_urls_or_user_references(self):
        """Stored documents must never contain anything that expires or that
        points at a database row — that is what makes restore-after-wipe work."""
        post = make_post()
        post.update_content(banners={"banner_home_top": "news_media/shared_images/a.png"})

        document = post.to_document()

        assert "https://" not in str(document)
        assert "user_id" not in document
        assert "author_id" not in document

    def test_is_json_serializable(self):
        import json

        post = make_post()
        post.publish()

        assert json.loads(json.dumps(post.to_document()))["title"] == post.title


class TestReplacingAnImageKey:
    """When an image moves between scopes its key changes, and everything
    pointing at it has to follow — banners and document alike.

    The aggregate does this because the aggregate is what knows where an image
    can be referenced from; a command rewriting a document by hand would have
    to know the ProseMirror shape, and would drift the moment a new node type
    could hold one.
    """

    def _document_with(self, key):
        return {
            "type": "doc",
            "content": [
                {"type": "paragraph"},
                {"type": "image", "attrs": {"src": key}},
            ],
        }

    def test_rewrites_a_banner_slot(self):
        post = make_post()
        post.update_content(banners={"banner_home_top": "old/key.png"})

        assert post.replace_image_key("old/key.png", "new/key.png") is True
        assert post.banner_home_top == "new/key.png"

    def test_rewrites_every_slot_holding_the_key(self):
        post = make_post()
        post.update_content(banners={
            "banner_home_top": "old/key.png",
            "banner_article_top": "old/key.png",
        })

        post.replace_image_key("old/key.png", "new/key.png")

        assert post.banner_home_top == "new/key.png"
        assert post.banner_article_top == "new/key.png"

    def test_leaves_other_slots_alone(self):
        post = make_post()
        post.update_content(banners={
            "banner_home_top": "old/key.png",
            "banner_home_bottom": "untouched/key.png",
        })

        post.replace_image_key("old/key.png", "new/key.png")

        assert post.banner_home_bottom == "untouched/key.png"

    def test_rewrites_an_image_inside_the_document(self):
        post = make_post()
        post.update_content(doc=self._document_with("old/key.png"))

        assert post.replace_image_key("old/key.png", "new/key.png") is True
        assert post.uses_image("new/key.png") is True
        assert post.uses_image("old/key.png") is False

    def test_reports_when_nothing_referenced_the_key(self):
        post = make_post()

        assert post.replace_image_key("old/key.png", "new/key.png") is False

    def test_does_not_re_date_the_post(self):
        """updated_at orders the editor index. A relocation is not an edit."""
        post = make_post()
        post.update_content(banners={"banner_home_top": "old/key.png"})
        before = post.updated_at

        post.replace_image_key("old/key.png", "new/key.png")

        assert post.updated_at == before

    def test_does_not_mutate_the_document_it_was_given(self):
        """The document handed in may be the one a session is holding, so
        rewriting it in place would smuggle the change into an unrelated save."""
        original = self._document_with("old/key.png")
        post = make_post()
        post.update_content(doc=original)

        post.replace_image_key("old/key.png", "new/key.png")

        assert original["content"][1]["attrs"]["src"] == "old/key.png"
