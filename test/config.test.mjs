import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  RUNNER_FILE,
  RunnerFileError,
  readRunnerConfig,
  writeRunnerConfig,
  effectiveRunner,
  VERSION,
} from "../dist/index.js";

const SCHEMA = `https://cdn.jsdelivr.net/npm/@ramon-sg/runner@${VERSION}/runner.schema.json`;

function tmp() {
  return mkdtempSync(join(tmpdir(), "runner-config-"));
}
function put(root, text) {
  mkdirSync(join(root, ".agents"), { recursive: true });
  writeFileSync(join(root, RUNNER_FILE), text);
}

test("RUNNER_FILE", () => {
  assert.equal(RUNNER_FILE, ".agents/runner.json");
});

test("no file reads as null", () => {
  const root = tmp();
  assert.equal(readRunnerConfig(root), null);
  rmSync(root, { recursive: true });
});

test("reads runner, tools and extra; $schema is dropped", () => {
  const root = tmp();
  put(
    root,
    JSON.stringify({
      $schema: "x",
      runner: "node",
      tools: { "@ramon-sg/issue-flow": "0.6.0" },
      other: 1,
    }),
  );
  assert.deepEqual(readRunnerConfig(root), {
    runner: "node",
    tools: { "@ramon-sg/issue-flow": "0.6.0" },
    extra: { other: 1 },
  });
  rmSync(root, { recursive: true });
});

test("missing runner is null and effectiveRunner defaults to bun", () => {
  const root = tmp();
  put(root, "{}");
  const config = readRunnerConfig(root);
  assert.equal(config.runner, null);
  assert.deepEqual(config.tools, {});
  assert.equal(effectiveRunner(config), "bun");
  assert.equal(effectiveRunner(null), "bun");
  assert.equal(effectiveRunner({ runner: "node", tools: {}, extra: {} }), "node");
  rmSync(root, { recursive: true });
});

const BAD = [
  ["broken JSON", "{nope"],
  ["unknown runner", '{"runner":"deno"}'],
  ["non-string runner", '{"runner":1}'],
  ["range version", '{"tools":{"x":"^1.0.0"}}'],
  ["partial version", '{"tools":{"x":"1.0"}}'],
  ["bad name", '{"tools":{"Bad Name":"1.0.0"}}'],
  ["tools array", '{"tools":[]}'],
  ["tools null", '{"tools":null}'],
  ["non-string version", '{"tools":{"x":1}}'],
  ["build metadata", '{"tools":{"x":"1.0.0+build"}}'],
  ["top-level array", "[]"],
  ["top-level null", "null"],
  ["top-level string", '"hi"'],
];
for (const [name, text] of BAD) {
  test(`throws RunnerFileError: ${name}`, () => {
    const root = tmp();
    put(root, text);
    assert.throws(
      () => readRunnerConfig(root),
      (err) => {
        assert.ok(err instanceof RunnerFileError);
        assert.equal(err.file, resolve(root, RUNNER_FILE));
        assert.ok(err.message.includes(err.file));
        return true;
      },
    );
    rmSync(root, { recursive: true });
  });
}

test("accepts prerelease versions", () => {
  const root = tmp();
  put(root, '{"tools":{"x":"1.0.0-rc.9"}}');
  assert.equal(readRunnerConfig(root).tools.x, "1.0.0-rc.9");
  rmSync(root, { recursive: true });
});

test("write creates .agents and orders keys", () => {
  const root = tmp();
  writeRunnerConfig(root, {
    runner: "bun",
    tools: { b: "2.0.0", a: "1.0.0" },
    extra: { z: 1, y: { k: true } },
  });
  const text = readFileSync(join(root, RUNNER_FILE), "utf8");
  assert.equal(
    text,
    JSON.stringify(
      { $schema: SCHEMA, runner: "bun", tools: { a: "1.0.0", b: "2.0.0" }, z: 1, y: { k: true } },
      null,
      2,
    ) + "\n",
  );
  assert.deepEqual(Object.keys(JSON.parse(text)), ["$schema", "runner", "tools", "z", "y"]);
  rmSync(root, { recursive: true });
});

test("write omits null runner", () => {
  const root = tmp();
  writeRunnerConfig(root, { runner: null, tools: {}, extra: {} });
  const parsed = JSON.parse(readFileSync(join(root, RUNNER_FILE), "utf8"));
  assert.deepEqual(parsed, { $schema: SCHEMA, tools: {} });
  rmSync(root, { recursive: true });
});

test("round trip keeps the file, with $schema refreshed", () => {
  const root = tmp();
  put(
    root,
    JSON.stringify({ $schema: "old", runner: "node", tools: { a: "1.0.0" }, other: [1] }, null, 2) + "\n",
  );
  writeRunnerConfig(root, readRunnerConfig(root));
  const text = readFileSync(join(root, RUNNER_FILE), "utf8");
  assert.equal(
    text,
    JSON.stringify({ $schema: SCHEMA, runner: "node", tools: { a: "1.0.0" }, other: [1] }, null, 2) + "\n",
  );
  rmSync(root, { recursive: true });
});

// Minimal JSON Schema validator: type, enum, pattern, properties, propertyNames,
// additionalProperties (boolean or schema).
function validate(schema, value) {
  if (schema.type) {
    const t = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
    if (t !== schema.type) return false;
  }
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.pattern && !new RegExp(schema.pattern).test(value)) return false;
  if (schema.type === "object") {
    for (const key of Object.keys(value)) {
      if (schema.propertyNames && !validate(schema.propertyNames, key)) return false;
      if (schema.properties?.[key]) {
        if (!validate(schema.properties[key], value[key])) return false;
      } else if (schema.additionalProperties === false) return false;
      else if (typeof schema.additionalProperties === "object" && !validate(schema.additionalProperties, value[key])) return false;
    }
  }
  return true;
}

test("runner.schema.json accepts the example and rejects bad files", () => {
  const schema = JSON.parse(readFileSync(new URL("../runner.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.ok(
    validate(schema, {
      $schema: SCHEMA,
      runner: "bun",
      tools: { "@ramon-sg/issue-flow": "0.6.0", "agent-kitchen": "1.0.0-rc.9" },
      other: 1,
    }),
  );
  assert.ok(!validate(schema, { runner: "deno" }));
  assert.ok(!validate(schema, { tools: { x: "^1.0.0" } }));
  assert.ok(!validate(schema, { tools: { "Bad Name": "1.0.0" } }));
  assert.ok(!validate(schema, { tools: { x: "1.0.0+build" } }));
  assert.ok(!validate(schema, { tools: [] }));
});

test("versions with leading zeros are rejected, plain ones accepted", () => {
  for (const bad of ["01.02.03", "1.02.0", "1.0.00"]) {
    const root = tmp();
    put(root, JSON.stringify({ tools: { x: bad } }));
    assert.throws(() => readRunnerConfig(root), RunnerFileError, bad);
  }
  for (const good of ["0.0.0", "10.20.30", "1.0.0-rc.1"]) {
    const root = tmp();
    put(root, JSON.stringify({ tools: { x: good } }));
    assert.equal(readRunnerConfig(root).tools.x, good);
  }
});

test("the schema patterns equal the source regexes", async () => {
  const { SEMVER, PACKAGE_NAME } = await import("../dist/config.js");
  const schema = JSON.parse(readFileSync(new URL("../runner.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.properties.tools.additionalProperties.pattern, SEMVER.source);
  assert.equal(schema.properties.tools.propertyNames.pattern, PACKAGE_NAME.source);
});

test("writeRunnerConfig rejects invalid configs and writes nothing", () => {
  const bad = [
    { runner: "deno", tools: {}, extra: {} },
    { runner: null, tools: { x: "^1.0.0" }, extra: {} },
    { runner: null, tools: { "Bad Name": "1.0.0" }, extra: {} },
    { runner: null, tools: { x: 1 }, extra: {} },
  ];
  for (const config of bad) {
    const root = tmp();
    assert.throws(() => writeRunnerConfig(root, config), TypeError);
    assert.equal(readRunnerConfig(root), null);
  }
});

test("an extra __proto__ key round-trips as an own property", () => {
  const root = tmp();
  put(root, '{"__proto__": {"a": 1}, "tools": {}}');
  const config = readRunnerConfig(root);
  assert.ok(Object.hasOwn(config.extra, "__proto__"));
  writeRunnerConfig(root, config);
  assert.match(readFileSync(join(root, RUNNER_FILE), "utf8"), /"__proto__": \{/);
  assert.ok(Object.hasOwn(readRunnerConfig(root).extra, "__proto__"));
});

test("a leading BOM is ignored", () => {
  const root = tmp();
  put(root, '﻿{"runner": "node"}');
  assert.equal(readRunnerConfig(root).runner, "node");
});

test("writeRunnerConfig leaves no temp files behind", () => {
  const root = tmp();
  writeRunnerConfig(root, { runner: "bun", tools: {}, extra: {} });
  assert.deepEqual(readdirSync(join(root, ".agents")), ["runner.json"]);
});

test("a failed write leaves no temp file behind", () => {
  const root = tmp();
  // A directory where the file should go makes the final rename fail.
  mkdirSync(join(root, ".agents", "runner.json"), { recursive: true });
  assert.throws(() => writeRunnerConfig(root, { runner: "bun", tools: {}, extra: {} }));
  assert.deepEqual(readdirSync(join(root, ".agents")), ["runner.json"]);
  rmSync(root, { recursive: true, force: true });
});
