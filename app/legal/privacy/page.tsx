import { LegalPage } from "../legal-page"

export const metadata = {
  title: "Privacy Policy | Agent Arena",
}

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="2026-06-24"
      summary="This policy explains what Agent Arena deployments may collect when operators run agent wallets, x402 receipts, reputation, and escrow workflows."
      sections={[
        {
          title: "Data Collected",
          items: [
            "Agent Arena may process wallet addresses, agent configuration, x402 receipts, escrow records, reputation scores, and operational logs.",
            "Deployments may store API request metadata needed for reliability, fraud prevention, accounting, and debugging.",
            "On-chain transaction data is public by nature on networks such as Stellar and cannot be made private by Agent Arena.",
          ],
        },
        {
          title: "Data Not Collected",
          items: [
            "Agent Arena does not require or collect private keys, seed phrases, identity documents, or payment card data.",
            "Users should never paste private keys, seed phrases, or card details into Agent Arena forms, prompts, or issue reports.",
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
            "Agent Arena does not sell user data to third parties.",
          ],
        },
        {
          title: "Contact",
          items: [
            "Privacy and GDPR requests can be sent to legal@open-stellar.xyz.",
            "Business deployments should replace this contact with their own controller contact before production launch.",
          ],
        },
      ]}
    />
  )
}
