import { getOrCreateAgent, normalizeTaskInput } from "./agent";
import type { AgentConfig, TaskResult } from "./types";

export interface CloudAgentHandlerConfig extends AgentConfig {
  apiKey?: string;
}

export function createServerlessAgentHandler(config: CloudAgentHandlerConfig) {
  return async function handler(req: Request): Promise<Response> {
    try {
      if (req.method === "GET") {
        const agent = getOrCreateAgent(config);
        return new Response(
          JSON.stringify({
            ok: true,
            agent: {
              id: agent.id,
              status: agent.getStatus(),
              metrics: agent.getMetrics(),
            },
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            },
          },
        );
      }

      if (req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        const agent = getOrCreateAgent(config);
        await agent.start();

        const task = normalizeTaskInput(body);
        const result: TaskResult = await agent.executeTask(task);

        return new Response(JSON.stringify({ ok: true, result }), {
          status: 201,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
        });
      }

      return new Response(
        JSON.stringify({ ok: false, error: "Method not allowed" }),
        { status: 405 },
      );
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Serverless execution failed";
      return new Response(JSON.stringify({ ok: false, error: errorMsg }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  };
}

export const createEdgeAgentHandler = createServerlessAgentHandler;
