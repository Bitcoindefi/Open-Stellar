export const mockPassport = {
  async authorizePayment(agentId: string, amount: string) {
    return {
      authorized: true,
      reason: "Mock mode passport gate approved",
      cap: amount || "1000000000",
      agentId,
      mock: true,
    }
  },

  async getStatus(agentId: string) {
    return {
      registered: true,
      attestation: {
        agent_id: agentId,
        nullifier: "mock-nullifier",
        registry_root: "mock-registry-root",
        spend_cap: "1000000000",
        ledger: 0,
      },
      mock: true,
    }
  },
}

