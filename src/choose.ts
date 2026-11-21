import { spawnSync } from "node:child_process";
import type { Runner } from "./config.js";

export const NO_BUN_WARNING =
  'Bun is not installed: the tools will run with Node (npx). Install Bun and set "runner": "bun" in .agents/runner.json to change it.';

/** Whether the executable behind a runner (`bunx` or `npx`) is installed and runs. */
export function runnerAvailable(runner: Runner): boolean {
  const result = spawnSync(runner === "bun" ? "bunx" : "npx", ["--version"], {
    stdio: "ignore",
    timeout: 15_000,
  });
  return !result.error && result.status === 0;
}

/**
 * The runner for a new file: Bun when installed. Without Bun, `ask` decides
 * (`null` means the user declined); with no `ask`, falls back to Node with a
 * warning. Never reads stdin itself.
 */
export async function chooseRunner(options: {
  ask?: () => Promise<Runner | null>;
}): Promise<{ runner: Runner; warning: string | null } | null> {
  if (runnerAvailable("bun")) return { runner: "bun", warning: null };
  if (!options.ask) return { runner: "node", warning: NO_BUN_WARNING };
  const answer = await options.ask();
  return answer === null ? null : { runner: answer, warning: null };
}
