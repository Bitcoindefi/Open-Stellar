/**
 * Dual-backend storage for API key records.
 *
 * Priority:
 *   1. Upstash Redis REST (activated when UPSTASH_REDIS_REST_URL +
 *      UPSTASH_REDIS_REST_TOKEN are set) — shared across all serverless
 *      invocations, survives cold starts.
 *   2. Local JSON file (API_KEYS_DB_PATH or cwd()/.data/api-keys.json) —
 *      suitable for self-hosted / local development.
 *
 * No new npm packages are required; the KV path uses plain fetch().
 */

import type { ApiKeyRecord } from "./api-keys";

// ─── KV constants ────────────────────────────────────────────────────────────

const KV_RECORD_KEY = "open-stellar:api-keys";

// ─── Warm in-memory cache (populated by initStorage on first call) ────────────

let cachedRecords: ApiKeyRecord[] | null = null;

export function clearStorageCache(): void {
  cachedRecords = null;
}

// ─── Backend detection ────────────────────────────────────────────────────────

function isKvConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL &&
      process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}

// ─── Upstash Redis REST helpers ───────────────────────────────────────────────

async function kvGet(): Promise<ApiKeyRecord[]> {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;

  const res = await fetch(`${url}/get/${encodeURIComponent(KV_RECORD_KEY)}`, {
    headers: { Authorization: `Bearer ${token}` },
    // Skip Next.js data cache so we always read the latest state.
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(
      `[open-stellar] KV GET failed: ${res.status} ${res.statusText}`,
    );
  }

  const json = (await res.json()) as { result: string | null };
  if (!json.result) return [];

  try {
    const parsed = JSON.parse(json.result) as ApiKeyRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function kvSet(records: ApiKeyRecord[]): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const payload = JSON.stringify(records);

  const res = await fetch(`${url}/set/${encodeURIComponent(KV_RECORD_KEY)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([payload]),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(
      `[open-stellar] KV SET failed: ${res.status} ${res.statusText}`,
    );
  }
}

// ─── File backend (unchanged semantics) ──────────────────────────────────────

function fileBackend() {
  // Lazy-require so the module is tree-shaken in edge/KV-only builds.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("node:path") as typeof import("node:path");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const process_ = require("node:process") as typeof import("node:process");

  const DEFAULT_PATH = path.join(process_.cwd(), ".data", "api-keys.json");
  const dbPath = process.env.API_KEYS_DB_PATH || DEFAULT_PATH;
  const dir = path.dirname(dbPath);

  function ensureDir() {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, "[]\n", "utf8");
  }

  function read(): ApiKeyRecord[] {
    try {
      ensureDir();
      const raw = fs.readFileSync(dbPath, "utf8").trim();
      if (!raw) return [];
      const parsed = JSON.parse(raw) as ApiKeyRecord[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function write(records: ApiKeyRecord[]) {
    try {
      ensureDir();
      const tmpPath = `${dbPath}.${process.pid || "tmp"}.tmp`;
      const payload = `${JSON.stringify(records, null, 2)}\n`;
      fs.writeFileSync(tmpPath, payload, "utf8");
      try {
        fs.renameSync(tmpPath, dbPath);
      } catch {
        // Rename may fail on cross-device moves; fall back to direct write.
        fs.writeFileSync(dbPath, payload, "utf8");
      }
    } catch (err) {
      console.error(
        "[open-stellar] api-keys: failed to persist key store to",
        dbPath,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { read, write };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Hydrates the in-memory cache from the configured backend.
 * Must be awaited once per invocation before any read.
 * Subsequent calls within the same invocation are no-ops (cache hit).
 */
export async function initStorage(): Promise<void> {
  if (cachedRecords !== null) return;

  if (isKvConfigured()) {
    try {
      cachedRecords = await kvGet();
    } catch (err) {
      console.error(
        "[open-stellar] KV read failed, falling back to empty store:",
        err instanceof Error ? err.message : err,
      );
      cachedRecords = [];
    }
  } else {
    cachedRecords = fileBackend().read();
  }
}

/**
 * Returns the cached records (synchronous after initStorage has been awaited).
 */
export function readPersistedKeys(): ApiKeyRecord[] {
  // If cache is cold (e.g. test reset), fall back to synchronous file read.
  if (cachedRecords === null) {
    if (isKvConfigured()) {
      // KV path requires async; callers must ensure initStorage() was awaited.
      console.warn(
        "[open-stellar] readPersistedKeys called before initStorage() on KV backend; returning []",
      );
      return [];
    }
    cachedRecords = fileBackend().read();
  }
  return cachedRecords;
}

/**
 * Persists the full record list and updates the in-memory cache.
 */
export async function writePersistedKeys(
  records: ApiKeyRecord[],
): Promise<void> {
  cachedRecords = records;

  if (isKvConfigured()) {
    try {
      await kvSet(records);
    } catch (err) {
      console.error(
        "[open-stellar] KV write failed:",
        err instanceof Error ? err.message : err,
      );
    }
  } else {
    fileBackend().write(records);
  }
}
