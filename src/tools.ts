import { SEMVER, isExactVersion, isPackageName } from "./config.js";
import type { RunnerConfig } from "./config.js";

/**
 * Compares two exact versions by semver precedence, prereleases included.
 * @returns Negative if left is older, 0 if equal, positive if newer.
 */
function compareSemver(left: string, right: string): number {
  const [a, b] = [SEMVER.exec(left), SEMVER.exec(right)];
  for (let index = 1; index <= 3; index += 1) {
    const diff = Number(a?.[index] ?? 0) - Number(b?.[index] ?? 0);
    if (diff !== 0) return diff;
  }
  const [pre, other] = [a?.[4], b?.[4]];
  if (pre === other) return 0;
  if (pre === undefined) return 1;
  if (other === undefined) return -1;
  const [x, y] = [pre.split("."), other.split(".")];
  for (let index = 0; index < Math.min(x.length, y.length); index += 1) {
    const [p, q] = [x[index] as string, y[index] as string];
    if (p === q) continue;
    const [pNumber, qNumber] = [/^\d+$/.test(p), /^\d+$/.test(q)];
    if (pNumber && qNumber) return Number(p) - Number(q);
    if (pNumber !== qNumber) return pNumber ? -1 : 1;
    return p < q ? -1 : 1;
  }
  return x.length - y.length;
}

/**
 * Adds a tool or raises its pinned version; never installs anything.
 * Never lowers a version unless `allowLower` is set; `ifMissing` only adds.
 * Does not mutate `config`.
 * @throws TypeError if `pkg` is not a package name or `version` is not exact.
 */
export function setTool(
  config: RunnerConfig,
  pkg: string,
  version: string,
  options: { ifMissing?: boolean; allowLower?: boolean } = {},
): { config: RunnerConfig; changed: boolean } {
  if (!isPackageName(pkg)) throw new TypeError(`invalid package name "${pkg}"`);
  if (!isExactVersion(version)) throw new TypeError(`invalid version "${version}" for ${pkg}`);

  const copy: RunnerConfig = { runner: config.runner, tools: { ...config.tools }, extra: { ...config.extra } };
  const current = Object.hasOwn(config.tools, pkg) ? config.tools[pkg] : undefined;
  let change = current === undefined;
  if (current !== undefined && !options.ifMissing) {
    const order = compareSemver(version, current);
    change = order > 0 || (order < 0 && options.allowLower === true);
  }
  if (change) copy.tools[pkg] = version;
  return { config: copy, changed: change };
}
