## test(e2e): agent registration -> task assignment -> XP earned flow (#219)

### EN
Adds `e2e/agent-task-xp.e2e.test.ts` - a Vitest e2e suite driving the REAL
Next.js route handlers (no mocks) through the full lifecycle:

1. `POST /api/agents` register -> 201
2. `POST /api/agents/[id]/tasks` assign -> 201
3. task moves to running, `PATCH .../tasks/[taskId]` complete -> 200
4. `GET /api/agents/[id]` -> `xp` increased, `level` matches the XP curve,
   `tasksCompleted` incremented

Error paths:
- assigning a task to a non-existent agent -> 404
- completing the same task twice is rejected (404) and XP does NOT move twice

Isolation: per-test in-memory stores (`resetAgentRegistryForTests`,
`resetTaskQueue`, `resetAgentXpDb`) + unique `e2e-agent-<uuid>` ids; cleanup
purges the queue via `DELETE /api/agents/[id]/tasks`. Cannot touch real data.
Every assert carries a message naming the broken step.

CI: `vitest.config.ts` now includes `e2e/*.e2e.test.ts` in the standard
`npx vitest run`, so it runs in the existing "Unit tests" CI job - no new
workflow needed. Playwright browser specs are unaffected.

Runtime: full flow suite finishes in ~15ms (< 10s requirement). Full repo run
green: **76 files / 471 tests passed**.

```
> npx vitest run e2e/agent-task-xp.e2e.test.ts
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

README section added explaining how to run it locally and what it needs.

### ES
Agrega `e2e/agent-task-xp.e2e.test.ts`: suite e2e en Vitest que maneja los
route handlers REALES de Next.js por todo el ciclo de vida: registro (201) ->
asignacion de tarea (201) -> completado (200) -> `xp` / `level` /
`tasksCompleted` actualizados en `GET /api/agents/[id]`. Tambien cubre los
caminos de error: 404 para agente inexistente y doble completado rechazado sin
sumar XP dos veces. Aislamiento explicito con stores en memoria y nombres
unicos `e2e-agent-<uuid>`; corre en el job de CI existente (~15ms).
