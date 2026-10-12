# agentic-city-runner

Connect the AI command-line tools you already use (Claude Code, OpenAI Codex CLI, Gemini CLI,
Ollama) to [Agentic City](https://agentic-city.vercel.app) and orchestrate them from the web app.

The runner is a small local server. It runs the **official CLIs you are already logged into**, as
subprocesses on your own machine. It never reads, copies or forwards their credentials: each CLI
keeps using its own login, and each provider's terms apply to your own usage. Agentic City (the
web app on Vercel) never talks to the runner; your browser does, over `127.0.0.1`.

## Quick start

```sh
npx agentic-city-runner
```

Until the package is published to npm, run it from a clone of this repo:

```sh
node packages/runner/bin.mjs
```

1. The runner lists the CLIs it found and prints a pairing link like
   `https://agentic-city.vercel.app/runner#<token>`.
2. Open that link in the browser where you use Agentic City. The page stores the token in this
   browser and takes you back to the app.
3. In **Modelos IA > Conectá tu PC** you see each agent with its status. In the chat, pick
   **Mi PC** to send a task to one agent or to the whole local team.

Requirements: Node 20 or newer, and at least one of these CLIs installed and logged in:

| Agent | Install | Log in | How the runner calls it (prompt always on stdin) |
| --- | --- | --- | --- |
| Claude Code | `npm i -g @anthropic-ai/claude-code` | `claude auth login` | `claude -p --output-format stream-json --verbose --tools "" --strict-mcp-config --no-session-persistence` |
| Codex CLI | `npm i -g @openai/codex` | `codex login` | `codex exec --sandbox read-only --skip-git-repo-check --ephemeral --color never --output-last-message <tmp>/last-message.txt -` |
| Gemini CLI | `npm i -g @google/gemini-cli` | run `gemini` once and choose Login with Google (or set `GEMINI_API_KEY`) | `gemini -p "Respond to the request above." --approval-mode plan --skip-trust --output-format text` |
| Ollama | https://ollama.com/download | `ollama serve` and `ollama pull llama3.2` | `ollama run <model> --nowordwrap` |

Flags were checked against Claude Code 2.1.296, Codex CLI 0.150.1 and Gemini CLI 0.63.0. Older
versions may not know `--tools`, `--ephemeral` or `--approval-mode plan`; update the CLI if a run
fails with an unknown option.

## Options

```
--port <n>            Local port (default 7421)
--origin <url>        Also allow this web origin (repeatable), e.g. a self-hosted copy
--app <url>           App URL used in the pairing link (default https://agentic-city.vercel.app)
--timeout <seconds>   Max time per CLI run (default 120)
--ollama-model <id>   Ollama model to use (default: first one in `ollama list`)
```

Environment: `AGENTIC_CITY_RUNNER_PORT`, `AGENTIC_CITY_RUNNER_ORIGINS` (comma separated),
`AGENTIC_CITY_RUNNER_TOKEN` (fixed pairing token, 24 to 128 characters of `A-Z a-z 0-9 - _`;
by default a new random token is created on every start).

For local development of the web app the runner also prints a `http://localhost:3000/runner#...`
link; `http://localhost:3000` is allowed by default.

## API

All endpoints need `Authorization: Bearer <token>`. Browsers must come from an allowed origin.

- `GET /status` (`?probe=1` also sends a one-line prompt to CLIs without a status command, today
  only Gemini): `{ ok, runner: { name, version, platform }, agents: [{ id, label, installed,
  version, loggedIn, detail?, loginHint?, models? }] }`. `loggedIn` is `true`, `false` or `null`
  (unknown).
- `POST /run` `{ agent: "claude" | "codex" | "gemini" | "ollama", prompt, model? }`: Server-Sent
  Events `start`, `chunk`, then `done` (`{ text, ms, truncated }`) or `error` (`{ message }`).
- `POST /orchestrate` `{ task, agents?: string[], orchestrator?: string }`: Server-Sent Events
  `start`, `planning`, `plan_fallback?`, `plan`, `step_start`, `chunk`, `step_done` or
  `step_error`, `synthesizing`, `final` (`{ text, synthesized, note? }`), `done`, or `error`.

### How orchestration works

1. The orchestrator (the requested one, else Claude Code, else the first available agent) gets the
   task and the list of available agents and must answer with a JSON plan:
   `[{"agent":"codex","subtask":"..."}]`, at most 4 steps.
2. The plan is validated (known and available agents only, non-empty subtasks, max 4). If it is
   not valid JSON, the whole task goes to the orchestrator alone and its answer is final.
3. Steps run in parallel on their CLIs, two at a time, each in a fresh temporary folder.
4. The orchestrator writes the final answer from the step results (skipped when there is only one
   step). If that last call fails, you get each agent's result instead.

## Security model

- **Loopback only.** The server binds to `127.0.0.1`, never to `0.0.0.0`, so other machines on your
  network cannot reach it. Requests whose `Host` header is not `127.0.0.1`, `localhost` or `[::1]`
  on the runner's port are refused (DNS rebinding protection).
- **Pairing token.** Every request needs the bearer token printed at start (256 random bits,
  compared in constant time). The pairing link carries it in the URL hash, which browsers never
  send to a server; the web app removes it from the address bar and keeps it only in this browser's
  `localStorage`. Restarting the runner makes a new token, so old links stop working.
- **CORS allowlist.** Browsers are only allowed from `https://agentic-city.vercel.app`, its aliases
  (`agentcity-app`, `agentarena-app`, `openstellar` on vercel.app), the project's Vercel deployment
  URLs, `http://localhost:3000` and any `--origin` you add. The runner answers Chrome's Private
  Network Access preflight (`Access-Control-Allow-Private-Network: true`) only for those origins.
  POST bodies must be JSON, which forces a CORS preflight.
- **Read-only runs.** Claude Code runs with every built-in tool disabled and without your MCP
  servers. Codex runs in its `read-only` sandbox (commands it runs cannot write files or use the
  network). Gemini runs in `plan` (read-only) approval mode. Each run starts in an empty temporary
  folder that is deleted afterwards. Note that a read-only agent can still *read* files your user
  can read (Codex can run read-only commands such as `cat`), and whatever it reads can appear in
  its answer in the browser.
- **No shell, no prompt in argv.** CLIs are spawned with an argument array and the prompt is
  written to stdin, so user text is never parsed by a shell. On Windows, npm `.cmd` shims need
  `cmd.exe`; only the runner's fixed flags go through it, and they are checked for shell
  metacharacters.
- **No credential access.** The runner never opens `~/.claude`, `~/.codex`, `~/.gemini` or any
  other credential file. Login state comes from each CLI's own status command (`claude auth
  status`, `codex login status`, `ollama list`) or, for Gemini, from a one-line test prompt when
  you click Actualizar.
- **Limits.** Each run has a timeout (default 120 s) and a 256 KB output cap; the process tree is
  killed when either is hit or when the browser disconnects. Prompts are capped at 20,000
  characters and request bodies at 64 KB. At most two tasks run at the same time.
- **Logs.** The terminal shows which endpoint ran and how long the prompt was, never its text.

## Troubleshooting

- **The card says it cannot find the runner.** Check that the terminal is still open and that you
  used the same port. If you passed `--port`, the pairing link includes it.
- **"El runner no reconoce este navegador" / 401.** The runner was restarted and made a new token:
  open the new link it printed.
- **Chrome asks to "access other apps and services on this device".** That is Chrome's Local
  Network Access permission for a public site calling `127.0.0.1`. Allow it for Agentic City.
  Brave may need Shields lowered for the site.
- **Safari.** Safari may block a secure page from calling `http://127.0.0.1` (mixed content) or
  ignore the Private Network Access headers. Use Chrome, Edge or Firefox for the runner.
- **An agent shows "no logueado".** Run its login command (see the table) in a terminal, then click
  Actualizar.
- **Gemini shows "instalado".** Gemini CLI has no status command; click Actualizar to send a
  one-line test prompt, or just use it.
- **Ollama shows "falta configurar".** Start the server (`ollama serve`) and pull a model.
- **Port busy.** Another runner is open; close it or use `--port 7422`.
- **WSL.** Running the runner inside WSL2 and the browser on Windows works with WSL's default
  localhost forwarding. If it does not, run the runner on Windows instead.
- **Windows.** Supported, including npm `.cmd` shims. Paths with `%`, `!` or `^` in the temp folder
  are refused for `.cmd` shims; set `TEMP` to a plain path if that happens.
