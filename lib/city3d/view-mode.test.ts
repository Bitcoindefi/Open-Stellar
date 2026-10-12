import { afterEach, describe, expect, it, vi } from "vitest"
import {
  DEFAULT_MAP_VIEW,
  MAP_VIEW_MODES,
  MAP_VIEW_STORAGE_KEY,
  detectWebGL,
  getBrowserStorage,
  parseMapViewMode,
  readMapViewMode,
  writeMapViewMode,
} from "./view-mode"

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    data,
  }
}

describe("parseMapViewMode", () => {
  it("accepts 3d and maps everything else to the 2D default", () => {
    expect(parseMapViewMode("3d")).toBe("3d")
    expect(parseMapViewMode("2d")).toBe("2d")
    expect(parseMapViewMode("3D")).toBe(DEFAULT_MAP_VIEW)
    expect(parseMapViewMode(null)).toBe(DEFAULT_MAP_VIEW)
    expect(parseMapViewMode(42)).toBe(DEFAULT_MAP_VIEW)
  })

  it("defaults to 2D and lists both modes", () => {
    expect(DEFAULT_MAP_VIEW).toBe("2d")
    expect(MAP_VIEW_MODES).toEqual(["2d", "3d"])
  })
})

describe("readMapViewMode / writeMapViewMode", () => {
  it("round-trips the saved mode", () => {
    const storage = memoryStorage()
    expect(readMapViewMode(storage)).toBe("2d")
    expect(writeMapViewMode(storage, "3d")).toBe(true)
    expect(storage.data.get(MAP_VIEW_STORAGE_KEY)).toBe("3d")
    expect(readMapViewMode(storage)).toBe("3d")
    expect(writeMapViewMode(storage, "2d")).toBe(true)
    expect(readMapViewMode(storage)).toBe("2d")
  })

  it("ignores garbage stored by older builds", () => {
    expect(readMapViewMode(memoryStorage({ [MAP_VIEW_STORAGE_KEY]: "isometric" }))).toBe("2d")
  })

  it("falls back to 2D when storage is missing or throws", () => {
    expect(readMapViewMode(null)).toBe("2d")
    expect(readMapViewMode(undefined)).toBe("2d")
    const throwing = {
      getItem: () => {
        throw new Error("SecurityError")
      },
      setItem: () => {
        throw new Error("QuotaExceededError")
      },
    }
    expect(readMapViewMode(throwing)).toBe("2d")
    expect(writeMapViewMode(throwing, "3d")).toBe(false)
    expect(writeMapViewMode(null, "3d")).toBe(false)
  })
})

describe("getBrowserStorage", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("returns null outside the browser", () => {
    expect(getBrowserStorage()).toBeNull()
  })

  it("returns window.localStorage when present", () => {
    const storage = memoryStorage()
    vi.stubGlobal("window", { localStorage: storage })
    expect(getBrowserStorage()).toBe(storage)
  })

  it("returns null when touching localStorage throws", () => {
    vi.stubGlobal("window", {
      get localStorage() {
        throw new Error("blocked")
      },
    })
    expect(getBrowserStorage()).toBeNull()
  })
})

describe("detectWebGL", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("is false without a DOM", () => {
    expect(detectWebGL()).toBe(false)
  })

  it("uses document.createElement when no factory is given", () => {
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => ({}) }) })
    expect(detectWebGL()).toBe(true)
  })

  it("accepts webgl2 and releases the probe context", () => {
    const loseContext = vi.fn()
    const gl = { getExtension: (name: string) => (name === "WEBGL_lose_context" ? { loseContext } : null) }
    const getContext = vi.fn((id: string) => (id === "webgl2" ? gl : null))
    expect(detectWebGL(() => ({ getContext }))).toBe(true)
    expect(getContext).toHaveBeenCalledWith("webgl2")
    expect(loseContext).toHaveBeenCalledTimes(1)
  })

  it("falls back to webgl1", () => {
    const getContext = vi.fn((id: string) => (id === "webgl" ? {} : null))
    expect(detectWebGL(() => ({ getContext }))).toBe(true)
    expect(getContext).toHaveBeenCalledWith("webgl")
  })

  it("survives a failing lose_context extension", () => {
    const gl = {
      getExtension: () => {
        throw new Error("nope")
      },
    }
    expect(detectWebGL(() => ({ getContext: () => gl }))).toBe(true)
  })

  it("is false when no context, no canvas, or the probe throws", () => {
    expect(detectWebGL(() => ({ getContext: () => null }))).toBe(false)
    expect(detectWebGL(() => null)).toBe(false)
    expect(
      detectWebGL(() => {
        throw new Error("no canvas")
      }),
    ).toBe(false)
  })
})
