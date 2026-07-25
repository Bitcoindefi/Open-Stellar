export interface ReportableError {
  message: string;
  stack?: string;
  digest?: string;
}

export type ErrorSource = "global" | "route";

export async function reportClientError(
  source: ErrorSource,
  route: string,
  error: ReportableError,
): Promise<void> {
  await fetch("/api/errors/report", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source,
      route,
      message: error.message,
      stack: error.stack,
      digest: error.digest,
    }),
  });
}
