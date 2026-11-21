import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { writeAtomic } from "./write.js";
import { join } from "node:path";
import type { Runner } from "./config.js";

const VERSION_OUTPUT = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** `bun@1.3.0` or `npm@11.6.0` for the installed manager, or `null` when it can't be read. */
function packageManagerField(runner: Runner): string | null {
  const name = runner === "bun" ? "bun" : "npm";
  const result = spawnSync(name, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 15_000,
  });
  if (result.error || result.status !== 0) return null;
  const version = String(result.stdout).trim();
  return VERSION_OUTPUT.test(version) ? `${name}@${version}` : null;
}

/** The indentation of the first indented line: a tab, or N spaces (default 2). */
function detectIndent(text: string): string {
  const match = /^([ \t]+)\S/m.exec(text);
  return match ? match[1] : "  ";
}

/**
 * Writes the shortcuts of a tool into `package.json` under `root`. A script is
 * the tool's own when its command contains `owned`: those are replaced; any
 * other script with the same name is left alone and returned in `clashes`.
 * `packageManager` is only written when this call creates the file.
 */
export function writeScripts(
  root: string,
  runner: Runner,
  scripts: Record<string, string>,
  owned: string,
): { changed: boolean; clashes: string[] } {
  const file = join(root, "package.json");

  if (!existsSync(file)) {
    const out: Record<string, unknown> = { private: true };
    const manager = packageManagerField(runner);
    if (manager !== null) out.packageManager = manager;
    out.scripts = { ...scripts };
    writeAtomic(file, JSON.stringify(out, null, 2) + "\n");
    return { changed: true, clashes: [] };
  }

  const text = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`${file}: cannot parse: ${(err as Error).message}`);
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(`${file}: must be a JSON object`);
  }
  const pkg = data as Record<string, unknown>;
  const existing = pkg.scripts;
  if (existing !== undefined && (typeof existing !== "object" || existing === null || Array.isArray(existing))) {
    throw new Error(`${file}: "scripts" must be an object`);
  }
  const current: Record<string, unknown> = { ...(existing as Record<string, unknown> | undefined) };

  let changed = existing === undefined && Object.keys(scripts).length > 0;
  const clashes: string[] = [];
  for (const [name, command] of Object.entries(scripts)) {
    const found = Object.hasOwn(current, name) ? current[name] : undefined;
    if (found === command) continue;
    if (found === undefined || (typeof found === "string" && found.includes(owned))) {
      current[name] = command;
      changed = true;
    } else {
      clashes.push(name);
    }
  }
  if (!changed) return { changed: false, clashes };

  pkg.scripts = current;
  const eol = text.endsWith("\n") ? "\n" : "";
  writeAtomic(file, JSON.stringify(pkg, null, detectIndent(text)) + eol);
  return { changed: true, clashes };
}
