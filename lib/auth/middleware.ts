import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  checkTierRateLimit,
  verifyApiKey,
  type ApiKeyTier,
  type VerificationResult,
} from "./api-keys";

export interface AuthEvaluationResult {
  allowed: boolean;
  status: number;
  error?: string;
  tier: ApiKeyTier;
  scopes: string[];
  isAdmin: boolean;
  headers?: Record<string, string>;
}

/**
 * Extracts API key securely from Authorization header (Bearer token) or x-api-key header.
 * Query parameters are completely disallowed to prevent secret leakage in logs and history.
 */
export function extractApiKey(req: Request | NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    const parts = authHeader.trim().split(/\s+/);
    if (parts.length === 2 && /^bearer$/i.test(parts[0])) {
      return parts[1];
    }
  }

  const xApiKey = req.headers.get("x-api-key");
  if (xApiKey?.trim()) {
    return xApiKey.trim();
  }

  return null;
}

/**
 * Extracts client IP address safely without trusting spoofable leftmost headers.
 */
export function getClientIp(req: Request | NextRequest): string {
  if (
    "ip" in req &&
    typeof (req as unknown as { ip?: string }).ip === "string" &&
    (req as unknown as { ip?: string }).ip
  ) {
    return (req as unknown as { ip: string }).ip;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  const cfConnectingIp = req.headers.get("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp.trim();
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      return parts.at(-1)!;
    }
  }
  return "127.0.0.1";
}

/**
 * Checks if a path is a static asset or Next.js internal.
 */
export function isStaticOrInternalPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname.startsWith("/public") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/manifest.json" ||
    /\.(png|jpg|jpeg|gif|svg|ico|webp|css|js|woff|woff2|ttf|eot)$/i.test(
      pathname,
    )
  );
}

function evaluateAdminRoute(
  apiKey: string | null,
  authResult: VerificationResult,
  isDevBypass: boolean,
): AuthEvaluationResult {
  if (isDevBypass) {
    return {
      allowed: true,
      status: 200,
      tier: "admin",
      scopes: ["*"],
      isAdmin: true,
    };
  }

  if (!apiKey) {
    return {
      allowed: false,
      status: 401,
      error: "Unauthorized: Admin API key required",
      tier: "no_key",
      scopes: [],
      isAdmin: false,
    };
  }

  if (!authResult.valid) {
    return {
      allowed: false,
      status: 401,
      error: "Unauthorized: Invalid or revoked API key",
      tier: "no_key",
      scopes: [],
      isAdmin: false,
    };
  }

  if (!authResult.isAdmin) {
    return {
      allowed: false,
      status: 403,
      error: "Forbidden: Admin access required",
      tier: authResult.tier,
      scopes: authResult.scopes,
      isAdmin: false,
    };
  }

  return {
    allowed: true,
    status: 200,
    tier: "admin",
    scopes: authResult.scopes,
    isAdmin: true,
  };
}

function evaluateAgentWriteRoute(
  apiKey: string | null,
  authResult: VerificationResult,
  isDevBypass: boolean,
): AuthEvaluationResult | null {
  if (isDevBypass) {
    return null;
  }

  if (!apiKey) {
    return {
      allowed: false,
      status: 401,
      error: "Unauthorized: API key required for agent write operations",
      tier: "no_key",
      scopes: [],
      isAdmin: false,
    };
  }

  if (!authResult.valid) {
    return {
      allowed: false,
      status: 401,
      error: "Unauthorized: Invalid or revoked API key",
      tier: "no_key",
      scopes: [],
      isAdmin: false,
    };
  }

  const hasWriteScope =
    authResult.isAdmin ||
    authResult.scopes.includes("*") ||
    authResult.scopes.includes("agents:write");

  if (!hasWriteScope) {
    return {
      allowed: false,
      status: 403,
      error: "Forbidden: Missing required scope agents:write",
      tier: authResult.tier,
      scopes: authResult.scopes,
      isAdmin: false,
    };
  }

  return null;
}

function evaluateWebhookWriteRoute(
  apiKey: string | null,
  authResult: VerificationResult,
  isDevBypass: boolean,
): AuthEvaluationResult | null {
  if (isDevBypass) {
    return null;
  }

  if (!apiKey) {
    return {
      allowed: false,
      status: 401,
      error: "Unauthorized: API key required for webhook management",
      tier: "no_key",
      scopes: [],
      isAdmin: false,
    };
  }

  if (!authResult.valid) {
    return {
      allowed: false,
      status: 401,
      error: "Unauthorized: Invalid or revoked API key",
      tier: "no_key",
      scopes: [],
      isAdmin: false,
    };
  }

  const hasWebhookScope =
    authResult.isAdmin ||
    authResult.scopes.includes("*") ||
    authResult.scopes.includes("webhooks:manage");

  if (!hasWebhookScope) {
    return {
      allowed: false,
      status: 403,
      error: "Forbidden: Missing required scope webhooks:manage",
      tier: authResult.tier,
      scopes: authResult.scopes,
      isAdmin: false,
    };
  }

  return null;
}

function evaluateQuestWriteRoute(
  apiKey: string | null,
  authResult: VerificationResult,
  isDevBypass: boolean,
): AuthEvaluationResult | null {
  if (isDevBypass) {
    return null;
  }

  if (!apiKey) {
    return {
      allowed: false,
      status: 401,
      error: "Unauthorized: API key required for quest management",
      tier: "no_key",
      scopes: [],
      isAdmin: false,
    };
  }

  if (!authResult.valid) {
    return {
      allowed: false,
      status: 401,
      error: "Unauthorized: Invalid or revoked API key",
      tier: "no_key",
      scopes: [],
      isAdmin: false,
    };
  }

  const hasQuestScope =
    authResult.isAdmin ||
    authResult.scopes.includes("*") ||
    authResult.scopes.includes("quests:manage");

  if (!hasQuestScope) {
    return {
      allowed: false,
      status: 403,
      error: "Forbidden: Missing required scope quests:manage",
      tier: authResult.tier,
      scopes: authResult.scopes,
      isAdmin: false,
    };
  }

  return null;
}

function evaluateRateLimit(
  authResult: VerificationResult,
  clientIp: string,
): AuthEvaluationResult | null {
  const rateLimitIdentifier =
    authResult.valid && authResult.record?.id ? authResult.record.id : clientIp;

  const rateLimitStatus = checkTierRateLimit(
    rateLimitIdentifier,
    authResult.tier,
  );
  if (!rateLimitStatus.allowed) {
    return {
      allowed: false,
      status: 429,
      error: "rate_limit_exceeded",
      tier: authResult.tier,
      scopes: authResult.scopes,
      isAdmin: authResult.isAdmin,
      headers: {
        "Retry-After": String(rateLimitStatus.retryAfterSeconds),
      },
    };
  }
  return null;
}

/**
 * Evaluates whether an API or Admin request is authorized.
 */
export async function evaluateAuth(
  req: Request | NextRequest,
): Promise<AuthEvaluationResult> {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const method = req.method.toUpperCase();
  const apiKey = extractApiKey(req);
  const clientIp = getClientIp(req);

  const authResult = apiKey
    ? await verifyApiKey(apiKey)
    : {
        valid: false,
        tier: "no_key" as ApiKeyTier,
        scopes: [],
        isAdmin: false,
      };

  // Check bypass modes (DEV_MODE) — never honored in production
  const isDevBypass =
    process.env.NODE_ENV !== "production" && process.env.DEV_MODE === "true";

  // Admin routes check
  const isAdminRoute =
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/api/admin" ||
    pathname.startsWith("/api/admin/");
  if (isAdminRoute) {
    return evaluateAdminRoute(apiKey, authResult, isDevBypass);
  }

  // Agent write routes check
  const isAgentWriteRoute =
    (pathname === "/api/agents" || pathname.startsWith("/api/agents/")) &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  if (isAgentWriteRoute) {
    const writeCheck = evaluateAgentWriteRoute(apiKey, authResult, isDevBypass);
    if (writeCheck) return writeCheck;
  }

  // Webhook management routes check
  const isWebhookWriteRoute =
    (pathname === "/api/webhooks" || pathname.startsWith("/api/webhooks/")) &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  if (isWebhookWriteRoute) {
    const webhookCheck = evaluateWebhookWriteRoute(
      apiKey,
      authResult,
      isDevBypass,
    );
    if (webhookCheck) return webhookCheck;
  }

  // Quest management routes check (exclude participant action routes)
  const isQuestWriteRoute =
    (pathname === "/api/quests" || pathname.startsWith("/api/quests/")) &&
    !pathname.includes("/apply") &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  if (isQuestWriteRoute) {
    const questCheck = evaluateQuestWriteRoute(apiKey, authResult, isDevBypass);
    if (questCheck) return questCheck;
  }

  // Rate Limiting
  const rateLimitCheck = evaluateRateLimit(authResult, clientIp);
  if (rateLimitCheck) return rateLimitCheck;

  return {
    allowed: true,
    status: 200,
    tier: authResult.tier,
    scopes: authResult.scopes,
    isAdmin: authResult.isAdmin,
  };
}

/**
 * Standard Next.js middleware handler for auth & rate limiting.
 */
export async function authMiddleware(req: NextRequest): Promise<NextResponse> {
  const pathname = req.nextUrl.pathname;

  if (isStaticOrInternalPath(pathname)) {
    return NextResponse.next();
  }

  const result = await evaluateAuth(req);

  if (!result.allowed) {
    return NextResponse.json(
      { ok: false, error: result.error || "Unauthorized" },
      {
        status: result.status,
        headers: result.headers,
      },
    );
  }

  const response = NextResponse.next();
  if (result.tier) {
    response.headers.set("X-Api-Tier", result.tier);
  }
  return response;
}
