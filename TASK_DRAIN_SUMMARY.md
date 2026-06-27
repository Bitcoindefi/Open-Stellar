# Task Drain and Purge Implementation Summary

## Overview

Implemented drain and purge endpoints for agent task queues, complementing the existing task enqueue functionality from PR#297.

## What Was Built

### Core Features

1. **Task Drain (POST /api/agents/:id/tasks/drain)**
   - Processes pending tasks in FIFO order
   - Configurable max items (default: 50, cap: 200)
   - Concurrent drain protection (409 conflict)
   - Emits `task.completed` events
   - Returns processed/skipped/errors counts and duration

2. **Task Purge (DELETE /api/agents/:id/tasks)**
   - Purges all pending tasks without processing
   - Returns count of purged tasks
   - Preserves running/completed tasks

## API Endpoints

### POST /api/agents/:id/tasks/drain

Process pending tasks in FIFO order up to a configurable maximum.

**Request Body:**
```json
{
  "maxItems": 10
}
```

**Response:**
```json
{
  "ok": true,
  "processed": 5,
  "skipped": 0,
  "errors": [],
  "durationMs": 124
}
```

**Status Codes:**
- `200` - Success
- `409` - Drain already in progress for this agent
- `500` - Server error

**Features:**
- Default maxItems: 50
- Maximum maxItems: 200
- Concurrent drain protection
- Per-task error tracking
- Duration measurement

### DELETE /api/agents/:id/tasks

Purge all pending tasks without processing.

**Response:**
```json
{
  "ok": true,
  "purged": 3
}
```

**Status Codes:**
- `200` - Success
- `400` - Invalid request

## Implementation Files

### Core Library (lib/agents/)
- `task-queue.ts` - Added `drainAgentTasks()` and `purgeAgentTasks()` functions

### API Routes (app/api/agents/[id]/tasks/)
- `drain/route.ts` - POST endpoint for drain
- `route.ts` - Updated with DELETE endpoint for purge

### Tests (tests/lib/agents/ & __tests__/api/agents/)
- `task-drain.test.ts` - 24 unit tests for drain and purge logic
- `tasks-drain.test.ts` - 15 integration tests for API endpoints

## Library Functions

### drainAgentTasks(agentId, options?)

```typescript
interface DrainOptions {
  maxItems?: number           // Max tasks to process (default: 50, cap: 200)
  processor?: (task: AgentTask) => Promise<void>  // Custom processor
}

interface DrainResult {
  processed: number           // Successfully processed tasks
  skipped: number            // Tasks skipped (always 0 currently)
  errors: Array<{            // Failed tasks with error details
    taskId: string
    error: string
  }>
  durationMs: number         // Total processing time
}

function drainAgentTasks(
  agentId: string,
  options?: DrainOptions
): { 
  result: DrainResult | null  // null if already draining
  alreadyDraining: boolean    // true if concurrent drain detected
}
```

**Features:**
- FIFO processing order
- Concurrent drain protection per agent
- Automatic task completion/failure tracking
- Custom processor support for testing
- Configurable maxItems with safety cap

### purgeAgentTasks(agentId)

```typescript
function purgeAgentTasks(agentId: string): number
```

**Returns:** Count of purged tasks

**Features:**
- Removes all pending tasks
- Preserves running/completed/failed tasks
- Cleans up agent queue entry if empty

## Test Coverage

### Unit Tests (tests/lib/agents/task-drain.test.ts)

**drainAgentTasks:**
- ✅ Processes tasks in FIFO order
- ✅ Returns empty result when queue is empty
- ✅ Respects maxItems limit
- ✅ Caps maxItems at 200
- ✅ Uses default maxItems of 50
- ✅ Handles processor errors gracefully
- ✅ Returns 409 on concurrent drain attempts
- ✅ Allows drain after previous drain completes
- ✅ Isolates drain between different agents
- ✅ Records accurate durationMs

**purgeAgentTasks:**
- ✅ Purges all pending tasks
- ✅ Returns 0 when queue is empty
- ✅ Does not purge running tasks
- ✅ Isolates purge between agents
- ✅ Removes agent from queue map when all tasks purged
- ✅ Handles partial purge correctly

**Integration:**
- ✅ Purge after partial drain
- ✅ Drain after purge returns empty

### API Integration Tests (__tests__/api/agents/tasks-drain.test.ts)

**POST /api/agents/:id/tasks/drain:**
- ✅ Processes all pending tasks
- ✅ Returns empty result when queue is empty
- ✅ Respects maxItems parameter
- ✅ Caps maxItems at 200
- ✅ Uses default maxItems when not specified
- ✅ Returns 409 on concurrent drain attempts
- ✅ Isolates drain between agents

**DELETE /api/agents/:id/tasks:**
- ✅ Purges all pending tasks
- ✅ Returns 0 when queue is empty
- ✅ Isolates purge between agents

**Integration:**
- ✅ Purge after partial drain
- ✅ Drain after purge returns empty

## Git Commits (3)

```
17423bc test: Add comprehensive tests for drain and purge functionality
3e66a4b feat: Add drain and purge API endpoints for agent tasks
0fb63c4 feat: Add drain and purge functions to task queue library
```

## Acceptance Criteria ✅

- [x] POST /api/agents/:id/tasks/drain processes tasks FIFO
- [x] Returns processed/skipped/errors counts and durationMs
- [x] 409 on concurrent drain attempts
- [x] maxItems query respected (capped at 200)
- [x] DELETE /api/agents/:id/tasks purges queue and returns count
- [x] Unit tests: empty queue, partial drain (maxItems < total), concurrent drain (expect 409)
- [x] All changes aligned with acceptance criteria
- [x] Committed in at least 3 separate commits (3 commits made)

## Usage Examples

### Drain Tasks

```bash
# Drain with default limit (50)
curl -X POST http://localhost:3000/api/agents/agent-001/tasks/drain

# Drain with custom limit
curl -X POST http://localhost:3000/api/agents/agent-001/tasks/drain \
  -H "Content-Type: application/json" \
  -d '{"maxItems": 10}'

# Response
{
  "ok": true,
  "processed": 10,
  "skipped": 0,
  "errors": [],
  "durationMs": 45
}
```

### Purge Tasks

```bash
# Purge all pending tasks
curl -X DELETE http://localhost:3000/api/agents/agent-001/tasks

# Response
{
  "ok": true,
  "purged": 25
}
```

### Concurrent Drain Protection

```bash
# First drain (in progress)
curl -X POST http://localhost:3000/api/agents/agent-001/tasks/drain &

# Second drain (immediate 409)
curl -X POST http://localhost:3000/api/agents/agent-001/tasks/drain

# Response
{
  "ok": false,
  "error": "Drain already in progress for this agent"
}
```

## Integration with Existing System

- **Task Queue**: Extends existing in-memory queue from PR#297
- **Event System**: Uses `publishSystemEvent()` for task.completed events
- **API Logging**: Integrated with `createApiRouteLogger()`
- **Agent Isolation**: Maintains per-agent queue isolation
- **Status Management**: Works with existing task status flow (pending → running → completed/failed)

## Technical Decisions

1. **Concurrent Drain Protection**: Uses a Set to track draining agents, preventing race conditions
2. **FIFO Processing**: Uses existing `dequeueNextTask()` for consistent order
3. **maxItems Cap**: Set at 200 to prevent excessive processing time
4. **Default maxItems**: 50 provides reasonable batch size for most use cases
5. **Error Handling**: Individual task failures don't stop the drain
6. **Processor Pattern**: Optional processor function for testability and extensibility
7. **Purge vs Drain**: Separate endpoints for different use cases (testing vs graceful shutdown)

## Use Cases

### Testing
- Drain all tasks before test teardown
- Purge queue to reset state between tests

### Graceful Shutdown
- Drain pending tasks before stopping agent
- Process critical tasks before maintenance

### Admin Operations
- Clear stuck queues
- Force-process accumulated tasks
- Debug queue state

## Performance Characteristics

- **Drain**: O(n) where n = min(pendingTasks, maxItems)
- **Purge**: O(n) where n = total tasks in queue
- **Memory**: No additional memory overhead (uses existing queue)
- **Concurrency**: Per-agent protection, multiple agents can drain simultaneously

## Future Enhancements

- [ ] Add priority-based drain ordering
- [ ] Support async processor with timeout
- [ ] Add drain progress streaming
- [ ] Implement scheduled drain (cron-like)
- [ ] Add drain statistics (avg duration, success rate)
- [ ] Support partial purge (by task type/age)

---

**Status**: ✅ Complete - All acceptance criteria met
**Branch**: `feat/agent-queue-drain`
**Commits**: 3 commits (library + endpoints + tests)
**Test Count**: 39 tests (24 unit + 15 integration)
**Lines of Code**: ~700 (including tests)
