import webpack from "webpack";
import { withLogtail } from "@logtail/next";

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/agents/:id(cloud-[^/]+)",
        destination: "/agent-functions/:id",
      },
    ];
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
      };
        // Optional peer deps of @wagmi/connectors — not installed, stub them out
        // to suppress "Module not found" build warnings.
        '@base-org/account': false,
        '@metamask/connect-evm': false,
      }
      config.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ["buffer", "Buffer"],
        }),
      );
    }

    // Stub optional @wagmi/connectors dependencies that are not installed.
    // Without these aliases the client bundle fails with "Module not found".
    config.resolve.alias = {
      ...config.resolve.alias,
      "@base-org/account": new URL("src/shims/empty-client-shim.js", import.meta.url).pathname,
      "@metamask/connect-evm": new URL("src/shims/empty-client-shim.js", import.meta.url).pathname,
    };

    return config;
  },
};

export default withLogtail(nextConfig);
