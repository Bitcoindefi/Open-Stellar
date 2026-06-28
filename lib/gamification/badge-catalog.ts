export type BadgeRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

export const BADGE_RARITY_VALUES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const satisfies readonly BadgeRarity[]

export interface BadgeCatalogEntry {
  badgeId: string
  name: string
  description: string
  rarity: BadgeRarity
  xpValue: number
}

export const BADGE_CATALOG: BadgeCatalogEntry[] = [
  {
    badgeId: 'iron-badge-progress',
    name: 'Iron Badge Progress',
    description: 'Maintained 99% uptime for a full daily window.',
    rarity: 'common',
    xpValue: 20,
  },
  {
    badgeId: 'rare-taskmaster',
    name: 'Rare Taskmaster',
    description: 'Completed 50 agent tasks in a single week.',
    rarity: 'rare',
    xpValue: 500,
  },
  {
    badgeId: 'zk-certified',
    name: 'ZK Certified',
    description: 'Minted first ZK passport for permanent identity.',
    rarity: 'epic',
    xpValue: 100,
  },
  {
    badgeId: 'first-quest',
    name: 'First Quest Completed',
    description: 'Completed your first quest.',
    rarity: 'common',
    xpValue: 50,
  },
  {
    badgeId: 'district-contender',
    name: 'District Contender',
    description: 'Reached top 10 in the district leaderboard.',
    rarity: 'uncommon',
    xpValue: 200,
  },
]

const catalogIndex = new Map(BADGE_CATALOG.map((e) => [e.badgeId, e]))

export function getBadgeCatalogEntry(badgeId: string): BadgeCatalogEntry | undefined {
  return catalogIndex.get(badgeId)
}
