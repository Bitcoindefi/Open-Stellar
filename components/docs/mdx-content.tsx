import Link from "next/link"

function inline(text: string): React.ReactNode[] {
  const parts = text.split(/(`[^`]+`|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g)
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link) return <Link key={index} href={link[2]}>{link[1]}</Link>
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>
    return part
  })
}

export function MdxContent({ body }: { body: string }) {
  const nodes: React.ReactNode[] = []
  const lines = body.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith("```")) {
      const language = line.slice(3).trim()
      const code: string[] = []
      while (++i < lines.length && !lines[i].startsWith("```")) code.push(lines[i])
      nodes.push(<pre key={i} data-language={language || "text"}><code>{code.join("\n")}</code></pre>)
    } else if (line.startsWith("### ")) nodes.push(<h3 key={i}>{inline(line.slice(4))}</h3>)
    else if (line.startsWith("## ")) nodes.push(<h2 key={i}>{inline(line.slice(3))}</h2>)
    else if (line.startsWith("# ")) nodes.push(<h1 key={i}>{inline(line.slice(2))}</h1>)
    else if (line.startsWith("- ")) {
      const items = [line.slice(2)]
      while (lines[i + 1]?.startsWith("- ")) items.push(lines[++i].slice(2))
      nodes.push(<ul key={i}>{items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>)}</ul>)
    } else if (line.trim()) nodes.push(<p key={i}>{inline(line)}</p>)
  }
  return <div className="docs-prose">{nodes}</div>
}
