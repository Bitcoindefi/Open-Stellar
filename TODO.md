# TODO

- [ ] Implement per-agent high-priority token bucket (5/min default) with non-sliding reset and admin-configurable limit.
- [ ] Implement enqueue-time downgrade: 6th+ high-priority task from same agent in 60s becomes `normal` priority; log warning.
- [ ] Add admin endpoint: PATCH /api/admin/agents/[id]/rate-limit (body: { highPriorityPerMinute: N }).
- [ ] Add GET endpoint: /api/agents/[id]/rate-limit returning current limit and current usage.
- [ ] Add tests: burst of 10 high-priority tasks from same agent => 5 high + 5 downgraded.
- [ ] Wire downgrade logic into task enqueue path.
- [ ] Implement downgrade logging warning.


- [ ] Run vitest to ensure all tests pass.

