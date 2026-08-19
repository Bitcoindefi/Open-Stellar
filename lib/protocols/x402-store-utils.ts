import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export interface JsonStore<T> {
  read(): T[]
  write(items: T[]): void
  reset(): void
}

/**
 * Creates a file-backed JSON array store at the given path.
 * - Auto-creates the parent directory and empty `[]` file on first use.
 * - `read()` always returns an array; corrupt JSON returns `[]` rather than throwing.
 * - `write()` overwrites the file in-place (Windows-safe — avoids renameSync EPERM).
 */
export function makeJsonStore<T>(dbPath: string): JsonStore<T> {
  function ensureDb(): void {
    const dir = dirname(dbPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    if (!existsSync(dbPath)) {
      writeFileSync(dbPath, '[]\n', 'utf8')
    }
  }

  function read(): T[] {
    ensureDb()
    const raw = readFileSync(dbPath, 'utf8').trim()
    if (!raw) return []
    try {
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as T[]) : []
    } catch {
      return []
    }
  }

  function write(items: T[]): void {
    ensureDb()
    writeFileSync(dbPath, `${JSON.stringify(items, null, 2)}\n`, 'utf8')
  }

  function reset(): void {
    write([])
  }

  return { read, write, reset }
}
