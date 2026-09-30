import { afterEach, describe, expect, it } from "vitest";
import { createAdminSessionToken, isAdminSessionToken } from "./admin-session";

const previousAdminKey = process.env.ADMIN_API_KEY;
const previousNodeEnv = process.env.NODE_ENV;
const mutableEnv = process.env as Record<string, string | undefined>;

afterEach(() => {
  if (previousAdminKey === undefined) delete process.env.ADMIN_API_KEY;
  else process.env.ADMIN_API_KEY = previousAdminKey;
  if (previousNodeEnv === undefined) delete mutableEnv.NODE_ENV;
  else mutableEnv.NODE_ENV = previousNodeEnv;
});

describe("admin sessions", () => {
  it("accepts a valid token only during its eight-hour lifetime", () => {
    process.env.ADMIN_API_KEY = "test-admin-secret";
    const issuedAt = Date.UTC(2026, 8, 23, 13, 0, 0);
    const token = createAdminSessionToken(issuedAt);

    expect(isAdminSessionToken(token, issuedAt)).toBe(true);
    expect(isAdminSessionToken(token, issuedAt + 8 * 60 * 60 * 1000)).toBe(true);
    expect(isAdminSessionToken(token, issuedAt + 8 * 60 * 60 * 1000 + 1000)).toBe(false);
    expect(isAdminSessionToken(`${token}x`, issuedAt)).toBe(false);
  });

  it("rejects tokens when the signing secret is not configured in production", () => {
    delete process.env.ADMIN_API_KEY;
    mutableEnv.NODE_ENV = "production";
    expect(isAdminSessionToken("1780182000.signature")).toBe(false);
  });
});
