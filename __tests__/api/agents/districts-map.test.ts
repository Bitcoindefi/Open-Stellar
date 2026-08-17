import { afterEach, describe, expect, it } from "vitest"
import { GET as getDistrictsMap } from "@/app/api/agents/[id]/districts/map/route"
import {
  getDistrictUnlockMap,
  recordAgentXp,
  resetDistrictUnlockStore,
} from "@/lib/districts/district-unlock-store"
import { DISTRICT_REGISTRY } from "@/lib/districts/district-registry"

function context(id: string) {
  return { params: Promise.resolve({ id }) }
}

afterEach(() => {
  resetDistrictUnlockStore()
})

describe("district map route", () => {
  it("returns all configured districts with 1 unlocked and 2 locked with correct status fields", async () => {
    const unlockMs = Date.parse("2026-06-27T10:00:00.000Z")
    recordAgentXp("bot-1", 531, unlockMs)

    const res = await getDistrictsMap(
      new Request("http://localhost/api/agents/bot-1/districts/map"),
      context("bot-1"),
    )
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.agentId).toBe("bot-1")
    expect(data.districts).toHaveLength(DISTRICT_REGISTRY.length)

    const dataCenter = data.districts.find((d: { id: string }) => d.id === "data-center")
    expect(dataCenter).toMatchObject({
      id: "data-center",
      label: "Data Center",
      status: "unlocked",
      unlockedAt: unlockMs,
      xpRequired: 500,
      xpAtUnlock: 531,
    })
    expect(dataCenter).not.toHaveProperty("xpCurrent")
    expect(dataCenter).not.toHaveProperty("progressPct")

    const commHub = data.districts.find((d: { id: string }) => d.id === "comm-hub")
    expect(commHub).toMatchObject({
      id: "comm-hub",
      label: "Comm Hub",
      status: "locked",
      xpRequired: 1500,
      xpCurrent: 531,
      progressPct: 35,
    })
    expect(commHub).not.toHaveProperty("unlockedAt")
    expect(commHub).not.toHaveProperty("xpAtUnlock")

    const processing = data.districts.find((d: { id: string }) => d.id === "processing")
    expect(processing).toMatchObject({
      status: "locked",
      xpRequired: 3000,
      xpCurrent: 531,
      progressPct: 17,
    })
  })

  it("returns all districts as locked with progressPct 0 for an agent with no XP recorded", async () => {
    const res = await getDistrictsMap(
      new Request("http://localhost/api/agents/bot-new/districts/map"),
      context("bot-new"),
    )
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.agentId).toBe("bot-new")
    expect(data.districts).toHaveLength(DISTRICT_REGISTRY.length)
    for (const district of data.districts) {
      expect(district.status).toBe("locked")
      expect(district.xpCurrent).toBe(0)
      expect(district.progressPct).toBe(0)
    }
  })

  it("unlocks multiple districts when XP surpasses several thresholds at once", () => {
    recordAgentXp("bot-2", 4000)
    const result = getDistrictUnlockMap("bot-2")

    const unlocked = result.districts.filter((d) => d.status === "unlocked")
    const locked = result.districts.filter((d) => d.status === "locked")

    expect(unlocked).toHaveLength(3)
    expect(unlocked.map((d) => d.id)).toEqual(["data-center", "comm-hub", "processing"])
    expect(locked).toHaveLength(2)
    expect(locked.map((d) => d.id)).toEqual(["defense", "research"])

    for (const d of unlocked) {
      expect(d).toHaveProperty("xpAtUnlock", 4000)
    }
  })

  it("xpRequired on each district matches the registry threshold", async () => {
    recordAgentXp("bot-3", 0)
    const result = getDistrictUnlockMap("bot-3")

    for (let i = 0; i < DISTRICT_REGISTRY.length; i++) {
      expect(result.districts[i].xpRequired).toBe(DISTRICT_REGISTRY[i].xpRequired)
    }
  })
})
