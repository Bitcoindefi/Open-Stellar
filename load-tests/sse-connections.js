import sse from 'k6/x/sse'
import { check, sleep } from 'k6'
import { Counter, Rate } from 'k6/metrics'

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const SSE_PATH = __ENV.SSE_PATH || '/api/events'
const CONNECTIONS = Number(__ENV.CONNECTIONS || '200')
const DURATION = __ENV.DURATION || '30s'
const CLOSE_AFTER_EVENTS = Number(__ENV.CLOSE_AFTER_EVENTS || '10')

const connected = new Rate('sse_connected')
const streamErrors = new Rate('sse_stream_errors')
const eventsReceived = new Counter('sse_events_received')

export const options = {
  scenarios: {
    sse_connection_storm: {
      executor: 'constant-vus',
      vus: CONNECTIONS,
      duration: DURATION,
      gracefulStop: '10s',
    },
  },
  thresholds: {
    sse_connected: ['rate>0.95'],
    sse_stream_errors: ['rate<0.05'],
    sse_events_received: ['count>0'],
  },
}

export default function () {
  let eventsForConnection = 0
  const response = sse.open(
    `${BASE_URL}${SSE_PATH}`,
    {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        'X-Load-Test': 'open-stellar-sse',
      },
      tags: { route: 'sse_events' },
    },
    (client) => {
      client.on('open', () => {
        connected.add(true)
      })

      client.on('event', () => {
        eventsForConnection += 1
        eventsReceived.add(1)
        if (eventsForConnection >= CLOSE_AFTER_EVENTS) {
          client.close()
        }
      })

      client.on('error', (error) => {
        streamErrors.add(true)
        console.log(`SSE stream error: ${error.error()}`)
        client.close()
      })
    },
  )

  const ok = check(response, {
    'SSE status is 200': (res) => res && res.status === 200,
  })
  connected.add(ok)
  streamErrors.add(!ok)

  sleep(0.1)
}
