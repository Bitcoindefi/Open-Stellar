import Link from "next/link"
import { LEGAL_LINKS } from "@/lib/legal-links"

interface LegalSection {
  title: string
  items: string[]
}

interface LegalPageProps {
  title: string
  updated: string
  summary: string
  sections: LegalSection[]
}

export function LegalPage({ title, updated, summary, sections }: LegalPageProps) {
  return (
    <main style={{
      minHeight: "100vh",
      background: "#030712",
      color: "#e2e8f0",
      padding: "48px 20px",
      fontFamily: "monospace",
    }}>
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <Link href="/" style={{ color: "#22d3ee", fontSize: 12, textDecoration: "none" }}>
          {"<- Back to Open Stellar"}
        </Link>

        <div style={{
          marginTop: 32,
          border: "1px solid #1f2a44",
          background: "#0f172a",
          borderRadius: 8,
          padding: 28,
        }}>
          <p style={{ color: "#38bdf8", fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase" }}>
            Legal
          </p>
          <h1 style={{ fontSize: 30, margin: "12px 0", lineHeight: 1.2 }}>{title}</h1>
          <p style={{ color: "#94a3b8", lineHeight: 1.7, margin: 0 }}>{summary}</p>
          <p style={{ color: "#64748b", fontSize: 12, marginTop: 18 }}>Last updated: {updated}</p>
        </div>

        <nav style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "22px 0" }}>
          {LEGAL_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                color: "#cbd5e1",
                border: "1px solid #1f2a44",
                borderRadius: 6,
                padding: "8px 10px",
                textDecoration: "none",
                fontSize: 12,
              }}
            >
              {link.shortLabel}
            </Link>
          ))}
        </nav>

        <section style={{ display: "grid", gap: 16 }}>
          {sections.map((section) => (
            <article
              key={section.title}
              style={{
                border: "1px solid #1f2a44",
                background: "#0b1220",
                borderRadius: 8,
                padding: 22,
              }}
            >
              <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>{section.title}</h2>
              <ul style={{ margin: 0, paddingLeft: 20, color: "#cbd5e1", lineHeight: 1.7 }}>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <p style={{ color: "#64748b", fontSize: 12, marginTop: 28, lineHeight: 1.6 }}>
          Contact legal@open-stellar.xyz for notices, privacy requests, or business deployment questions.
        </p>
      </div>
    </main>
  )
}
