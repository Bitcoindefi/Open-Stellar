/**
 * Idempotency guard for quest completion / reward claims.
 *
 * A quest reward (XP, etc.) must be granted at most once per (quest, actor).
 * Without this, the /api/quests/[id]/apply endpoint could be POSTed repeatedly
 * to mint rewards for the same actor — amplified by the XP multiplier. This
 * tracks which (questId, actorId) pairs have already claimed completion.
 */

import { readQuestProgress, writeQuestProgress } from './quest-persistence'

import { getQuestById, getNextDailyReset, getNextWeeklyReset } from './quests'
import { getStoredQuest } from './quest-store'

/** True if this actor has already claimed completion of this quest in the current cycle. */
export function hasClaimedQuest(questId: string, actorId: string): boolean {
  const store = readQuestProgress()
  const claims = store.completions.filter(c => c.questId === questId && c.actorId === actorId)
  if (claims.length === 0) return false

  // Sort claims descending
  claims.sort((a, b) => new Date(b.claimedAt).getTime() - new Date(a.claimedAt).getTime())
  const lastClaim = claims[0]

  let questType = lastClaim.questType
  if (!questType) {
    const predefinedQuest = getQuestById(questId)
    const storedQuest = getStoredQuest(questId)
    questType = predefinedQuest?.type || storedQuest?.type
  }
  
  if (!questType) return true // unknown quest type
  
  if (questType === 'daily') {
    // Check if the claim happened today (i.e. before the next daily reset of the claim's time)
    const nextReset = getNextDailyReset(new Date(lastClaim.claimedAt))
    return new Date().getTime() < nextReset.getTime()
  } else if (questType === 'weekly') {
    const nextReset = getNextWeeklyReset(new Date(lastClaim.claimedAt))
    return new Date().getTime() < nextReset.getTime()
  }

  // Story quests can only be claimed once ever
  return true
}

/** Record that this actor has claimed completion of this quest. */
export function markQuestClaimed(questId: string, actorId: string): void {
  const store = readQuestProgress()
  if (!hasClaimedQuest(questId, actorId)) {
    const predefinedQuest = getQuestById(questId)
    const storedQuest = getStoredQuest(questId)
    const questType = predefinedQuest?.type || storedQuest?.type || 'story'

    store.completions.push({
      questId,
      actorId,
      claimedAt: new Date().toISOString(),
      questType
    })
    writeQuestProgress(store)
  }
}

/** Test helper — clears all recorded completions. */
export function resetQuestCompletions(): void {
  const store = readQuestProgress()
  store.completions = []
  writeQuestProgress(store)
}
