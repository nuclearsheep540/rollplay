# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import os
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.redis import RedisIntegration


def init_sentry():
    """Initialize Sentry for api-auth service with security monitoring."""

    # Use service-specific DSN
    dsn = os.getenv("SENTRY_DSN_API_AUTH")
    if not dsn:
        print("Sentry DSN not configured for api-auth, skipping initialization")
        return

    # Suspicious patterns for security monitoring
    SUSPICIOUS_PATTERNS = [
        'wget', 'curl', 'pkill', 'xmrig', 'bash', 'sh -c',
        'exec', 'spawn', 'touch', '.write_test', 'javae', 'javat',
        'sYsTeMd', 'runnv', 'watcher.js', 'csf.php', 'subprocess'
    ]

    def before_send(event, hint):
        """Add service tags and security monitoring."""

        # Add service identification tags
        event['tags'] = {
            **event.get('tags', {}),
            'service': 'api-auth',
            'layer': 'authentication',
            'component': 'jwt'
        }

        # Check for security incidents
        event_str = str(event).lower()
        if any(pattern in event_str for pattern in SUSPICIOUS_PATTERNS):
            event['tags']['security_incident'] = 'potential_rce'
            event['tags']['severity'] = 'critical'
            event['tags']['alert_security_team'] = True
            event['level'] = 'fatal'
            event['fingerprint'] = ['security-rce-attempt']
            print(f"[SECURITY ALERT] api-auth: Suspicious activity detected in event")

        return event

    sentry_sdk.init(
        dsn=dsn,
        environment=os.getenv("ENVIRONMENT", "development"),
        integrations=[
            FastApiIntegration(transaction_style="endpoint"),
            RedisIntegration(),
        ],
        traces_sample_rate=1.0,
        before_send=before_send,

        # Optional: Release tracking
        release=os.getenv("SENTRY_RELEASE"),
    )

    print(f"Sentry initialized for api-auth (environment: {os.getenv('ENVIRONMENT', 'development')})")


# Call this in your app.py
if __name__ == "__main__":
    init_sentry()
