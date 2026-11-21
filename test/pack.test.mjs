// Tests of the published package: what `npm pack` puts in it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("the package has the build and the schema, and no tests nor sources", () => {
  const [pack] = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: ROOT, encoding: "utf8" }));
  const files = pack.files.map((file) => file.path);

  for (const file of ["dist/index.js", "dist/index.d.ts", "runner.schema.json", "package.json", "README.md", "LICENSE"]) assert.ok(files.includes(file), `${file} is not in the package`);
  assert.deepEqual(files.filter((file) => file.startsWith("test/") || file.startsWith("src/")), []);
});

test("the package has no runtime dependencies", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  assert.deepEqual(Object.keys(pkg.dependencies ?? {}), []);
});
