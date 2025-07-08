/** @type {import('next').NextConfig} */
const nextConfig = {
  // Remove experimental flag - likely no longer needed in Next.js 15
  async rewrites() {
    return [
      {
        source: '/auth/magic-link',
        destination: 'http://nginx:80/auth/magic-link', // Proxy magic-link endpoint
      },
      {
        source: '/auth/validate',
        destination: 'http://nginx:80/auth/validate', // Proxy validate endpoint
      },
      {
        source: '/auth/verify/:token',
        destination: 'http://nginx:80/auth/verify/:token', // Proxy API verify endpoint (path param)
      },
      // Note: /auth/verify (without path param) stays as frontend page
      {
        source: '/api/game/:path*',
        destination: 'http://nginx:80/api/game/:path*', // Proxy to nginx container
      },
      {
        source: '/api/site/:path*',
        destination: 'http://nginx:80/api/site/:path*', // Proxy to nginx container
      },
    ]
  },
}

module.exports = nextConfig
