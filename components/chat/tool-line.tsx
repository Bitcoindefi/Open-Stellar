"use client"

import type { ReactNode } from "react"
import { Loader2 } from "lucide-react"
import { toolLineText, type ToolLineStatus } from "@/lib/orchestration/events"

/**
 * One line for one thing an agent did, so a hire, a refusal and a pending approval read as the
 * same kind of event in the transcript. Detail sits behind a disclosure to keep the rhythm of
 * one line per action.
 *
 * Adapted from CopilotKit/openbot (MIT), app/src/components/channels/tool-line.tsx.
 */
const tone: Record<ToolLineStatus, string> = {
  running: "#94a3b8",
  done: "#5eead4",
  refused: "#fca5a5",
  failed: "#fbbf24",
  approval: "#c4b5fd",
}

export function ToolLine({ status, label, detail, children }: { status: ToolLineStatus; label: string; detail?: string; children?: ReactNode }) {
  const color = tone[status]
  const text = (
    <span style={{ display: "inline-flex", minWidth: 0, maxWidth: "100%", alignItems: "baseline", gap: 6, fontFamily: "monospace", fontSize: 10, color }}>
      {status === "running" ? <Loader2 size={10} className="animate-spin" aria-hidden="true" style={{ flexShrink: 0, alignSelf: "center" }} /> : null}
      <span style={{ flexShrink: 0 }}>{toolLineText(status, label)}</span>
      {detail && !children ? <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: 0.7 }}>{detail}</span> : null}
    </span>
  )

  if (!children) return <div role="status" style={{ padding: "2px 2px 2px 10px", borderLeft: `2px solid ${color}55` }}>{text}</div>

  return (
    <details style={{ padding: "2px 2px 2px 10px", borderLeft: `2px solid ${color}55` }}>
      <summary style={{ cursor: "pointer", listStyle: "none" }}>{text}</summary>
      <div style={{ marginTop: 4, fontFamily: "monospace", fontSize: 10, lineHeight: 1.5, color: "#94a3b8", whiteSpace: "pre-wrap" }}>{children}</div>
    </details>
  )
}
