/** Small hex color helpers for the 3D city (no three.js dependency). */

export interface Rgb {
  r: number
  g: number
  b: number
}

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

/** Parses `#rgb` / `#rrggbb` into 0-255 channels, or null for anything else. */
export function hexToRgb(hex: string | null | undefined): Rgb | null {
  if (!hex) return null
  const match = HEX_COLOR.exec(hex.trim())
  if (!match) return null
  const raw = match[1].length === 3 ? match[1].replace(/./g, (ch) => ch + ch) : match[1]
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
  }
}

function channel(value: number): string {
  return Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, "0")
}

export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

/** Linear mix of two hex colors (`t` = 0 gives `a`, 1 gives `b`). Invalid input returns `a` unchanged. */
export function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  if (!ca || !cb) return a
  const k = Math.min(1, Math.max(0, t))
  return rgbToHex({
    r: ca.r + (cb.r - ca.r) * k,
    g: ca.g + (cb.g - ca.g) * k,
    b: ca.b + (cb.b - ca.b) * k,
  })
}

/**
 * Pulls a color toward its own gray by `amount` and scales it by `brightness`.
 * Used for offline robots: they keep a hint of their color but read as powered down.
 */
export function desaturateHex(hex: string, amount: number, brightness = 1): string {
  const c = hexToRgb(hex)
  if (!c) return hex
  const gray = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b
  const k = Math.min(1, Math.max(0, amount))
  const scale = Math.max(0, brightness)
  return rgbToHex({
    r: (c.r + (gray - c.r) * k) * scale,
    g: (c.g + (gray - c.g) * k) * scale,
    b: (c.b + (gray - c.b) * k) * scale,
  })
}
