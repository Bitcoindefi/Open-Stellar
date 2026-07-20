export interface PersistedAgentState {
  id: string;
  name: string;
  model: string;
  district: string;
  status: string;
  cpu?: number;
  memory?: number;
  autoRestart?: boolean;
  lastHeartbeat?: string;
  tasksCompleted?: number;
  updatedAt: string;
}

export interface PersistedStateData {
  agents: PersistedAgentState[];
  updatedAt: string;
}

function isEdgeRuntime(): boolean {
  return process.env.NEXT_RUNTIME === "edge" || typeof window !== "undefined";
}

// Dynamically obtain node require without triggering Webpack Edge module bundling
function getDynamicRequire() {
  if (isEdgeRuntime()) return null;
  try {
    const g = globalThis as Record<string, unknown>;
    if (typeof g.__non_webpack_require__ === "function") {
      return g.__non_webpack_require__ as (id: string) => unknown;
    }
    return require;
  } catch {
    return null;
  }
}

function getFilePath(): string {
  const req = getDynamicRequire();
  if (!req) return "";
  try {
    const path = req("node:path");
    const dataDir = process.env.AGENT_STATE_FILE
      ? ""
      : path.join(process.cwd(), ".data");
    return (
      process.env.AGENT_STATE_FILE || path.join(dataDir, "agent-state.json")
    );
  } catch {
    return "";
  }
}

export function loadPersistedState(): PersistedStateData {
  const req = getDynamicRequire();
  if (!req) return { agents: [], updatedAt: new Date().toISOString() };

  try {
    const filePath = getFilePath();
    if (!filePath) return { agents: [], updatedAt: new Date().toISOString() };

    const fs = req("node:fs");
    if (!fs.existsSync(filePath)) {
      return { agents: [], updatedAt: new Date().toISOString() };
    }
    const content = fs.readFileSync(filePath, "utf8").trim();
    if (!content) {
      return { agents: [], updatedAt: new Date().toISOString() };
    }
    const parsed = JSON.parse(content) as PersistedStateData;
    if (Array.isArray(parsed.agents)) {
      return parsed;
    }
    return { agents: [], updatedAt: new Date().toISOString() };
  } catch {
    return { agents: [], updatedAt: new Date().toISOString() };
  }
}

export function savePersistedState(agents: PersistedAgentState[]): void {
  const req = getDynamicRequire();
  if (!req) return;

  try {
    const filePath = getFilePath();
    if (!filePath) return;

    const fs = req("node:fs");
    const path = req("node:path");

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const data: PersistedStateData = {
      agents,
      updatedAt: new Date().toISOString(),
    };
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf8");
    try {
      fs.renameSync(tempPath, filePath);
    } catch {
      fs.copyFileSync(tempPath, filePath);
      try {
        fs.unlinkSync(tempPath);
      } catch {}
    }
  } catch (err) {
    console.error(`[persistence] Error saving agent state:`, err);
  }
}

export function upsertPersistedAgent(agent: PersistedAgentState): void {
  const current = loadPersistedState();
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
  savePersistedState(current.agents);
}

export function removePersistedAgent(id: string): void {
  const current = loadPersistedState();
  const filtered = current.agents.filter((a) => a.id !== id);
  if (filtered.length !== current.agents.length) {
    savePersistedState(filtered);
  }
}
