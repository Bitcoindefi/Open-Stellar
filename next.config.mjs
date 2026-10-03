import webpack from 'webpack'
import { withLogtail } from '@logtail/next'

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      // The MCP consent and approval pages must never load inside another site's frame.
      // Referrer "same-origin" (not "no-referrer", which makes the form POST send Origin: null).
      {
        source: "/mcp/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ]
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
