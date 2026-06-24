import http from 'k6/http'
import { check, group, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const ORCHESTRATOR_PATH = __ENV.ORCHESTRATOR_PATH || '/api/orchestrate'
const VUS = Number(__ENV.VUS || '50')
const DURATION = __ENV.DURATION || '30s'

const enqueueLatency = new Trend('orchestrator_enqueue_duration_ms')
const acceptedJobs = new Rate('orchestrator_jobs_accepted')

export const options = {
  scenarios: {
    queue_saturation: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
      gracefulStop: '10s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    orchestrator_enqueue_duration_ms: ['p(95)<1500'],
    orchestrator_jobs_accepted: ['rate>0.95'],
  },
}

function jobPayload() {
  return JSON.stringify({
    jobId: `load-${__VU}-${__ITER}-${Date.now()}`,
    agentId: `LOAD-${String(__VU).padStart(2, '0')}`,
    steps: [
      { id: 'plan', tool: 'planner', input: 'summarize queue state' },
      { id: 'execute', tool: 'agent', input: 'run synthetic task' },
      { id: 'report', tool: 'reporter', input: 'publish synthetic result' },
    ],
    metadata: {
      source: 'k6-load-test',
      scenario: 'orchestrator-queue-saturation',
    },
  })
}

export default function () {
  group('enqueue orchestration run', () => {
    const res = http.post(`${BASE_URL}${ORCHESTRATOR_PATH}`, jobPayload(), {
      headers: {
        'Content-Type': 'application/json',
        'X-Load-Test': 'open-stellar-orchestrator',
      },
      tags: { route: 'orchestrator_enqueue' },
    })

    enqueueLatency.add(res.timings.duration)
    const accepted = check(res, {
      'orchestrator accepted or queued job': (response) => [200, 201, 202].includes(response.status),
    })
    acceptedJobs.add(accepted)
  })

  sleep(0.5)
}
