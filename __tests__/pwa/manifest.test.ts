import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

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
})
