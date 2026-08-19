# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from uuid import UUID

# Cap on notes one user may hold *per campaign* — not per account. This is the unit
# the user experiences, and the frontend shows "n / 100" from the first note so the
# limit is never a surprise at 99.
MAX_NOTES_PER_CAMPAIGN = 100

# Ceiling on a single note's serialised document. Generous for prose (a dense page
# is a few KB); exists so a runaway client cannot write unbounded rows.
MAX_CONTENT_BYTES = 256 * 1024

# Longest derived title we will hand back when the user hasn't named a note.
DERIVED_TITLE_MAX_CHARS = 80

# What an empty ProseMirror document looks like. A doc with no content at all is
# invalid to the editor, so a new note starts with one empty paragraph.
EMPTY_DOCUMENT: Dict[str, Any] = {"type": "doc", "content": [{"type": "paragraph"}]}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class NoteRevisionConflict(ValueError):
    """
    Raised when a write carries a revision that is no longer current.

    Subclasses ValueError so generic handlers still catch it, while the endpoint
    can catch it first and answer 409 rather than 400.
    """


@dataclass
class NoteAggregate:
    """
    One private note, owned by a user and scoped to a campaign.

    Ownership is the whole authorisation story: ``user_id`` is the only thing that
    grants access. Campaign membership is checked when a note is *created* (you may
    only start a notebook for a campaign you are in) and never again — otherwise
    leaving or deleting a campaign would revoke access to your own writing.
    """

    id: Optional[UUID]
    user_id: UUID
    campaign_id: Optional[UUID]
    campaign_name: str
    title: Optional[str]
    content_delta: Dict[str, Any]
    content_text: str
    rev: int
    created_at: datetime
    updated_at: datetime

    @classmethod
    def create(cls, user_id: UUID, campaign_id: UUID, campaign_name: str) -> "NoteAggregate":
        """Start a new, empty note. Titles are derived until the user renames one."""
        if not user_id:
            raise ValueError("user_id is required")
        if not campaign_id:
            raise ValueError("campaign_id is required")
        if not campaign_name or not campaign_name.strip():
            raise ValueError("campaign_name is required")

        now = utc_now()
        return cls(
            id=None,
            user_id=user_id,
            campaign_id=campaign_id,
            campaign_name=campaign_name.strip(),
            title=None,
            content_delta=dict(EMPTY_DOCUMENT),
            content_text="",
            rev=0,
            created_at=now,
            updated_at=now,
        )

    @classmethod
    def from_persistence(
        cls,
        id: UUID,
        user_id: UUID,
        campaign_id: Optional[UUID],
        campaign_name: str,
        title: Optional[str],
        content_delta: Dict[str, Any],
        content_text: str,
        rev: int,
        created_at: datetime,
        updated_at: datetime,
    ) -> "NoteAggregate":
        """Reconstitute a note from the database."""
        return cls(
            id=id,
            user_id=user_id,
            campaign_id=campaign_id,
            campaign_name=campaign_name,
            title=title,
            content_delta=content_delta,
            content_text=content_text,
            rev=rev,
            created_at=created_at,
            updated_at=updated_at,
        )

    @property
    def display_title(self) -> str:
        """
        The title to show. An explicit title wins; otherwise the first non-empty
        line of the note stands in, the way a paper notebook's first line does.
        """
        if self.title and self.title.strip():
            return self.title.strip()

        for line in self.content_text.splitlines():
            stripped = line.strip()
            if stripped:
                if len(stripped) > DERIVED_TITLE_MAX_CHARS:
                    return stripped[:DERIVED_TITLE_MAX_CHARS].rstrip() + "…"
                return stripped

        return "Untitled note"

    def is_owned_by(self, user_id: UUID) -> bool:
        return self.user_id == user_id

    def update_content(
        self, content_delta: Dict[str, Any], content_text: str, expected_rev: int
    ) -> None:
        """
        Replace the note's body and bump the revision.

        ``expected_rev`` is the revision the client had when it started editing. If
        it no longer matches, another tab or device has written since and this save
        would silently destroy that work — so it is refused rather than merged.
        """
        if not isinstance(content_delta, dict):
            raise ValueError("content_delta must be a document object")
        if expected_rev != self.rev:
            raise NoteRevisionConflict(
                f"Note has been edited elsewhere (expected revision {expected_rev}, current is {self.rev})"
            )

        size = len(json.dumps(content_delta).encode("utf-8"))
        if size > MAX_CONTENT_BYTES:
            raise ValueError(
                f"Note is too large ({size} bytes; limit is {MAX_CONTENT_BYTES})"
            )

        self.content_delta = content_delta
        self.content_text = content_text or ""
        self.rev += 1
        self.updated_at = utc_now()

    def rename(self, title: Optional[str]) -> None:
        """
        Set an explicit title, or clear it back to a derived one.

        Passing an empty string is how the UI says "go back to deriving it" — that
        is deliberate, not a validation gap.
        """
        if title is None or not title.strip():
            self.title = None
        else:
            cleaned = title.strip()
            if len(cleaned) > 200:
                raise ValueError("Title cannot exceed 200 characters")
            self.title = cleaned

        self.updated_at = utc_now()

    def orphan(self) -> None:
        """
        Detach from a deleted campaign, keeping the stamped name.

        The database does this itself via ON DELETE SET NULL; this exists so the
        same transition can be expressed (and tested) in the domain.
        """
        self.campaign_id = None
