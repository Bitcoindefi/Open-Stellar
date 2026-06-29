import { NextRequest, NextResponse } from "next/server";
import { getSkill } from "@/lib/skills/skill-store";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: skillId } = await params;
    const { searchParams } = new URL(req.url);
    const version = searchParams.get("version") ?? undefined;

    const skill = getSkill(skillId, version);
    if (!skill) {
      return NextResponse.json(
        {
          error: "Skill not found",
          skillId,
          version: version ?? "latest",
        },
        { status: 404 }
      );
    }

    // In production: deserialize and execute the handler
    // Here we return the handler reference for the agent runtime to invoke
    return NextResponse.json({
      skillId: skill.skillId,
      version: skill.version,
      handler: skill.handler,
      invokedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[skills/invoke]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}