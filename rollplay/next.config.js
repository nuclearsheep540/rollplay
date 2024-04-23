/** @type {import('next').NextConfig} */
const nextConfig = { 
    experimental: { missingSuspenseWithCSRBailout: false, },
    async rewrites() {
        return [
          {
            source: '/18.200.239.2:3000/:path*',
            destination: 'http://18.200.239.2:3000/:path*',
          },
        ]
      },

}

module.exports = nextConfig
