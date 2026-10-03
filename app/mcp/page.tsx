import { McpPageClient } from "@/components/mcp/mcp-page-client"

export const metadata = {
  title: "Conectar Claude Code / Cursor",
  description: "Conectá Claude Code, Cursor o Claude Desktop a tus agentes de Agentic City por MCP, sin API keys.",
}

// Landing for MCP: how to connect a client, the clients connected from this browser, and the
// agents' wallet that pays their hires (linked from the MCP tools when the wallet needs funds).
export default function McpPage() {
  return (
    <main className="min-h-screen bg-[#050a12] px-4 py-10 text-slate-200">
      <div className="mx-auto max-w-xl space-y-3">
        <p className="text-[10px] uppercase tracking-[.28em] text-slate-500">Agentic City · MCP</p>
        <McpPageClient />
      </div>
    </main>
  )
}
