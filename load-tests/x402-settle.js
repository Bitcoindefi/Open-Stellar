import http from 'k6/http'
import { check, group, sleep } from 'k6'
import { Trend, Rate } from 'k6/metrics'

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const SERVICE_ID = __ENV.X402_SERVICE_ID || 'load-test-agent-service'
const CHAIN = __ENV.X402_CHAIN || 'stellar'
const PAYER = __ENV.X402_PAYER || 'load-test-payer'
const UNITS = Number(__ENV.X402_UNITS || '1')
const UNIT_PRICE_USD = Number(__ENV.X402_UNIT_PRICE_USD || '0.1')
const VUS = Number(__ENV.VUS || '100')
const DURATION = __ENV.DURATION || '10s'

const quoteLatency = new Trend('x402_quote_duration_ms')
const settleLatency = new Trend('x402_settle_duration_ms')
const settlementAccepted = new Rate('x402_settlement_accepted')

export const options = {
  scenarios: {
    x402_settle_burst: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
      gracefulStop: '5s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(99)<2000'],
    x402_quote_duration_ms: ['p(95)<1000'],
    x402_settle_duration_ms: ['p(99)<2000'],
    x402_settlement_accepted: ['rate>0.99'],
  },
}

function jsonHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-Load-Test': 'open-stellar-x402-settle',
  }
}

function fakeTxHash() {
  const vu = String(__VU).padStart(4, '0')
  const iter = String(__ITER).padStart(8, '0')
  return `${vu}${iter}`.padEnd(64, 'a').slice(0, 64)
}

export default function () {
  group('quote and settle x402 payment', () => {
    const quotePayload = JSON.stringify({
      serviceId: SERVICE_ID,
      chain: CHAIN,
      payer: PAYER,
      units: UNITS,
      unitPriceUsd: UNIT_PRICE_USD,
      ttlSeconds: 300,
    })

    const quoteRes = http.post(`${BASE_URL}/api/protocol/x402/quote`, quotePayload, {
      headers: jsonHeaders(),
      tags: { route: 'x402_quote' },
    })
    quoteLatency.add(quoteRes.timings.duration)

    const quoteOk = check(quoteRes, {
      'quote status is 200': (res) => res.status === 200,
      'quote has paymentRef': (res) => Boolean(res.json('quote.paymentRef')),
    })
    if (!quoteOk) {
      settlementAccepted.add(false)
      return
    }

    const paymentRef = quoteRes.json('quote.paymentRef')
    const settlePayload = JSON.stringify({
      paymentRef,
      chain: CHAIN,
      txHash: fakeTxHash(),
      paidBy: PAYER,
    })

    const settleRes = http.post(`${BASE_URL}/api/protocol/x402/settle`, settlePayload, {
      headers: jsonHeaders(),
      tags: { route: 'x402_settle' },
    })
    settleLatency.add(settleRes.timings.duration)

    const accepted = check(settleRes, {
      'settle status is 200': (res) => res.status === 200,
      'settle accepted receipt': (res) => res.json('receipt.accepted') === true,
    })
    settlementAccepted.add(accepted)
  })

  sleep(0.1)
}
