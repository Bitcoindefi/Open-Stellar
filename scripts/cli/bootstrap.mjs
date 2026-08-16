import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATE_DIR = path.resolve(__dirname, '../templates/agent')

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

function installDependencies(projectDir, spawnCommand) {
  return new Promise((resolve, reject) => {
    const child = spawnCommand('npm', ['install'], {
      cwd: projectDir,
      shell: process.platform === 'win32',
      stdio: 'inherit',
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`npm install failed with exit code ${code}`))
    })
  })
}

function printSuccess(projectName) {
  console.log('')
  console.log(`Created ${projectName}`)
  console.log('')
  console.log('Next steps:')
  console.log(`  cd ${projectName} && npm run dev`)
  console.log('')
}

export async function runBootstrap(argv = process.argv.slice(2), options = {}) {
  const [projectName] = argv
  const cwd = options.cwd ?? process.cwd()
  const spawnCommand = options.spawnCommand ?? spawn

  if (!projectName) {
    throw new Error('Usage: npx open-stellar bootstrap <project-name>')
  }

  const targetDir = path.resolve(cwd, projectName)

  if (await pathExists(targetDir)) {
    throw new Error(`Directory "${projectName}" already exists.`)
  }

  await fs.cp(TEMPLATE_DIR, targetDir, { recursive: true })

  const replacements = {
    __PROJECT_NAME__: projectName,
  }

  for (const fileName of ['package.json', 'README.md']) {
    const filePath = path.join(targetDir, fileName)
    let content = await fs.readFile(filePath, 'utf8')

    for (const [token, value] of Object.entries(replacements)) {
      content = content.split(token).join(value)
    }

    await fs.writeFile(filePath, content, 'utf8')
  }

  await installDependencies(targetDir, spawnCommand)
  printSuccess(projectName)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await runBootstrap()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
