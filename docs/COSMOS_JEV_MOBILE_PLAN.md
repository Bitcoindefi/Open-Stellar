# CosmosPay, JEV, And Mobile Plan

## Current Findings

- The deployed public app responds at `https://agentarena-app.vercel.app`.
- The deployed page is a bounties landing (`Find Bounties, Reap Rewards`) with GitHub sign-in and wallet connect. It does not match the current local Agent City/admin-console experience in this repo.
- `https://open-stellar.xyz` is referenced in the project, but DNS did not resolve during this pass.
- Open Stellar already has Stellar wallet flows, x402 receipts, EVM rails, ZK Passport, agent runtimes, and a mobile drawer/navigation shell.
- CosmosPay fits best as an additional Stellar SEP-7 payment-intent provider, not as a replacement for the existing x402 flow.
- JEV is available through Vercel AI Gateway as `typesafe-ai/jev`. It is an evaluation model for typed decisions, so it should handle routing, verification, readiness checks, and rubric decisions rather than long-form chat.

## Implemented Base

- Added `@cosmosapp/pay_sdk`, `ai`, `@ai-sdk/openai-compatible`, and `openai` to project dependencies.
- Added server-only CosmosPay helpers in `lib/cosmospay/client.ts`.
- Added `POST /api/cosmos/payment-intents` to create CosmosPay SEP-7 pay intents.
- Added `POST /api/cosmos/payment-intents/validate` to validate a submitted Stellar transaction hash.
- Added JEV helpers in `lib/ai/jev.ts`.
- Added `GET/POST /api/ai/jev/evaluate` for typed JEV evaluation through Vercel AI Gateway.
- JEV is BYOK by default: users send their own AI Gateway key per request; Open Stellar should not ship with the developer's personal key.
- Wired agents whose model is `jev` or `typesafe-ai/jev` to use the JEV evaluator.
- Added `npm run check:jev` as a safe smoke test for the AI Gateway/JEV connection.
- Added env placeholders for CosmosPay and JEV in `.env.local.example`.

## Deployment Settings

Set these in Vercel:

```bash
COSMOS_PAY_API_KEY=dv_...          # testnet, or prod_... for mainnet
COSMOS_PAY_WEBHOOK_SECRET=whsec_... # when webhooks are registered
OPEN_STELLAR_JEV_MODEL=typesafe-ai/jev
NEXT_PUBLIC_APP_URL=https://agentarena-app.vercel.app
```

Do not set `AI_GATEWAY_API_KEY` on a public/shared Open Stellar deployment. For JEV, each user should provide their own key as:

```bash
x-ai-gateway-key: <user-ai-gateway-key>
```

or:

```bash
Authorization: Bearer <user-ai-gateway-key>
```

For a private single-user deployment only, an operator can enable a server key:

```bash
AI_GATEWAY_API_KEY=...
OPEN_STELLAR_ALLOW_SERVER_AI_GATEWAY_KEY=true
OPEN_STELLAR_DEFAULT_AGENT_MODEL=typesafe-ai/jev
```

For Codex/local development only, after setting local env vars, run:

```bash
npm run check:jev
```

For ChatGPT-compatible clients that can use an OpenAI-compatible endpoint, configure:

```bash
OPENAI_BASE_URL=https://ai-gateway.vercel.sh/v1
OPENAI_API_KEY=$AI_GATEWAY_API_KEY
OPENAI_MODEL=typesafe-ai/jev
```

JEV may not work as a normal chat model in every ChatGPT-style client because it is exposed as an evaluation model. Open Stellar should treat it as a decision/evaluation backend.

## Next Implementation Steps

1. Add a CosmosPay tab in the wallet/admin UI that creates an intent, renders the returned URI/QR, and validates the returned `txHash`.
2. Decide whether the deployed bounties landing remains the public homepage or whether Vercel should be redeployed from this local repo state.
3. Register a CosmosPay webhook endpoint and persist events idempotently by webhook event id.
4. Add JEV checks to sensitive flows: quote settlement readiness, agent-task risk, webhook acceptance, and mobile release QA.
5. Finish mobile polish with real device breakpoints: navigation density, drawer height, wallet forms, admin tables, and map/canvas controls.
6. Update OpenAPI docs so external integrators see `/api/cosmos/*` and `/api/ai/jev/evaluate`.
