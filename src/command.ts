import type { Runner } from "./config.js";

const SAFE_ARGUMENT = /^[A-Za-z0-9_@%+:,./-][A-Za-z0-9_@%+=:,./-]*$/;

/** Quotes one argument for a POSIX shell, only when it needs it. */
function shellQuote(argument: string): string {
  if (SAFE_ARGUMENT.test(argument)) return argument;
  return `'${argument.replaceAll("'", `'\\''`)}'`;
}

/**
 * The executable and arguments that run a pinned tool with the given runner:
 * `bun x --bun pkg@version ...` or `npx --yes pkg@version ...`.
 * Uses `bun x` rather than `bunx`: some installs (asdf's Bun plugin) ship
 * `bunx` as an unquoted `bun x $@` shell script that splits arguments.
 * Does not validate `pkg` or `version`.
 */
export function toolCommand(
  runner: Runner,
  pkg: string,
  version: string,
  args: string[] = [],
): { file: string; args: string[] } {
  const spec = `${pkg}@${version}`;
  return runner === "bun"
    ? { file: "bun", args: ["x", "--bun", spec, ...args] }
    : { file: "npx", args: ["--yes", spec, ...args] };
}

/** The same command as one line a POSIX shell parses back into the same arguments. */
export function toolCommandText(
  runner: Runner,
  pkg: string,
  version: string,
  args: string[] = [],
): string {
  const command = toolCommand(runner, pkg, version, args);
  return [command.file, ...command.args].map(shellQuote).join(" ");
}
