import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { cwd } from "node:process";
import type { ApiKeyRecord } from "./api-keys";

const DEFAULT_API_KEYS_PATH = join(cwd(), ".data", "api-keys.json");

function getDbPath(): string {
  return process.env.API_KEYS_DB_PATH || DEFAULT_API_KEYS_PATH;
}

export function ensureDb(): void {
  const dbPath = getDbPath();
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  if (!existsSync(dbPath)) {
    writeFileSync(dbPath, "[]\n", "utf8");
  }
}

export function readPersistedKeys(): ApiKeyRecord[] {
  try {
    ensureDb();
    const dbPath = getDbPath();
    if (!existsSync(dbPath)) return [];
    const raw = readFileSync(dbPath, "utf8").trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ApiKeyRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writePersistedKeys(records: ApiKeyRecord[]): void {
  try {
    ensureDb();
    const dbPath = getDbPath();
    const tmpPath = `${dbPath}.${process.pid || "tmp"}.tmp`;
    const payload = `${JSON.stringify(records, null, 2)}\n`;
    writeFileSync(tmpPath, payload, "utf8");
    try {
      renameSync(tmpPath, dbPath);
    } catch {
      writeFileSync(dbPath, payload, "utf8");
    }
  } catch {
    // Non-fatal if filesystem is temporarily locked
  }
}
