// buildGraph-runner.mjs — runs buildGraph.mjs with correct module resolution
// Run from backend/: node buildGraph-runner.mjs [args...]
import { createRequire } from "module";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Patch module resolution so buildGraph.mjs finds openai from backend/node_modules
const __dirname = dirname(fileURLToPath(import.meta.url));
const graphScript = resolve(__dirname, "..", "infra", "buildGraph.mjs");

// Re-exec the process with the correct working directory
import { spawnSync } from "child_process";
const result = spawnSync(process.execPath, [graphScript, ...process.argv.slice(2)], {
  cwd: __dirname,  // backend/ — ensures node_modules resolution
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
