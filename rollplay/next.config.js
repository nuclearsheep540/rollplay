/** @type {import('next').NextConfig} */
const nextConfig = {
  // Remove experimental flag - likely no longer needed in Next.js 15
  async rewrites() {
    return [
      {
        source: '/auth/:path*',
        destination: 'http://nginx:80/auth/:path*', // Proxy to nginx container
      },
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
