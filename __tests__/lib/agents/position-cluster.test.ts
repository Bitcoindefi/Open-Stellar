import { describe, it, expect } from "vitest";
import { clusterPositions } from "@/lib/agents/position-cluster";

describe("clusterPositions", () => {
  it("clusters 3 agents within 2km with gridSize=5 -> 1 cluster of 3", () => {
    const positions = [
      { agentId: "a1", lat: 40.73, lng: -73.995 },
      { agentId: "a2", lat: 40.731, lng: -73.996 },
      { agentId: "a3", lat: 40.732, lng: -73.997 },
    ];
    const clusters = clusterPositions(positions, 5);
    expect(clusters.length).toBe(1);
    expect(clusters[0].count).toBe(3);
    expect(clusters[0].agentIds).toEqual(["a1", "a2", "a3"]);
  });
});
