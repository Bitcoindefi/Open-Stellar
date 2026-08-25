/**
 * File-backed persistence for the agent XP store (issue #191).
 *
 * Replaces the in-process `globalThis.__openStellarAgentXpDb__` map with a
 * write-through file store: every mutation is flushed to
 * `/.data/agent-xp.json` (path configurable via `AGENT_XP_STORE_PATH`) using
 * the same atomic temp-file + rename pattern as the x402 receipt store, so a
 * crash mid-write can never leave a partial file behind.
 *
 * Corruption policy: a malformed or truncated file is quarantined (renamed to
 * `.corrupt-<timestamp>`) and reported through a console warning - startup
 * proceeds with an empty store instead of crashing.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { cwd } from "node:process";

export interface AgentXPRecord {
  agentId: string;
  xp: number;
  level: number;
}

/** Daily XP snapshot for charting (issue #191 history endpoint). */
export interface AgentXPSnapshot {
  /** ISO date string (YYYY-MM-DD). */
  date: string;
  agentId: string;
  /** XP accumulated that day. */
  xpGained: number;
  /** Total XP as of end of that day. */
  totalXp: number;
}

type XpDb = Map<string, AgentXPRecord>;

const globalXp = globalThis as typeof globalThis & {
  __openStellarAgentXpDb__?: XpDb;
};

/** In-memory cache, warmed from disk at first touch. */
const agentXpDb: XpDb = globalXp.__openStellarAgentXpDb__ ?? new Map();
if (!globalXp.__openStellarAgentXpDb__) {
  loadFromDisk();
  globalXp.__openStellarAgentXpDb__ = agentXpDb;
}

function storePath(): string {
  const configured = process.env.AGENT_XP_STORE_PATH;
  if (configured && configured.trim().length > 0) return configured;
  return join(cwd(), ".data", "agent-xp.json");
}

/** Daily snapshots keyed by `${agentId}:${date}`, capped per agent. */
interface SnapshotState {
  daily: Record<string, number>;
  totals: Record<string, number>;
}
const SNAPSHOTS_MAX_PER_AGENT = 90;

let snapshotState: SnapshotState | null = null;

function snapshotFile(): string {
  const base = storePath();
  return join(dirname(base), "agent-xp-snapshots.json");
}

function loadSnapshots(): SnapshotState {
  if (snapshotState) return snapshotState;
  const path = snapshotFile();
  try {
    if (existsSync(path)) {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as SnapshotState;
      snapshotState = { daily: parsed.daily ?? {}, totals: parsed.totals ?? {} };
      return snapshotState;
    }
  } catch {
    warnCorrupt(path);
  }
  snapshotState = { daily: {}, totals: {} };
  return snapshotState;
}

function warnCorrupt(path: string): void {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    renameSync(path, `${path}.corrupt-${stamp}`);
    // eslint-disable-next-line no-console -- corruption must be visible in server logs
    console.warn(`[xp-store] corrupt state file quarantined: ${path}`);
  } catch {
    // eslint-disable-next-line no-console -- corruption must be visible in server logs
    console.warn(`[xp-store] unreadable state file at ${path} starting fresh`);
  }
}

function loadFromDisk(): void {
  const path = storePath();
  try {
    if (!existsSync(path)) return;
    const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, AgentXPRecord>;
    for (const [key, record] of Object.entries(raw)) {
      if (
        record &&
        typeof record.agentId === "string" &&
        Number.isFinite(record.xp) &&
        Number.isFinite(record.level)
      ) {
        agentXpDb.set(key, { agentId: key, xp: record.xp, level: record.level });
      }
    }
  } catch {
    warnCorrupt(path);
  }
}

function ensureDir(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** Atomic write: temp file in the same directory, then rename over the target. */
function atomicWrite(path: string, data: unknown): void {
  ensureDir(path);
  const tmpPath = `${path}.${process.pid}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  try {
    renameSync(tmpPath, path);
  } catch {
    // Windows can throw EPERM when a parallel process holds the target lock.
    // Fall back to a direct write so data is never silently lost.
    writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    try { renameSync(tmpPath, `${tmpPath}.done`); } catch { /* best-effort */ }
  }
}

function flush(): void {
  atomicWrite(storePath(), Object.fromEntries(agentXpDb));
}

/** Test hook: clear cache and backing files' contents, then reload empty. */
export function resetAgentXpStore(): void {
  agentXpDb.clear();
  snapshotState = null;
  for (const path of [storePath(), snapshotFile()]) {
    try { if (existsSync(path)) writeFileSync(path, "{}\n", "utf8"); } catch { /* ignore */ }
  }
}

/** Simulates a server cold start: drop cache, then reload from disk. */
export function simulateColdStart(): void {
  agentXpDb.clear();
  snapshotState = null;
  loadFromDisk();
}

export function getAgentXPFromFile(agentId: string): AgentXPRecord {
  return agentXpDb.get(agentId) ?? { agentId, xp: 0, level: 1 };
}

/** Write-through upsert used by awardXP so nothing is lost on restart. */
export function saveAgentXPRecord(record: AgentXPRecord): void {
  agentXpDb.set(record.agentId, record);
  flush();

  // Daily snapshot bookkeeping for the charting endpoint.
  const snaps = loadSnapshots();
  const today = new Date().toISOString().slice(0, 10);
  const key = `${record.agentId}:${today}`;
  const previousTotal = snaps.totals[record.agentId] ?? 0;
  snaps.daily[key] = Math.max(0, record.xp - previousTotal);
  snaps.totals[record.agentId] = record.xp;

  // Cap stored days per agent so the file cannot grow without bound.
  const keysForAgent = Object.keys(snaps.daily)
    .filter((k) => k.startsWith(`${record.agentId}:`))
    .sort();
  while (keysForAgent.length > SNAPSHOTS_MAX_PER_AGENT) {
    const oldest = keysForAgent.shift();
    if (oldest !== undefined) delete snaps.daily[oldest];
  }
  atomicWrite(snapshotFile(), snaps);
}

/** Daily XP snapshots for an agent, oldest first (charting endpoint). */
export function getAgentXPHistory(agentId: string): AgentXPSnapshot[] {
  const snaps = loadSnapshots();
  return Object.keys(snaps.daily)
    .filter((key) => key.startsWith(`${agentId}:`))
    .sort()
    .map((key) => {
      const date = key.slice(agentId.length + 1);
      const xpGained = snaps.daily[key] ?? 0;
      return { date, agentId, xpGained, totalXp: snaps.totals[agentId] ?? 0 };
    });
}

/** Seed honest history entries (tests / demos). */
export function seedAgentXPSnapshots(agentId: string, gains: number[], baseXp: number): void {
  const snaps = loadSnapshots();
  let total = baseXp;
  gains.forEach((gained, index) => {
    const date = new Date(Date.now() - (gains.length - index - 1) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    snaps.daily[`${agentId}:${date}`] = gained;
    total += gained;
    snaps.totals[agentId] = total;
  });
  // Enforce the per-agent cap here as well: seeding is the path most likely to
  // write many days at once, so it is exactly where the file could blow up.
  const keysForAgent = Object.keys(snaps.daily)
    .filter((k) => k.startsWith(`${agentId}:`))
    .sort();
  while (keysForAgent.length > SNAPSHOTS_MAX_PER_AGENT) {
    const oldestKey = keysForAgent.shift();
    if (oldestKey !== undefined) delete snaps.daily[oldestKey];
  }
  atomicWrite(snapshotFile(), snaps);
}
