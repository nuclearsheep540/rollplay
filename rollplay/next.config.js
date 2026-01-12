const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for smaller, more secure Docker images
  output: 'standalone',

  // Most API routing is handled by NGINX reverse proxy
  // These rewrites only apply when requests come directly to Next.js (rare in our setup)
  async rewrites() {
    return [
      // Auth API endpoints - proxy to backend through NGINX
      {
        source: '/auth/magic-link',
        destination: 'http://nginx:80/api/auth/magic-link',
      },
      {
        source: '/auth/validate',
        destination: 'http://nginx:80/api/auth/validate',
      },
      {
        source: '/auth/verify-otp',
        destination: 'http://nginx:80/api/auth/verify-otp',
      },
      {
        source: '/auth/logout',
        destination: 'http://nginx:80/api/auth/logout',
      },
    ]
  },
}

// Sentry configuration options
const sentryWebpackPluginOptions = {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  // Suppresses source map uploading logs during build
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
};

// Make sure adding Sentry options is the last code to run before exporting
module.exports = withSentryConfig(nextConfig, sentryWebpackPluginOptions);
