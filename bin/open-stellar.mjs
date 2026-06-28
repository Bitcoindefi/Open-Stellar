#!/usr/bin/env node
import http from 'node:http'
import { randomInt } from 'node:crypto'

const args = process.argv.slice(2)
const [scope, command] = args
function flag(name, fallback) {
  const idx = args.indexOf(`--${name}`)
  return idx >= 0 ? args[idx + 1] : fallback
}
function usage() {
  console.log('Usage: open-stellar agent start --name Nexus-7 --district data-center [--url http://localhost:3000]')
}
async function postJson(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `${res.status} ${res.statusText}`)
  return json
}
function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'agent'
}
async function startAgent() {
  const name = flag('name')
  const district = flag('district', 'data-center')
  const baseUrl = flag('url', process.env.OPEN_STELLAR_URL || 'http://localhost:3000').replace(/\/$/, '')
  if (!name) { usage(); process.exit(1) }
  const agentId = flag('id', slug(name))
  const model = flag('model', 'local/lightweight')
  const port = Number(flag('port', '0'))
  let server
  let endpoint = `${baseUrl}/local-agents/${agentId}`
  if (port > 0) {
    server = http.createServer((req, res) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ ok: true, agentId, status: 'active' }))
    }).listen(port)
    endpoint = `http://localhost:${port}`
  }
  await postJson(`${baseUrl}/api/agents`, {
    agentId, name, model, district, status: 'active', endpoint,
    capabilities: ['local-runtime', 'task-execution', district],
    x402: { accepts: false },
  })
  console.log(`Agent ${name} (${agentId}) registered at ${baseUrl} in ${district}. Press Ctrl+C to stop.`)
  const heartbeat = async () => {
    try {
      await fetch(`${baseUrl}/api/agents/${encodeURIComponent(agentId)}/heartbeat`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'active', cpu: 5 + randomInt(21), memory: 24, currentTask: 'Awaiting tasks', autoRestart: true }),
      })
    } catch (error) {
      const message = (error.message || '').replace(/[\r\n]/g, '');
      console.error(`heartbeat failed: ${message}`)
    }
  }
  await heartbeat()
  const timer = setInterval(heartbeat, 15000)
  process.on('SIGINT', async () => {
    clearInterval(timer); server?.close()
    try { await fetch(`${baseUrl}/api/agents/${encodeURIComponent(agentId)}`, { method: 'DELETE' }) } catch {}
    process.exit(0)
  })
}
if (scope === 'agent' && command === 'start') {
  try {
    await startAgent()
  } catch (e) {
    const message = (e.message || '').replace(/[\r\n]/g, '');
    console.error(message)
    process.exit(1)
  }
}
else { usage(); process.exit(scope ? 1 : 0) }
