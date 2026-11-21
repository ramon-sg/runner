import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const INDEX = pathToFileURL(join(process.cwd(), "dist", "index.js")).href;

/**
 * Runs `body` in a child whose PATH holds only fake executables.
 * `fakes` maps a name to what it prints for `--version`. `root` is the project dir.
 */
function withProject(fakes, setup, body) {
  const bin = mkdtempSync(join(tmpdir(), "runner-bin-"));
  const root = mkdtempSync(join(tmpdir(), "runner-scripts-"));
  try {
    for (const [name, out] of Object.entries(fakes)) {
      writeFileSync(join(bin, name), `#!/bin/sh\necho ${out}\n`);
      chmodSync(join(bin, name), 0o755);
    }
    if (setup) setup(root);
    const script = `import * as lib from ${JSON.stringify(INDEX)};
const root = ${JSON.stringify(root)};
const out = await (async () => { ${body} })();
console.log(JSON.stringify(out));`;
    const stdout = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      env: { PATH: bin },
      stdio: ["ignore", "pipe", "inherit"],
      timeout: 10_000,
    }).toString();
    return { out: JSON.parse(stdout), root };
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
}

function project(fakes, files, body, check) {
  let rootRef;
  try {
    const r = withProject(fakes, (root) => {
      rootRef = root;
      for (const [name, content] of Object.entries(files)) writeFileSync(join(root, name), content);
    }, body);
    check(r.out, rootRef);
  } finally {
    if (rootRef) rmSync(rootRef, { recursive: true, force: true });
  }
}

const SCRIPTS = `{ "issue:start": "bunx --bun @ramon-sg/issue-flow@1.0.0 issue start" }`;
const call = (runner) => `return lib.writeScripts(root, "${runner}", ${SCRIPTS}, "issue-flow");`;
const pkg = (root) => JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

test("creates package.json with bun version", () => {
  project({ bun: "1.3.0" }, {}, call("bun"), (out, root) => {
    assert.deepEqual(out, { changed: true, clashes: [] });
    const text = readFileSync(join(root, "package.json"), "utf8");
    assert.deepEqual(JSON.parse(text), {
      private: true,
      packageManager: "bun@1.3.0",
      scripts: { "issue:start": "bunx --bun @ramon-sg/issue-flow@1.0.0 issue start" },
    });
    assert.deepEqual(Object.keys(JSON.parse(text)), ["private", "packageManager", "scripts"]);
    assert.ok(text.startsWith('{\n  "private"') && text.endsWith("}\n"));
  });
});

test("creates package.json with npm version for node", () => {
  project({ npm: "11.6.0" }, {}, call("node"), (out, root) => {
    assert.equal(out.changed, true);
    assert.equal(pkg(root).packageManager, "npm@11.6.0");
  });
});

test("creates package.json without packageManager when version unavailable", () => {
  project({}, {}, call("bun"), (out, root) => {
    assert.equal(out.changed, true);
    assert.deepEqual(Object.keys(pkg(root)), ["private", "scripts"]);
  });
});

test("ignores non-version output", () => {
  project({ bun: "oops" }, {}, call("bun"), (_out, root) => {
    assert.equal("packageManager" in pkg(root), false);
  });
});

test("existing package.json: only scripts touched, order and indent kept, no packageManager added", () => {
  const original = `{\n    "name": "x",\n    "scripts": {\n        "test": "t"\n    },\n    "dependencies": { "a": "1.0.0" }\n}\n`;
  project({ bun: "1.3.0" }, { "package.json": original }, call("bun"), (out, root) => {
    assert.deepEqual(out, { changed: true, clashes: [] });
    const text = readFileSync(join(root, "package.json"), "utf8");
    const data = JSON.parse(text);
    assert.deepEqual(Object.keys(data), ["name", "scripts", "dependencies"]);
    assert.deepEqual(data.dependencies, { a: "1.0.0" });
    assert.deepEqual(Object.keys(data.scripts), ["test", "issue:start"]);
    assert.ok(text.startsWith('{\n    "name"'));
    assert.ok(text.endsWith("}\n"));
  });
});

test("existing package.json without scripts gets them at the end; tab indent and no trailing newline kept", () => {
  const original = `{\n\t"name": "x"\n}`;
  project({}, { "package.json": original }, call("bun"), (_out, root) => {
    const text = readFileSync(join(root, "package.json"), "utf8");
    assert.deepEqual(Object.keys(JSON.parse(text)), ["name", "scripts"]);
    assert.ok(text.startsWith('{\n\t"name"'));
    assert.ok(!text.endsWith("\n"));
  });
});

test("keeps an existing packageManager", () => {
  const original = JSON.stringify({ name: "x", packageManager: "pnpm@9.0.0" }, null, 2) + "\n";
  project({ bun: "1.3.0" }, { "package.json": original }, call("bun"), (_out, root) => {
    assert.equal(pkg(root).packageManager, "pnpm@9.0.0");
  });
});

test("replaces an owned script", () => {
  const original = JSON.stringify({ scripts: { "issue:start": "issue-flow issue start" } }, null, 2) + "\n";
  project({}, { "package.json": original }, call("bun"), (out, root) => {
    assert.deepEqual(out, { changed: true, clashes: [] });
    assert.equal(pkg(root).scripts["issue:start"], "bunx --bun @ramon-sg/issue-flow@1.0.0 issue start");
  });
});

test("a foreign script with the same name is untouched and reported", () => {
  const original = JSON.stringify({ scripts: { "issue:start": "make start" } }, null, 2) + "\n";
  project({}, { "package.json": original }, call("bun"), (out, root) => {
    assert.deepEqual(out, { changed: false, clashes: ["issue:start"] });
    assert.equal(readFileSync(join(root, "package.json"), "utf8"), original);
  });
});

test("no change leaves mtime alone", () => {
  const original = JSON.stringify({ scripts: { "issue:start": "bunx --bun @ramon-sg/issue-flow@1.0.0 issue start" } }, null, 2) + "\n";
  project(
    {},
    { "package.json": original },
    `const f = root + "/package.json";
     const fs = await import("node:fs");
     const old = new Date(2000, 0, 1);
     fs.utimesSync(f, old, old);
     const m1 = fs.statSync(f).mtimeMs;
     const r = lib.writeScripts(root, "bun", ${SCRIPTS}, "issue-flow");
     return { r, same: fs.statSync(f).mtimeMs === m1 };`,
    (out) => {
      assert.deepEqual(out.r, { changed: false, clashes: [] });
      assert.equal(out.same, true);
    },
  );
});

test("invalid JSON or non-object throws naming the path and leaves the file", () => {
  for (const bad of ["{ nope", "[1]"]) {
    project(
      {},
      { "package.json": bad },
      `try { lib.writeScripts(root, "bun", ${SCRIPTS}, "issue-flow"); return "no throw"; } catch (e) { return e.message; }`,
      (out, root) => {
        assert.ok(out.includes(join(root, "package.json")), out);
        assert.equal(readFileSync(join(root, "package.json"), "utf8"), bad);
      },
    );
  }
});
