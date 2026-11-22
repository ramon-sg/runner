import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toolCommand, toolCommandText } from "../dist/index.js";

const P = "@ramon-sg/issue-flow";

test("bun uses bun x --bun, not the bunx shim", () => {
  assert.deepEqual(toolCommand("bun", P, "0.6.0", ["issue", "start"]), {
    file: "bun",
    args: ["x", "--bun", `${P}@0.6.0`, "issue", "start"],
  });
});

test("node uses npx --yes", () => {
  assert.deepEqual(toolCommand("node", P, "0.6.0", ["issue", "start"]), {
    file: "npx",
    args: ["--yes", `${P}@0.6.0`, "issue", "start"],
  });
});

test("no args gives only the package", () => {
  assert.deepEqual(toolCommand("bun", P, "0.6.0").args, ["x", "--bun", `${P}@0.6.0`]);
});

test("text joins plain arguments", () => {
  assert.equal(
    toolCommandText("bun", "@ramon-sg/github-rest", "0.7.0", ["pr", "view", "12"]),
    "bun x --bun @ramon-sg/github-rest@0.7.0 pr view 12",
  );
});

test("text quotes unsafe arguments", () => {
  assert.equal(
    toolCommandText("bun", P, "0.6.0", ["--title", "Fix it's broken"]),
    `bun x --bun ${P}@0.6.0 --title 'Fix it'\\''s broken'`,
  );
});

test("empty argument is quoted", () => {
  assert.ok(toolCommandText("node", P, "0.6.0", [""]).endsWith(" ''"));
});

test("a real shell parses the text back into the same arguments", () => {
  const dir = mkdtempSync(join(tmpdir(), "runner-cmd-"));
  try {
    writeFileSync(join(dir, "print.mjs"), "console.log(JSON.stringify(process.argv.slice(2)));\n");
    writeFileSync(
      join(dir, "bun"),
      `#!/bin/sh\nexec "${process.execPath}" "${join(dir, "print.mjs")}" "$@"\n`,
    );
    chmodSync(join(dir, "bun"), 0o755);
    const args = ["--title", "Fix it's broken", "", "a b", "$HOME", "x;y"];
    const out = execFileSync("sh", ["-c", toolCommandText("bun", P, "0.6.0", args)], {
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
    }).toString();
    assert.deepEqual(JSON.parse(out), ["x", "--bun", `${P}@0.6.0`, ...args]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an argument starting with = is quoted", () => {
  assert.ok(toolCommandText("node", P, "0.6.0", ["=ls"]).endsWith(" '=ls'"));
  assert.ok(toolCommandText("node", P, "0.6.0", ["--a=b"]).endsWith(" --a=b"));
});
