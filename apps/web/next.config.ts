import type { NextConfig } from 'next'

const apiUrl = process.env.API_URL || 'http://localhost:4000'
const useStandaloneOutput = process.env.NEXT_OUTPUT === 'standalone'

const config: NextConfig = {
  output: useStandaloneOutput ? 'standalone' : undefined,
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${apiUrl}/api/:path*` },
      { source: '/uploads/:path*', destination: `${apiUrl}/uploads/:path*` },
    ]
  },
}
export default config
