import { test } from "node:test";
import assert from "node:assert/strict";
import { setTool } from "../dist/index.js";

const P = "@ramon-sg/x";
const cfg = (tools = {}) => ({ runner: "bun", tools, extra: { a: { b: 1 } } });

test("adds a missing tool", () => {
  const r = setTool(cfg(), P, "1.0.0");
  assert.equal(r.changed, true);
  assert.deepEqual(r.config.tools, { [P]: "1.0.0" });
});

test("same version is unchanged", () => {
  const c = cfg({ [P]: "1.0.0" });
  const r = setTool(c, P, "1.0.0");
  assert.equal(r.changed, false);
  assert.deepEqual(r.config, c);
});

test("raises a version", () => {
  const r = setTool(cfg({ [P]: "1.2.0" }), P, "1.3.0");
  assert.equal(r.changed, true);
  assert.equal(r.config.tools[P], "1.3.0");
});

test("lowering needs allowLower", () => {
  const c = cfg({ [P]: "1.3.0" });
  const r = setTool(c, P, "1.2.0");
  assert.equal(r.changed, false);
  assert.equal(r.config.tools[P], "1.3.0");
  const l = setTool(c, P, "1.2.0", { allowLower: true });
  assert.equal(l.changed, true);
  assert.equal(l.config.tools[P], "1.2.0");
});

test("ifMissing keeps an existing tool even if the new one is higher", () => {
  const r = setTool(cfg({ [P]: "1.0.0" }), P, "2.0.0", { ifMissing: true });
  assert.equal(r.changed, false);
  assert.equal(r.config.tools[P], "1.0.0");
  assert.equal(setTool(cfg(), P, "2.0.0", { ifMissing: true }).changed, true);
});

test("prerelease ordering", () => {
  const up = setTool(cfg({ [P]: "1.0.0-rc.9" }), P, "1.0.0");
  assert.equal(up.changed, true);
  assert.equal(up.config.tools[P], "1.0.0");
  const down = setTool(cfg({ [P]: "1.0.0" }), P, "1.0.0-rc.9");
  assert.equal(down.changed, false);
  assert.equal(down.config.tools[P], "1.0.0");
  assert.equal(setTool(cfg({ [P]: "1.0.0-rc.9" }), P, "1.0.0-rc.10").changed, true);
  assert.equal(setTool(cfg({ [P]: "1.0.0-alpha" }), P, "1.0.0-alpha.1").changed, true);
});

test("invalid version or name throws TypeError with the value", () => {
  assert.throws(() => setTool(cfg(), P, "^1.0.0"), (e) => e instanceof TypeError && e.message.includes("^1.0.0"));
  assert.throws(() => setTool(cfg(), "Bad Name", "1.0.0"), (e) => e instanceof TypeError && e.message.includes("Bad Name"));
});

test("does not mutate the input", () => {
  const c = cfg({ [P]: "1.0.0" });
  const copy = structuredClone(c);
  const r = setTool(c, P, "2.0.0");
  assert.deepEqual(c, copy);
  assert.notEqual(r.config, c);
  assert.notEqual(r.config.tools, c.tools);
  setTool(c, "other", "1.0.0");
  assert.deepEqual(c, copy);
});
