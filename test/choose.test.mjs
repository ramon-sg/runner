import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const INDEX = pathToFileURL(join(process.cwd(), "dist", "index.js")).href;

/** Runs `body` (an async function body using `lib`) in a child with a PATH holding only `names`. */
function run(names, body) {
  const dir = mkdtempSync(join(tmpdir(), "runner-choose-"));
  try {
    for (const name of names) {
      writeFileSync(join(dir, name), "#!/bin/sh\nexit 0\n");
      chmodSync(join(dir, name), 0o755);
    }
    const script = `import * as lib from ${JSON.stringify(INDEX)};
const out = await (async () => { ${body} })();
console.log(JSON.stringify(out));`;
    const stdout = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      env: { PATH: dir },
      stdio: ["ignore", "pipe", "inherit"],
      timeout: 10_000,
    }).toString();
    return JSON.parse(stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("runnerAvailable bun needs bunx", () => {
  assert.equal(run(["bunx"], `return lib.runnerAvailable("bun");`), true);
  assert.equal(run([], `return lib.runnerAvailable("bun");`), false);
});

test("runnerAvailable node needs npx", () => {
  assert.equal(run(["npx"], `return lib.runnerAvailable("node");`), true);
  assert.equal(run([], `return lib.runnerAvailable("node");`), false);
});

test("with Bun it picks bun and never asks", () => {
  const out = run(
    ["bun", "bunx"],
    `let called = false;
     const r = await lib.chooseRunner({ ask: async () => { called = true; return "node"; } });
     return { r, called };`,
  );
  assert.deepEqual(out, { r: { runner: "bun", warning: null }, called: false });
});

test("without Bun, ask returning node gives node with no warning", () => {
  const out = run([], `return await lib.chooseRunner({ ask: async () => "node" });`);
  assert.deepEqual(out, { runner: "node", warning: null });
});

test("without Bun, ask returning null gives null", () => {
  const out = run([], `return { r: await lib.chooseRunner({ ask: async () => null }) };`);
  assert.deepEqual(out, { r: null });
});

test("without Bun and without ask it falls back to node with the warning", () => {
  const out = run([], `return { r: await lib.chooseRunner({}), w: lib.NO_BUN_WARNING };`);
  assert.deepEqual(out.r, { runner: "node", warning: out.w });
  assert.equal(
    out.w,
    'Bun is not installed: the tools will run with Node (npx). Install Bun and set "runner": "bun" in .agents/runner.json to change it.',
  );
});
