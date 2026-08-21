# Agent Passport (ZK) integration

[open-stellar-passport](https://github.com/bitcoindefi/open-stellar-passport) ported into Open Stellar as the
zero-knowledge trust layer for agent payments. An agent mints a Groth16 passport that proves — without revealing the
owner's identity or real balance — that it is backed by a verified human and is solvent for its spend cap. The x402
settlement rail then releases a payment only when the agent holds a valid passport and the amount is within its proven,
hidden cap.

## What was added

| Path                                           | Purpose                                                                                                                                                                                                    |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/passport/passport.ts`                     | Full pipeline: client-side `mintPassport` (Groth16 via snarkjs/WASM), `verifyOnChain`, `getPassport`, `authorizePayment`, `replaySpentProof`. snarkjs is lazy-imported so it never enters a server bundle. |
| `lib/passport/validator-client.ts`             | Soroban contract bindings for `AgentPassportValidator` (generated for stellar-sdk v16).                                                                                                                    |
| `public/zk/*`                                  | Circuit + proving artifacts (`agent_passport.wasm`, `agent_passport_final.zkey`, `verification_key.json`, witness wasm, and the demo spent-proof).                                                         |
| `components/admin/passport-panel.tsx`          | The admin **Agent Passport** tab UI: mint → verify on-chain → authorize x402 payment → replay-attack demo.                                                                                                 |
| `app/api/protocol/passport/authorize/route.ts` | `POST { agentId, amount }` → on-chain spend-cap gate.                                                                                                                                                      |
| `app/api/protocol/passport/status/route.ts`    | `GET ?agentId` → on-chain passport lookup.                                                                                                                                                                 |

## How it plugs into x402

`app/api/protocol/x402/settle/route.ts` now takes an optional `agentId`. When present, settlement calls
`authorizePayment(agentId, quote.amountUnits)` first and returns **HTTP 402** if the agent has no passport or the amount
exceeds its proven cap. Requests without `agentId` keep the original behaviour (backwards-compatible).

## Deployed contracts (Stellar testnet)

- AgentPassportValidator: `CDNSZUNEWFCGSPWLPDSWTENR2WPHKC34RGZQG7RJA54OPGTZGVVRFYBA`
- CircomGroth16Verifier: `CCMKLYSRUH2HMA4UU6WLXWQXEY6KAH5AWB5BEVMJGNGC5GLGTVROLG4A`

## Build notes

- `@stellar/stellar-sdk` was upgraded **13 → 16** to match the generated bindings (v13 cannot decode the contract's
  `Option<Attestation>` return). Open Stellar only uses stable classic APIs (`Horizon.Server`, `TransactionBuilder`,
  `Operation`, `Asset`, `Networks`), which are unchanged.
- snarkjs pulls optional Node built-ins; `next.config.mjs` stubs them and provides the `Buffer` global for the client
  bundle. Because that config is webpack-specific, `dev`/`build` scripts pin `--webpack` (Next 16 defaults to Turbopack).

## Verified end-to-end (live testnet)

- `GET /api/protocol/passport/status?agentId=42` → real attestation (cap 50 XLM, ledger 3,146,304).
- `POST /api/protocol/passport/authorize` → 10 XLM **authorized**, 900 XLM **denied**.
- `POST /api/protocol/x402/settle` with `agentId=42` → 0.1 XLM settles, 1000 XLM blocked with HTTP 402, no-agent path unchanged.
