import { describe, expect, it } from "vitest";
import { mockPassport } from "@/lib/mock/passport-mock";
import { mockStellar } from "@/lib/mock/stellar-mock";
import { createMockX402Quote, settleMockX402 } from "@/lib/mock/x402-mock";

describe("local mock mode helpers", () => {
  it("returns a funded Stellar balance without network data", async () => {
    await expect(mockStellar.getBalance()).resolves.toMatchObject({
      ok: true,
      balance: "100.0000000",
      funded: true,
      mock: true,
    });
  });

  it("creates and settles mock x402 payments", () => {
    const quote = createMockX402Quote({
      serviceId: "demo",
      chain: "stellar",
      payer: "agent-1",
      units: 2,
      unitPriceUsd: 0.05,
    });
    const receipt = settleMockX402({
      paymentRef: quote.paymentRef,
      chain: quote.chain,
    });

    expect(quote.mock).toBe(true);
    expect(quote.amountUsd).toBe(0.1);
    expect(receipt.accepted).toBe(true);
    expect(receipt.paymentRef).toBe(quote.paymentRef);
  });

  it("approves passport checks with a clearly marked mock attestation", async () => {
    await expect(
      mockPassport.authorizePayment("agent-1", "10"),
    ).resolves.toMatchObject({
      authorized: true,
      mock: true,
    });
    await expect(mockPassport.getStatus("agent-1")).resolves.toMatchObject({
      registered: true,
      mock: true,
      attestation: { agent_id: "agent-1" },
    });
  });
});
