/**
 * apps/web/scripts/build-report.mjs
 *
 * Runs after `next build`. Writes public/build-report.json.
 * Read by /api/system-status and surfaced on the /system-status dashboard.
 * CI gate status is derived from environment variables set by GitHub Actions.
 *
 * Usage: node scripts/build-report.mjs
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "../public");
const outFile = join(outDir, "build-report.json");

function safeExec(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const commit = process.env.GITHUB_SHA
  ?? safeExec("git rev-parse HEAD")
  ?? "unknown";

const branch = process.env.GITHUB_REF_NAME
  ?? safeExec("git rev-parse --abbrev-ref HEAD")
  ?? "unknown";

const ci = Boolean(process.env.CI);

// CI check results — set by workflow steps before calling build
const checks = {
  lint:      process.env.CI_LINT_PASSED      === "true",
  typecheck: process.env.CI_TYPECHECK_PASSED === "true",
  test:      process.env.CI_TEST_PASSED      === "true",
  build:     true, // If this script runs, build succeeded
};

const report = {
  builtAt: new Date().toISOString(),
  commit,
  branch,
  ci,
  checks,
};

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, JSON.stringify(report, null, 2));

console.log(`[build-report] Written to ${outFile}`);
console.log(JSON.stringify(report, null, 2));
