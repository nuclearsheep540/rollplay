# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Endpoint tests for POST /auth/refresh — rotation and its failure paths.

Every test builds its own tokens and its own TestClient. The one thing they touch
that they did not create is the module-level `passwordless_auth` singleton that
app.py constructs at import; it is only ever reached through pytest's monkeypatch
fixture, which restores it at teardown.
"""

from datetime import datetime, timedelta, timezone
from http.cookies import SimpleCookie
from uuid import uuid4

import jwt
import pytest
from fastapi.testclient import TestClient

import app as app_module
from auth.passwordless import UserServiceUnavailable

ACCESS_COOKIE = "auth_token"
REFRESH_COOKIE = "refresh_token"


def _set_cookies(response):
    """Map cookie name to its parsed morsel for every Set-Cookie header on a response.

    Read from the raw headers rather than the client's cookie jar: the jar discards
    Secure cookies delivered over the TestClient's http:// transport, and the
    attributes (Max-Age, HttpOnly, SameSite) are precisely what these tests assert on.
    """
    parsed = {}
    for header in response.headers.get_list("set-cookie"):
        jar = SimpleCookie()
        jar.load(header)
        for cookie_name, morsel in jar.items():
            parsed[cookie_name] = morsel
    return parsed


@pytest.fixture
def client():
    """A fresh TestClient per test, so no cookie jar is carried between them."""
    with TestClient(app_module.app) as test_client:
        yield test_client


@pytest.fixture
def secret():
    """The secret the app booted with — tests must sign with the same one."""
    return app_module.settings.JWT_SECRET_KEY


@pytest.fixture
def make_refresh_token(secret):
    """Factory: mint one refresh token per call, with the test in control of its exp.

    Encoded directly with PyJWT rather than through JWTHandler so the test does not
    inherit the handler's configured lifetime: the rotation assertion is that the
    returned token outlives the presented one, which needs the presented one to be
    demonstrably shorter.
    """

    def _make(expires_in_days=6, user_id=None, email="rotation@example.com",
              token_type="refresh", key=None):
        now = datetime.now(timezone.utc)
        payload = {
            "user_id": str(user_id or uuid4()),
            "email": email,
            "type": token_type,
            "iat": now,
            "exp": now + timedelta(days=expires_in_days),
        }
        return jwt.encode(payload, key or secret, algorithm="HS256")

    return _make


@pytest.fixture
def account_active(monkeypatch):
    """Stub the api-site account check so these tests exercise api-auth alone.

    raising=False because the method does not exist on the pre-fix tree, and this
    file's first run has to reach the endpoint to prove the endpoint is missing.
    """

    def _set(active):
        async def _check(user_id):
            return active

        monkeypatch.setattr(
            app_module.passwordless_auth, "_is_user_active", _check, raising=False
        )

    return _set


def test_refresh_rotates_the_refresh_token(client, make_refresh_token, secret, account_active):
    """A successful refresh must return a NEW refresh token that outlives the presented one.

    This is the regression the PR exists for. Before it, the endpoint re-issued only
    the access token, so the refresh window stayed pinned to login plus seven days and
    every user was logged out one week after logging in regardless of activity.
    """
    account_active(True)

    presented = make_refresh_token(expires_in_days=6)
    presented_exp = jwt.decode(presented, secret, algorithms=["HS256"])["exp"]

    client.cookies.set(REFRESH_COOKIE, presented)
    response = client.post("/auth/refresh")

    assert response.status_code == 200

    cookies = _set_cookies(response)
    assert set(cookies) == {ACCESS_COOKIE, REFRESH_COOKIE}
    assert cookies[ACCESS_COOKIE]["max-age"] == "900"
    assert cookies[REFRESH_COOKIE]["max-age"] == "604800"
    for morsel in cookies.values():
        assert morsel["httponly"]
        assert morsel["secure"]
        assert morsel["samesite"].lower() == "lax"
        assert morsel["path"] == "/"

    rotated_exp = jwt.decode(cookies[REFRESH_COOKIE].value, secret, algorithms=["HS256"])["exp"]
    assert rotated_exp > presented_exp

    body = response.json()
    assert "access_token" not in body
    assert "refresh_token" not in body


def test_refresh_without_a_cookie_is_rejected_and_clears_both(client):
    """No refresh cookie is a 401, and both cookies are expired on the way out."""
    response = client.post("/auth/refresh")

    assert response.status_code == 401
    cookies = _set_cookies(response)
    assert set(cookies) == {ACCESS_COOKIE, REFRESH_COOKIE}
    assert all(morsel["max-age"] == "0" for morsel in cookies.values())


def test_expired_refresh_token_is_rejected_and_clears_both(client, make_refresh_token, account_active):
    """An expired refresh token is a 401 — the account check must never be reached."""
    account_active(True)

    client.cookies.set(REFRESH_COOKIE, make_refresh_token(expires_in_days=-1))
    response = client.post("/auth/refresh")

    assert response.status_code == 401
    cookies = _set_cookies(response)
    assert all(morsel["max-age"] == "0" for morsel in cookies.values())


def test_access_token_is_not_accepted_as_a_refresh_token(client, make_refresh_token, account_active):
    """A valid access token presented in the refresh cookie is a 401, not a rotation."""
    account_active(True)

    client.cookies.set(REFRESH_COOKIE, make_refresh_token(token_type="access"))
    response = client.post("/auth/refresh")

    assert response.status_code == 401
    cookies = _set_cookies(response)
    assert all(morsel["max-age"] == "0" for morsel in cookies.values())


def test_inactive_account_is_rejected_and_clears_both(client, make_refresh_token, account_active):
    """A structurally valid token for a soft-deleted account is a 401, not a rotation.

    This is the check that bounds how long a deleted user's access token stays useful:
    without it, refresh would keep minting fresh ones forever.
    """
    account_active(False)

    client.cookies.set(REFRESH_COOKIE, make_refresh_token())
    response = client.post("/auth/refresh")

    assert response.status_code == 401
    cookies = _set_cookies(response)
    assert set(cookies) == {ACCESS_COOKIE, REFRESH_COOKIE}
    assert all(morsel["max-age"] == "0" for morsel in cookies.values())


def test_api_site_outage_is_503_and_keeps_the_cookies(client, make_refresh_token, monkeypatch):
    """When api-site cannot confirm the account, the caller keeps its cookies.

    Reporting "unknown" as "inactive" would log every user out whenever api-site
    restarts, so this path must not clear anything.
    """

    async def _unavailable(user_id):
        raise UserServiceUnavailable("api-site unreachable: simulated outage")

    monkeypatch.setattr(app_module.passwordless_auth, "_is_user_active", _unavailable)

    client.cookies.set(REFRESH_COOKIE, make_refresh_token())
    response = client.post("/auth/refresh")

    assert response.status_code == 503
    assert response.headers.get_list("set-cookie") == []


def test_otp_verification_sets_both_cookies(client, monkeypatch):
    """The login path still issues both cookies through the shared helper."""

    async def _verified(token):
        return {
            "user": {"id": "11111111-2222-3333-4444-555555555555", "email": "otp@example.com"},
            "access_token": "stub-access",
            "refresh_token": "stub-refresh",
            "token_type": "bearer",
        }

    monkeypatch.setattr(app_module.passwordless_auth, "verify_otp_token", _verified)

    response = client.post("/auth/verify-otp", json={"token": "whatever"})

    assert response.status_code == 200
    cookies = _set_cookies(response)
    assert cookies[ACCESS_COOKIE].value == "stub-access"
    assert cookies[REFRESH_COOKIE].value == "stub-refresh"
    assert cookies[ACCESS_COOKIE]["max-age"] == "900"
    assert cookies[REFRESH_COOKIE]["max-age"] == "604800"


def test_logout_clears_both_cookies(client):
    """Logout still expires both cookies through the shared helper."""
    response = client.post("/auth/logout")

    assert response.status_code == 200
    cookies = _set_cookies(response)
    assert set(cookies) == {ACCESS_COOKIE, REFRESH_COOKIE}
    assert all(morsel["max-age"] == "0" for morsel in cookies.values())
