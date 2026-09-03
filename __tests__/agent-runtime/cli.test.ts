import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

describe("Open-Stellar CLI", () => {
  it("starts agent via CLI and saves state to .data/agent-state.json", () => {
    const output = execSync(
      "node bin/open-stellar.js agent start --name Nexus-7 --district data-center",
      {
        encoding: "utf8",
      },
    );

    expect(output).toContain("Nexus-7");
    expect(output).toContain("data-center");

    const filePath = join(process.cwd(), ".data", "agent-state.json");
    expect(existsSync(filePath)).toBe(true);

    const data = JSON.parse(readFileSync(filePath, "utf8"));
    const agent = data.agents.find((a: any) => a.name === "Nexus-7");

    expect(agent).toBeDefined();
    expect(agent.district).toBe("data-center");
    expect(agent.status).toBe("active");
  }, 15000);

  it("lists persisted agents via CLI", () => {
    execSync(
      "node bin/open-stellar.js agent start --name Nexus-7 --district data-center",
      {
        encoding: "utf8",
      },
    );

    const output = execSync("node bin/open-stellar.js agent list", {
      encoding: "utf8",
    });

    expect(output).toContain("bot-nexus-7");
    expect(output).toContain("Nexus-7");
  }, 15000);
});
