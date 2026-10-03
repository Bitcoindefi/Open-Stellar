import { isStrictSameOrigin } from "@/lib/connections/hydrate"
import { readBrowserId } from "@/lib/identity/browser-id"
import { decideApproval } from "@/lib/mcp/approvals"
import { readParams } from "@/lib/mcp/http"
import { getKvStore } from "@/lib/security/kv-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// The person's answer to an over-cap hire requested by an MCP client (/mcp/approve).
export async function POST(req: Request): Promise<Response> {
  const form = await readParams(req)
  const id = typeof form.id === "string" && /^[0-9a-f]{32}$/.test(form.id) ? form.id : ""
  const back = (result: string) => new Response(null, {
    status: 303,
    headers: { Location: `/mcp/approve?id=${id}&result=${result}`, "Cache-Control": "no-store" },
  })
  if (!isStrictSameOrigin(req)) return back("cross-site")
  const browser = readBrowserId(req)
  if (!browser || !id) return back("not-yours")
  try {
    const decision = form.decision === "approve" ? "approve" : "reject"
    const result = await decideApproval(getKvStore(), id, browser.id, decision)
    return back(result.ok ? (decision === "approve" ? "approved" : "rejected") : "invalid")
  } catch {
    return back("unavailable")
  }
}
