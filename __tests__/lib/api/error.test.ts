import { describe, expect, it } from "vitest";
import { apiError } from "@/lib/api/error";

describe("apiError", () => {
  it("returns the canonical error shape with an explicit code", async () => {
    const res = apiError("not found", "NOT_FOUND", 404);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "not found", code: "NOT_FOUND" });
  });

  it("defaults the code from the status when omitted", async () => {
    for (const [status, code] of [
      [400, "BAD_REQUEST"],
      [404, "NOT_FOUND"],
      [409, "CONFLICT"],
      [422, "UNPROCESSABLE"],
      [429, "RATE_LIMITED"],
      [500, "INTERNAL"],
    ] as const) {
      const res = apiError("boom", undefined, status);
      const body = await res.json();
      expect(res.status).toBe(status);
      expect(body).toEqual({ ok: false, error: "boom", code });
    }
  });

  it("defaults to status 400", () => {
    expect(apiError("bad").status).toBe(400);
  });
});
