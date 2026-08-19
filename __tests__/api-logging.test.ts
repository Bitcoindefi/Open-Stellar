import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearLogtailLoggerForTests,
  createApiRouteLogger,
  logApiEvent,
} from "@/lib/api-logging";

const info = vi.fn().mockResolvedValue({});
const warn = vi.fn().mockResolvedValue({});
const error = vi.fn().mockResolvedValue({});

vi.mock("@logtail/node", () => ({
  Logtail: vi.fn().mockImplementation(function () {
    return { info, warn, error };
  }),
}));

afterEach(() => {
  delete process.env.LOGTAIL_SOURCE_TOKEN;
  clearLogtailLoggerForTests();
  info.mockClear();
  warn.mockClear();
  error.mockClear();
});

describe("api logging", () => {
  it("does nothing when LOGTAIL_SOURCE_TOKEN is not configured", async () => {
    const api = createApiRouteLogger(
      new Request("http://localhost/api/test"),
      "/api/test",
    );

    const res = await api.json({ ok: true });

    expect(res.status).toBe(200);
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("emits route, method, path, status, and duration context", async () => {
    process.env.LOGTAIL_SOURCE_TOKEN = "test-token";
    const api = createApiRouteLogger(
      new Request("http://localhost/api/protocol/x402/settle?debug=true", {
        method: "POST",
      }),
      "/api/protocol/x402/settle",
    );

    const res = await api.json({ ok: true }, undefined, {
      event: "x402.settle.completed",
      paymentRef: "p1",
    });

    expect(res.status).toBe(200);
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith(
      "api.route.completed",
      expect.objectContaining({
        route: "/api/protocol/x402/settle",
        method: "POST",
        path: "/api/protocol/x402/settle",
        status: 200,
        event: "x402.settle.completed",
        paymentRef: "p1",
        durationMs: expect.any(Number),
        query: { debug: "true" },
      }),
    );
  });

  it("uses warning logs for 4xx responses", async () => {
    process.env.LOGTAIL_SOURCE_TOKEN = "test-token";
    const api = createApiRouteLogger(
      new Request("http://localhost/api/test"),
      "/api/test",
    );

    await api.json({ ok: false }, { status: 400 }, { reason: "bad_input" });

    expect(warn).toHaveBeenCalledWith(
      "api.route.completed",
      expect.objectContaining({
        status: 400,
        reason: "bad_input",
      }),
    );
  });

  it("normalizes errors and never fails the response when logging rejects", async () => {
    process.env.LOGTAIL_SOURCE_TOKEN = "test-token";
    error.mockRejectedValueOnce(new Error("logger offline"));
    const api = createApiRouteLogger(
      new Request("http://localhost/api/test"),
      "/api/test",
    );

    const res = await api.report(
      "error",
      new Error("route failed"),
      { ok: false },
      { status: 500 },
    );

    expect(res.status).toBe(500);
    expect(error).toHaveBeenCalledWith(
      "api.route.failed",
      expect.objectContaining({
        status: 500,
        error: expect.objectContaining({
          name: "Error",
          message: "route failed",
        }),
      }),
    );
  });

  it("can emit standalone structured events", async () => {
    process.env.LOGTAIL_SOURCE_TOKEN = "test-token";

    await logApiEvent("info", "custom.event", {
      route: "/api/test",
      long: "x".repeat(700),
    });

    expect(info).toHaveBeenCalledWith(
      "custom.event",
      expect.objectContaining({
        route: "/api/test",
        long: expect.stringMatching(/\.\.\.$/),
      }),
    );
  });

  it("redacts sensitive context fields and query params", async () => {
    process.env.LOGTAIL_SOURCE_TOKEN = "test-token";
    const api = createApiRouteLogger(
      new Request("http://localhost/api/test?token=abc123&debug=true"),
      "/api/test",
    );

    await api.json({ ok: true }, undefined, {
      signedXdr: "AAAA",
      apiKey: "secret-value",
    });

    expect(info).toHaveBeenCalledWith(
      "api.route.completed",
      expect.objectContaining({
        apiKey: "[redacted]",
        signedXdr: "[redacted]",
        query: {
          token: "[redacted]",
          debug: "true",
        },
      }),
    );
  });
});
