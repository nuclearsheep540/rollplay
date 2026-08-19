# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Command/repository tests for notes.

The theme is that **ownership is the whole authorisation story**: campaign
membership is checked once, at creation, and never again — so that leaving or
deleting a campaign can never revoke access to your own writing.
"""

from uuid import uuid4

import pytest

from modules.notes.application import commands as note_commands
from modules.notes.application.commands import (
    CreateNote,
    DeleteNote,
    NoteLimitReached,
    RenameNote,
    UpdateNoteContent,
)
from modules.notes.application.queries import GetNoteById, GetNotesForCampaign
from modules.notes.domain.note_aggregate import MAX_NOTES_PER_CAMPAIGN
from modules.notes.model.note_model import Note as NoteModel
from modules.notes.repositories.note_repository import NoteRepository


@pytest.fixture
def note_repo(db_session):
    return NoteRepository(db_session)


@pytest.fixture
def make_campaign(create_campaign, seed_default_edition):
    """create_campaign, with the edition seed its repository insists on."""
    return create_campaign


def document(text: str) -> dict:
    return {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}]}


class TestCreateNote:
    def test_stamps_the_campaign_name_at_creation(self, note_repo, campaign_repo, create_user, make_campaign):
        user = create_user()
        campaign = make_campaign(host_id=user.id, title="Curse of Strahd")

        note = CreateNote(note_repo, campaign_repo).execute(user.id, campaign.id)

        # Stamped, not looked up — this is what names the note after the campaign
        # row is gone.
        assert note.campaign_name == "Curse of Strahd"
        assert note.campaign_id == campaign.id
        assert note.rev == 0

    def test_non_member_cannot_start_a_notebook(self, note_repo, campaign_repo, create_user, make_campaign):
        dm = create_user()
        stranger = create_user()
        campaign = make_campaign(host_id=dm.id)

        with pytest.raises(PermissionError):
            CreateNote(note_repo, campaign_repo).execute(stranger.id, campaign.id)

    def test_unknown_campaign_is_rejected(self, note_repo, campaign_repo, create_user):
        user = create_user()
        with pytest.raises(ValueError, match="Campaign not found"):
            CreateNote(note_repo, campaign_repo).execute(user.id, uuid4())

    def test_cap_is_enforced_per_campaign(
        self, note_repo, campaign_repo, create_user, make_campaign, monkeypatch
    ):
        # Exercise the mechanism at a small number; the real ceiling is asserted below.
        monkeypatch.setattr(note_commands, "MAX_NOTES_PER_CAMPAIGN", 2)
        user = create_user()
        campaign = make_campaign(host_id=user.id)
        command = CreateNote(note_repo, campaign_repo)

        command.execute(user.id, campaign.id)
        command.execute(user.id, campaign.id)

        with pytest.raises(NoteLimitReached, match="delete a note to make room"):
            command.execute(user.id, campaign.id)

    def test_the_cap_is_a_hundred(self):
        assert MAX_NOTES_PER_CAMPAIGN == 100

    def test_cap_is_scoped_to_one_campaign_not_the_account(
        self, note_repo, campaign_repo, create_user, make_campaign, monkeypatch
    ):
        monkeypatch.setattr(note_commands, "MAX_NOTES_PER_CAMPAIGN", 1)
        user = create_user()
        first = make_campaign(host_id=user.id, title="Strahd")
        second = make_campaign(host_id=user.id, title="Avernus")
        command = CreateNote(note_repo, campaign_repo)

        command.execute(user.id, first.id)
        # A full notebook in one campaign must not block another.
        command.execute(user.id, second.id)


class TestOwnership:
    @pytest.fixture
    def someone_elses_note(self, note_repo, campaign_repo, create_user, make_campaign):
        owner = create_user()
        campaign = make_campaign(host_id=owner.id)
        return CreateNote(note_repo, campaign_repo).execute(owner.id, campaign.id)

    def test_reading_another_users_note_reports_it_missing(self, note_repo, someone_elses_note):
        # Deliberately 'not found' rather than 'forbidden' — the existence of
        # another user's note is not ours to confirm.
        with pytest.raises(LookupError):
            GetNoteById(note_repo).execute(someone_elses_note.id, uuid4())

    def test_writing_another_users_note_is_refused(self, note_repo, someone_elses_note):
        with pytest.raises(LookupError):
            UpdateNoteContent(note_repo).execute(
                someone_elses_note.id, uuid4(), document("mine now"), "mine now", 0
            )

    def test_renaming_another_users_note_is_refused(self, note_repo, someone_elses_note):
        with pytest.raises(LookupError):
            RenameNote(note_repo).execute(someone_elses_note.id, uuid4(), "hijacked")

    def test_deleting_another_users_note_is_refused(self, note_repo, someone_elses_note):
        with pytest.raises(LookupError):
            DeleteNote(note_repo).execute(someone_elses_note.id, uuid4())


class TestContentRoundTrip:
    def test_save_and_reload_preserves_the_document(
        self, note_repo, campaign_repo, create_user, make_campaign
    ):
        user = create_user()
        campaign = make_campaign(host_id=user.id)
        note = CreateNote(note_repo, campaign_repo).execute(user.id, campaign.id)

        UpdateNoteContent(note_repo).execute(
            note.id, user.id, document("The party met Meepo"), "The party met Meepo", 0
        )

        reloaded = GetNoteById(note_repo).execute(note.id, user.id)
        assert reloaded.rev == 1
        assert reloaded.content_text == "The party met Meepo"
        assert reloaded.content_delta["content"][0]["content"][0]["text"] == "The party met Meepo"
        # Never named, so the picker shows the first line.
        assert reloaded.display_title == "The party met Meepo"

    def test_a_stale_save_does_not_clobber(
        self, note_repo, campaign_repo, create_user, make_campaign
    ):
        from modules.notes.domain.note_aggregate import NoteRevisionConflict

        user = create_user()
        campaign = make_campaign(host_id=user.id)
        note = CreateNote(note_repo, campaign_repo).execute(user.id, campaign.id)
        command = UpdateNoteContent(note_repo)

        command.execute(note.id, user.id, document("tab one"), "tab one", 0)
        with pytest.raises(NoteRevisionConflict):
            command.execute(note.id, user.id, document("tab two"), "tab two", 0)

        assert GetNoteById(note_repo).execute(note.id, user.id).content_text == "tab one"


class TestListing:
    def test_lists_only_this_users_notes_for_this_campaign(
        self, note_repo, campaign_repo, create_user, make_campaign
    ):
        dm = create_user()
        other = create_user()
        campaign = make_campaign(host_id=dm.id)
        campaign.add_player(other.id)
        campaign_repo.save(campaign)
        elsewhere = make_campaign(host_id=dm.id, title="Avernus")

        command = CreateNote(note_repo, campaign_repo)
        mine = command.execute(dm.id, campaign.id)
        command.execute(other.id, campaign.id)
        command.execute(dm.id, elsewhere.id)

        listed = GetNotesForCampaign(note_repo).execute(dm.id, campaign.id)
        assert [note.id for note in listed] == [mine.id]

    def test_empty_campaign_returns_nothing_and_creates_nothing(
        self, note_repo, create_user, make_campaign
    ):
        user = create_user()
        campaign = make_campaign(host_id=user.id)

        assert GetNotesForCampaign(note_repo).execute(user.id, campaign.id) == []
        assert note_repo.count_for_campaign(user.id, campaign.id) == 0


class TestSurvivesCampaignDeletion:
    """
    The behaviour with no visible surface in v1, and therefore the one most
    likely to regress silently.

    SQLite in this harness does not enforce FK actions (no `PRAGMA foreign_keys=ON`),
    so the cascade itself is asserted at the schema level here and verified against
    real Postgres separately.
    """

    def test_campaign_fk_is_declared_set_null(self):
        foreign_key = next(iter(NoteModel.__table__.c.campaign_id.foreign_keys))
        assert foreign_key.ondelete == "SET NULL"
        assert NoteModel.__table__.c.campaign_id.nullable is True

    def test_user_fk_is_declared_cascade(self):
        # Deleting the author *should* take their notes with them — unlike a campaign.
        foreign_key = next(iter(NoteModel.__table__.c.user_id.foreign_keys))
        assert foreign_key.ondelete == "CASCADE"

    def test_an_orphaned_note_keeps_its_stamped_campaign_name(
        self, note_repo, campaign_repo, create_user, make_campaign
    ):
        user = create_user()
        campaign = make_campaign(host_id=user.id, title="Curse of Strahd")
        note = CreateNote(note_repo, campaign_repo).execute(user.id, campaign.id)

        note.orphan()
        note_repo.save(note)

        orphans = note_repo.list_orphaned(user.id)
        assert [orphan.id for orphan in orphans] == [note.id]
        assert orphans[0].campaign_id is None
        assert orphans[0].campaign_name == "Curse of Strahd"

    def test_the_owner_can_still_read_an_orphaned_note(
        self, note_repo, campaign_repo, create_user, make_campaign
    ):
        user = create_user()
        campaign = make_campaign(host_id=user.id)
        note = CreateNote(note_repo, campaign_repo).execute(user.id, campaign.id)

        note.orphan()
        note_repo.save(note)

        # Authorisation is ownership, so losing the campaign changes nothing.
        assert GetNoteById(note_repo).execute(note.id, user.id).campaign_id is None
