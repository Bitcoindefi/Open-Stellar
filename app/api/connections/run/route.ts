import { POST as handler } from "@/app/api/admin/connections/run/route"
import { withOAuthCredentials } from "@/lib/connections/hydrate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Public relay: login-based connections get their key from the encrypted cookie first.
export async function POST(req: Request) {
  const hydrated = await withOAuthCredentials(req)
  if (hydrated instanceof Response) return hydrated
  return handler(hydrated)
}
