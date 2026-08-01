# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import os
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.redis import RedisIntegration


def init_sentry():
    """Initialize Sentry for api-auth service."""

    # Use service-specific DSN
    dsn = os.getenv("SENTRY_DSN_API_AUTH")
    if not dsn:
        print("Sentry DSN not configured for api-auth, skipping initialization")
        return

    def before_send(event, hint):
        """Add service identification tags."""
        event['tags'] = {
            **event.get('tags', {}),
            'service': 'api-auth',
            'layer': 'authentication',
            'component': 'jwt'
        }
        return event

    sentry_sdk.init(
        dsn=dsn,
        environment=os.getenv("ENVIRONMENT", "development"),
        integrations=[
            FastApiIntegration(transaction_style="endpoint"),
            RedisIntegration(),
        ],
        traces_sample_rate=0.1,
        before_send=before_send,

        # Optional: Release tracking
        release=os.getenv("SENTRY_RELEASE"),
    )

    print(f"Sentry initialized for api-auth (environment: {os.getenv('ENVIRONMENT', 'development')})")


# Call this in your app.py
if __name__ == "__main__":
    init_sentry()
