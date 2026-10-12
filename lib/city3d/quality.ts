/**
 * Render quality knobs for the 3D city. The device pixel ratio is capped at 1.5
 * and steps down on slow GPUs (drei PerformanceMonitor), never below 0.75.
 */
export const MAX_DPR = 1.5
export const MIN_DPR = 0.75
export const DPR_STEP = 0.25

function sanitize(deviceDpr: number): number {
  return Number.isFinite(deviceDpr) && deviceDpr > 0 ? deviceDpr : 1
}

/** Starting pixel ratio: the device's, capped. */
export function getInitialDpr(deviceDpr: number): number {
  return Math.max(MIN_DPR, Math.min(MAX_DPR, sanitize(deviceDpr)))
}

/** Next pixel ratio after the frame rate declines (-1) or recovers (+1). */
export function stepDpr(current: number, direction: -1 | 1, ceiling: number = MAX_DPR): number {
  const next = sanitize(current) + direction * DPR_STEP
  return Math.max(MIN_DPR, Math.min(Math.min(MAX_DPR, ceiling), next))
}

/** MSAA only pays off on low-density screens; dense ones are sharp enough without it. */
export function shouldAntialias(deviceDpr: number): boolean {
  return sanitize(deviceDpr) < 1.5
}
