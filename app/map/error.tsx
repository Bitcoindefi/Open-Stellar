"use client";

import { RouteErrorCard } from "@/components/error/route-error-card";

type RouteErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function MapError({ error, reset }: Readonly<RouteErrorProps>) {
  return (
    <RouteErrorCard
      route="/map"
      title="Map unavailable"
      message="This section failed to load. Try again without leaving the app."
      error={error}
      reset={reset}
    />
  );
}
