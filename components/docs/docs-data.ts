import fs from "node:fs"
import path from "node:path"

export type DocPage = { slug: string; title: string; description: string; body: string }

const docsRoot = path.join(process.cwd(), "docs")

export const docNav = [
  { title: "Getting started", slug: "getting-started" },
  { title: "Concepts", items: [
    { title: "x402", slug: "concepts/x402" },
    { title: "Agents", slug: "concepts/agents" },
    { title: "ZK Passport", slug: "concepts/zk-passport" },
    { title: "Gamification", slug: "concepts/gamification" },
  ]},
  { title: "Guides", items: [
    { title: "Gate an API", slug: "guides/gate-an-api" },
    { title: "Deploy agent", slug: "guides/deploy-agent" },
    { title: "Build service", slug: "guides/build-service" },
    { title: "Orchestrate", slug: "guides/orchestrate" },
  ]},
  { title: "API reference", slug: "api-reference" },
  { title: "SDK reference", slug: "sdk-reference" },
  { title: "Changelog", slug: "changelog" },
]

export function allDocSlugs(): string[] {
  const slugs: string[] = []
  const walk = (dir: string, prefix = "") => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name), `${prefix}${entry.name}/`)
      if (entry.isFile() && entry.name.endsWith(".mdx")) slugs.push(`${prefix}${entry.name.replace(/\.mdx$/, "")}`)
    }
  }
  walk(docsRoot)
  return slugs.sort()
}

export function getDocPage(slug = "getting-started"): DocPage | null {
  const file = path.join(docsRoot, `${slug}.mdx`)
  if (!fs.existsSync(file)) return null
  const raw = fs.readFileSync(file, "utf8")
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  const meta = Object.fromEntries((match?.[1] ?? "").split("\n").filter(Boolean).map((line) => {
    const [key, ...rest] = line.split(":")
    return [key.trim(), rest.join(":").trim().replace(/^['"]|['"]$/g, "")]
  })) as Record<string, string>
  return { slug, title: meta.title ?? slug, description: meta.description ?? "", body: match?.[2] ?? raw }
}
