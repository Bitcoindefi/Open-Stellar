import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const HEARTBEAT_PATH_TEMPLATE = __ENV.HEARTBEAT_PATH_TEMPLATE || '/api/agents/:id/heartbeat'
const AGENTS = Number(__ENV.AGENTS || '50')
const HEARTBEAT_INTERVAL_SECONDS = Number(__ENV.HEARTBEAT_INTERVAL_SECONDS || '15')
const DURATION = __ENV.DURATION || '2m'

const heartbeatLatency = new Trend('agent_heartbeat_duration_ms')
const heartbeatAccepted = new Rate('agent_heartbeat_accepted')

export const options = {
  scenarios: {
    heartbeat_flood: {
      executor: 'constant-vus',
      vus: AGENTS,
      duration: DURATION,
      gracefulStop: '10s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    agent_heartbeat_duration_ms: ['p(95)<1000'],
    agent_heartbeat_accepted: ['rate>0.98'],
  },
}

function agentId() {
  return `load-agent-${String(__VU).padStart(3, '0')}`
}

function heartbeatPath(id) {
  return HEARTBEAT_PATH_TEMPLATE.replace(':id', encodeURIComponent(id))
}

function heartbeatPayload(id) {
  return JSON.stringify({
    agentId: id,
    status: 'active',
    cpu: Math.floor((__ITER * 13 + __VU) % 100),
    memory: Math.floor((__ITER * 7 + __VU * 2) % 100),
    currentTask: 'synthetic heartbeat load test',
    sentAt: new Date().toISOString(),
  })
}

export default function () {
  const id = agentId()
  const res = http.post(`${BASE_URL}${heartbeatPath(id)}`, heartbeatPayload(id), {
    headers: {
      'Content-Type': 'application/json',
      'X-Load-Test': 'open-stellar-heartbeat',
    },
    tags: { route: 'agent_heartbeat' },
  })

  heartbeatLatency.add(res.timings.duration)
  const accepted = check(res, {
    'heartbeat accepted': (response) => [200, 201, 202, 204].includes(response.status),
  })
  heartbeatAccepted.add(accepted)

  sleep(HEARTBEAT_INTERVAL_SECONDS)
}
