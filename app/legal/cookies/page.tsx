import { LegalPage } from "../legal-page"
import { COOKIES_CONTENT } from "@/lib/legal-content"

export const metadata = {
  title: "Cookie Policy | Open Stellar",
}

export default function CookiesPage() {
  return (
    <LegalPage
      title={COOKIES_CONTENT.title}
      updated={COOKIES_CONTENT.updated}
      summary={COOKIES_CONTENT.summary}
      sections={COOKIES_CONTENT.sections}
    />
  )
}
