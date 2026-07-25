import * as React from "react"

export interface PaymentReceiptEmailProps {
  serviceName: string
  agentName: string
  amountXlm: string
  amountUsd: string
  txHash: string
  txUrl: string
  timestamp: string
  unsubscribeUrl: string
}

export function PaymentReceiptEmail({
  serviceName,
  agentName,
  amountXlm,
  amountUsd,
  txHash,
  txUrl,
  timestamp,
  unsubscribeUrl,
}: PaymentReceiptEmailProps) {
  return (
    <div style={{ fontFamily: "Arial, sans-serif", color: "#102033", lineHeight: 1.5 }}>
      <h1>Payment receipt</h1>
      <p>{serviceName} received a payment for {agentName}.</p>
      <ul>
        <li><strong>Amount:</strong> {amountXlm} XLM ({amountUsd})</li>
        <li><strong>Transaction:</strong> <a href={txUrl}>{txHash}</a></li>
        <li><strong>Timestamp:</strong> {timestamp}</li>
      </ul>
      <p>Thanks for building with Open Stellar.</p>
      <p style={{ fontSize: 12, color: "#667085" }}>
        You are receiving this because payment receipts are enabled. <a href={unsubscribeUrl}>Unsubscribe</a>.
      </p>
    </div>
  )
}
