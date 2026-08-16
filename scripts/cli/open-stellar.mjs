#!/usr/bin/env node

import { runBootstrap } from './bootstrap.mjs'

const [command, ...args] = process.argv.slice(2)

try {
  if (command === 'bootstrap') {
    await runBootstrap(args)
  } else {
    console.error('Usage: npx open-stellar bootstrap <project-name>')
    process.exit(1)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
