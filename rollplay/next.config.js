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

module.exports = nextConfig
