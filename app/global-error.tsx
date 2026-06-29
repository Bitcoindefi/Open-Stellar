"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/client-error-reporting";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({
  error,
  reset,
}: Readonly<GlobalErrorProps>) {
  const isDev = process.env.NODE_ENV !== "production";

  useEffect(() => {
    if (isDev) {
      console.error("Global app error", error);
      return;
    }

    void reportClientError("global", globalThis.location.pathname, error).catch(
      () => {},
    );
  }, [error, isDev]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background:
            "radial-gradient(circle at top left, rgba(34,211,238,0.16), transparent 28%), linear-gradient(180deg, rgba(3,7,18,0.95), rgba(3,7,18,1))",
          color: "#e2e8f0",
          fontFamily: "var(--font-vt323), monospace",
          display: "grid",
          placeItems: "center",
          padding: "24px",
        }}
      >
        <main
          style={{
            width: "100%",
            maxWidth: 760,
            background: "rgba(15,23,42,0.88)",
            border: "1px solid rgba(34,211,238,0.18)",
            borderRadius: 24,
            padding: 28,
            boxShadow: "0 24px 80px rgba(2,8,23,0.55)",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid rgba(34,211,238,0.2)",
              background: "rgba(34,211,238,0.08)",
              color: "#a5f3fc",
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.18em",
            }}
          >
            System Recovery
          </div>

          <h1
            style={{
              marginTop: 16,
              marginBottom: 12,
              fontFamily: "var(--font-pixel), monospace",
              fontSize: 28,
              lineHeight: 1.3,
              textTransform: "uppercase",
              color: "#cffafe",
            }}
          >
            Something went wrong
          </h1>

          <p
            style={{
              margin: 0,
              fontSize: 24,
              lineHeight: 1.5,
              color: "#cbd5e1",
            }}
          >
            Open Stellar hit an unexpected problem. You can try again, reload
            the page, or report the issue if it keeps happening.
          </p>

          {isDev ? (
            <div
              style={{
                marginTop: 20,
                padding: 16,
                borderRadius: 16,
                border: "1px solid rgba(248,113,113,0.24)",
                background: "rgba(127,29,29,0.16)",
              }}
            >
              <p
                style={{
                  margin: "0 0 8px 0",
                  color: "#fca5a5",
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                }}
              >
                Developer details
              </p>

              <pre
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  color: "#fecaca",
                  fontSize: 14,
                  lineHeight: 1.5,
                }}
              >
                {error.message}
                {"\n\n"}
                {error.digest ? `Digest: ${error.digest}\n\n` : ""}
                {error.stack}
              </pre>
            </div>
          ) : null}

          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              marginTop: 24,
            }}
          >
            <button
              type="button"
              onClick={() => reset()}
              style={{
                borderRadius: 999,
                border: "1px solid rgba(34,211,238,0.4)",
                background: "rgba(34,211,238,0.12)",
                color: "#a5f3fc",
                padding: "10px 16px",
                cursor: "pointer",
              }}
            >
              Try again
            </button>

            <button
              type="button"
              onClick={() => globalThis.location.reload()}
              style={{
                borderRadius: 999,
                border: "1px solid rgba(148,163,184,0.35)",
                background: "rgba(15,23,42,0.9)",
                color: "#e2e8f0",
                padding: "10px 16px",
                cursor: "pointer",
              }}
            >
              Reload page
            </button>

            <a
              href="https://github.com/Bitcoindefi/Open-Stellar/issues/new/choose"
              target="_blank"
              rel="noreferrer"
              style={{
                borderRadius: 999,
                border: "1px solid rgba(251,191,36,0.35)",
                background: "rgba(251,191,36,0.1)",
                color: "#fde68a",
                padding: "10px 16px",
                textDecoration: "none",
              }}
            >
              Report issue
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
