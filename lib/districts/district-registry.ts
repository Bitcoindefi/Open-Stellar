import type { DistrictId } from "@/lib/types"

export interface DistrictMeta {
  id: DistrictId
  label: string
  xpRequired: number
}

export const DISTRICT_REGISTRY: DistrictMeta[] = [
  { id: "data-center", label: "Data Center", xpRequired: 500 },
  { id: "comm-hub", label: "Comm Hub", xpRequired: 1500 },
  { id: "processing", label: "Processing", xpRequired: 3000 },
  { id: "defense", label: "Defense Grid", xpRequired: 5000 },
  { id: "research", label: "Research Lab", xpRequired: 8000 },
]
