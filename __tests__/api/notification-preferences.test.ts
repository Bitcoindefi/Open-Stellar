import { afterEach, describe, expect, it } from "vitest"

import { GET, PATCH } from "@/app/api/notifications/preferences/route"
import { resetNotificationPreferences } from "@/lib/notifications/notification-preferences"

afterEach(() => {
  resetNotificationPreferences()
})

describe("GET /api/notifications/preferences", () => {
  it("returns an empty muted list when the agent has no preferences", async () => {
    const response = await GET(
      new Request("http://localhost/api/notifications/preferences?agentId=agent-new"),
    )
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual({
      ok: true,
      agentId: "agent-new",
      muted: [],
      updatedAt: expect.any(String),
    })
  })
})

describe("PATCH /api/notifications/preferences", () => {
  it("saves muted notification types", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: "agent-preferences",
          muted: ["agent_offline", "quest_expired"],
        }),
      }),
    )
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual({
      ok: true,
      agentId: "agent-preferences",
      muted: ["agent_offline", "quest_expired"],
      updatedAt: expect.any(String),
    })

    const getResponse = await GET(
      new Request("http://localhost/api/notifications/preferences?agentId=agent-preferences"),
    )
    expect(await getResponse.json()).toEqual(data)
  })

  it("rejects unknown muted notification types", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: "agent-preferences",
          muted: ["agent_offline", "unknown_type"],
        }),
      }),
    )
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data).toEqual({
      ok: false,
      error: "muted contains invalid notification type: unknown_type",
    })
  })
})
