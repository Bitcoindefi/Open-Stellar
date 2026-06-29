export type XPMultiplier = { multiplier: number; validUntil: number; reason: string }

let activeMultiplier: XPMultiplier | null = null

export function setXPMultiplier(m: XPMultiplier) {
  activeMultiplier = m
}

export function getActiveMultiplier(): number {
  if (!activeMultiplier || Date.now() > activeMultiplier.validUntil) return 1
  return activeMultiplier.multiplier
}

export function clearXPMultiplier(): void {
  activeMultiplier = null
}

export function getXPMultiplierState(): XPMultiplier | null {
  if (!activeMultiplier || Date.now() > activeMultiplier.validUntil) return null
  return activeMultiplier
}

export function resetXPMultiplierForTests(): void {
  activeMultiplier = null
}
