"use client"

import { useMemo, useState } from "react"

type PermissionState = "unsupported" | "default" | "granted" | "denied"

function getPermissionState(): PermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported"
  return Notification.permission as PermissionState
}

export function NotificationOptIn() {
  const [permission, setPermission] = useState<PermissionState>(getPermissionState)

  const copy = useMemo(() => {
    if (permission === "granted") return "Notifications enabled for badge, level-up, and large payment events."
    if (permission === "denied") return "Notifications are blocked in this browser."
    if (permission === "unsupported") return "This browser does not support push notifications."
    return "Operators can opt in to browser notifications for their agents' notable events."
  }, [permission])

  async function requestNotifications() {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported")
      return
    }

    const result = await Notification.requestPermission()
    setPermission(result as PermissionState)
  }

  return (
    <section style={{ border: "1px solid #1f2a44", borderRadius: 8, background: "#0f172a", padding: 16 }}>
      <h2 style={{ margin: "0 0 10px", color: "#e2e8f0", fontSize: 16 }}>Notifications</h2>
      <p style={{ margin: "0 0 12px", color: "#94a3b8", fontSize: 12, lineHeight: 1.6 }}>
        {copy}
      </p>
      <button
        type="button"
        onClick={requestNotifications}
        disabled={permission === "granted" || permission === "denied" || permission === "unsupported"}
        style={{
          width: "100%",
          border: "1px solid #2a3a52",
          borderRadius: 6,
          background: permission === "default" ? "#164e63" : "#111827",
          color: permission === "default" ? "#ecfeff" : "#94a3b8",
          cursor: permission === "default" ? "pointer" : "default",
          fontFamily: "monospace",
          fontSize: 11,
          padding: "9px 10px",
        }}
      >
        Enable notifications
      </button>
    </section>
  )
}
