import Link from "next/link"
import { docNav } from "./docs-data"

type NavGroup = { title: string; items: { title: string; slug: string }[] }
type NavLink = { title: string; slug: string }

function isNavGroup(item: NavGroup | NavLink): item is NavGroup {
  return "items" in item
}

export function DocsLayout({ children, activeSlug }: { children: React.ReactNode; activeSlug: string }) {
  return <main className="min-h-screen bg-[#050816] text-slate-100">
    <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(34,211,238,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,.08)_1px,transparent_1px)] bg-[size:24px_24px]" />
    <div className="relative mx-auto grid max-w-7xl gap-8 px-4 py-8 md:grid-cols-[260px_1fr]">
      <aside className="md:sticky md:top-8 md:h-[calc(100vh-4rem)]">
        <Link href="/" className="mb-6 block font-mono text-xs uppercase tracking-[0.35em] text-cyan-300">← Open Stellar</Link>
        <nav className="rounded-2xl border border-cyan-400/20 bg-slate-950/80 p-4 shadow-[0_0_40px_rgba(34,211,238,.08)]">
          <p className="mb-4 font-mono text-sm text-fuchsia-200">/docs</p>
          {docNav.map((item) => isNavGroup(item) ? <div key={item.title} className="mb-4"><p className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-slate-500">{item.title}</p>{item.items.map((child) => <DocLink key={child.slug} slug={child.slug} title={child.title} active={activeSlug === child.slug} />)}</div> : <DocLink key={item.slug} slug={item.slug} title={item.title} active={activeSlug === item.slug} />)}
        </nav>
      </aside>
      <section className="min-w-0 rounded-3xl border border-cyan-400/20 bg-slate-950/85 p-6 shadow-[0_0_80px_rgba(124,58,237,.15)] md:p-10">{children}</section>
    </div>
  </main>
}

function DocLink({ slug, title, active }: { slug: string; title: string; active: boolean }) {
  return <Link href={`/docs/${slug}`} className={`mb-1 block rounded-lg px-3 py-2 font-mono text-sm ${active ? "bg-cyan-300 text-slate-950" : "text-slate-300 hover:bg-slate-800 hover:text-cyan-200"}`}>{title}</Link>
}
