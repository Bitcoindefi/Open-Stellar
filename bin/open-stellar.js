#!/usr/bin/env node

import { parseArgs } from "node:util";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const subcommand = args[1];

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
  }

  if (command === "agent") {
    if (subcommand === "start") {
      await handleAgentStart(args.slice(2));
      return;
    }
    if (subcommand === "list") {
      await handleAgentList();
      return;
    }
    if (subcommand === "task") {
      await handleAgentTask(args.slice(2));
      return;
    }
  }

  console.error(`Unknown command: ${args.join(" ")}`);
  printHelp();
  process.exit(1);
}

function printHelp() {
  console.log(`
Open-Stellar CLI — Lightweight Agent Runtime & Orchestration

Usage:
  npx open-stellar agent start --name <name> --district <district> [options]
  npx open-stellar agent list
  npx open-stellar agent task --id <agentId> --title <title>

Commands:
  agent start    Register and start an agent locally or connect to runtime
  agent list     List all active & registered agents
  agent task     Dispatch a task to a registered agent

Options:
  --name         Agent display name (e.g. Nexus-7) [required for start]
  --district     District ID (data-center | comm-hub | processing | defense | research) [default: data-center]
  --model        AI Model (e.g. claude-4-sonnet, gpt-5-mini) [default: claude-4-sonnet]
  --endpoint     Target API Endpoint URL [default: http://localhost:3000]
  --capability   Add agent capability flag
`);
}

function saveLocalAgentState(agent) {
  const dataDir = join(process.cwd(), ".data");
  const filePath = join(dataDir, "agent-state.json");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  let current = { agents: [], updatedAt: new Date().toISOString() };
  if (existsSync(filePath)) {
    try {
      current = JSON.parse(readFileSync(filePath, "utf8"));
    } catch {
      // Ignore read errors
    }
  }

  const idx = current.agents.findIndex((a) => a.id === agent.id);
  if (idx >= 0) {
    current.agents[idx] = {
      ...current.agents[idx],
      ...agent,
      updatedAt: new Date().toISOString(),
    };
  } else {
    current.agents.push({ ...agent, updatedAt: new Date().toISOString() });
  }
  writeFileSync(filePath, JSON.stringify(current, null, 2), "utf8");
}

function listPersistedAgents() {
  const filePath = join(process.cwd(), ".data", "agent-state.json");
  if (existsSync(filePath)) {
    try {
      const data = JSON.parse(readFileSync(filePath, "utf8"));
      return data.agents || [];
    } catch {
      return [];
    }
  }
  return [];
}

function validateEndpoint(rawEndpoint) {
  const parsed = new URL(rawEndpoint);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Invalid endpoint protocol: ${parsed.protocol}`);
  }
  return parsed.origin;
}

async function handleAgentStart(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      name: { type: "string", short: "n" },
      district: { type: "string", short: "d", default: "data-center" },
      model: { type: "string", short: "m", default: "claude-4-sonnet" },
      endpoint: {
        type: "string",
        short: "e",
        default: "http://localhost:3000",
      },
      capability: { type: "string", multiple: true },
    },
    allowPositionals: true,
  });

  if (!values.name) {
    console.error("Error: --name is required for starting an agent");
    console.error(
      "Example: npx open-stellar agent start --name Nexus-7 --district data-center",
    );
    process.exit(1);
  }

  const endpoint = validateEndpoint(values.endpoint);
  const slug = values.name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const agentId = slug.startsWith("bot-") ? slug : `bot-${slug}`;

  const payload = {
    agentId,
    name: values.name,
    model: values.model,
    district: values.district,
    capabilities: values.capability || [values.district, "task-execution"],
    x402: { accepts: true, pricePerTask: "0.01 XLM" },
    status: "active",
    endpoint: `${endpoint}/api/agents/${encodeURIComponent(agentId)}`,
  };

  saveLocalAgentState({
    id: agentId,
    name: values.name,
    model: values.model,
    district: values.district,
    status: "active",
    cpu: 15,
    memory: 32,
    autoRestart: true,
  });

  try {
    const res = await fetch(`${endpoint}/api/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`API registration failed (${res.status}): ${errText}`);
    }

    await res.json();
    console.log(`🚀 Starting Agent: ${values.name} (${agentId})`);
    console.log(`📍 District: ${values.district}`);
    console.log(`✅ Agent registered with runtime API!`);
    console.log(`🟢 Status: active`);
    console.log(`💾 Saved state to .data/agent-state.json (survives restarts)`);
  } catch {
    console.log(`🚀 Starting Agent: ${values.name} (${agentId})`);
    console.log(`📍 District: ${values.district}`);
    console.log(`⚠️ Runtime API server offline or unreached`);
    console.log(
      `✅ Agent ${values.name} initialized in local offline runtime mode`,
    );
    console.log(`💾 Saved state to .data/agent-state.json (survives restarts)`);
  }
}

async function handleAgentList() {
  const agents = listPersistedAgents();
  console.log("Registered Agents:");
  if (agents.length === 0) {
    console.log("  (No agents registered yet)");
    return;
  }
  for (const agent of agents) {
    console.log(
      ` - ${agent.name} [${agent.id}] (District: ${agent.district}, Status: ${agent.status})`,
    );
  }
}

async function handleAgentTask(args) {
  const { values } = parseArgs({
    args,
    options: {
      id: { type: "string" },
      title: { type: "string" },
      endpoint: { type: "string", default: "http://localhost:3000" },
    },
  });

  if (!values.id || !values.title) {
    console.error("Error: --id and --title are required");
    process.exit(1);
  }

  const endpoint = validateEndpoint(values.endpoint);
  try {
    const res = await fetch(
      `${endpoint}/api/agents/${encodeURIComponent(values.id)}/task`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: values.title }),
      },
    );
    await res.json();
    console.log("Task submitted successfully.");
  } catch {
    console.error("Failed sending task to API server");
  }
}

main().catch((err) => {
  console.error("CLI Error:", err);
  process.exit(1);
});
