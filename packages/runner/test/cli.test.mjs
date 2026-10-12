import { describe, expect, it } from "vitest"
import { formatAgentTable, main, parseArgs, readVersion } from "../src/cli.mjs"

function sink() {
  let text = ""
  return { write: (chunk) => { text += chunk }, get text() { return text } }
}

describe("parseArgs", () => {
  it("uses safe defaults and always allows the app it links to", () => {
    const options = parseArgs([], {})
    expect(options).toMatchObject({ port: 7421, appUrl: "https://agentic-city.vercel.app", timeoutMs: 120_000, ollamaModel: null })
    expect(options.origins).toEqual(["https://agentic-city.vercel.app"])
  })

  it("reads flags, inline values and env", () => {
    const options = parseArgs(["--port", "7500", "--origin=http://localhost:3924/", "--app", "http://localhost:3924", "--timeout", "30", "--ollama-model", "llama3.2"], { AGENTIC_CITY_RUNNER_ORIGINS: "https://a.example, https://b.example" })
    expect(options).toMatchObject({ port: 7500, appUrl: "http://localhost:3924", timeoutMs: 30_000, ollamaModel: "llama3.2" })
    expect(options.origins).toEqual(["https://a.example", "https://b.example", "http://localhost:3924"])
    expect(parseArgs([], { AGENTIC_CITY_RUNNER_PORT: "8000" }).port).toBe(8000)
    expect(parseArgs(["-h"], {}).help).toBe(true)
    expect(parseArgs(["-v"], {}).version).toBe(true)
  })

  it("rejects bad values with a readable message", () => {
    expect(() => parseArgs(["--port", "80"], {})).toThrow(/--port/)
    expect(() => parseArgs(["--port"], {})).toThrow(/Falta el valor/)
    expect(() => parseArgs(["--timeout", "1"], {})).toThrow(/--timeout/)
    expect(() => parseArgs(["--ollama-model", "a b"], {})).toThrow(/--ollama-model/)
    expect(() => parseArgs(["--app", "notaurl"], {})).toThrow(/--app/)
    expect(() => parseArgs(["--origin", "file:///x"], {})).toThrow(/Origen/)
    expect(() => parseArgs(["--yolo"], {})).toThrow(/desconocida/)
  })
})

describe("formatAgentTable", () => {
  it("prints one line per agent with its state", () => {
    const table = formatAgentTable([
      { label: "Claude Code", version: "2.1.0", installed: true, loggedIn: true },
      { label: "Codex CLI", version: "0.150.1", installed: true, loggedIn: false, loginHint: "codex login" },
      { label: "Gemini CLI", version: "0.63.0", installed: true, loggedIn: null },
      { label: "Ollama", version: null, installed: false, loggedIn: null },
      { label: "Ollama", version: "0.1", installed: true, loggedIn: false, detail: "Sin modelos" },
    ])
    const lines = table.split("\n")
    expect(lines[0]).toMatch(/Claude Code\s+2\.1\.0\s+listo/)
    expect(lines[1]).toContain("corré: codex login")
    expect(lines[2]).toContain("se verifica en la primera tarea")
    expect(lines[3]).toMatch(/Ollama\s+-\s+no instalado/)
    expect(lines[4]).toContain("Sin modelos")
  })
})

describe("main", () => {
  it("prints help and version without starting a server", async () => {
    const out = sink()
    expect(await main(["--help"], { env: {}, stdout: out, stderr: sink() })).toBe(0)
    expect(out.text).toContain("npx agentic-city-runner")
    const version = sink()
    expect(await main(["--version"], { env: {}, stdout: version, stderr: sink() })).toBe(0)
    expect(version.text.trim()).toBe(readVersion())
  })

  it("exits with 2 on a bad flag or a weak fixed token", async () => {
    const err = sink()
    expect(await main(["--nope"], { env: {}, stdout: sink(), stderr: err })).toBe(2)
    expect(err.text).toContain("Opción desconocida")
    const weak = sink()
    expect(await main([], { env: { AGENTIC_CITY_RUNNER_TOKEN: "123" }, stdout: sink(), stderr: weak })).toBe(2)
    expect(weak.text).toContain("AGENTIC_CITY_RUNNER_TOKEN")
  })
})
