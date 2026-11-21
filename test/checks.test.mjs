import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { checkToolPins } from "../dist/index.js";

const INDEX = pathToFileURL(join(process.cwd(), "dist", "index.js")).href;
const PKG = "@ramon-sg/issue-flow";

function project(json) {
  const root = mkdtempSync(join(tmpdir(), "runner-checks-"));
  if (json !== undefined) {
    mkdirSync(join(root, ".agents"));
    writeFileSync(join(root, ".agents", "runner.json"), typeof json === "string" ? json : JSON.stringify(json));
  }
  return root;
}

/** Runs checkRunner(root) in a child whose PATH holds only fake `names`. */
function runChecks(root, names) {
  const bin = mkdtempSync(join(tmpdir(), "runner-checks-bin-"));
  try {
    for (const name of names) {
      writeFileSync(join(bin, name), "#!/bin/sh\nexit 0\n");
      chmodSync(join(bin, name), 0o755);
    }
    const script = `import * as lib from ${JSON.stringify(INDEX)};
console.log(JSON.stringify(lib.checkRunner(${JSON.stringify(root)})));`;
    return JSON.parse(
      execFileSync(process.execPath, ["--input-type=module", "-e", script], {
        env: { PATH: bin },
        stdio: ["ignore", "pipe", "inherit"],
        timeout: 10_000,
      }).toString(),
    );
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
}

test("checkRunner warns when the file is missing", () => {
  const root = project();
  const checks = runChecks(root, []);
  assert.equal(checks.length, 1);
  assert.equal(checks[0].status, "warn");
  assert.equal(checks[0].name, "runner");
  assert.match(checks[0].detail, /\.agents\/runner\.json/);
});

test("checkRunner fails on an invalid file with the error message", () => {
  const root = project({ runner: "deno" });
  const checks = runChecks(root, []);
  assert.equal(checks.length, 1);
  assert.equal(checks[0].status, "fail");
  assert.match(checks[0].detail, /"runner" must be "bun" or "node"/);
});

test("checkRunner ok when the effective runner is available", () => {
  const root = project({ runner: "bun" });
  const checks = runChecks(root, ["bunx"]);
  assert.deepEqual(checks.map((c) => c.status), ["ok"]);
  assert.match(checks[0].detail, /bun/);
  const node = runChecks(project({ runner: "node" }), ["npx"]);
  assert.deepEqual(node.map((c) => c.status), ["ok"]);
  assert.match(node[0].detail, /node/);
});

test("checkRunner fails saying what to install when unavailable", () => {
  const bun = runChecks(project({}), []);
  assert.equal(bun[0].status, "fail");
  assert.match(bun[0].detail, /Bun/);
  const node = runChecks(project({ runner: "node" }), []);
  assert.equal(node[0].status, "fail");
  assert.match(node[0].detail, /Node\.js/);
});

test("checkToolPins ok when every text uses the pinned version", () => {
  const root = project({ tools: { [PKG]: "0.6.0" } });
  const checks = checkToolPins(root, PKG, [`bunx ${PKG}@0.6.0 run`, `npx ${PKG}@0.6.0`, "unrelated"]);
  assert.equal(checks.length, 1);
  assert.equal(checks[0].status, "ok");
  assert.equal(checks[0].name, "runner");
});

test("checkToolPins fails per text with another version", () => {
  const root = project({ tools: { [PKG]: "0.6.0" } });
  const bad = `bunx ${PKG}@0.5.1 run`;
  const bare = `bunx ${PKG} run`;
  const mixed = `${PKG}@0.6.0 and ${PKG}@0.6.01`;
  const checks = checkToolPins(root, PKG, [`${PKG}@0.6.0`, bad, bare, mixed]);
  assert.deepEqual(checks.map((c) => c.status), ["fail", "fail", "fail"]);
  assert.deepEqual(checks.map((c) => c.detail.includes(bad) || c.detail.includes(bare) || c.detail.includes(mixed)), [true, true, true]);
});

test("checkToolPins ignores texts naming a longer package", () => {
  const root = project({ tools: { [PKG]: "0.6.0" } });
  const checks = checkToolPins(root, PKG, [`${PKG}-extra@1.0.0`, `${PKG}/sub@2.0.0`]);
  assert.deepEqual(checks.map((c) => c.status), ["ok"]);
});

test("checkToolPins fails when the package is not in runner.json", () => {
  const root = project({ tools: {} });
  const checks = checkToolPins(root, PKG, [`${PKG}@0.6.0`]);
  assert.deepEqual(checks.map((c) => c.status), ["fail"]);
});

test("checkToolPins fails when runner.json is missing or invalid", () => {
  const missing = checkToolPins(project(), PKG, []);
  assert.deepEqual(missing.map((c) => c.status), ["fail"]);
  assert.match(missing[0].detail, /\.agents\/runner\.json/);
  const invalid = checkToolPins(project("{"), PKG, []);
  assert.deepEqual(invalid.map((c) => c.status), ["fail"]);
  assert.match(invalid[0].detail, /cannot read or parse/);
});

test("checkToolPins ignores longer or scoped names that end with the package", () => {
  const root = project({ tools: { [PKG]: "0.6.0" } });
  const checks = checkToolPins(root, PKG, [`my-${PKG}@2.0.0`, `@other/${PKG}@3.0.0`]);
  assert.deepEqual(checks.map((c) => c.status), ["ok"]);
});

test("checkToolPins accepts a version followed by a sentence period, not a longer one", () => {
  const root = project({ tools: { [PKG]: "0.7.0" } });
  assert.deepEqual(checkToolPins(root, PKG, [`use ${PKG}@0.7.0.`]).map((c) => c.status), ["ok"]);
  assert.deepEqual(checkToolPins(root, PKG, [`${PKG}@0.7.0.1`]).map((c) => c.status), ["fail"]);
  const beta = project({ tools: { [PKG]: "0.6.0" } });
  assert.deepEqual(checkToolPins(beta, PKG, [`${PKG}@0.6.0-beta`]).map((c) => c.status), ["fail"]);
});

test("checkToolPins treats Object.prototype names as missing", () => {
  const root = project({ tools: {} });
  // With no text naming it, an inherited `tools.constructor` would read as pinned.
  assert.deepEqual(checkToolPins(root, "constructor", []).map((c) => c.status), ["fail"]);
  assert.deepEqual(checkToolPins(root, "constructor", ["constructor@1.0.0"]).map((c) => c.status), ["fail"]);
});
