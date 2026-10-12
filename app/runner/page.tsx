import type { Metadata } from "next"
import { RunnerPairing } from "@/components/runner/runner-pairing"

export const metadata: Metadata = {
  title: "Conectá tu PC · Agentic City",
  robots: { index: false, follow: false },
}

export default function RunnerPage() {
  return <RunnerPairing />
}
