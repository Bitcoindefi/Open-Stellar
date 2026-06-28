import fs from 'node:fs/promises'
import path from 'node:path'

const SKIP_FILES = new Set(['.gitkeep'])

export async function pathExists(targetPath) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

export async function copyTemplate(templateDir, targetDir, options) {
  await fs.mkdir(targetDir, { recursive: true })
  const entries = await fs.readdir(templateDir, { withFileTypes: true })

  for (const entry of entries) {
    if (SKIP_FILES.has(entry.name)) {
      continue
    }

    if (entry.name === 'vercel.json' && options.deployTarget !== 'vercel') {
      continue
    }

    if (entry.name === 'Dockerfile' && options.deployTarget !== 'docker') {
      continue
    }

    const sourcePath = path.join(templateDir, entry.name)
    const destPath = path.join(targetDir, entry.name)

    if (entry.isDirectory()) {
      await copyTemplate(sourcePath, destPath, options)
      continue
    }

    await fs.copyFile(sourcePath, destPath)
  }
}

export async function replaceInFile(filePath, replacements) {
  let content = await fs.readFile(filePath, 'utf8')

  for (const [token, value] of Object.entries(replacements)) {
    content = content.split(token).join(value)
  }

  await fs.writeFile(filePath, content, 'utf8')
}
