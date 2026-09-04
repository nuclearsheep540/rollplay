# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Pytest anchor for api-auth.

Loading this conftest puts the api-auth root on sys.path, so tests import
application modules (`from auth.jwt_handler import ...`) identically under both
`pytest` and `python -m pytest`, matching how uvicorn resolves them at runtime.

It also pins the environment `Settings()` needs BEFORE app.py is imported by any
test: app.py constructs Settings, PasswordlessAuth and JWTHandler at import time,
so a missing required field would fail collection rather than a test. setdefault
keeps the container's real dev.env values when present and supplies stand-ins in
CI, which matters for JWT_SECRET_KEY — tests mint tokens with the same secret the
app booted with.
"""

import os

import pytest

# Importing the class reads no environment; only instantiation does. That is why
# this import can sit above the os.environ calls below.
from config.settings import Settings

os.environ.setdefault("JWT_SECRET_KEY", "test-secret")
# MailtrapClient(token=...) only stores the token; no network call is made at
# construction, so a stand-in is enough to import app.py.
os.environ.setdefault("MAIL_TRAP_API_TOKEN", "test-token")
os.environ.setdefault("NEXT_PUBLIC_API_URL", "http://localhost:3000")
# RedisClient._connect pings on construction and falls back to an in-memory dict
# when that fails, so an unreachable URL is safe here.
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
os.environ.setdefault("ENVIRONMENT", "development")
# init_sentry() returns early on an empty DSN — tests must not report to Sentry.
os.environ["SENTRY_DSN_API_AUTH"] = ""


@pytest.fixture
def make_settings():
    """Factory: a fresh Settings per call, sharing the secret the app booted with.

    Every test that needs a JWTHandler builds its own via this factory, so no two
    tests share a settings object and none of them mutate a global.
    """

    def _make(**overrides):
        values = {
            "JWT_SECRET_KEY": os.environ["JWT_SECRET_KEY"],
            "MAIL_TRAP_API_TOKEN": "test-token",
            "NEXT_PUBLIC_API_URL": "http://localhost:3000",
            "REDIS_URL": "redis://localhost:6379",
        }
        values.update(overrides)
        return Settings(**values)

    return _make
