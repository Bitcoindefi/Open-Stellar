import { NextResponse } from "next/server"
import { createUnsubscribeUrl, emails, getEmailPreferences } from "@/lib/email/resend"

function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get("authorization") === `Bearer ${secret}`
}

function operatorEmails(): string[] {
  return (process.env.OPERATOR_EMAILS || process.env.OPERATOR_EMAIL || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

async function sendWeeklyReports() {
  const recipients = operatorEmails()
  const results = []

  for (const to of recipients) {
    const preferences = getEmailPreferences(to)
    if (preferences?.unsubscribed || preferences?.events.weeklyReport === false) {
      results.push({ to, skipped: true, reason: "weekly report notifications disabled" })
      continue
    }

    const result = await emails.weeklyReport({
      to,
      data: {
        totalTasks: 0,
        totalXlmEarned: "0",
        totalUsdEarned: "$0.00",
        agents: [],
        unsubscribeUrl: createUnsubscribeUrl(to),
      },
    })
    results.push({ to, ...result })
  }

  return results
}

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron request" }, { status: 401 })
  }

  const results = await sendWeeklyReports()
  return NextResponse.json({ ok: true, results }, { headers: { "Cache-Control": "no-store" } })
}

export const POST = GET
