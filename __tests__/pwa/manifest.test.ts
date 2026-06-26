import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

function readAppShell(): string[] {
  const sw = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8")
  const match = sw.match(/const APP_SHELL = \[([\s\S]*?)\]/)
  if (!match) throw new Error("APP_SHELL not found in sw.js")
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
}

describe("PWA manifest", () => {
  const manifest = JSON.parse(readFileSync(join(process.cwd(), "public", "manifest.webmanifest"), "utf8"))

  it("declares an installable standalone app shell", () => {
    expect(manifest.name).toBe("Open Stellar Agent City")
    expect(manifest.short_name).toBe("Open Stellar")
    expect(manifest.start_url).toBe("/")
    expect(manifest.scope).toBe("/")
    expect(manifest.display).toBe("standalone")
    expect(manifest.background_color).toBe("#030712")
    expect(manifest.theme_color).toBe("#111827")
  })

  it("ships icons and a useful app shortcut", () => {
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }),
        expect.objectContaining({ src: "/apple-icon.png", sizes: "180x180", purpose: expect.stringContaining("maskable") }),
      ]),
    )
    expect(manifest.shortcuts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Admin Console", url: "/admin" }),
      ]),
    )
  })

  it("pre-caches /offline in the service worker APP_SHELL", () => {
    const shell = readAppShell()
    expect(shell).toContain("/offline")
  })
})
