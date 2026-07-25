import { notFound, redirect } from "next/navigation"
import { DocsLayout } from "@/components/docs/docs-layout"
import { allDocSlugs, getDocPage } from "@/components/docs/docs-data"
import { MdxContent } from "@/components/docs/mdx-content"

export function generateStaticParams() {
  return allDocSlugs().map((slug) => ({ slug: slug.split("/") }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params
  const page = getDocPage(slug?.join("/") ?? "getting-started")
  return { title: page ? `${page.title} | Open Stellar Docs` : "Open Stellar Docs", description: page?.description }
}

export default async function DocsPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params
  if (!slug?.length) redirect("/docs/getting-started")
  const activeSlug = slug.join("/")
  const page = getDocPage(activeSlug)
  if (!page) notFound()
  return <DocsLayout activeSlug={activeSlug}><MdxContent body={page.body} /></DocsLayout>
}
