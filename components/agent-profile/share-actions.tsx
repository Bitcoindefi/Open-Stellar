"use client"

import Link from "next/link"
import { BriefcaseBusiness, Check, Copy, Share2 } from "lucide-react"
import { useState } from "react"

interface AgentShareActionsProps {
  profileUrl: string
  shareText: string
  marketplaceHref: string
}

export function AgentShareActions({ profileUrl, shareText, marketplaceHref }: AgentShareActionsProps) {
  const [copied, setCopied] = useState(false)

  const copyProfileUrl = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  const shareOnX = () => {
    const params = new URLSearchParams({
      text: shareText,
      url: profileUrl,
    })
    window.open(`https://twitter.com/intent/tweet?${params.toString()}`, "_blank", "noopener,noreferrer")
  }

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <button
        type="button"
        onClick={copyProfileUrl}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 font-mono text-xs font-bold uppercase text-cyan-100 transition hover:border-cyan-300/70 hover:bg-cyan-400/20"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? "Copied" : "Copy URL"}
      </button>
      <button
        type="button"
        onClick={shareOnX}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 font-mono text-xs font-bold uppercase text-slate-200 transition hover:border-cyan-400/60 hover:text-cyan-100"
      >
        <Share2 className="h-4 w-4" />
        Share
      </button>
      <Link
        href={marketplaceHref}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-300 px-3 py-2 font-mono text-xs font-bold uppercase text-slate-950 transition hover:bg-emerald-200"
      >
        <BriefcaseBusiness className="h-4 w-4" />
        Hire Agent
      </Link>
    </div>
  )
}
