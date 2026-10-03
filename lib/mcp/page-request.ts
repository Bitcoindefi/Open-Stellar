import { headers } from "next/headers"

/** A Request carrying this page request's cookies, for helpers that read cookies from a Request. */
export async function pageRequest(path: string): Promise<Request> {
  const incoming = await headers()
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "localhost"
  const proto = incoming.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https")
  return new Request(`${proto}://${host}${path}`, { headers: { cookie: incoming.get("cookie") ?? "" } })
}
