# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Unit tests for NoteAggregate — the rules that keep a note honest.

DB-free: the aggregate is pure. The interesting behaviour is the derived title
(what the picker shows when a user never named a note) and the revision guard
(the thing standing between two open tabs and silent data loss).
"""

from uuid import uuid4

import pytest

from modules.notes.domain.note_aggregate import (
    MAX_CONTENT_BYTES,
    NoteAggregate,
    NoteRevisionConflict,
)


def make_note(**overrides) -> NoteAggregate:
    note = NoteAggregate.create(
        user_id=overrides.pop("user_id", uuid4()),
        campaign_id=overrides.pop("campaign_id", uuid4()),
        campaign_name=overrides.pop("campaign_name", "Curse of Strahd"),
    )
    for field, value in overrides.items():
        setattr(note, field, value)
    return note


def document(text: str) -> dict:
    return {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}]}


class TestCreate:
    def test_starts_empty_and_unnamed(self):
        note = make_note()
        assert note.title is None
        assert note.content_text == ""
        assert note.rev == 0
        # An editor cannot render a doc with no content, so a new note carries one
        # empty paragraph rather than an empty node list.
        assert note.content_delta == {"type": "doc", "content": [{"type": "paragraph"}]}

    def test_requires_a_campaign_name_to_stamp(self):
        with pytest.raises(ValueError, match="campaign_name"):
            NoteAggregate.create(user_id=uuid4(), campaign_id=uuid4(), campaign_name="   ")

    def test_requires_a_campaign(self):
        with pytest.raises(ValueError, match="campaign_id"):
            NoteAggregate.create(user_id=uuid4(), campaign_id=None, campaign_name="Strahd")


class TestDisplayTitle:
    def test_explicit_title_wins(self):
        note = make_note(title="Session prep", content_text="something else entirely")
        assert note.display_title == "Session prep"

    def test_falls_back_to_first_non_empty_line(self):
        note = make_note(content_text="\n\n  The party met Meepo\nwho was upset")
        assert note.display_title == "The party met Meepo"

    def test_empty_note_reads_as_untitled(self):
        assert make_note(content_text="   \n\n  ").display_title == "Untitled note"

    def test_long_first_line_is_truncated_with_an_ellipsis(self):
        note = make_note(content_text="x" * 200)
        assert len(note.display_title) == 81  # 80 chars + the ellipsis
        assert note.display_title.endswith("…")


class TestUpdateContent:
    def test_bumps_the_revision(self):
        note = make_note()
        note.update_content(document("hello"), "hello", expected_rev=0)
        assert note.rev == 1
        assert note.content_text == "hello"

    def test_stale_revision_is_refused_rather_than_merged(self):
        note = make_note()
        note.update_content(document("first"), "first", expected_rev=0)

        # A second tab still believes it is on rev 0.
        with pytest.raises(NoteRevisionConflict):
            note.update_content(document("second"), "second", expected_rev=0)

        # And the first writer's content survives untouched.
        assert note.content_text == "first"
        assert note.rev == 1

    def test_oversized_document_is_rejected(self):
        note = make_note()
        with pytest.raises(ValueError, match="too large"):
            note.update_content(document("x" * (MAX_CONTENT_BYTES + 1)), "x", expected_rev=0)

    def test_rejects_a_non_document(self):
        note = make_note()
        with pytest.raises(ValueError, match="document object"):
            note.update_content("<p>not json</p>", "text", expected_rev=0)


class TestRename:
    def test_sets_an_explicit_title(self):
        note = make_note()
        note.rename("  NPCs  ")
        assert note.title == "NPCs"

    def test_empty_title_reverts_to_a_derived_one(self):
        note = make_note(content_text="Loot from the crypt")
        note.rename("Treasure")
        note.rename("")
        assert note.title is None
        assert note.display_title == "Loot from the crypt"

    def test_rejects_an_absurd_title(self):
        with pytest.raises(ValueError, match="200 characters"):
            make_note().rename("t" * 201)


class TestOwnership:
    def test_owner_is_recognised(self):
        owner = uuid4()
        assert make_note(user_id=owner).is_owned_by(owner) is True

    def test_anyone_else_is_not(self):
        assert make_note(user_id=uuid4()).is_owned_by(uuid4()) is False
