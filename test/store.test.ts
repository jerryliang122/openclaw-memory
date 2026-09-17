import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { MemoryStore } from "../src/store.js";

function tempStore(): MemoryStore {
  const dir = mkdtempSync(join(tmpdir(), "openclaw-memory-"));
  return new MemoryStore(dir);
}

test("add applies defaults and persists to disk", () => {
  const store = tempStore();
  const record = store.add({ content: "first line\nsecond line", tags: ["Go", "go", " "] });
  assert.equal(record.type, "fact");
  assert.equal(record.title, "first line");
  assert.deepEqual(record.tags, ["go"]);
  assert.match(record.id, /^mem_/);

  const onDisk = JSON.parse(readFileSync(join(store.dir, "memories.json"), "utf8"));
  assert.equal(onDisk.version, 1);
  assert.equal(onDisk.memories.length, 1);
  assert.equal(onDisk.memories[0].id, record.id);
});

test("records survive a new store instance on the same directory", () => {
  const store = tempStore();
  const saved = store.add({ content: "persistent fact" });
  const reopened = new MemoryStore(store.dir);
  assert.deepEqual(reopened.get(saved.id), saved);
});

test("update patches only provided fields and bumps updatedAt", () => {
  const store = tempStore();
  const saved = store.add({ content: "old", tags: ["a"] });
  const updated = store.update(saved.id, { content: "new" });
  assert.ok(updated);
  assert.equal(updated.content, "new");
  assert.equal(updated.title, saved.title);
  assert.deepEqual(updated.tags, ["a"]);
  assert.ok(updated.updatedAt >= saved.updatedAt);
});

test("update and delete report missing ids", () => {
  const store = tempStore();
  assert.equal(store.update("mem_nope", { content: "x" }), undefined);
  assert.equal(store.delete("mem_nope"), false);
});

test("delete removes the record", () => {
  const store = tempStore();
  const saved = store.add({ content: "doomed" });
  assert.equal(store.delete(saved.id), true);
  assert.equal(store.get(saved.id), undefined);
});

test("search ranks title and tag hits above body-only hits", () => {
  const store = tempStore();
  const bodyOnly = store.add({ content: "mentions docker in passing", title: "unrelated" });
  const titleHit = store.add({ content: "nothing here", title: "docker runbook" });
  const tagHit = store.add({ content: "see also", title: "notes", tags: ["docker"] });

  const hits = store.search("docker");
  const ids = hits.map((hit) => hit.record.id);
  // Title (3) and tag (3) score above body-only (1); exact order between
  // the two 3-pointers falls back to updatedAt, both must precede bodyOnly.
  assert.ok(ids.indexOf(bodyOnly.id) > ids.indexOf(titleHit.id));
  assert.ok(ids.indexOf(bodyOnly.id) > ids.indexOf(tagHit.id));
});

test("search supports whole-query substring matching for Chinese", () => {
  const store = tempStore();
  store.add({ content: "用户偏好:深色主题,回复保持简短", title: "用户偏好" });
  const hits = store.search("偏好");
  assert.equal(hits.length, 1);
});

test("search honors type and tag filters plus limit", () => {
  const store = tempStore();
  store.add({ content: "alpha note", type: "fact", tags: ["one"] });
  store.add({ content: "alpha pref", type: "preference", tags: ["two"] });
  store.add({ content: "alpha ref", type: "reference" });

  assert.equal(store.search("alpha", { type: "preference" }).length, 1);
  assert.equal(store.search("alpha", { tags: ["one"] }).length, 1);
  assert.equal(store.search("alpha", { limit: 2 }).length, 2);
  assert.equal(store.search("alpha", { limit: 0 }).length, 0);
  assert.deepEqual(store.search("nothing-matches-this"), []);
});

test("list sorts by updatedAt desc and filters by type", () => {
  const store = tempStore();
  const first = store.add({ content: "a", type: "fact" });
  const second = store.add({ content: "b", type: "preference" });
  assert.deepEqual(
    store.list().map((record) => record.id),
    [second.id, first.id],
  );
  assert.deepEqual(
    store.list("preference").map((record) => record.id),
    [second.id],
  );
});

test("corrupted store file is quarantined and starts empty", () => {
  const dir = mkdtempSync(join(tmpdir(), "openclaw-memory-"));
  writeFileSync(join(dir, "memories.json"), "{ not valid json !!", "utf8");
  const store = new MemoryStore(dir);
  assert.deepEqual(store.list(), []);
  const quarantined = readdirSync(dir).filter((name) => name.startsWith("memories.json.corrupt-"));
  assert.equal(quarantined.length, 1);
});

test("expandHome resolves ~ prefix", () => {
  assert.doesNotThrow(() => new MemoryStore("~/openclaw-memory-test-dir"));
});
