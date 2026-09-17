import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { MemoryStore } from "../src/store.js";
import * as tools from "../src/tools.js";

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "openclaw-memory-tools-"));
  const store = new MemoryStore(dir);
  return { store, dir };
}

const textOf = (result: tools.ToolResult): string => result.content[0]?.text ?? "";

test("save -> search -> get -> update -> delete flow", () => {
  const { store } = fixture();

  const saved = tools.save(
    { content: "用户偏好:回答用中文", type: "preference", tags: ["language"] },
    store,
  );
  assert.equal(saved.details.ok, true);
  const id = saved.details.id as string;

  const found = tools.search({ query: "偏好" }, store);
  assert.equal(found.details.results instanceof Array && (found.details.results as object[]).length, 1);

  const got = tools.get({ id }, store);
  assert.equal(got.details.found, true);
  assert.match(textOf(got), /用户偏好/);

  const updated = tools.update({ id, content: "用户偏好:回答用中文,代码注释用英文" }, store);
  assert.equal(updated.details.updated, true);

  const deleted = tools.remove({ id }, store);
  assert.equal(deleted.details.deleted, true);

  const missing = tools.get({ id }, store);
  assert.equal(missing.details.found, false);
  assert.match(textOf(missing), /not found/);
});

test("search reports no matches without throwing", () => {
  const { store } = fixture();
  const result = tools.search({ query: "ghost" }, store);
  assert.equal(result.details.ok, true);
  assert.deepEqual(result.details.results, []);
  assert.match(textOf(result), /No memories matched/);
});

test("list handles empty store and type filter", () => {
  const { store } = fixture();
  const empty = tools.list({}, store);
  assert.match(textOf(empty), /empty/i);

  tools.save({ content: "a fact" }, store);
  tools.save({ content: "a preference", type: "preference" }, store);

  const onlyPrefs = tools.list({ type: "preference" }, store);
  assert.equal(onlyPrefs.details.count, 1);
});
