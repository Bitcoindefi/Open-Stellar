import { LegalPage } from "../legal-page"
import { TERMS_CONTENT } from "@/lib/legal-content"

export const metadata = {
  title: "Terms of Service | Open Stellar",
}

export default function TermsPage() {
  return (
    <LegalPage
      title={TERMS_CONTENT.title}
      updated={TERMS_CONTENT.updated}
      summary={TERMS_CONTENT.summary}
      sections={TERMS_CONTENT.sections}
    />
  )
}
