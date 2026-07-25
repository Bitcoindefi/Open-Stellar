"use client";

import { useEffect } from "react";
import { reportClientError, type ReportableError } from "@/lib/client-error-reporting";

interface RouteErrorCardProps {
  route: string;
  title: string;
  message: string;
  error: ReportableError;
  reset: () => void;
}

export function RouteErrorCard({
  route,
  title,
  message,
  error,
  reset,
}: Readonly<RouteErrorCardProps>) {
  const isDev = process.env.NODE_ENV !== "production";

  useEffect(() => {
    if (isDev) {
      console.error(`${route} route error`, error);
      return;
    }

    void reportClientError("route", route, error).catch(() => {});
  }, [error, isDev, route]);

  return (
    <div className="p-6">
      <div className="rounded-2xl border border-slate-700 bg-slate-950/80 p-5 text-slate-100">
        <h2 className="font-pixel text-lg uppercase text-cyan-200">{title}</h2>
        <p className="mt-3 text-slate-300">{message}</p>

        {isDev ? (
          <pre className="mt-4 whitespace-pre-wrap text-xs text-rose-300">
            {error.message}
            {"\n"}
            {error.stack}
          </pre>
        ) : null}

        <div className="mt-4 flex gap-3">
          <button onClick={() => reset()}>Try again</button>
          <button onClick={() => globalThis.location.reload()}>Reload page</button>
        </div>
      </div>
    </div>
  );
}
