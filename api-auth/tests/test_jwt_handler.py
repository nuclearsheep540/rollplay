# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Unit tests for JWTHandler: configured lifetimes and refresh-token verification.

Pure logic, no I/O. Every test builds its own handler from the make_settings factory,
so no settings object or handler is shared between tests.
"""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import jwt
import pytest

from auth.jwt_handler import JWTHandler

ALGORITHM = "HS256"


@pytest.fixture
def user_data():
    """A fresh minimal user payload per test, the shape create_tokens takes."""
    return {"id": str(uuid4()), "email": "handler@example.com"}


def _claims(token, secret):
    return jwt.decode(token, secret, algorithms=[ALGORITHM])


def test_token_lifetimes_come_from_settings(make_settings, user_data):
    """The exp of each token is driven by Settings, not by a constant in the handler.

    Non-default values are used deliberately: with the defaults, a handler that ignored
    Settings entirely would still produce the expected numbers and the test would pass.
    """
    settings = make_settings(
        jwt_access_token_expire_minutes=3,
        jwt_refresh_token_expire_days=2,
    )
    handler = JWTHandler(settings)
    tokens = handler.create_tokens(user_data)

    access = _claims(tokens["access_token"], settings.JWT_SECRET_KEY)
    refresh = _claims(tokens["refresh_token"], settings.JWT_SECRET_KEY)

    assert access["exp"] - access["iat"] == 3 * 60
    assert refresh["exp"] - refresh["iat"] == 2 * 24 * 60 * 60


def test_refresh_token_round_trips_to_the_pair_minting_shape(make_settings, user_data):
    """verify_refresh_token returns exactly what create_tokens consumes, so a rotation
    can hand the result straight back in without reshaping it."""
    settings = make_settings()
    handler = JWTHandler(settings)

    verified = handler.verify_refresh_token(handler.create_refresh_token(user_data))

    assert verified == {"id": user_data["id"], "email": user_data["email"]}


def test_access_token_is_rejected_as_a_refresh_token(make_settings, user_data):
    """Token type is enforced, so an access token cannot be replayed to mint a pair."""
    handler = JWTHandler(make_settings())

    assert handler.verify_refresh_token(handler.create_token(user_data)) is None


def test_expired_refresh_token_is_rejected(make_settings, user_data):
    """A negative lifetime mints an already-expired token; verification must refuse it."""
    handler = JWTHandler(make_settings(jwt_refresh_token_expire_days=-1))

    assert handler.verify_refresh_token(handler.create_refresh_token(user_data)) is None


def test_refresh_token_signed_with_another_secret_is_rejected(make_settings, user_data):
    """A token this service did not sign must not verify."""
    foreign = JWTHandler(make_settings(JWT_SECRET_KEY="a-different-secret"))
    handler = JWTHandler(make_settings())

    assert handler.verify_refresh_token(foreign.create_refresh_token(user_data)) is None


def test_refresh_token_with_a_non_uuid_user_id_is_rejected(make_settings):
    """The user_id claim is forwarded to api-site as a query parameter, so it is
    validated here rather than being allowed to produce a 422 downstream."""
    settings = make_settings()
    handler = JWTHandler(settings)
    now = datetime.now(timezone.utc)
    forged = jwt.encode(
        {
            "user_id": "not-a-uuid",
            "email": "handler@example.com",
            "type": "refresh",
            "iat": now,
            "exp": now + timedelta(days=1),
        },
        settings.JWT_SECRET_KEY,
        algorithm=ALGORITHM,
    )

    assert handler.verify_refresh_token(forged) is None


def test_refresh_token_without_an_exp_claim_is_rejected(make_settings):
    """A token carrying no exp would otherwise verify forever, so exp is required."""
    settings = make_settings()
    handler = JWTHandler(settings)
    endless = jwt.encode(
        {
            "user_id": str(uuid4()),
            "email": "handler@example.com",
            "type": "refresh",
        },
        settings.JWT_SECRET_KEY,
        algorithm=ALGORITHM,
    )

    assert handler.verify_refresh_token(endless) is None
