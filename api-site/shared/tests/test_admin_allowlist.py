# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Parsing and matching contract for the admin allowlist.

Adminhood has no column and no token claim — it is this string comparison, run
per request. That makes the parsing rules the whole security surface: a stray
space in the env file, or a user typing their email with different casing at
signup, must not silently decide who can publish news.

Each test constructs its own Settings with an explicit ADMIN_EMAILS value
rather than reading the ambient environment, so the result never depends on
what dev.env happens to contain on the machine running the suite.
"""

import pytest

from config.settings import Settings


def settings_with(admin_emails):
    """A Settings whose allowlist is exactly what this test declares."""
    return Settings(ADMIN_EMAILS=admin_emails)


class TestAllowlistParsing:
    def test_unset_allowlist_grants_nobody(self):
        assert settings_with('').admin_email_set == set()

    def test_single_email(self):
        assert settings_with('matt@example.com').admin_email_set == {'matt@example.com'}

    def test_multiple_emails_split_on_commas(self):
        parsed = settings_with('one@example.com,two@example.com').admin_email_set

        assert parsed == {'one@example.com', 'two@example.com'}

    def test_surrounding_whitespace_is_stripped(self):
        parsed = settings_with(' one@example.com , two@example.com ').admin_email_set

        assert parsed == {'one@example.com', 'two@example.com'}

    def test_stored_lowercased_so_matching_is_case_insensitive(self):
        assert settings_with('Matt@Example.COM').admin_email_set == {'matt@example.com'}

    def test_trailing_comma_does_not_admit_an_empty_email(self):
        assert settings_with('matt@example.com,').admin_email_set == {'matt@example.com'}


class TestIsAdminEmail:
    """The matcher reads whichever allowlist the module snapshotted at import.

    These tests patch that module-level settings object and restore it, rather
    than relying on the ambient env — otherwise the assertions would describe
    the developer's dev.env instead of the code.
    """

    @pytest.fixture
    def allowlist(self, monkeypatch):
        def _set(emails):
            from shared.dependencies import auth
            monkeypatch.setattr(auth, 'settings', settings_with(emails))
        return _set

    def test_listed_email_is_admin(self, allowlist):
        from shared.dependencies.auth import is_admin_email
        allowlist('matt@example.com')

        assert is_admin_email('matt@example.com') is True

    def test_unlisted_email_is_not_admin(self, allowlist):
        from shared.dependencies.auth import is_admin_email
        allowlist('matt@example.com')

        assert is_admin_email('someone@example.com') is False

    def test_matching_ignores_case_on_the_user_side_too(self, allowlist):
        from shared.dependencies.auth import is_admin_email
        allowlist('matt@example.com')

        assert is_admin_email('MATT@Example.com') is True

    def test_empty_allowlist_admits_nobody(self, allowlist):
        from shared.dependencies.auth import is_admin_email
        allowlist('')

        assert is_admin_email('matt@example.com') is False

    def test_missing_email_is_not_admin(self, allowlist):
        from shared.dependencies.auth import is_admin_email
        allowlist('matt@example.com')

        assert is_admin_email(None) is False
