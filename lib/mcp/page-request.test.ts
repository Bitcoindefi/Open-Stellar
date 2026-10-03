import { describe, expect, it, vi } from "vitest"

const headerState = vi.hoisted(() => ({ values: {} as Record<string, string> }))
vi.mock("next/headers", () => ({
  headers: async () => new Headers(headerState.values),
}))

import { pageRequest } from "@/lib/mcp/page-request"

describe("pageRequest", () => {
  it("rebuilds the page URL and carries only the cookies", async () => {
    headerState.values = { host: "agentic-city.vercel.app", "x-forwarded-proto": "https", cookie: "ac_uid=abc", authorization: "Bearer x" }
    const req = await pageRequest("/mcp/authorize")
    expect(req.url).toBe("https://agentic-city.vercel.app/mcp/authorize")
    expect(req.headers.get("cookie")).toBe("ac_uid=abc")
    expect(req.headers.get("authorization")).toBeNull()
  })

  it("defaults to http on localhost and https elsewhere", async () => {
    headerState.values = { host: "localhost:3919" }
    expect((await pageRequest("/mcp")).url).toBe("http://localhost:3919/mcp")
    headerState.values = { "x-forwarded-host": "example.test" }
    expect((await pageRequest("/mcp")).url).toBe("https://example.test/mcp")
    headerState.values = {}
    expect((await pageRequest("/mcp")).url).toBe("http://localhost/mcp")
  })
})
