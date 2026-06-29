import { LRUCache } from "lru-cache";

export interface SkillVersion {
  skillId: string;
  version: string;        // semver, e.g. "1.2.0"
  handler: string;        // serialized function reference or module path
  metadata: {
    description?: string;
    createdAt: string;
    author?: string;
  };
}

// Storage: skillId@version → SkillVersion
// Plus: latest:skillId → version string
const store = new Map<string, SkillVersion>();
const latestPointers = new Map<string, string>();

// LRU cache for hot invocations (optional optimization)
const cache = new LRUCache<string, SkillVersion>({
  max: 500,
  ttl: 1000 * 60 * 5, // 5 min
});

export function makeKey(skillId: string, version: string): string {
  return `${skillId}@${version}`;
}

export function registerSkill(skill: SkillVersion): void {
  const key = makeKey(skill.skillId, skill.version);
  if (store.has(key)) {
    throw new Error("Skill version already exists");
  }
  store.set(key, skill);
  // Update latest pointer if this is the first version or newer semver
  const currentLatest = latestPointers.get(skill.skillId);
  if (!currentLatest || isNewerVersion(skill.version, currentLatest)) {
    latestPointers.set(skill.skillId, skill.version);
  }
}

export function getSkill(skillId: string, version?: string): SkillVersion | undefined {
  const targetVersion = version ?? latestPointers.get(skillId);
  if (!targetVersion) return undefined;
  const key = makeKey(skillId, targetVersion);
  // Check cache first
  const cached = cache.get(key);
  if (cached) return cached;
  const skill = store.get(key);
  if (skill) cache.set(key, skill);
  return skill;
}

export function getAllVersions(skillId: string): string[] {
  const versions: string[] = [];
  for (const [key, skill] of store.entries()) {
    if (skill.skillId === skillId) {
      versions.push(skill.version);
    }
  }
  return versions.sort(compareSemver);
}

export function getAllSkills(): { skillId: string; versions: string[]; latest: string }[] {
  const skillMap = new Map<string, string[]>();
  for (const [key, skill] of store.entries()) {
    if (!skillMap.has(skill.skillId)) {
      skillMap.set(skill.skillId, []);
    }
    skillMap.get(skill.skillId)!.push(skill.version);
  }
  return Array.from(skillMap.entries()).map(([skillId, versions]) => ({
    skillId,
    versions: versions.sort(compareSemver),
    latest: latestPointers.get(skillId) ?? versions[0],
  }));
}

// ── Semver helpers ─────────────────────────────────────────────────────────
function parseSemver(v: string): [number, number, number] {
  const parts = v.split(".").map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function compareSemver(a: string, b: string): number {
  const [ma, mi, pa] = parseSemver(a);
  const [mb, mi2, pb] = parseSemver(b);
  if (ma !== mb) return ma - mb;
  if (mi !== mi2) return mi - mi2;
  return pa - pb;
}

function isNewerVersion(a: string, b: string): boolean {
  return compareSemver(a, b) > 0;
}

// ── Debug / reset ──────────────────────────────────────────────────────────
export function _resetStore(): void {
  store.clear();
  latestPointers.clear();
  cache.clear();
}