# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Tests for the internal account-status endpoint api-auth calls during token refresh.

Each test creates the user it asks about, so no test depends on rows left behind by
another. The endpoint is read-only, so nothing needs cleaning up afterwards.
"""

from uuid import uuid4

CHECK_ACTIVE = "/api/users/internal/check-active"


def test_active_user_is_reported_active(client, create_user):
    user = create_user("check-active-live@example.com")

    response = client.get(CHECK_ACTIVE, params={"user_id": str(user.id)})

    assert response.status_code == 200
    assert response.json() == {"active": True}


def test_soft_deleted_user_is_reported_inactive(client, create_user, user_repo):
    """A soft-deleted account must stop refreshing, which is what bounds how long its
    already-issued access token stays useful."""
    user = create_user("check-active-deleted@example.com")
    user_repo.soft_delete(user.id)

    response = client.get(CHECK_ACTIVE, params={"user_id": str(user.id)})

    assert response.status_code == 200
    assert response.json() == {"active": False}


def test_unknown_user_is_reported_inactive(client):
    response = client.get(CHECK_ACTIVE, params={"user_id": str(uuid4())})

    assert response.status_code == 200
    assert response.json() == {"active": False}


def test_malformed_user_id_is_rejected(client):
    """FastAPI validates the UUID, so a malformed id never reaches the repository."""
    response = client.get(CHECK_ACTIVE, params={"user_id": "not-a-uuid"})

    assert response.status_code == 422


def test_refresh_endpoint_no_longer_lives_here(client):
    """Token refresh moved to api-auth, which owns token generation.

    Pinned as a test because the old path is the one three frontend callers used, and a
    reappearance here would mean the ownership split had been undone.
    """
    response = client.post("/api/users/auth/refresh")

    assert response.status_code == 404
