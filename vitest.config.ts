import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // Run test files sequentially to prevent concurrent writes to the same
    // file-backed stores (.data/x402-*.json) from racing each other.
    // Import / transform time dominates runtime anyway, so wall-clock impact is minimal.
    sequence: {
      concurrent: false,
    },
    // The create-app template is a scaffold compiled inside generated apps, not here;
    // its imports (@/lib/agents/my-first-agent, ...) don't resolve in this repo.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "packages/create-app/template/**",
      "e2e/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["app/api/**/*.ts", "lib/**/*.ts"],
      exclude: [
        "lib/passport/validator-client.ts",
        "lib/passport/snarkjs.d.ts",
        "node_modules/",
        "dist/",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
