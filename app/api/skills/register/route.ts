import { NextRequest, NextResponse } from "next/server";
import { registerSkill, getSkill } from "@/lib/skills/skill-store";
import { z } from "zod";

const semverRegex = /^(\d+)\.(\d+)\.(\d+)$/;

const RegisterSchema = z.object({
  skillId: z.string().min(1).max(128),
  version: z
    .string()
    .regex(semverRegex, "Version must be semver (e.g. 1.2.0)")
    .optional()
    .default("1.0.0"),
  handler: z.string().min(1),
  metadata: z.object({
    description: z.string().optional(),
    author: z.string().optional(),
  }).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { skillId, version, handler, metadata } = parsed.data;

    // 409 guard: duplicate id + version
    const existing = getSkill(skillId, version);
    if (existing) {
      return NextResponse.json(
        { error: "Skill version already exists", skillId, version },
        { status: 409 }
      );
    }

    registerSkill({
      skillId,
      version,
      handler,
      metadata: {
        description: metadata?.description ?? "",
        createdAt: new Date().toISOString(),
        author: metadata?.author,
      },
    });

    return NextResponse.json(
      { skillId, version, status: "registered" },
      { status: 201 }
    );
  } catch (err) {
    console.error("[skills/register]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}