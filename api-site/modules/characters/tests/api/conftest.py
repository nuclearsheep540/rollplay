# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""TestClient + dependency-override harness for character API tests.

The shared db_session/seed fixtures from the project conftest take care of
schema + reference rows. Here we mount the real FastAPI app with overrides
for ``get_db`` (use the test session) and ``get_current_user_id`` (return a
preset UUID per-test) so endpoint paths can be hit end-to-end.
"""

from typing import Iterator
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from shared.dependencies.auth import get_current_user_id
from shared.dependencies.db import get_db
from shared.rulesets.registry import RulesetRegistry


@pytest.fixture(scope="session", autouse=True)
def _initialize_registry():
    """Boot the singleton ruleset registry once for the whole test session."""
    RulesetRegistry.reset()
    RulesetRegistry.initialize()
    yield
    RulesetRegistry.reset()


@pytest.fixture
def client(db_session, seed_default_edition) -> Iterator[TestClient]:
    """FastAPI TestClient wired to the shared in-memory SQLite session.

    The registry is the real one (initialized at session scope).
    Authentication is overridden per-request by ``set_current_user``.
    """
    # Avoid importing app at module level so the test session doesn't pay the
    # FastAPI boot cost when not needed.
    from main import app

    def _db_override():
        # Yield the test session without closing it (the db_session fixture owns lifecycle).
        yield db_session

    app.dependency_overrides[get_db] = _db_override

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()


@pytest.fixture
def auth_as(client: TestClient):
    """Override the current_user dependency to return the given UUID."""
    from main import app

    def _set(user_id: UUID):
        app.dependency_overrides[get_current_user_id] = lambda: user_id

    yield _set
    # Cleared in the client fixture's teardown.
