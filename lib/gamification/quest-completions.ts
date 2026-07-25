/**
 * Idempotency guard for quest completion / reward claims.
 *
 * A quest reward (XP, etc.) must be granted at most once per (quest, actor).
 * Without this, the /api/quests/[id]/apply endpoint could be POSTed repeatedly
 * to mint rewards for the same actor — amplified by the XP multiplier. This
 * tracks which (questId, actorId) pairs have already claimed completion.
 */

type CompletionStore = Set<string>

const globalState = globalThis as typeof globalThis & {
  __openStellarQuestCompletions__?: CompletionStore
}

function store(): CompletionStore {
  if (!globalState.__openStellarQuestCompletions__) {
    globalState.__openStellarQuestCompletions__ = new Set<string>()
  }
  return globalState.__openStellarQuestCompletions__
}

function key(questId: string, actorId: string): string {
  return `${questId}::${actorId}`
}

/** True if this actor has already claimed completion of this quest. */
export function hasClaimedQuest(questId: string, actorId: string): boolean {
  return store().has(key(questId, actorId))
}

/** Record that this actor has claimed completion of this quest. */
export function markQuestClaimed(questId: string, actorId: string): void {
  store().add(key(questId, actorId))
}

/** Test helper — clears all recorded completions. */
export function resetQuestCompletions(): void {
  store().clear()
}
