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

  // Store-only metadata must never cross the public task-offer API boundary.
  escrowRef?: string | null
  transitionLog?: Array<{ actorId: string; at: string; state: TaskOfferStatus }>
  createdAt?: string
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
  workerAgentId?: string | null
  payload: Record<string, unknown>
}

// #113 owns offer creation, escrow, and lifecycle semantics. This module is only
// the shared storage seam that lets the board read whichever offers #113/#114
// put into the store; it deliberately does not define a second state machine.
const taskOffers = new Map<string, TaskOfferRecord>()

function isOpenAndUnexpired(offer: TaskOfferRecord, nowMs: number) {
  return offer.status === "open" && Date.parse(offer.deadline) > nowMs
}

function toPublicOffer(offer: TaskOfferRecord): PublicTaskOffer {
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

export function listOpenTaskOffers(requiredCapability?: string, nowMs = Date.now()): PublicTaskOffer[] {
  const capability = requiredCapability?.trim()

  return Array.from(taskOffers.values())
    .filter((offer) => isOpenAndUnexpired(offer, nowMs))
    .filter((offer) => !capability || offer.requiredCapability === capability)
    .sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline))
    .map(toPublicOffer)
}

export function putTaskOffer(offer: TaskOfferRecord) {
  taskOffers.set(offer.id, { ...offer, payload: { ...offer.payload } })
}

// Narrow deterministic reset hook for route tests and future #113/#114 tests.
export function resetTaskOffersForTests(offers: TaskOfferRecord[] = []) {
  taskOffers.clear()
  for (const offer of offers) putTaskOffer(offer)
}
