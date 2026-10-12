import { EventEmitter } from "node:events"
import path from "node:path"
import { PassThrough } from "node:stream"
import { describe, expect, it } from "vitest"
import { needsWindowsShell, quoteForCmd, resolveCommand, runProcess, stripAnsi } from "../src/exec.mjs"
import { IS_WINDOWS } from "./helpers.mjs"

const node = process.execPath

describe("resolveCommand", () => {
  it("finds an executable on a POSIX PATH without a shell", () => {
    const seen = []
    const found = resolveCommand("claude", {
      env: { PATH: "/opt/a:/opt/b" },
      platform: "linux",
      isExecutable: (candidate) => {
        seen.push(candidate)
        return candidate === "/opt/b/claude"
      },
    })
    expect(found).toBe("/opt/b/claude")
    expect(seen).toEqual(["/opt/a/claude", "/opt/b/claude"])
  })

  it("tries PATHEXT extensions on Windows and prefers the first match", () => {
    const found = resolveCommand("codex", {
      env: { Path: "C:\\tools;C:\\npm", PATHEXT: ".EXE;.CMD" },
      platform: "win32",
      isExecutable: (candidate) => candidate === "C:\\npm\\codex.cmd",
    })
    expect(found).toBe("C:\\npm\\codex.cmd")
  })

  it("returns null when the command is missing or the name is not a plain command", () => {
    expect(resolveCommand("gemini", { env: { PATH: "/nope" }, platform: "linux", isExecutable: () => false })).toBeNull()
    expect(resolveCommand("../evil", { env: { PATH: "/bin" }, platform: "linux", isExecutable: () => true })).toBeNull()
    expect(resolveCommand("a b", { env: { PATH: "/bin" }, platform: "linux", isExecutable: () => true })).toBeNull()
    expect(resolveCommand("ollama", { env: {}, platform: "linux", isExecutable: () => true })).toBeNull()
  })

  it("checks the real filesystem by default", () => {
    const dir = path.dirname(node)
    expect(resolveCommand(path.basename(node).replace(/\.exe$/i, ""), { env: { PATH: dir, Path: dir } })).toBeTruthy()
  })
})

describe("cmd.exe quoting (Windows .cmd shims)", () => {
  it("only needs a shell for .cmd/.bat on Windows", () => {
    expect(needsWindowsShell("C:\\npm\\claude.cmd", "win32")).toBe(true)
    expect(needsWindowsShell("C:\\npm\\gemini.BAT", "win32")).toBe(true)
    expect(needsWindowsShell("C:\\bin\\claude.exe", "win32")).toBe(false)
    expect(needsWindowsShell("/usr/bin/claude.cmd", "linux")).toBe(false)
  })

  it("quotes empty and spaced arguments and refuses metacharacters", () => {
    expect(quoteForCmd("--tools")).toBe("--tools")
    expect(quoteForCmd("")).toBe('""')
    expect(quoteForCmd("C:\\Users\\Ana Paz\\tmp\\last.txt")).toBe('"C:\\Users\\Ana Paz\\tmp\\last.txt"')
    for (const bad of ["a&b", "50%", "x|y", "a\"b", "hi!", "a^b", "<x>", "a\nb"]) {
      expect(() => quoteForCmd(bad)).toThrow(/Unsafe/)
    }
  })
})

describe("stripAnsi", () => {
  it("removes color codes and carriage returns", () => {
    expect(stripAnsi("\u001b[31mred\u001b[0m line\r\n")).toBe("red line\n")
  })
})

describe("runProcess", () => {
  it.skipIf(IS_WINDOWS)("sends the prompt on stdin and streams stdout", async () => {
    const chunks = []
    const result = await runProcess({
      command: node,
      args: ["-e", "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>process.stdout.write(d.toUpperCase()+' ñ✓'))"],
      input: "hola mundo",
      onStdout: (text) => chunks.push(text),
    })
    expect(result.code).toBe(0)
    expect(result.stdout).toBe("HOLA MUNDO ñ✓")
    expect(chunks.join("")).toBe("HOLA MUNDO ñ✓")
    expect(result.timedOut).toBe(false)
    expect(result.truncated).toBe(false)
  })

  it.skipIf(IS_WINDOWS)("kills a process that runs past the timeout", async () => {
    const started = Date.now()
    const result = await runProcess({ command: node, args: ["-e", "setTimeout(()=>{}, 20000)"], timeoutMs: 300 })
    expect(result.timedOut).toBe(true)
    expect(result.code).not.toBe(0)
    expect(Date.now() - started).toBeLessThan(5000)
  })

  it.skipIf(IS_WINDOWS)("caps the output and stops the process", async () => {
    const result = await runProcess({
      command: node,
      args: ["-e", "const s='x'.repeat(1024);(function w(){while(process.stdout.write(s));process.stdout.once('drain',w)})()"],
      maxOutputBytes: 4096,
      timeoutMs: 10_000,
    })
    expect(result.truncated).toBe(true)
    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(4096)
    expect(result.timedOut).toBe(false)
  })

  it.skipIf(IS_WINDOWS)("keeps only the tail of a long stderr and reports a non-zero exit", async () => {
    const result = await runProcess({ command: node, args: ["-e", "process.stderr.write('e'.repeat(20000)+'END');process.exit(4)"] })
    expect(result.code).toBe(4)
    expect(result.stderr.endsWith("END")).toBe(true)
    expect(result.stderr.length).toBeLessThanOrEqual(8 * 1024 + 3)
  })

  it.skipIf(IS_WINDOWS)("stops when the caller aborts", async () => {
    const controller = new AbortController()
    const pending = runProcess({ command: node, args: ["-e", "setTimeout(()=>{}, 20000)"], signal: controller.signal })
    setTimeout(() => controller.abort(), 100)
    const result = await pending
    expect(result.aborted).toBe(true)
  })

  it.skipIf(IS_WINDOWS)("honors an already aborted signal", async () => {
    const controller = new AbortController()
    controller.abort()
    const result = await runProcess({ command: node, args: ["-e", "setTimeout(()=>{}, 20000)"], signal: controller.signal })
    expect(result.aborted).toBe(true)
  })

  it("rejects when the command cannot be started", async () => {
    await expect(runProcess({ command: "/definitely/not/here/claude" })).rejects.toThrow()
  })

  it("passes arguments as an array, never through a shell, and quotes them for .cmd shims", async () => {
    const calls = []
    const fakeSpawn = (file, args, options) => {
      calls.push({ file, args, options })
      const child = new EventEmitter()
      child.stdout = new PassThrough()
      child.stderr = new PassThrough()
      child.stdin = new PassThrough()
      child.pid = 4242
      child.exitCode = null
      setTimeout(() => {
        child.stdout.end("ok")
        child.exitCode = 0
        child.emit("close", 0, null)
      }, 5)
      return child
    }
    const posix = await runProcess({ command: "/usr/bin/claude", args: ["-p", "--tools", ""], input: "do $(rm -rf ~) now", spawnImpl: fakeSpawn, platform: "linux" })
    expect(posix.stdout).toBe("ok")
    expect(calls[0].options.shell).toBe(false)
    expect(calls[0].args).toEqual(["-p", "--tools", ""])
    expect(calls[0].options.env.NO_COLOR).toBe("1")

    await runProcess({ command: "C:\\npm\\claude.cmd", args: ["-p", "--tools", ""], input: "a & b", spawnImpl: fakeSpawn, platform: "win32" })
    expect(calls[1].options.shell).toBe(true)
    expect(calls[1].file).toBe('"C:\\npm\\claude.cmd"')
    expect(calls[1].args).toEqual(["-p", "--tools", '""'])
    expect(calls[1].options.detached).toBe(false)
  })
})
