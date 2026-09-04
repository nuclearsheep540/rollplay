# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""TestClient harness for user API tests.

Mirrors modules/characters/tests/api/conftest.py: mount the real FastAPI app with
get_db overridden to the shared in-memory session from the project conftest. No auth
override is set up here — the endpoint under test is an internal service-to-service
route with no auth dependency, and a test needing one should add it explicitly.
"""

from typing import Iterator

import pytest
from fastapi.testclient import TestClient

from shared.dependencies.db import get_db


@pytest.fixture
def client(db_session) -> Iterator[TestClient]:
    """A fresh TestClient per test, wired to the test database session."""
    # main is imported here rather than at module scope, and the ordering is
    # load-bearing rather than a style choice: the project conftest's db_session
    # fixture rewrites every PostgreSQL UUID/JSONB column type to a SQLite-safe
    # equivalent, and main.py calls configure_mappers() at import. Importing main
    # first freezes the mappers against the unpatched types, after which a
    # post-commit reload of a row finds nothing and every insert looks deleted.
    # Depending on db_session above guarantees the patch has already run.
    from main import app

    def _db_override():
        # Yield without closing: the db_session fixture owns the lifecycle.
        yield db_session

    app.dependency_overrides[get_db] = _db_override

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
