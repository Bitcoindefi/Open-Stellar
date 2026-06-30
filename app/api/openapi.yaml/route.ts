import { getOpenApiSource } from "@/lib/openapi"

export const runtime = "nodejs"

export function GET(): Response {
  return new Response(getOpenApiSource(), {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "application/yaml",
    },
  })
}
