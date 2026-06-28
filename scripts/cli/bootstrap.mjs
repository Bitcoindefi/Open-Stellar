#!/usr/bin/env node
/**
 * open-stellar bootstrap
 *
 * Scaffolds a new Open-Stellar agent project.
 *
 * Usage:
 *   npx open-stellar bootstrap [project-name]
 *
 * What it does:
 *   1. Creates [project-name]/ directory
 *   2. Copies template files from scripts/templates/agent/
 *   3. Substitutes {{PROJECT_NAME}} in package.json, README.md, and app/page.tsx
 *   4. Runs `npm install` in the new directory
 *   5. Prints next-steps message
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── Helpers ────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";

function log(msg) {
  process.stdout.write(msg + "\n");
}

function info(msg) {
  log(`${CYAN}  →${RESET} ${msg}`);
}

function success(msg) {
  log(`${GREEN}  ✓${RESET} ${msg}`);
}

function error(msg) {
  log(`${RED}  ✗ Error:${RESET} ${msg}`);
}

function warn(msg) {
  log(`${YELLOW}  ⚠${RESET}  ${msg}`);
}

/**
 * Recursively copy a directory, replacing {{PROJECT_NAME}} in specified files.
 * @param {string} src  - Source directory
 * @param {string} dest - Destination directory
 * @param {string} projectName - Value to substitute for {{PROJECT_NAME}}
 * @param {Set<string>} substituteFiles - Basenames that get the substitution
 */
function copyTemplate(src, dest, projectName, substituteFiles) {
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyTemplate(srcPath, destPath, projectName, substituteFiles);
    } else {
      let content = fs.readFileSync(srcPath, "utf8");

      if (substituteFiles.has(entry.name)) {
        content = content.replaceAll("{{PROJECT_NAME}}", projectName);
      }

      fs.writeFileSync(destPath, content, "utf8");
      info(`Copied  ${DIM}${path.relative(dest, destPath)}${RESET}`);
    }
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);

  // Remove "bootstrap" sub-command if passed via `node bootstrap.mjs bootstrap my-agent`
  const filteredArgs = args.filter((a) => a !== "bootstrap");
  const projectName = filteredArgs[0];

  if (!projectName) {
    error("A project name is required.");
    log(
      `\n  Usage: ${BOLD}npx open-stellar bootstrap <project-name>${RESET}\n`,
    );
    process.exit(1);
  }

  // Validate project name (npm-compatible: lowercase, alphanumeric + hyphens)
  if (!/^[a-z0-9][a-z0-9-]*$/.test(projectName)) {
    error(
      `Invalid project name "${projectName}".` +
        " Use lowercase letters, numbers, and hyphens only (must start with a letter or digit).",
    );
    process.exit(1);
  }

  const destDir = path.resolve(process.cwd(), projectName);

  // Guard: directory already exists
  if (fs.existsSync(destDir)) {
    error(
      `Directory "${projectName}" already exists. Choose a different name or remove it first.`,
    );
    process.exit(1);
  }

  // Locate template directory relative to this script
  const templateDir = path.resolve(__dirname, "..", "templates", "agent");

  if (!fs.existsSync(templateDir)) {
    error(`Template directory not found: ${templateDir}`);
    error(
      "Make sure you are running this command from the Open-Stellar repository root.",
    );
    process.exit(1);
  }

  log("");
  log(`${BOLD}${GREEN}◆ Open-Stellar Bootstrap${RESET}`);
  log(`${DIM}  Scaffolding "${projectName}"…${RESET}`);
  log("");

  // 1. Create target directory
  fs.mkdirSync(destDir, { recursive: true });
  success(`Created directory ${BOLD}${projectName}/${RESET}`);

  // 2. Copy template files with substitutions
  const FILES_WITH_SUBSTITUTION = new Set([
    "package.json",
    "README.md",
    "page.tsx",
  ]);
  copyTemplate(templateDir, destDir, projectName, FILES_WITH_SUBSTITUTION);
  success("Template files copied");

  // 3. npm install
  log("");
  info(`Running ${BOLD}npm install${RESET} in ${projectName}/…`);

  try {
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    const installResult = spawnSync(npmCommand, ["install"], {
      cwd: destDir,
      stdio: "inherit",
      shell: false,
    });

    if (installResult.status !== 0) {
      throw new Error("npm install failed");
    }

    success("Dependencies installed");
  } catch {
    error("npm install failed. Check the output above for details.");
    warn(`You can retry manually:\n\n    cd ${projectName} && npm install\n`);
    process.exit(1);
  }

  // 4. Success message
  log("");
  log(
    `${GREEN}${BOLD}  ✨ Project "${projectName}" created successfully!${RESET}`,
  );
  log("");
  log("  Next steps:");
  log("");
  log(`    ${CYAN}cd ${projectName}${RESET}`);
  log(
    `    ${CYAN}cp .env.example .env.local${RESET}   ${DIM}# add your API keys${RESET}`,
  );
  log(`    ${CYAN}npm run dev${RESET}`);
  log("");
  log(`  Then open ${BOLD}http://localhost:3000${RESET} in your browser.`);
  log("");
}

main();
