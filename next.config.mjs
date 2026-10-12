import webpack from 'webpack'
import { withLogtail } from '@logtail/next'

/** @type {import('next').NextConfig} */
const securityHeaders = [
  // Nobody may frame the app (clickjacking). frame-ancestors is the modern form; X-Frame-Options covers old browsers.
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=()' },
]

const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
  async rewrites() {
    return [
      { source: "/agents/:id(cloud-[^/]+)", destination: "/agent-functions/:id" },
    ]
  },
  images: {
    unoptimized: true,
  },
  // snarkjs (Agent Passport proving) pulls in optional Node built-ins that have
  // no browser equivalent — stub them and provide the Buffer global.
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
        readline: false,
        worker_threads: false,
        // Optional peer deps of @wagmi/connectors — not installed, stub them out
        // to suppress "Module not found" build warnings.
        '@base-org/account': false,
        '@metamask/connect-evm': false,
      }
      config.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ['buffer', 'Buffer'],
        }),
      )
    }
    return config
  },
}

export default withLogtail(nextConfig)
