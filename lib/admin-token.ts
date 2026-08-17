const ADMIN_TOKEN_HEADER_NAMES = [
  "ADMIN_TOKEN",
  "admin_token",
  "x-admin-token",
  "admin-token",
] as const

type HeaderStore = Headers | Pick<Headers, "get">

export function getProvidedAdminToken(headers: HeaderStore): string | null {
  for (const headerName of ADMIN_TOKEN_HEADER_NAMES) {
    const value = headers.get(headerName)
    if (value) {
      return value
    }
  }

  return null
}

export function hasValidAdminToken(headers: HeaderStore): boolean {
  const expectedToken = process.env.ADMIN_TOKEN
  if (!expectedToken) {
    return false
  }

  return getProvidedAdminToken(headers) === expectedToken
}
