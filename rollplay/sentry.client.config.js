/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as Sentry from '@sentry/nextjs';

const isProd = (process.env.NEXT_PUBLIC_ENVIRONMENT || process.env.NODE_ENV) === 'prod'
  || process.env.NODE_ENV === 'production';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Use ENVIRONMENT variable to distinguish dev vs prod
  environment: process.env.NEXT_PUBLIC_ENVIRONMENT || process.env.NODE_ENV || 'development',

  // Disable Sentry entirely in dev. Errors still get captured if you
  // call Sentry.captureException manually, but the auto-instrumentation
  // (BrowserTracing wrapping setTimeout/setInterval/rAF/fetch and the
  // session replay DOM-mutation recorder) adds significant per-frame
  // overhead during local development.
  enabled: isProd,

  // Performance tracing: 10% in prod, off entirely in dev. The wrapper
  // overhead for sampled-out transactions is still real — at 0 the
  // wrapper short-circuits without doing any work.
  tracesSampleRate: isProd ? 0.1 : 0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Session replay: only on errors in prod, fully off in dev. Replay
  // captures every DOM mutation; with our audio meter rAFs writing
  // textContent ~10/sec across all strips, that's a constant stream
  // of recorded events.
  replaysOnErrorSampleRate: isProd ? 1.0 : 0,
  replaysSessionSampleRate: 0,

  integrations: isProd
    ? [
        Sentry.replayIntegration({
          maskAllText: true,
          blockAllMedia: true,
        }),
      ]
    : [],

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
