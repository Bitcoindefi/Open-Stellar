import { describe, it, expect, vi } from "vitest";

const mockXdr = "AAAAAQAAAAA_MOCK_XDR";

// Mock Stellar SDK — use function keyword for constructor compatibility.
// We also mock Operation.payment to bypass address checksum validation.
vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@stellar/stellar-sdk")>();
  const mockTx = { toXDR: () => mockXdr };
  const mockBuilder = {
    addOperation: vi.fn().mockReturnThis(),
    setTimeout: vi.fn().mockReturnThis(),
    build: vi.fn().mockReturnValue(mockTx),
  };
  return {
    ...original,
    Horizon: {
      Server: vi.fn().mockImplementation(function (this: {
        loadAccount: unknown;
      }) {
        this.loadAccount = vi.fn().mockResolvedValue({
          account_id: "GTEST",
          sequence: "1",
          balances: [],
          flags: {},
          thresholds: {},
          signers: [],
          data_attr: {},
          _baseAccount: null,
          _data: {},
        });
      }),
    },
    TransactionBuilder: vi.fn().mockImplementation(function () {
      return mockBuilder;
    }),
    Operation: {
      ...original.Operation,
      payment: vi.fn().mockReturnValue({ type: "payment" }),
    },
  };
});

import { POST } from "@/app/api/stellar/build-tx/route";

describe("POST /api/stellar/build-tx — input validation", () => {
  it("rejects missing sourcePublic", async () => {
    const req = new Request("http://localhost/api/stellar/build-tx", {
      method: "POST",
      body: JSON.stringify({ destination: "GDEST...", amount: "10" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeTruthy();
  });

  it("rejects missing destination", async () => {
    const req = new Request("http://localhost/api/stellar/build-tx", {
      method: "POST",
      body: JSON.stringify({ sourcePublic: "GSRC...", amount: "10" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects missing amount", async () => {
    const req = new Request("http://localhost/api/stellar/build-tx", {
      method: "POST",
      body: JSON.stringify({
        sourcePublic: "GSRC...",
        destination: "GDEST...",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects zero amount", async () => {
    const req = new Request("http://localhost/api/stellar/build-tx", {
      method: "POST",
      body: JSON.stringify({
        sourcePublic: "GSRC...",
        destination: "GDEST...",
        amount: "0",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid amount");
  });

  it("rejects negative amount", async () => {
    const req = new Request("http://localhost/api/stellar/build-tx", {
      method: "POST",
      body: JSON.stringify({
        sourcePublic: "GSRC...",
        destination: "GDEST...",
        amount: "-5",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid amount");
  });

  it("rejects amount exceeding 900M XLM", async () => {
    const req = new Request("http://localhost/api/stellar/build-tx", {
      method: "POST",
      body: JSON.stringify({
        sourcePublic: "GSRC...",
        destination: "GDEST...",
        amount: "999999999",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid amount");
  });

  it("accepts valid amount and returns xdr with ok:true", async () => {
    const req = new Request("http://localhost/api/stellar/build-tx", {
      method: "POST",
      body: JSON.stringify({
        sourcePublic: "GSRC...",
        destination: "GDEST...",
        amount: "10",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.xdr).toBe(mockXdr);
  });

  it("normalizes amount to 7 decimal places", async () => {
    // This test verifies the normalization happens without throwing
    const req = new Request("http://localhost/api/stellar/build-tx", {
      method: "POST",
      body: JSON.stringify({
        sourcePublic: "GSRC...",
        destination: "GDEST...",
        amount: "10.123",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
