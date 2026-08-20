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


class TestNewNotesAreIndependent:
    """Every new note must own its document outright.

    A new note is seeded from a single empty-document shape. If that shape were a
    module-level object handed out by reference — or copied only shallowly — every
    note created in the process would share the same nested list, and one in-place
    mutation would silently rewrite what every *subsequent* new note starts with.
    It survives until the worker restarts, so it would present as notes born with
    someone else's content and vanish the moment anyone tried to reproduce it.

    Nothing mutates content_delta in place today; these tests exist so that stays
    harmless if anything ever does.

    ``test_seeded_documents_are_distinct_objects`` is the definitive check: it
    detects sharing by identity without mutating anything, so it stands alone and
    does not depend on what any other test did first. The two mutation tests below
    describe the same defect in terms of consequence.
    """

    def test_two_new_notes_do_not_share_their_document_tree(self):
        first = make_note()
        second = make_note()

        first.content_delta["content"].append({"type": "paragraph"})

        assert len(second.content_delta["content"]) == 1

    def test_mutating_one_notes_paragraph_does_not_reach_another(self):
        first = make_note()
        second = make_note()

        # One level deeper than the list — a shallow copy of the outer dict
        # leaves this shared too.
        first.content_delta["content"][0]["type"] = "heading"

        assert second.content_delta["content"][0]["type"] == "paragraph"

    def test_seeded_documents_are_distinct_objects(self):
        first = make_note()
        second = make_note()

        assert first.content_delta is not second.content_delta
        assert first.content_delta["content"] is not second.content_delta["content"]
        assert first.content_delta["content"][0] is not second.content_delta["content"][0]

    def test_a_new_note_starts_with_exactly_one_empty_paragraph(self):
        """The seed shape itself: an editor cannot render a doc with no content.

        A regression guard on the shape, NOT evidence of independence — run alone
        against the shared-object bug this passes, because nothing has polluted
        the shared seed yet. Verified by experiment, 2026-08-20. Do not cite it
        as proof of the fix; that is what the identity test above is for.
        """
        assert make_note().content_delta == {
            "type": "doc",
            "content": [{"type": "paragraph"}],
        }
