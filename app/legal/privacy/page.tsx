import { LegalPage } from "../legal-page"
import { PRIVACY_CONTENT } from "@/lib/legal-content"

export const metadata = {
  title: "Privacy Policy | Open Stellar",
}

export default function PrivacyPage() {
  return (
    <LegalPage
      title={PRIVACY_CONTENT.title}
      updated={PRIVACY_CONTENT.updated}
      summary={PRIVACY_CONTENT.summary}
      sections={PRIVACY_CONTENT.sections}
    />
  )
}
