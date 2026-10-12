#!/usr/bin/env node
// Entry point for `npx agentic-city-runner` and `node packages/runner/bin.mjs`.

const [major] = process.versions.node.split(".").map(Number)
if (major < 20) {
  process.stderr.write(`agentic-city-runner necesita Node 20 o más nuevo (tenés ${process.versions.node}).\n`)
  process.exit(1)
}

const { main } = await import("./src/cli.mjs")
process.exitCode = await main()
