import { describe, expect, it, vi } from "vitest";
import { createAgent } from "@/lib/agent-runtime/sdk";

function uniqueId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

describe("Agent SDK & Lifecycle Hooks", () => {
  it("triggers onStart and onStop hooks during lifecycle transitions", async () => {
    const onStart = vi.fn();
    const onStop = vi.fn();
    const onStateChange = vi.fn();
    const id = uniqueId("bot-test-sdk-lifecycle");

    const sdk = createAgent({
      id,
      name: "TestSDKAgent",
      model: "claude-4-sonnet",
      district: "data-center",
      onStart,
      onStop,
      onStateChange,
    });

    expect(sdk.id).toBe(id);
    expect(sdk.status).toBe("idle");

    await sdk.start();
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(sdk.status).toBe("running");
    expect(onStateChange).toHaveBeenCalledWith("running");

    await sdk.stop();
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(sdk.status).toBe("stopped");
    expect(onStateChange).toHaveBeenCalledWith("stopped");
  });

  it("executes tasks and updates metrics", async () => {
    const onTask = vi.fn().mockResolvedValue({
      summary: "Task completed successfully",
      output: { result: 42 },
    });
    const id = uniqueId("bot-test-sdk-task");
    const sdk = createAgent({
      id,
      name: "TaskAgent",
      model: "claude-4-sonnet",
      onTask,
    });

    await sdk.start();
    const res = await sdk.executeTask({ id: "t1", title: "Calculate metric" });

    expect(res.status).toBe("completed");
    expect(res.summary).toBe("Task completed successfully");
    expect(sdk.getMetrics().tasksCompleted).toBe(1);
  });

  it("handles errors and triggers onError hook", async () => {
    const onError = vi.fn();
    const id = uniqueId("bot-test-sdk-err");
    const sdk = createAgent({
      id,
      name: "ErrorAgent",
      model: "claude-4-sonnet",
      onTask: async () => {
        throw new Error("Execution failure");
      },
      onError,
    });

    await sdk.start();
    const res = await sdk.executeTask({ id: "t2", title: "Faulty task" });

    expect(res.status).toBe("failed");
    expect(res.error).toBe("Execution failure");
    expect(onError).toHaveBeenCalled();
  });

  it("supports inter-agent messaging", async () => {
    const idA = uniqueId("bot-msg-a");
    const idB = uniqueId("bot-msg-b");
    const agentA = createAgent({
      id: idA,
      name: "AgentA",
      model: "claude-4-sonnet",
    });
    const agentB = createAgent({
      id: idB,
      name: "AgentB",
      model: "claude-4-sonnet",
    });

    const received: any[] = [];
    agentB.subscribe((msg) => received.push(msg));

    await agentA.sendMessage(idB, { text: "Hello Agent B" }, "chat");
    expect(received).toHaveLength(1);
    expect(received[0].payload).toEqual({ text: "Hello Agent B" });
  });
});
