import { describe, expect, it } from "vitest"
import { GET as exportUserData } from "@/app/api/user/export/route"
import { POST as requestDeletion } from "@/app/api/user/delete-request/route"

describe("user privacy routes", () => {
  it("exports GDPR data as no-store JSON", async () => {
    const res = await exportUserData()
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(res.headers.get("Cache-Control")).toBe("no-store")
    expect(res.headers.get("Content-Disposition")).toContain("open-stellar-export")
    expect(data.dataControllerContact).toBe("legal@open-stellar.xyz")
    expect(data.userData.walletAddresses).toEqual([])
    expect(data.notes.join(" ")).toContain("Private keys")
  })

  it("accepts deletion requests with a contact or wallet address", async () => {
    const res = await requestDeletion(
      new Request("http://localhost/api/user/delete-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact: "operator@example.com" }),
      }),
    )
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.status).toBe("received")
    expect(data.contact).toBe("operator@example.com")
  })

  it("rejects deletion requests without a contact handle", async () => {
    const res = await requestDeletion(
      new Request("http://localhost/api/user/delete-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    )
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.ok).toBe(false)
  })
})
