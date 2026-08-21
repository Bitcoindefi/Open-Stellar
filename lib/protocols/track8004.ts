export type Track8004Mode = "native-8004" | "reputation-fallback";
export type TrackChain = "bnb" | "stellar";

export interface Track8004Resolution {
  chain: TrackChain;
  mode: Track8004Mode;
  reason: string;
}

export function resolveTrack8004(
  chain: TrackChain,
  stellarSupports8004 = false,
): Track8004Resolution {
  if (chain === "stellar" && !stellarSupports8004) {
    return {
      chain,
      mode: "reputation-fallback",
      reason:
        "Track 8004 is not available on current Stellar setup; using reputation workflow.",
    };
  }

  return {
    chain,
    mode: "native-8004",
    reason: "Track 8004 available for this chain and environment.",
  };
}

export interface ReputationAction {
  actorId: string;
  delta: number;
  reason: string;
  scope: "tx" | "service" | "governance";
}
