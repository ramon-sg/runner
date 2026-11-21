import { RUNNER_FILE, RunnerFileError, effectiveRunner, readRunnerConfig } from "./config.js";
import type { RunnerConfig } from "./config.js";
import { runnerAvailable } from "./choose.js";

export interface Check {
  name: string;
  status: "ok" | "warn" | "fail";
  detail: string;
}

const NAME = "runner";

function check(status: Check["status"], detail: string): Check {
  return { name: NAME, status, detail };
}

type Read = { config: RunnerConfig | null } | { error: string };

function read(root: string): Read {
  try {
    return { config: readRunnerConfig(root) };
  } catch (err) {
    if (err instanceof RunnerFileError) return { error: err.message };
    throw err;
  }
}

/** Checks that `.agents/runner.json` exists, is valid, and its runner is installed. */
export function checkRunner(root: string): Check[] {
  const result = read(root);
  if ("error" in result) return [check("fail", result.error)];
  if (result.config === null) return [check("warn", `${RUNNER_FILE} is missing`)];
  const runner = effectiveRunner(result.config);
  const exe = runner === "bun" ? "bunx" : "npx";
  if (runnerAvailable(runner)) return [check("ok", `runner "${runner}" (${exe} is available)`)];
  const install = runner === "bun" ? "Bun" : "Node.js (npx)";
  return [check("fail", `runner "${runner}" needs ${exe}, which is not available: install ${install}`)];
}

const PACKAGE_CHAR = /[a-z0-9\-._~/]/;
const VERSION_CHAR = /[0-9A-Za-z\-.+]/;

/** Each occurrence of `pkg` in `text` that is not the prefix of a longer package name. */
function occurrences(text: string, pkg: string): number[] {
  const found: number[] = [];
  let from = 0;
  for (;;) {
    const at = text.indexOf(pkg, from);
    if (at === -1) return found;
    const next = text[at + pkg.length];
    if (next === undefined || !PACKAGE_CHAR.test(next)) found.push(at);
    from = at + 1;
  }
}

/** Checks that every command text naming `pkg` pins the version in `runner.json`. */
export function checkToolPins(root: string, pkg: string, texts: string[]): Check[] {
  const result = read(root);
  if ("error" in result) return [check("fail", result.error)];
  if (result.config === null) return [check("fail", `${RUNNER_FILE} is missing`)];
  const pinned = result.config.tools[pkg];
  if (pinned === undefined) return [check("fail", `${pkg} has no entry in "tools" of ${RUNNER_FILE}`)];

  const expected = `${pkg}@${pinned}`;
  const fails: Check[] = [];
  for (const text of texts) {
    const at = occurrences(text, pkg);
    const bad = at.some((i) => {
      if (!text.startsWith(expected, i)) return true;
      const after = text[i + expected.length];
      return after !== undefined && VERSION_CHAR.test(after);
    });
    if (bad) fails.push(check("fail", `${pkg} is not pinned to ${pinned} in: ${text}`));
  }
  if (fails.length > 0) return fails;
  return [check("ok", `${pkg} is pinned to ${pinned} everywhere`)];
}
