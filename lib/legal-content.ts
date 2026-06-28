export interface LegalSection {
  title: string
  items: string[]
}

export interface LegalContent {
  title: string
  updated: string
  summary: string
  sections: LegalSection[]
}

export const TERMS_CONTENT: LegalContent = {
  title: "Terms of Service",
  updated: "2026-06-24",
  summary: "These terms describe how operators may use Open Stellar protocol infrastructure for AI agent payments, wallets, reputation, and escrow workflows.",
  sections: [
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
  ],
}

export const PRIVACY_CONTENT: LegalContent = {
  title: "Privacy Policy",
  updated: "2026-06-24",
  summary: "This policy explains what Open Stellar deployments may collect when operators run agent wallets, x402 receipts, reputation, and escrow workflows.",
  sections: [
    {
      title: "Data Collected",
      items: [
        "Open Stellar may process wallet addresses, agent configuration, x402 receipts, escrow records, reputation scores, and operational logs.",
        "Deployments may store API request metadata needed for reliability, fraud prevention, accounting, and debugging.",
        "On-chain transaction data is public by nature on networks such as Stellar and cannot be made private by Open Stellar.",
      ],
    },
    {
      title: "Data Not Collected",
      items: [
        "Open Stellar does not require or collect private keys, seed phrases, identity documents, or payment card data.",
        "Users should never paste private keys, seed phrases, or card details into Open Stellar forms, prompts, or issue reports.",
        "Wallet signatures and transactions are handled through wallet providers selected by the user.",
      ],
    },
    {
      title: "Retention and Deletion",
      items: [
        "Off-chain records can be deleted on request when they are not required for security, accounting, legal, or dispute-resolution purposes.",
        "Receipts may be retained for 2 years for accounting and audit purposes, then deleted or anonymized.",
        "On-chain records cannot be deleted because blockchains are public ledgers maintained by independent networks.",
      ],
    },
    {
      title: "GDPR and Data Export",
      items: [
        "EU users may request a data export through GET /api/user/export.",
        "Users may initiate deletion review through POST /api/user/delete-request.",
        "Open Stellar does not sell user data to third parties.",
      ],
    },
    {
      title: "Contact",
      items: [
        "Privacy and GDPR requests can be sent to legal@open-stellar.xyz.",
        "Business deployments should replace this contact with their own controller contact before production launch.",
      ],
    },
  ],
}

export const COOKIES_CONTENT: LegalContent = {
  title: "Cookie Policy",
  updated: "2026-06-24",
  summary: "Open Stellar is designed to run with local browser storage for app state. Cookies are not required except where optional analytics providers are enabled by a deployment operator.",
  sections: [
    {
      title: "Cookies",
      items: [
        "The core Open Stellar app does not require first-party cookies for wallet, agent, or payment functionality.",
        "A deployment operator may enable optional analytics or hosting tools that set their own cookies.",
        "Third-party wallet providers may use their own storage or cookies outside Open Stellar control.",
      ],
    },
    {
      title: "localStorage",
      items: [
        "`onboarding-seen` records whether the agent-city onboarding modal has already been dismissed.",
        "Wallet providers may store connection state in localStorage so users do not need to reconnect on every visit.",
        "Client-only UI preferences may be stored locally and can be cleared from browser settings.",
      ],
    },
    {
      title: "Managing Storage",
      items: [
        "Users can clear localStorage and cookies from their browser settings at any time.",
        "Clearing browser storage may disconnect wallets, reset onboarding state, and remove local UI preferences.",
        "Production operators should disclose any additional analytics storage before launch.",
      ],
    },
  ],
}
