"use client";

import { RouteErrorCard } from "@/components/error/route-error-card";

type RouteErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function LeaderboardError({
  error,
  reset,
}: Readonly<RouteErrorProps>) {
  return (
    <RouteErrorCard
      route="/leaderboard"
      title="Leaderboard unavailable"
      message="This ranking view failed to load. Try again without leaving the app."
      error={error}
      reset={reset}
    />
  );
}
