"use client"

import { useEffect, useMemo, useState } from "react"

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`
}

export function CountdownTimer({ endsAt }: { endsAt: string }) {
  const endMs = useMemo(() => new Date(endsAt).getTime(), [endsAt])
  const [remainingMs, setRemainingMs] = useState(() => endMs - Date.now())

  useEffect(() => {
    const update = () => setRemainingMs(endMs - Date.now())
    update()
    const id = window.setInterval(update, 1000)
    return () => window.clearInterval(id)
  }, [endMs])

  return (
    <time dateTime={endsAt} className="font-mono text-2xl text-cyan-100 sm:text-3xl">
      {formatRemaining(remainingMs)}
    </time>
  )
}
