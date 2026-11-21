import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toolCommand, toolCommandText } from "../dist/index.js";

const P = "@ramon-sg/issue-flow";

test("bun uses bunx --bun", () => {
  assert.deepEqual(toolCommand("bun", P, "0.6.0", ["issue", "start"]), {
    file: "bunx",
    args: ["--bun", `${P}@0.6.0`, "issue", "start"],
  });
});

test("node uses npx --yes", () => {
  assert.deepEqual(toolCommand("node", P, "0.6.0", ["issue", "start"]), {
    file: "npx",
    args: ["--yes", `${P}@0.6.0`, "issue", "start"],
  });
});

test("no args gives only the package", () => {
  assert.deepEqual(toolCommand("bun", P, "0.6.0").args, ["--bun", `${P}@0.6.0`]);
});

test("text joins plain arguments", () => {
  assert.equal(
    toolCommandText("bun", "@ramon-sg/github-rest", "0.7.0", ["pr", "view", "12"]),
    "bunx --bun @ramon-sg/github-rest@0.7.0 pr view 12",
  );
});

test("text quotes unsafe arguments", () => {
  assert.equal(
    toolCommandText("bun", P, "0.6.0", ["--title", "Fix it's broken"]),
    `bunx --bun ${P}@0.6.0 --title 'Fix it'\\''s broken'`,
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
      join(dir, "bunx"),
      `#!/bin/sh\nexec "${process.execPath}" "${join(dir, "print.mjs")}" "$@"\n`,
    );
    chmodSync(join(dir, "bunx"), 0o755);
    const args = ["--title", "Fix it's broken", "", "a b", "$HOME", "x;y"];
    const out = execFileSync("sh", ["-c", toolCommandText("bun", P, "0.6.0", args)], {
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
    }).toString();
    assert.deepEqual(JSON.parse(out), ["--bun", `${P}@0.6.0`, ...args]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an argument starting with = is quoted", () => {
  assert.ok(toolCommandText("node", P, "0.6.0", ["=ls"]).endsWith(" '=ls'"));
  assert.ok(toolCommandText("node", P, "0.6.0", ["--a=b"]).endsWith(" --a=b"));
});
