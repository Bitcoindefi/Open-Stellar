"use client";

import { RouteErrorCard } from "@/components/error/route-error-card";

type RouteErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AdminError({ error, reset }: Readonly<RouteErrorProps>) {
  return (
    <RouteErrorCard
      route="/admin"
      title="Admin console unavailable"
      message="This admin section failed to load. Try again without leaving the app."
      error={error}
      reset={reset}
    />
  );
}
