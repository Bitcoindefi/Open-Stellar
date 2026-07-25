# Copilot Code Review Instructions — Open-Stellar

## Project overview
Open-Stellar is a Next.js 14 (App Router) platform for AI agent orchestration on the Stellar blockchain.
TypeScript throughout. Tests use Vitest. State is in-memory stores under `lib/`.

## Review priorities

### Security — flag immediately
- Any use of `|| true` or `2>/dev/null` to silence audit failures (e.g. `npm audit || true`) → BLOCK
- SQL/NoSQL injection patterns or unvalidated user input reaching queries
- Missing auth checks on routes under `app/api/` — every mutating route needs the caller verified
- Secrets or API keys hardcoded in source

### Type safety
The OS event bus only accepts this exact union — flag any string not in it:
```
"agent.status" | "task.started" | "task.completed" | "payment.received" |
"quest.completed" | "agent.xp" | "badge.unlocked" | "district.unlocked" |
"agent.registry" | "quest.expired" | "agent.restart"
```
Alert types must be one of: `"agent_offline" | "quest_completed" | "reputation_updated" | "quest_expired" | "passport_revoked"`

### Tests
- Every new route or store function must have a Vitest test
- Flag PRs that add logic but no tests

### Code quality
- In-memory stores must export a `reset*Store()` for test isolation
- Routes must return typed JSON responses with appropriate HTTP status codes
- No hardcoded timeouts — use named constants (e.g. `OFFLINE_AFTER_MS`)

## What NOT to flag
- Minor style issues (formatting is handled by the linter)
- Cosmetic variable renaming without behavioral change
