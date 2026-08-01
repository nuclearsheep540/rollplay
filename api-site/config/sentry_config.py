# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import os
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration


def init_sentry():
    """Initialize Sentry for api-site service."""

    # Use service-specific DSN
    dsn = os.getenv("SENTRY_DSN_API_SITE")
    if not dsn:
        print("Sentry DSN not configured for api-site, skipping initialization")
        return

    def before_send(event, hint):
        """Add service identification tags."""
        event['tags'] = {
            **event.get('tags', {}),
            'service': 'api-site',
            'layer': 'business-logic',
            'component': 'fastapi'
        }
        return event

    sentry_sdk.init(
        dsn=dsn,
        environment=os.getenv("ENVIRONMENT", "development"),
        integrations=[
            FastApiIntegration(transaction_style="endpoint"),
        ],
        traces_sample_rate=0.1,
        before_send=before_send,

        # Optional: Release tracking
        release=os.getenv("SENTRY_RELEASE"),
    )

    print(f"Sentry initialized for api-site (environment: {os.getenv('ENVIRONMENT', 'development')})")


# Call this in your main.py
if __name__ == "__main__":
    init_sentry()
