import * as React from "react"

export interface DisputeResolvedEmailProps {
  escrowId: string
  outcome: "released" | "refunded"
  adminNotes?: string
  amount: string
  unsubscribeUrl: string
}

export function DisputeResolvedEmail({ escrowId, outcome, adminNotes, amount, unsubscribeUrl }: DisputeResolvedEmailProps) {
  return (
    <div style={{ fontFamily: "Arial, sans-serif", color: "#102033", lineHeight: 1.5 }}>
      <h1>Dispute {escrowId} resolved</h1>
      <ul>
        <li><strong>Outcome:</strong> {outcome}</li>
        <li><strong>Amount:</strong> {amount}</li>
        {adminNotes ? <li><strong>Admin notes:</strong> {adminNotes}</li> : null}
      </ul>
      <p style={{ fontSize: 12, color: "#667085" }}>
        You are receiving this because dispute notifications are enabled. <a href={unsubscribeUrl}>Unsubscribe</a>.
      </p>
    </div>
  )
}
