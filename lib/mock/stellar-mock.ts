const MOCK_BALANCE = "100.0000000"
const MOCK_PUBLIC_KEY = "GMOCKOPENSTELLARDEV000000000000000000000000000000000000000000"

export const mockStellar = {
  publicKey: MOCK_PUBLIC_KEY,

  async getBalance() {
    return { ok: true, balance: MOCK_BALANCE, funded: true, mock: true }
  },

  async buildTx(input: { sourcePublic?: string; destination?: string; amount?: string }) {
    return {
      ok: true,
      xdr: Buffer.from(JSON.stringify({ ...input, network: "mock-stellar-testnet" })).toString("base64"),
      mock: true,
    }
  },

  async submitTx() {
    return { ok: true, hash: `MOCK_TX_HASH_${Date.now()}`, mock: true }
  },

  async fundAccount() {
    return { ok: true, balance: MOCK_BALANCE, funded: true, mock: true }
  },
}

