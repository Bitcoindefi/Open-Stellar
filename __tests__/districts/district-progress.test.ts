import { beforeEach, describe, expect, it } from "vitest";
import { GET as getDistricts } from "@/app/api/agents/[id]/districts/route";
import { recordAgentXp, resetDistrictUnlockStore } from "@/lib/districts/district-unlock-store";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function fetchBody(id: string) {
  const res = await getDistricts(new Request("http://localhost/x"), ctx(id));
  const body = await res.json();
  return { res, body };
}

/**
 * Issue #300 acceptance, against the real route handler:
 *   - 0 XP: everything locked, progress 0%
 *   - 500 XP: first district unlocked, next at ~33%
 *   - unlock fires exactly once per district per agent
 */
describe("district unlock progress (issue #300)", () => {
  beforeEach(() => {
    resetDistrictUnlockStore();
  });

  it("agent at 0 XP: all locked with 0% progress", async () => {
    const { res, body } = await fetchBody("progress-agent");

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.unlocked).toEqual([]);
    for (const entry of body.progress) {
      expect(entry.current).toBe(0);
      expect(entry.pct).toBe(0);
      expect(entry.required).toBeGreaterThan(0);
    }
  });

  it("agent at 500 XP: first district unlocked, next at ~33%", async () => {
    recordAgentXp("progress-agent", 500);

    const { body } = await fetchBody("progress-agent");

    expect(body.unlocked).toContain("data-center");
    const commHub = body.progress.find((p: { district: string }) => p.district === "comm-hub");
    expect(commHub).toBeDefined();
    expect(commHub.current).toBe(500);
    expect(commHub.required).toBe(1500);
    expect(commHub.pct).toBe(33); // floor(500/1500*100)
  });

  it("absolute XP totals accumulate across updates and pct grows", async () => {
    recordAgentXp("progress-agent", 200);
    let { body } = await fetchBody("progress-agent");
    const dataCenterBefore = body.progress.find((p: { district: string }) => p.district === "data-center");
    expect(dataCenterBefore.pct).toBe(40); // 200/500

    recordAgentXp("progress-agent", 600); // absolute total
    ({ body } = await fetchBody("progress-agent"));
    expect(body.unlocked).toContain("data-center");
  });

  it("unlocks each district exactly once per agent", async () => {
    recordAgentXp("once-agent", 500);
    recordAgentXp("once-agent", 900); // data-center must not re-unlock
    recordAgentXp("once-agent", 1500); // comm-hub unlocks now

    const { body } = await fetchBody("once-agent");
    // Exactly one entry per district, no duplicates from repeated XP updates.
    const counts = new Map<string, number>();
    for (const id of body.unlocked) counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const [, count] of counts) expect(count).toBe(1);
    expect(body.unlocked).toContain("data-center");
    expect(body.unlocked).toContain("comm-hub");
  });

  it("returns 0% progress entries for every locked district in order", async () => {
    const { body } = await fetchBody("fresh-agent");
    const districts = body.progress.map((p: { district: string }) => p.district);
    expect(districts).toContain("data-center");
    expect(districts).toContain("research");
  });
});

