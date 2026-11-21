import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { writeAtomic } from "./write.js";
import { dirname, join, resolve } from "node:path";
import { VERSION } from "./version.js";

export type Runner = "bun" | "node";

export const RUNNER_FILE = ".agents/runner.json";

export interface RunnerConfig {
  runner: Runner | null;
  tools: Record<string, string>;
  extra: Record<string, unknown>;
}

export const SCHEMA_URL = `https://cdn.jsdelivr.net/npm/@ramon-sg/runner@${VERSION}/runner.schema.json`;

/** An exact semver version: release plus an optional prerelease, no build metadata. */
export const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?$/;
export const PACKAGE_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

export function isExactVersion(v: string): boolean {
  return SEMVER.test(v);
}

export function isPackageName(name: string): boolean {
  return PACKAGE_NAME.test(name);
}

/** A `runner.json` that cannot be used. */
export class RunnerFileError extends Error {
  file: string;
  constructor(file: string, problem: string) {
    super(`${file}: ${problem}`);
    this.name = "RunnerFileError";
    this.file = file;
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Reads `.agents/runner.json` under `root`; `null` when it does not exist. */
export function readRunnerConfig(root: string): RunnerConfig | null {
  const file = resolve(root, RUNNER_FILE);
  if (!existsSync(file)) return null;
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch (err) {
    throw new RunnerFileError(file, `cannot read or parse: ${(err as Error).message}`);
  }
  if (!isPlainObject(data)) throw new RunnerFileError(file, "must be a JSON object");

  const { $schema: _schema, runner, tools, ...extra } = data;

  if (runner !== undefined && runner !== "bun" && runner !== "node") {
    throw new RunnerFileError(file, `"runner" must be "bun" or "node", got ${JSON.stringify(runner)}`);
  }

  const parsedTools: Record<string, string> = {};
  if (tools !== undefined) {
    if (!isPlainObject(tools)) throw new RunnerFileError(file, `"tools" must be an object`);
    for (const [name, version] of Object.entries(tools)) {
      if (!isPackageName(name)) {
        throw new RunnerFileError(file, `"tools": "${name}" is not a valid package name`);
      }
      if (typeof version !== "string" || !isExactVersion(version)) {
        throw new RunnerFileError(
          file,
          `"tools": "${name}" must be an exact version like "1.2.3", got ${JSON.stringify(version)}`,
        );
      }
      parsedTools[name] = version;
    }
  }

  return { runner: runner ?? null, tools: parsedTools, extra };
}

/** Writes `.agents/runner.json` under `root`, creating `.agents/` if needed. Throws `TypeError` on a config the reader would reject. */
export function writeRunnerConfig(root: string, config: RunnerConfig): void {
  const { runner, tools: configTools } = config;
  if (runner !== null && runner !== "bun" && runner !== "node") {
    throw new TypeError(`runner must be null, "bun" or "node", got ${JSON.stringify(runner)}`);
  }
  for (const [name, version] of Object.entries(configTools)) {
    if (!isPackageName(name)) throw new TypeError(`"${name}" is not a valid package name`);
    if (typeof version !== "string" || !isExactVersion(version)) {
      throw new TypeError(`tool "${name}" must be an exact version like "1.2.3", got ${JSON.stringify(version)}`);
    }
  }

  const file = join(root, RUNNER_FILE);
  // No prototype, so an extra key named `__proto__` stays an own property.
  const out: Record<string, unknown> = Object.create(null);
  out.$schema = SCHEMA_URL;
  if (runner !== null) out.runner = runner;
  const tools: Record<string, string> = Object.create(null);
  for (const name of Object.keys(configTools).sort()) tools[name] = configTools[name];
  out.tools = tools;
  for (const [key, value] of Object.entries(config.extra)) {
    if (key === "$schema" || key === "runner" || key === "tools") continue;
    out[key] = value;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeAtomic(file, JSON.stringify(out, null, 2) + "\n");
}

/** The runner to use: the configured one, or Bun by default. */
export function effectiveRunner(config: RunnerConfig | null): Runner {
  return config?.runner ?? "bun";
}
