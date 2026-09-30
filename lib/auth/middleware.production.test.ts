import { afterEach, describe, expect, it } from "vitest";
import { evaluateAuth } from "./middleware";

const previousNodeEnv = process.env.NODE_ENV;
const previousDevMode = process.env.DEV_MODE;
const mutableEnv = process.env as Record<string, string | undefined>;

afterEach(() => {
  if (previousNodeEnv === undefined) delete mutableEnv.NODE_ENV;
  else mutableEnv.NODE_ENV = previousNodeEnv;
  if (previousDevMode === undefined) delete process.env.DEV_MODE;
  else process.env.DEV_MODE = previousDevMode;
});

describe("admin middleware in production", () => {
  it("does not let DEV_MODE bypass admin authentication", async () => {
    mutableEnv.NODE_ENV = "production";
    process.env.DEV_MODE = "true";

    const result = await evaluateAuth(new Request("https://example.test/admin"));
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(401);
  });
});
