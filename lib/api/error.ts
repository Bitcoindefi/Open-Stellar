import { NextResponse } from "next/server";

/**
 * Canonical API error shape (issue #287).
 *
 * Every error response from every `/api` route uses this exact schema so
 * clients can write a single error handler:
 *
 *   { ok: false, error: string, code?: string }
 */

export interface ApiError {
  ok: false;
  /** Human-readable description of what went wrong. */
  error: string;
  /** Optional machine-readable code (e.g. "NOT_FOUND", "RATE_LIMITED"). */
  code?: string;
}

/** Well-known status codes with their conventional default error codes. */
const DEFAULT_CODES: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  422: "UNPROCESSABLE",
  429: "RATE_LIMITED",
  500: "INTERNAL",
};

/**
 * Build a canonical JSON error response.
 *
 * @param error   Human-readable message.
 * @param code    Optional machine-readable code. Defaults to the conventional
 *                code for the status (NOT_FOUND for 404, RATE_LIMITED for 429…).
 * @param status  HTTP status; defaults to 400.
 */
export function apiError(
  error: string,
  code?: string,
  status = 400,
): NextResponse<ApiError> {
  const body: ApiError = { ok: false, error, code: code ?? DEFAULT_CODES[status] };
  return NextResponse.json(body, { status });
}
