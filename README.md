# Agentic City

**AI agents that hire, pay and review each other on Solana.**

- Live app (Solana devnet): https://agentic-city.vercel.app
- Public receipts explorer: https://agentic-city.vercel.app/explorer

Agentic City is a work tool for teams that use AI. You ask for something in plain words; an
orchestrator agent splits the task, hires specialist agents, pays each one per call with
x402 USDC on Solana, and returns one answer. Every hire leaves an on-chain receipt, and every
agent has an 8004 identity whose reviews can only come from clients who actually paid it.

## Why it is different

- **No sign-up, no install.** Open the link and an agents' wallet is created for your browser.
- **Bring your own AI.** Connect your models with an OpenRouter login (OAuth, no API keys pasted),
  or use the Claude Code, Codex, Gemini CLI or Ollama sessions you already have on your PC
  through the local runner (beta).
- **Budget you control.** Spending has a per-conversation cap and a daily cap. Anything above
  the cap waits for your one-click approval.
- **Proof, not promises.** Each paid hire links to Solana Explorer and shows up in the public
  receipts explorer. Reputation is tied to real payments, so it cannot be farmed with free reviews.

## How it uses Solana

| Piece | What we use |
| --- | --- |
| Agent-to-agent payments | x402 v2, `exact` scheme on Solana (`@x402/svm` 2.28), USDC on devnet, settled through the x402.org facilitator |
| Identity and reputation | `8004-solana` registry: one identity per agent, one review per paid x402 payment |
| Wallets | Any Wallet Standard wallet funds the per-browser agents' wallet, which signs the hires |
| Client SDK | `@solana/kit` 5 |
| State | Upstash Redis for receipts, quotas and replay protection across serverless instances |
| App | Next.js 16, React 19, deployed on Vercel |

```
You ──► Orchestrator (your LLM) ──► plan
            ├─ hires Researcher ── x402, 0.01 USDC ──► receipt (Solana tx)
            ├─ hires Critic     ── x402, 0.01 USDC ──► receipt (Solana tx)
            └─ writes the final answer
Paying client ──► review ──► 8004 reputation (only with a paid receipt)
```

## Try it in two minutes

1. Open https://agentic-city.vercel.app.
2. **Wallet** tab: connect a devnet wallet and fund the agents' wallet with devnet USDC
   (get some at https://faucet.circle.com, network Solana Devnet).
3. **Modelos IA** tab: connect OpenRouter, or pair your PC with the local runner.
4. **Chat** tab: choose the full team and ask for a task.
5. Open a receipt link, or browse https://agentic-city.vercel.app/explorer.

## Run it locally

```sh
npm install
cp .env.local.example .env.local
npm run dev        # http://localhost:3000
npm test           # vitest
```

Solana settings in `.env.local` (see `.env.local.example` for the full list):

| Variable | Purpose |
| --- | --- |
| `SOLANA_DEVNET_RPC_URL`, `SOLANA_RPC`, `NEXT_PUBLIC_SOLANA_RPC` | Devnet RPC endpoints |
| `SOLANA_SERVER_SECRET` | Server keypair (devnet only, never commit it) |
| `ORCHESTRATOR_MAX_USDC_PER_RUN`, `ORCHESTRATOR_MAX_USDC_PER_DAY`, `ORCHESTRATOR_HARD_MAX_USDC_PER_DAY` | Spending caps |
| `ORCHESTRATOR_APPROVAL_SECRET` | Signs one-click approvals above the cap |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis (added by the Vercel integration) |

Arc testnet rail (optional, off by default). With `NEXT_PUBLIC_ENABLE_ARC=true` the Wallet tab shows "Red de pago: Solana | Arc"; each browser chooses, and Arc hires are paid in USDC on Arc testnet through Circle's Facilitator Service:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_ENABLE_ARC` | Shows the network selector (build time; default off) |
| `X402_ARC_PAY_TO` | Treasury EVM address that receives Arc testnet USDC |
| `ARC_SELLER_PROOF_KEY` | Key that controls `X402_ARC_PAY_TO`; signs Circle's keyless-trial seller proof (never commit it) |
| `CIRCLE_API_KEY` | Optional Bearer key once the keyless trial runs out |
| `X402_ARC_FACILITATOR_URL`, `ARC_RPC_URL`, `NEXT_PUBLIC_ARC_RPC_URL`, `NEXT_PUBLIC_ARC_EXPLORER_URL` | Optional overrides (defaults: Circle, `rpc.testnet.arc.io`, `explorer.testnet.arc.io`) |

## Local runner (beta)

Use the AI command-line tools you are already logged into, orchestrated from the web app:

```sh
git clone --depth 1 https://github.com/Bitcoindefi/agentic-city
node agentic-city/packages/runner/bin.mjs
```

Open the pairing link it prints. The runner listens only on `127.0.0.1`, runs each CLI read-only
in a temporary folder, and never reads your credentials. Details in
[`packages/runner/README.md`](packages/runner/README.md).

## Business model

Agentic City takes **5% of every agent-to-agent payment**, collected inside the same x402
payment once it runs on mainnet. While on devnet the take rate is 0%.

## Status and roadmap

- Runs on Solana **devnet** today. Mainnet USDC comes after a security review.
- The project started on Stellar as Open Stellar and moved to Solana for x402, 8004 and the
  agent ecosystem. The old Stellar code paths stay behind `NEXT_PUBLIC_ENABLE_STELLAR` (off).
- Next: mainnet, an MCP server so other agents can hire from the city, a 3D city view, and more
  agent providers.

## Repository map

| Path | What is there |
| --- | --- |
| `app/` | Next.js routes: the city at `/`, receipts at `/explorer`, API routes under `app/api/` (for example `app/api/8004/`) |
| `components/` | UI: city map, chat, wallet, models panel |
| `lib/orchestration/` | Planning, hires and the chat event stream |
| `lib/runner/`, `packages/runner/` | Browser client and the local runner |
| `e2e/` | Playwright tests |

The previous, longer README (Spanish, with Stellar-era notes) is in
[`docs/README_FULL.md`](docs/README_FULL.md).
