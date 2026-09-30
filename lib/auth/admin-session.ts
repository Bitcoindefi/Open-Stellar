import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "open_stellar_admin_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

export function getSessionAdminApiKey(): string | null {
  return process.env.ADMIN_API_KEY?.trim() || null;
}

export function createAdminSessionToken(nowMs = Date.now()): string {
  const key = getSessionAdminApiKey();
  if (!key) throw new Error("ADMIN_API_KEY must be configured to start an admin session");
  const issuedAt = Math.floor(nowMs / 1000).toString();
  const signature = createHmac("sha256", key).update(issuedAt).digest("base64url");
  return `${issuedAt}.${signature}`;
}

export function isAdminSessionToken(token: string, nowMs = Date.now()): boolean {
  const key = getSessionAdminApiKey();
  if (!key) return false;
  const [issuedAt, signature, extra] = token.split(".");
  if (!issuedAt || !signature || extra !== undefined || !/^\d+$/.test(issuedAt)) return false;
  const issuedAtSeconds = Number(issuedAt);
  const nowSeconds = Math.floor(nowMs / 1000);
  if (!Number.isSafeInteger(issuedAtSeconds) || issuedAtSeconds > nowSeconds + 60 || nowSeconds - issuedAtSeconds > ADMIN_SESSION_MAX_AGE_SECONDS) return false;

  const expected = createHmac("sha256", key).update(issuedAt).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(signature, "base64url");
  } catch {
    return false;
  }
  return safeEqual(supplied, expected);
}

export function getAdminSessionTokenFromRequest(req: Request): string | null {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const prefix = `${ADMIN_SESSION_COOKIE}=`;
  const value = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix))?.slice(prefix.length);
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
