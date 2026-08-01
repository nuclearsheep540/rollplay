# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import os
import re

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration

# Word boundaries so `exec` does not match `execute` in our own stack frames.
SUSPICIOUS_PATTERN = re.compile(
    r"\b(?:wget|curl|pkill|xmrig|bash|sh\s+-c|exec|spawn|touch|subprocess|systemd|runnv|javae|javat)\b"
    r"|\.write_test\b|watcher\.js\b|csf\.php\b",
    re.IGNORECASE,
)


def init_sentry():
    """Initialize Sentry for api-site service with security monitoring."""

    # Use service-specific DSN
    dsn = os.getenv("SENTRY_DSN_API_SITE")
    if not dsn:
        print("Sentry DSN not configured for api-site, skipping initialization")
        return

    def before_send(event, hint):
        """Add service tags and security monitoring."""

        # Add service identification tags
        event['tags'] = {
            **event.get('tags', {}),
            'service': 'api-site',
            'layer': 'business-logic',
            'component': 'fastapi'
        }

        # Check the request only — scanning the whole event matched our own
        # stack frames and flagged every database error as an RCE attempt.
        if SUSPICIOUS_PATTERN.search(str(event.get('request') or '')):
            event['tags']['security_incident'] = 'potential_rce'
            event['tags']['severity'] = 'critical'
            event['tags']['alert_security_team'] = True
            event['level'] = 'fatal'
            print(f"[SECURITY ALERT] api-site: Suspicious activity detected in event")

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
