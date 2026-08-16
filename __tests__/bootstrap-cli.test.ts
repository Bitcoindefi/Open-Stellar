import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { runBootstrap } from '../scripts/cli/bootstrap.mjs'

function createSuccessfulSpawn() {
  return vi.fn(() => {
    const child = new EventEmitter()
    queueMicrotask(() => child.emit('close', 0))
    return child
  })
}

describe('open-stellar bootstrap', () => {
  it('scaffolds an agent project and runs npm install', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'open-stellar-bootstrap-'))
    const spawnCommand = createSuccessfulSpawn()

    await runBootstrap(['my-agent'], {
      cwd: tempDir,
      spawnCommand,
    })

    const projectDir = path.join(tempDir, 'my-agent')
    const expectedFiles = [
      'package.json',
      'tsconfig.json',
      'next.config.mjs',
      '.env.example',
      'README.md',
      'lib/agent.ts',
      'app/page.tsx',
      'app/layout.tsx',
    ]

    await Promise.all(
      expectedFiles.map(async (fileName) => {
        await expect(fs.stat(path.join(projectDir, fileName))).resolves.toBeTruthy()
      }),
    )

    await expect(fs.readFile(path.join(projectDir, 'package.json'), 'utf8')).resolves.toContain('"name": "my-agent"')
    await expect(fs.readFile(path.join(projectDir, 'README.md'), 'utf8')).resolves.toContain('# my-agent')
    await expect(fs.readFile(path.join(projectDir, '.env.example'), 'utf8')).resolves.toContain('ANTHROPIC_API_KEY=')
    expect(spawnCommand).toHaveBeenCalledWith('npm', ['install'], expect.objectContaining({ cwd: projectDir }))
  })

  it('errors when the project directory already exists', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'open-stellar-bootstrap-'))
    await fs.mkdir(path.join(tempDir, 'my-agent'))

    await expect(
      runBootstrap(['my-agent'], {
        cwd: tempDir,
        spawnCommand: createSuccessfulSpawn(),
      }),
    ).rejects.toThrow('Directory "my-agent" already exists.')
  })
})
