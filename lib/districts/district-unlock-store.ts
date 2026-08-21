import type { DistrictId } from "@/lib/types";
import { DISTRICT_REGISTRY } from "./district-registry";

interface UnlockRecord {
  unlockedAtMs: number;
  xpAtUnlock: number;
}

interface AgentXpRecord {
  xpCurrent: number;
  unlocks: Map<DistrictId, UnlockRecord>;
}

type DistrictUnlockDb = Map<string, AgentXpRecord>;

const globalDb = globalThis as typeof globalThis & {
  __openStellarDistrictUnlockDb__?: DistrictUnlockDb;
};

const db: DistrictUnlockDb = (globalDb.__openStellarDistrictUnlockDb__ ??=
  new Map());

export interface UnlockedDistrictEntry {
  id: DistrictId;
  label: string;
  status: "unlocked";
  unlockedAt: number;
  xpRequired: number;
  xpAtUnlock: number;
}

export interface LockedDistrictEntry {
  id: DistrictId;
  label: string;
  status: "locked";
  xpRequired: number;
  xpCurrent: number;
  progressPct: number;
}

export type DistrictMapEntry = UnlockedDistrictEntry | LockedDistrictEntry;

export interface DistrictMapResult {
  agentId: string;
  districts: DistrictMapEntry[];
}

export function recordAgentXp(
  agentId: string,
  totalXp: number,
  nowMs = Date.now(),
): void {
  const cleanId = agentId.trim();
  if (!cleanId) throw new Error("agentId is required");
  if (!Number.isFinite(totalXp) || totalXp < 0)
    throw new Error("totalXp must be a non-negative finite number");

  const existing = db.get(cleanId) ?? { xpCurrent: 0, unlocks: new Map() };
  existing.xpCurrent = totalXp;

  for (const meta of DISTRICT_REGISTRY) {
    if (totalXp >= meta.xpRequired && !existing.unlocks.has(meta.id)) {
      existing.unlocks.set(meta.id, {
        unlockedAtMs: nowMs,
        xpAtUnlock: totalXp,
      });
    }
  }

  db.set(cleanId, existing);
}

export function getDistrictUnlockMap(agentId: string): DistrictMapResult {
  const cleanId = agentId.trim();
  const record = db.get(cleanId);
  const xpCurrent = record?.xpCurrent ?? 0;

  const districts: DistrictMapEntry[] = DISTRICT_REGISTRY.map((meta) => {
    const unlock = record?.unlocks.get(meta.id);
    if (unlock) {
      return {
        id: meta.id,
        label: meta.label,
        status: "unlocked",
        unlockedAt: unlock.unlockedAtMs,
        xpRequired: meta.xpRequired,
        xpAtUnlock: unlock.xpAtUnlock,
      } satisfies UnlockedDistrictEntry;
    }
    return {
      id: meta.id,
      label: meta.label,
      status: "locked",
      xpRequired: meta.xpRequired,
      xpCurrent,
      progressPct: Math.floor((xpCurrent / meta.xpRequired) * 100),
    } satisfies LockedDistrictEntry;
  });

  return { agentId: cleanId, districts };
}

export function resetDistrictUnlockStore(): void {
  db.clear();
}
