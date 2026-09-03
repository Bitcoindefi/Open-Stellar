import { Agent, getOrCreateAgent, normalizeTaskInput } from "./agent";
import {
  listAgentMessages,
  subscribeToAgentMessages,
} from "./messaging";
import type {
  AgentConfig,
  AgentMessage,
  TaskResult,
  TaskHandler,
  MessageHandler,
} from "./types";

export interface CreateAgentOptions extends AgentConfig {
  onStart?: () => void | Promise<void>;
  onStop?: () => void | Promise<void>;
  onTask?: TaskHandler;
  onMessage?: MessageHandler;
  onError?: (error: Error) => void | Promise<void>;
  onStateChange?: (status: string) => void | Promise<void>;
}

export class AgentSDK {
  readonly agent: Agent;

  constructor(options: CreateAgentOptions) {
    this.agent = getOrCreateAgent(options);

    if (options.onStart) this.agent.onStart(options.onStart);
    if (options.onStop) this.agent.onStop(options.onStop);
    if (options.onTask) this.agent.onTask(options.onTask);
    if (options.onMessage) this.agent.onMessage(options.onMessage);
    if (options.onError) this.agent.onError(options.onError);
    if (options.onStateChange) this.agent.onStateChange(options.onStateChange);
  }

  get id(): string {
    return this.agent.id;
  }

  get status(): string {
    return this.agent.getStatus();
  }

  async start(): Promise<void> {
    await this.agent.start();
  }

  async stop(): Promise<void> {
    await this.agent.stop();
  }

  async executeTask(task: unknown): Promise<TaskResult> {
    return this.agent.executeTask(normalizeTaskInput(task));
  }

  async sendMessage(
    toAgentId: string,
    payload: unknown,
    type: AgentMessage["type"] = "chat",
  ): Promise<void> {
    const msg: AgentMessage = {
      id: `msg_${Date.now()}`,
      fromAgentId: this.id,
      toAgentId,
      type,
      payload,
      sentAt: new Date().toISOString(),
    };
    await this.agent.sendMessage(toAgentId, msg);
  }

  getMessages(): AgentMessage[] {
    return listAgentMessages(this.id);
  }

  subscribe(listener: (message: AgentMessage) => void): () => void {
    return subscribeToAgentMessages(this.id, listener);
  }

  getMetrics() {
    return this.agent.getMetrics();
  }
}

export function createAgent(options: CreateAgentOptions): AgentSDK {
  return new AgentSDK(options);
}

export { Agent, getAgent, getOrCreateAgent } from "./agent";
export { enqueueTask, getTask, listTasks } from "./task-queue";
export {
  sendAgentMessage,
  listAgentMessages,
  subscribeToAgentMessages,
} from "./messaging";
