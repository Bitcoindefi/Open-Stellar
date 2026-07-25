import { describe, it, expect, beforeEach } from "vitest";
import {
  registerSkill,
  getSkill,
  getAllVersions,
  getAllSkills,
  _resetStore,
  makeKey,
} from "@/lib/skills/skill-store";

describe("Skill Versioning", () => {
  beforeEach(() => {
    _resetStore();
  });

  describe("POST /api/skills/register", () => {
    it("registers a skill with explicit version", () => {
      registerSkill({
        skillId: "translate",
        version: "1.2.0",
        handler: "lib/skills/translate@v1.2.0",
        metadata: { description: "Translation skill", createdAt: "2024-01-01T00:00:00Z" },
      });

      const skill = getSkill("translate", "1.2.0");
      expect(skill).toBeDefined();
      expect(skill!.version).toBe("1.2.0");
      expect(skill!.handler).toBe("lib/skills/translate@v1.2.0");
    });

    it("defaults version to 1.0.0 when omitted", () => {
      registerSkill({
        skillId: "summarize",
        version: "1.0.0",
        handler: "lib/skills/summarize",
        metadata: { description: "Summarization skill", createdAt: "2024-01-01T00:00:00Z" },
      });

      const skill = getSkill("summarize");
      expect(skill).toBeDefined();
      expect(skill!.version).toBe("1.0.0");
    });

    it("returns 409 Conflict for duplicate id + version", () => {
      registerSkill({
        skillId: "translate",
        version: "1.0.0",
        handler: "lib/skills/translate@v1",
        metadata: { description: "V1", createdAt: "2024-01-01T00:00:00Z" },
      });

      expect(() =>
        registerSkill({
          skillId: "translate",
          version: "1.0.0",
          handler: "lib/skills/translate@v1-dup",
          metadata: { description: "Dup", createdAt: "2024-01-01T00:00:00Z" },
        })
      ).toThrow("Skill version already exists");
    });

    it("allows same skillId with different versions", () => {
      registerSkill({
        skillId: "translate",
        version: "1.0.0",
        handler: "lib/skills/translate@v1",
        metadata: { description: "V1", createdAt: "2024-01-01T00:00:00Z" },
      });
      registerSkill({
        skillId: "translate",
        version: "2.0.0",
        handler: "lib/skills/translate@v2",
        metadata: { description: "V2", createdAt: "2024-01-01T00:00:00Z" },
      });

      const v1 = getSkill("translate", "1.0.0");
      const v2 = getSkill("translate", "2.0.0");
      expect(v1!.handler).toBe("lib/skills/translate@v1");
      expect(v2!.handler).toBe("lib/skills/translate@v2");
    });
  });

  describe("POST /api/skills/:id/invoke", () => {
    it("invokes pinned version when version query param provided", () => {
      registerSkill({
        skillId: "translate",
        version: "1.0.0",
        handler: "handler-v1",
        metadata: { description: "V1", createdAt: "2024-01-01T00:00:00Z" },
      });
      registerSkill({
        skillId: "translate",
        version: "2.0.0",
        handler: "handler-v2",
        metadata: { description: "V2", createdAt: "2024-01-01T00:00:00Z" },
      });

      const pinned = getSkill("translate", "1.0.0");
      expect(pinned!.handler).toBe("handler-v1");
      expect(pinned!.version).toBe("1.0.0");
    });

    it("invokes latest version when no version param", () => {
      registerSkill({
        skillId: "translate",
        version: "1.0.0",
        handler: "handler-v1",
        metadata: { description: "V1", createdAt: "2024-01-01T00:00:00Z" },
      });
      registerSkill({
        skillId: "translate",
        version: "2.0.0",
        handler: "handler-v2",
        metadata: { description: "V2", createdAt: "2024-01-01T00:00:00Z" },
      });

      const latest = getSkill("translate");
      expect(latest!.handler).toBe("handler-v2");
      expect(latest!.version).toBe("2.0.0");
    });

    it("returns undefined for non-existent version", () => {
      registerSkill({
        skillId: "translate",
        version: "1.0.0",
        handler: "handler-v1",
        metadata: { description: "V1", createdAt: "2024-01-01T00:00:00Z" },
      });

      const missing = getSkill("translate", "9.9.9");
      expect(missing).toBeUndefined();
    });
  });

  describe("GET /api/skills", () => {
    it("lists all versions per skill", () => {
      registerSkill({
        skillId: "translate",
        version: "1.0.0",
        handler: "h1",
        metadata: { description: "V1", createdAt: "2024-01-01T00:00:00Z" },
      });
      registerSkill({
        skillId: "translate",
        version: "2.0.0",
        handler: "h2",
        metadata: { description: "V2", createdAt: "2024-01-01T00:00:00Z" },
      });
      registerSkill({
        skillId: "summarize",
        version: "1.0.0",
        handler: "h3",
        metadata: { description: "S1", createdAt: "2024-01-01T00:00:00Z" },
      });

      const all = getAllSkills();
      expect(all).toHaveLength(2);

      const translate = all.find((s) => s.skillId === "translate");
      expect(translate!.versions).toEqual(["1.0.0", "2.0.0"]);
      expect(translate!.latest).toBe("2.0.0");

      const summarize = all.find((s) => s.skillId === "summarize");
      expect(summarize!.versions).toEqual(["1.0.0"]);
      expect(summarize!.latest).toBe("1.0.0");
    });
  });

  describe("Latest pointer updates", () => {
    it("updates latest pointer when a newer version is registered", () => {
      registerSkill({
        skillId: "translate",
        version: "1.0.0",
        handler: "h1",
        metadata: { description: "V1", createdAt: "2024-01-01T00:00:00Z" },
      });
      expect(getSkill("translate")!.version).toBe("1.0.0");

      registerSkill({
        skillId: "translate",
        version: "2.0.0",
        handler: "h2",
        metadata: { description: "V2", createdAt: "2024-01-01T00:00:00Z" },
      });
      expect(getSkill("translate")!.version).toBe("2.0.0");
    });

    it("does not update latest pointer when older version is registered", () => {
      registerSkill({
        skillId: "translate",
        version: "2.0.0",
        handler: "h2",
        metadata: { description: "V2", createdAt: "2024-01-01T00:00:00Z" },
      });
      registerSkill({
        skillId: "translate",
        version: "1.0.0",
        handler: "h1",
        metadata: { description: "V1", createdAt: "2024-01-01T00:00:00Z" },
      });

      expect(getSkill("translate")!.version).toBe("2.0.0");
    });
  });
});