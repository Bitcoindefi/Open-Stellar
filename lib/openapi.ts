import { readFileSync } from "node:fs"
import { join } from "node:path"

const OPENAPI_PATH = join(process.cwd(), "openapi.yaml")

let cachedSource: string | undefined

export function getOpenApiSource(): string {
  cachedSource ??= readFileSync(OPENAPI_PATH, "utf8")
  return cachedSource
}
