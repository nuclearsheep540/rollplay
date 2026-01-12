/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Use ENVIRONMENT variable to distinguish dev vs prod
  environment: process.env.NEXT_PUBLIC_ENVIRONMENT || process.env.NODE_ENV || 'development',

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: 1.0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Security monitoring: Alert on suspicious command patterns
  beforeSend(event, hint) {
    // Patterns that indicate potential RCE or malicious activity
    const suspiciousPatterns = [
      'wget', 'curl', 'pkill', 'xmrig', 'bash', 'sh -c',
      'exec', 'spawn', 'touch', '.write_test', 'javae', 'javat',
      'sYsTeMd', 'runnv', 'watcher.js', 'csf.php'
    ];

    // Convert event to string for pattern matching
    const eventString = JSON.stringify(event).toLowerCase();
    const suspicious = suspiciousPatterns.some(pattern =>
      eventString.includes(pattern.toLowerCase())
    );

    if (suspicious) {
      // Tag as critical security incident
      event.tags = {
        ...event.tags,
        security_incident: 'potential_rce',
        severity: 'critical',
        alert_security_team: true
      };

      // Set high priority
      event.level = 'fatal';

      // Add fingerprint for grouping similar incidents
      event.fingerprint = ['security-rce-attempt'];

      console.error('[SECURITY ALERT] Suspicious activity detected:', event);
    }

    return event;
  },
});
