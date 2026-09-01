# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

# The empty TipTap document. Built per call rather than shared as a module
# constant: a shared nested structure would hand every new post the same
# `content` list, so one post's first edit would appear in all of them.
def empty_document() -> Dict[str, Any]:
    """A fresh, empty ProseMirror document — a new object every call."""
    return {"type": "doc", "content": [{"type": "paragraph"}]}


def collect_image_keys(node: Any) -> List[str]:
    """
    Every image key referenced inside a ProseMirror document.

    Image nodes hold the S3 KEY in `src` — never a URL — so this reads the
    stored form directly and needs no signing to answer what a document uses.
    """
    keys = []

    if isinstance(node, dict):
        if node.get("type") == "image":
            key = node.get("attrs", {}).get("src")
            if key:
                keys.append(key)
        for child in node.get("content", []) or []:
            keys.extend(collect_image_keys(child))
    elif isinstance(node, list):
        for child in node:
            keys.extend(collect_image_keys(child))

    return keys


def replace_image_keys(node: Any, old_key: str, new_key: str) -> Any:
    """
    A copy of the document with every reference to ``old_key`` pointing at
    ``new_key`` instead.

    The write-side counterpart to collect_image_keys, used when an image moves
    between scopes. Immutable, like every other document operation here: the
    caller's document may be the one held in a session's identity map, and
    rewriting it in place would smuggle the change into an unrelated save.
    """
    if isinstance(node, list):
        return [replace_image_keys(child, old_key, new_key) for child in node]

    if not isinstance(node, dict):
        return node

    rebuilt = dict(node)

    if rebuilt.get("type") == "image" and (rebuilt.get("attrs") or {}).get("src") == old_key:
        rebuilt["attrs"] = {**rebuilt["attrs"], "src": new_key}

    if rebuilt.get("content"):
        rebuilt["content"] = replace_image_keys(rebuilt["content"], old_key, new_key)

    return rebuilt


# Banner slots, keyed by the surface they render on. The editor names these
# exactly, and the API mirrors them, so adding a surface is a one-line change
# here rather than a rename across three layers.
BANNER_SLOTS = (
    "banner_home_top",
    "banner_home_bottom",
    "banner_article_top",
    "banner_article_bottom",
)

MAX_TITLE_LENGTH = 160
MAX_AUTHOR_LENGTH = 80


class NewsPostAggregate:
    """
    News Post Aggregate Root.

    An authored editorial post. Two states only — draft and published — with
    publishing as a one-way seal that stamps ``published_at``; re-publishing an
    already-published post is a no-op rather than a re-dating, so editing a
    typo never moves a post back to the top of Home.

    The aggregate owns no user identity: ``author_name`` is display text.
    """

    def __init__(
        self,
        id: Optional[UUID] = None,
        title: str = "",
        author_name: str = "",
        doc: Optional[Dict[str, Any]] = None,
        banner_home_top: Optional[str] = None,
        banner_home_bottom: Optional[str] = None,
        banner_article_top: Optional[str] = None,
        banner_article_bottom: Optional[str] = None,
        published: bool = False,
        published_at: Optional[datetime] = None,
        created_at: Optional[datetime] = None,
        updated_at: Optional[datetime] = None,
    ):
        self.id = id if id is not None else uuid4()
        self.title = title
        self.author_name = author_name
        self.doc = doc if doc is not None else empty_document()
        self.banner_home_top = banner_home_top
        self.banner_home_bottom = banner_home_bottom
        self.banner_article_top = banner_article_top
        self.banner_article_bottom = banner_article_bottom
        self.published = published
        self.published_at = published_at
        self.created_at = created_at if created_at is not None else datetime.utcnow()
        self.updated_at = updated_at if updated_at is not None else datetime.utcnow()

    @classmethod
    def create(cls, title: str, author_name: str) -> 'NewsPostAggregate':
        """
        Start a new draft.

        Business rules:
        - A title is required, even on a draft — the index lists posts by title
          and an untitled row is unusable.
        - Drafts are never published and carry no published_at.
        """
        cleaned_title = (title or "").strip()
        cleaned_author = (author_name or "").strip()

        if not cleaned_title:
            raise ValueError("A news post needs a title")
        if len(cleaned_title) > MAX_TITLE_LENGTH:
            raise ValueError(f"Title cannot exceed {MAX_TITLE_LENGTH} characters")
        if not cleaned_author:
            raise ValueError("A news post needs an author name")
        if len(cleaned_author) > MAX_AUTHOR_LENGTH:
            raise ValueError(f"Author name cannot exceed {MAX_AUTHOR_LENGTH} characters")

        return cls(title=cleaned_title, author_name=cleaned_author)

    @classmethod
    def from_persistence(
        cls,
        id: UUID,
        title: str,
        author_name: str,
        doc: Dict[str, Any],
        banner_home_top: Optional[str],
        banner_home_bottom: Optional[str],
        banner_article_top: Optional[str],
        banner_article_bottom: Optional[str],
        published: bool,
        published_at: Optional[datetime],
        created_at: datetime,
        updated_at: datetime,
    ) -> 'NewsPostAggregate':
        """Rehydrate from a stored row (or a restored S3 document)."""
        return cls(
            id=id,
            title=title,
            author_name=author_name,
            doc=doc,
            banner_home_top=banner_home_top,
            banner_home_bottom=banner_home_bottom,
            banner_article_top=banner_article_top,
            banner_article_bottom=banner_article_bottom,
            published=published,
            published_at=published_at,
            created_at=created_at,
            updated_at=updated_at,
        )

    def update_content(
        self,
        title: Optional[str] = None,
        author_name: Optional[str] = None,
        doc: Optional[Dict[str, Any]] = None,
        banners: Optional[Dict[str, Optional[str]]] = None,
    ):
        """
        Apply an edit. Every argument is optional so a caller can change one
        thing without restating the rest.

        `banners` maps slot name to S3 key; an explicit None clears that slot,
        which is how REMOVE works in the editor. Slots absent from the dict are
        left alone — clearing and not-mentioning are different intents.
        """
        if title is not None:
            cleaned_title = title.strip()
            if not cleaned_title:
                raise ValueError("A news post needs a title")
            if len(cleaned_title) > MAX_TITLE_LENGTH:
                raise ValueError(f"Title cannot exceed {MAX_TITLE_LENGTH} characters")
            self.title = cleaned_title

        if author_name is not None:
            cleaned_author = author_name.strip()
            if not cleaned_author:
                raise ValueError("A news post needs an author name")
            if len(cleaned_author) > MAX_AUTHOR_LENGTH:
                raise ValueError(f"Author name cannot exceed {MAX_AUTHOR_LENGTH} characters")
            self.author_name = cleaned_author

        if doc is not None:
            self.doc = doc

        if banners is not None:
            for slot, key in banners.items():
                if slot not in BANNER_SLOTS:
                    raise ValueError(f"Unknown banner slot: {slot}")
                setattr(self, slot, key)

        self.updated_at = datetime.utcnow()

    def publish(self):
        """
        Seal the post as published.

        Idempotent: publishing an already-published post keeps its original
        published_at, so a later correction does not re-date it on Home.
        """
        if self.published:
            return

        self.published = True
        self.published_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()

    def unpublish(self):
        """
        Return a published post to draft.

        Clears published_at: an unpublished post has no publication date, and
        keeping a stale one would let it silently reappear dated in the past.
        """
        self.published = False
        self.published_at = None
        self.updated_at = datetime.utcnow()

    def uses_image(self, image_key: str) -> bool:
        """
        Whether this post references an image, as a banner or in its body.

        Asked before an image is deleted: news images have no database row of
        their own, so a post's own references ARE the only record that an image
        is in use. Nothing else can be consulted.
        """
        if image_key in self.banner_keys().values():
            return True

        return image_key in collect_image_keys(self.doc)

    def replace_image_key(self, old_key: str, new_key: str) -> bool:
        """
        Point every reference to an image at its new home.

        Called when an image moves between scopes: the bytes are copied first,
        then this rewrites what points at them, and only then is the original
        deleted — so at no moment does this post reference something that is
        not there.

        Deliberately does NOT touch ``updated_at``. A relocation is not an
        authorial edit, and updated_at orders the editor's index — moving an
        image should not shuffle a draft to the top of the list.

        Returns:
            Whether anything referenced the old key
        """
        changed = False

        for slot in BANNER_SLOTS:
            if getattr(self, slot) == old_key:
                setattr(self, slot, new_key)
                changed = True

        rewritten_doc = replace_image_keys(self.doc, old_key, new_key)
        if rewritten_doc != self.doc:
            self.doc = rewritten_doc
            changed = True

        return changed

    def banner_keys(self) -> Dict[str, Optional[str]]:
        """The four banner slots as a dict, for signing and serialization."""
        keys = {}
        for slot in BANNER_SLOTS:
            keys[slot] = getattr(self, slot)
        return keys

    def to_document(self) -> Dict[str, Any]:
        """
        The complete post as a JSON-serializable document.

        This is what gets written to S3 on every save and read back by the
        restore command — so it must carry everything needed to rebuild the row
        WITHOUT the database: no FKs, no derived fields, no signed URLs (banner
        and image references stay as S3 keys, which never expire).
        """
        document = {
            "id": str(self.id),
            "title": self.title,
            "author_name": self.author_name,
            "doc": self.doc,
            "published": self.published,
            "published_at": self.published_at.isoformat() if self.published_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        document.update(self.banner_keys())
        return document

    def __repr__(self):
        state = "published" if self.published else "draft"
        return f"<NewsPostAggregate {self.id} '{self.title}' ({state})>"
