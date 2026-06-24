# Open Stellar Load Tests

These k6 scenarios exercise the high-volume paths described in issue #92 without hard-coding a production target. Run them against a local server or an explicitly approved preview deployment.

## Prerequisites

- Install k6: https://grafana.com/docs/k6/latest/set-up/install-k6/
- Start the app locally:

```bash
npm run dev
```

All commands default to `BASE_URL=http://localhost:3000`. Override `BASE_URL` only when you have permission to test that deployment.

## Scenario 1: x402 Settle Burst

Creates a quote and immediately settles it with a synthetic tx hash. This matches the current `/api/protocol/x402/quote` and `/api/protocol/x402/settle` APIs.

```bash
k6 run load-tests/x402-settle.js
```

Useful overrides:

```bash
BASE_URL=http://localhost:3000 VUS=100 DURATION=10s k6 run load-tests/x402-settle.js
X402_CHAIN=stellar X402_PAYER=load-test-payer k6 run load-tests/x402-settle.js
```

Default thresholds:

- HTTP failure rate below 1%
- global p99 latency below 2000 ms
- x402 settle p99 below 2000 ms
- accepted settlement rate above 99%

## Scenario 2: Orchestrator Queue Saturation

Posts synthetic three-step jobs to a configurable orchestrator endpoint.

```bash
ORCHESTRATOR_PATH=/api/orchestrate VUS=50 DURATION=30s k6 run load-tests/orchestrator.js
```

The current repository does not expose an orchestrator API route yet. Keep `ORCHESTRATOR_PATH` pointed at the implementation branch or preview that adds it.

## Scenario 3: SSE Connection Storm

Opens many concurrent event-stream connections and validates `text/event-stream` responses.

```bash
SSE_PATH=/api/events CONNECTIONS=200 DURATION=30s k6 run load-tests/sse-connections.js
```

This scenario uses `k6/x/sse`, which requires an xk6-built k6 binary with the SSE extension instead of the stock k6 binary. Build or install that binary first, then run the command above.

The current repository does not expose `/api/events` yet. Set `SSE_PATH` when testing a branch that provides the SSE feed.

## Scenario 4: Agent Heartbeat Flood

Simulates 50 agents sending heartbeats at 15-second intervals.

```bash
HEARTBEAT_PATH_TEMPLATE=/api/agents/:id/heartbeat AGENTS=50 DURATION=2m k6 run load-tests/agent-heartbeat.js
```

The `:id` token is replaced with a synthetic `load-agent-###` id for each virtual user.

## Benchmark Report Template

Record each run in a PR comment or a release note:

```text
Target:
Commit:
Scenario:
Config:
RPS:
p50 / p95 / p99 latency:
HTTP failures:
App-level failures:
Stellar RPC calls per settlement:
Estimated Vercel cost per 1000 settlements:
Observed bottleneck:
```

## Safety Notes

- Do not run these against production unless the maintainers explicitly approve the test window and limits.
- Start with `VUS=5 DURATION=30s` on a new target before using the defaults from the issue.
- Prefer preview deployments with disposable test data.
- Use the `X-Load-Test` request header to filter synthetic traffic in logs.
