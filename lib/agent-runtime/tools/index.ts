import type { DistrictId } from "@/lib/types"

export type AgentToolName =
  | "read_file"
  | "write_file"
  | "query_db"
  | "compress_data"
  | "send_message"
  | "route_request"
  | "encrypt_payload"
  | "run_inference"
  | "batch_process"
  | "tokenize"
  | "scan_threat"
  | "update_firewall"
  | "analyze_anomaly"
  | "search_papers"
  | "run_experiment"
  | "visualize_data"

export interface AgentToolDefinition {
  name: AgentToolName
  description: string
  input_schema: {
    type: "object"
    properties: Record<string, unknown>
    required?: string[]
  }
}

const textParam = (description: string) => ({ type: "string", description })
const objectParam = (description: string) => ({ type: "object", description, additionalProperties: true })

export const DISTRICT_TOOL_NAMES: Record<DistrictId, AgentToolName[]> = {
  "data-center": ["read_file", "write_file", "query_db", "compress_data"],
  "comm-hub": ["send_message", "route_request", "encrypt_payload"],
  processing: ["run_inference", "batch_process", "tokenize"],
  defense: ["scan_threat", "update_firewall", "analyze_anomaly"],
  research: ["search_papers", "run_experiment", "visualize_data"],
}

export const TOOL_DEFINITIONS: Record<AgentToolName, AgentToolDefinition> = {
  read_file: { name: "read_file", description: "Read a file from an approved workspace path.", input_schema: { type: "object", properties: { path: textParam("Workspace-relative file path") }, required: ["path"] } },
  write_file: { name: "write_file", description: "Write content to an approved workspace path.", input_schema: { type: "object", properties: { path: textParam("Workspace-relative file path"), content: textParam("File content") }, required: ["path", "content"] } },
  query_db: { name: "query_db", description: "Run a read-only database query against operational metadata.", input_schema: { type: "object", properties: { query: textParam("Read-only query or natural language request"), params: objectParam("Query parameters") }, required: ["query"] } },
  compress_data: { name: "compress_data", description: "Compress a named dataset or payload for storage transfer.", input_schema: { type: "object", properties: { source: textParam("Data source identifier"), codec: textParam("Compression codec") }, required: ["source"] } },
  send_message: { name: "send_message", description: "Send a message to another agent or channel.", input_schema: { type: "object", properties: { recipient: textParam("Agent, channel, or route"), message: textParam("Message body") }, required: ["recipient", "message"] } },
  route_request: { name: "route_request", description: "Route a request through the communications hub.", input_schema: { type: "object", properties: { destination: textParam("Destination route"), payload: objectParam("Payload to route") }, required: ["destination", "payload"] } },
  encrypt_payload: { name: "encrypt_payload", description: "Encrypt a payload for secure delivery.", input_schema: { type: "object", properties: { payload: objectParam("Payload to encrypt"), keyId: textParam("Key identifier") }, required: ["payload"] } },
  run_inference: { name: "run_inference", description: "Run model inference on a prompt or input payload.", input_schema: { type: "object", properties: { model: textParam("Model identifier"), input: textParam("Inference input") }, required: ["input"] } },
  batch_process: { name: "batch_process", description: "Process a batch of items.", input_schema: { type: "object", properties: { job: textParam("Batch job name"), items: { type: "array", items: {} } }, required: ["job", "items"] } },
  tokenize: { name: "tokenize", description: "Tokenize text for processing analysis.", input_schema: { type: "object", properties: { text: textParam("Text to tokenize") }, required: ["text"] } },
  scan_threat: { name: "scan_threat", description: "Scan an artifact or signal for threats.", input_schema: { type: "object", properties: { target: textParam("Target to scan"), depth: textParam("Scan depth") }, required: ["target"] } },
  update_firewall: { name: "update_firewall", description: "Prepare or apply a firewall policy update.", input_schema: { type: "object", properties: { rule: textParam("Firewall rule"), mode: textParam("dry-run or apply") }, required: ["rule"] } },
  analyze_anomaly: { name: "analyze_anomaly", description: "Analyze anomalous telemetry or behavior.", input_schema: { type: "object", properties: { signal: objectParam("Anomaly signal"), baseline: objectParam("Baseline data") }, required: ["signal"] } },
  search_papers: { name: "search_papers", description: "Search research literature for relevant papers.", input_schema: { type: "object", properties: { query: textParam("Research query"), limit: { type: "number", description: "Maximum results" } }, required: ["query"] } },
  run_experiment: { name: "run_experiment", description: "Run a structured research experiment.", input_schema: { type: "object", properties: { hypothesis: textParam("Hypothesis under test"), variables: objectParam("Experiment variables") }, required: ["hypothesis"] } },
  visualize_data: { name: "visualize_data", description: "Create a chart specification from data.", input_schema: { type: "object", properties: { data: objectParam("Data to visualize"), chartType: textParam("Chart type") }, required: ["data"] } },
}

export function getAgentTools(district: DistrictId): AgentToolDefinition[] {
  return DISTRICT_TOOL_NAMES[district].map((name) => TOOL_DEFINITIONS[name])
}
