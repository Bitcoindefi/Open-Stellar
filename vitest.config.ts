import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["app/api/**/*.ts", "lib/**/*.ts"],
      exclude: ["lib/passport/validator-client.ts", "lib/passport/snarkjs.d.ts", "node_modules/", "dist/"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
})
