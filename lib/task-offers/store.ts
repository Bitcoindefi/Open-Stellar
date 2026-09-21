export type TaskOfferStatus =
  | "open"
  | "claimed"
  | "delivered"
  | "accepted"
  | "disputed"
  | "expired"

export interface TaskOfferRecord {
  id: string
  title: string
  requiredCapability: string
  rewardAmount: number
  rewardAsset: string
  deadline: string
  status: TaskOfferStatus
  posterAgentId: string
  workerAgentId?: string | null
  payload: Record<string, unknown>

  // Server-only metadata. Never expose these fields through the board API.
  internalEscrowRef?: string | null
  internalCreatedAt?: string
}

export interface PublicTaskOffer {
  id: string
  title: string
  requiredCapability: string
  rewardAmount: number
  rewardAsset: string
  deadline: string
  status: TaskOfferStatus
  posterAgentId: string
  workerAgentId: string | null
  payload: Record<string, unknown>
}

const TASK_OFFERS = new Map<string, TaskOfferRecord>()

function cloneRecord(offer: TaskOfferRecord): TaskOfferRecord {
  return {
    ...offer,
    payload: { ...offer.payload },
  }
}

function assertTaskOffer(offer: TaskOfferRecord) {
  if (!offer.id.trim()) throw new Error("Task offer id is required")
  if (!offer.title.trim()) throw new Error("Task offer title is required")
  if (!offer.requiredCapability.trim()) throw new Error("Task offer capability is required")
  if (!Number.isFinite(offer.rewardAmount) || offer.rewardAmount < 0) {
    throw new Error("Task offer reward must be a non-negative number")
  }
  if (!Number.isFinite(Date.parse(offer.deadline))) {
    throw new Error("Task offer deadline must be an ISO-compatible date")
  }
}

export function putTaskOffer(offer: TaskOfferRecord): TaskOfferRecord {
  assertTaskOffer(offer)
  const stored = cloneRecord(offer)
  TASK_OFFERS.set(stored.id, stored)
  return cloneRecord(stored)
}

export function getTaskOffer(id: string): TaskOfferRecord | null {
  const offer = TASK_OFFERS.get(id)
  return offer ? cloneRecord(offer) : null
}

export function listOpenTaskOffers(options: {
  requiredCapability?: string
  now?: number
} = {}): TaskOfferRecord[] {
  const now = options.now ?? Date.now()
  const requiredCapability = options.requiredCapability?.trim().toLowerCase()

  return Array.from(TASK_OFFERS.values())
    .filter((offer) => {
      if (offer.status !== "open") return false
      if (Date.parse(offer.deadline) <= now) return false
      if (requiredCapability && offer.requiredCapability.toLowerCase() !== requiredCapability) return false
      return true
    })
    .sort((a, b) => {
      const deadlineDelta = Date.parse(a.deadline) - Date.parse(b.deadline)
      return deadlineDelta || a.id.localeCompare(b.id)
    })
    .map(cloneRecord)
}

export function toPublicTaskOffer(offer: TaskOfferRecord): PublicTaskOffer {
  return {
    id: offer.id,
    title: offer.title,
    requiredCapability: offer.requiredCapability,
    rewardAmount: offer.rewardAmount,
    rewardAsset: offer.rewardAsset,
    deadline: offer.deadline,
    status: offer.status,
    posterAgentId: offer.posterAgentId,
    workerAgentId: offer.workerAgentId ?? null,
    payload: { ...offer.payload },
  }
}

export function resetTaskOfferStoreForTests() {
  TASK_OFFERS.clear()
}
