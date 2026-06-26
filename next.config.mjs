import webpack from 'webpack'
import { withLogtail } from '@logtail/next'

/** @type {import('next').NextConfig} */
const nextConfig = {
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
