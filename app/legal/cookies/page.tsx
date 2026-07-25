import { LegalPage } from "../legal-page"

export const metadata = {
  title: "Cookie Policy | Open Stellar",
}

export default function CookiesPage() {
  return (
    <LegalPage
      title="Cookie Policy"
      updated="2026-06-24"
      summary="Open Stellar is designed to run with local browser storage for app state. Cookies are not required except where optional analytics providers are enabled by a deployment operator."
      sections={[
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
      ]}
    />
  )
}
