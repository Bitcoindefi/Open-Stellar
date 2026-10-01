import { betterAuth } from "better-auth"
import { nextCookies } from "better-auth/next-js"

// User sign-in (Google). Runs without a database for now: Better Auth keeps the session and
// the Google account data in encrypted cookies (stateless mode). Move to Postgres when the
// app needs server-side user records.

export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim())
}

export const auth = betterAuth({
  appName: "Agentic City",
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  socialProviders: isGoogleConfigured()
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!.trim(),
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
        },
      }
    : {},
  session: {
    expiresIn: SESSION_MAX_AGE_SECONDS,
    updateAge: 24 * 60 * 60,
    cookieCache: { enabled: true, maxAge: SESSION_MAX_AGE_SECONDS, strategy: "jwe" },
  },
  account: { storeStateStrategy: "cookie", storeAccountCookie: true },
  plugins: [nextCookies()],
})

export type SessionUser = { name: string; email: string; image: string | null }

export async function getSessionUser(headers: Headers): Promise<SessionUser | null> {
  if (!process.env.BETTER_AUTH_SECRET) return null
  try {
    const session = await auth.api.getSession({ headers })
    if (!session?.user) return null
    return { name: session.user.name, email: session.user.email, image: session.user.image ?? null }
  } catch {
    return null
  }
}
