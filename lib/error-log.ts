import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { cwd } from "node:process";

export interface ErrorLogEntry {
  id: string;
  source: "global" | "route";
  route: string;
  message: string;
  stack?: string;
  digest?: string;
  createdAt: string;
  userAgent?: string;
}

const DEFAULT_LOG_PATH = join(cwd(), ".data", "error-log.json");
const LOG_PATH = process.env.ERROR_LOG_PATH || DEFAULT_LOG_PATH;

function ensureLogFile(): void {
  const dir = dirname(LOG_PATH);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  if (!existsSync(LOG_PATH)) {
    writeFileSync(LOG_PATH, "[]\n", "utf8");
  }
}

function readEntries(): ErrorLogEntry[] {
  ensureLogFile();
  const raw = readFileSync(LOG_PATH, "utf8").trim();
  if (!raw) return [];

  const parsed = JSON.parse(raw) as ErrorLogEntry[];
  return Array.isArray(parsed) ? parsed : [];
}

function writeEntries(entries: ErrorLogEntry[]): void {
  ensureLogFile();
  const tmpPath = `${LOG_PATH}.${process.pid}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
  renameSync(tmpPath, LOG_PATH);
}

export function appendErrorLog(
  entry: Omit<ErrorLogEntry, "id" | "createdAt">,
): ErrorLogEntry {
  const nextEntry: ErrorLogEntry = {
    id: `err_${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
    ...entry,
  };

  const entries = readEntries();
  writeEntries([nextEntry, ...entries].slice(0, 500));

  return nextEntry;
}
