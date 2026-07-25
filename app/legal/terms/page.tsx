import { LegalPage } from "../legal-page"

export const metadata = {
  title: "Terms of Service | Open Stellar",
}

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="2026-06-24"
      summary="These terms describe how operators may use Open Stellar protocol infrastructure for AI agent payments, wallets, reputation, and escrow workflows."
      sections={[
        {
          title: "Protocol Infrastructure",
          items: [
            "Open Stellar is a protocol infrastructure tool and developer interface, not a bank, broker, custodian, payment processor, or financial service.",
            "Users are responsible for configuring their own wallets, agents, keys, spending limits, and deployment environments.",
            "Open Stellar does not provide investment, legal, tax, or accounting advice.",
          ],
        },
        {
          title: "Agent Responsibility",
          items: [
            "Users are responsible for every action initiated by their agents, including x402 requests, wallet interactions, tasks, and API calls.",
            "Operators should monitor agent permissions, spending caps, logs, and payment receipts before running production workloads.",
            "Agents must not be used to offer illegal services, evade sanctions, commit fraud, or abuse third-party systems.",
          ],
        },
        {
          title: "Fees and Payments",
          items: [
            "Protocol fees and on-chain network fees are non-refundable once a transaction is submitted or settled.",
            "Escrow disputes should first use the admin arbitration process; unresolved disputes may be escalated to community governance when available.",
            "Users are responsible for confirming recipient addresses, chains, amounts, and smart contract interactions.",
          ],
        },
        {
          title: "Smart Contracts and Availability",
          items: [
            "Smart contracts, ZK artifacts, wallet adapters, and integrations are provided as-is without warranties.",
            "No guarantee is made that the platform will be uninterrupted, error-free, exploit-free, or compatible with every wallet or chain.",
            "Users should test on testnet and preview environments before handling real value.",
          ],
        },
        {
          title: "Governing Law",
          items: [
            "Business deployments should define governing law and jurisdiction in their own commercial agreement.",
            "Where no separate agreement exists, disputes should be handled through good-faith negotiation before arbitration or court action.",
          ],
        },
      ]}
    />
  )
}
