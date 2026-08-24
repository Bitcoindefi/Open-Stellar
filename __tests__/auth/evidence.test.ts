import { describe, it, expect } from "vitest";
import {
  createApiKey,
  getApiKeyRecord,
  listApiKeys,
  resetApiKeyStore,
} from "@/lib/auth/api-keys";
import { evaluateAuth } from "@/lib/auth/middleware";

describe("Visual Evidence Verification", () => {
  it("EVIDENCE 1: 401 response on an admin route without a key", async () => {
    resetApiKeyStore();
    delete process.env.DEV_MODE;
    process.env.ADMIN_API_KEY = "osk_admin_live_demo1234567890abcdef";

    const req = new Request("http://localhost:3000/admin", { method: "GET" });
    const result = await evaluateAuth(req);

    console.log("\n=======================================================");
    console.log("--- [VISUAL EVIDENCE 1: 401 WITHOUT KEY] ---");
    console.log("Target Route: GET /admin");
    console.log("Authorization: <none>");
    console.log("HTTP Status:", result.status);
    console.log("Evaluation Result:", JSON.stringify(result, null, 2));
    console.log("=======================================================\n");

    expect(result.allowed).toBe(false);
    expect(result.status).toBe(401);
    expect(result.error).toBe("Unauthorized: Admin API key required");
  });

  it("EVIDENCE 2: The same route working with a valid key", async () => {
    resetApiKeyStore();
    delete process.env.DEV_MODE;
    const adminKey = "osk_admin_live_demo1234567890abcdef";
    process.env.ADMIN_API_KEY = adminKey;

    const req = new Request("http://localhost:3000/admin", {
      method: "GET",
      headers: { Authorization: `Bearer ${adminKey}` },
    });
    const result = await evaluateAuth(req);

    console.log("\n=======================================================");
    console.log("--- [VISUAL EVIDENCE 2: 200 WITH VALID KEY] ---");
    console.log("Target Route: GET /admin");
    console.log(`Authorization: Bearer ${adminKey.slice(0, 14)}...`);
    console.log("HTTP Status:", result.status);
    console.log("Evaluation Result:", JSON.stringify(result, null, 2));
    console.log("=======================================================\n");

    expect(result.allowed).toBe(true);
    expect(result.status).toBe(200);
    expect(result.isAdmin).toBe(true);
  });

  it("EVIDENCE 3: Storage showing the SHA-256 hash, not the plaintext secret", async () => {
    resetApiKeyStore();
    delete process.env.DEV_MODE;

    const created = await createApiKey({
      name: "production-payment-relay",
      scopes: ["x402:quote", "x402:settle"],
      tier: "pro",
    });

    const stored = getApiKeyRecord(created.id);
    const publicList = await listApiKeys();

    console.log("\n=======================================================");
    console.log("--- [VISUAL EVIDENCE 3: STORAGE HASH VERIFICATION] ---");
    console.log("Plaintext Generated Key (Shown ONCE to caller):", created.key);
    console.log(
      "Stored Record in Database/Store (Only Hashed Key!):",
      JSON.stringify(stored, null, 2),
    );
    console.log(
      "Sanitized Record in Public List API (Only Key Prefix!):",
      JSON.stringify(publicList, null, 2),
    );
    console.log("=======================================================\n");

    // Validations
    expect(stored?.hashedKey).toBeDefined();
    expect(stored?.hashedKey.length).toBe(64); // SHA-256 hex string
    expect(stored?.hashedKey).not.toBe(created.key);
    expect((stored as any).key).toBeUndefined();
    expect(JSON.stringify(stored)).not.toContain(created.key);
    expect(JSON.stringify(publicList)).not.toContain(created.key);
  });
});
