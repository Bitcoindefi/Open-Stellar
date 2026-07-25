export const XP_DECAY_CONFIG = {
  halfLifeDays: 30,
  minimumXp: 0,
  gracePeriodDays: 7,
} as const

export type XpDecayConfig = typeof XP_DECAY_CONFIG