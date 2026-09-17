import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface MemoryRecord {
  id: string;
  title: string;
  content: string;
  type: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MemoryFile {
  version: 1;
  memories: MemoryRecord[];
}

export interface SearchFilters {
  type?: string;
  tags?: string[];
  limit?: number;
}

export interface SearchHit {
  record: MemoryRecord;
  score: number;
}

const STORE_FILENAME = "memories.json";

export function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/") || path.startsWith("~\\")) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

function newId(): string {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `mem_${time}${rand}`;
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0);
}

/**
 * File-backed memory store. All writes go through an atomic
 * write-to-temp-then-rename so a crash mid-write never truncates
 * memories.json.
 */
export class MemoryStore {
  readonly dir: string;
  readonly maxSearchResults: number;
  private memories: MemoryRecord[];

  constructor(dir: string, maxSearchResults = 20) {
    this.dir = expandHome(dir);
    this.maxSearchResults = Math.min(Math.max(1, maxSearchResults), 100);
    mkdirSync(this.dir, { recursive: true });
    this.memories = this.load();
  }

  private get path(): string {
    return join(this.dir, STORE_FILENAME);
  }

  private load(): MemoryRecord[] {
    if (!existsSync(this.path)) return [];
    let raw: string;
    try {
      raw = readFileSync(this.path, "utf8");
    } catch {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as Partial<MemoryFile>;
      if (!Array.isArray(parsed.memories)) return [];
      return parsed.memories.filter(isValidRecord);
    } catch {
      // Quarantine the corrupted file instead of crashing the agent,
      // then start from an empty store.
      copyFileSync(this.path, `${this.path}.corrupt-${Date.now()}`);
      return [];
    }
  }

  private persist(): void {
    const file: MemoryFile = { version: 1, memories: this.memories };
    const tmp = `${this.path}.tmp-${process.pid}`;
    writeFileSync(tmp, `${JSON.stringify(file, null, 2)}\n`, "utf8");
    renameSync(tmp, this.path);
  }

  add(input: {
    content: string;
    title?: string;
    type?: string;
    tags?: string[];
  }): MemoryRecord {
    const now = new Date().toISOString();
    const record: MemoryRecord = {
      id: newId(),
      title: (input.title ?? input.content.split("\n", 1)[0] ?? "").slice(0, 120),
      content: input.content,
      type: input.type ?? "fact",
      tags: dedupeTags(input.tags),
      createdAt: now,
      updatedAt: now,
    };
    this.memories.push(record);
    this.persist();
    return record;
  }

  get(id: string): MemoryRecord | undefined {
    return this.memories.find((record) => record.id === id);
  }

  list(type?: string): MemoryRecord[] {
    const records =
      type === undefined
        ? [...this.memories]
        : this.memories.filter((record) => record.type === type);
    return sortByRecency(records);
  }

  update(
    id: string,
    patch: { title?: string; content?: string; type?: string; tags?: string[] },
  ): MemoryRecord | undefined {
    const record = this.get(id);
    if (!record) return undefined;
    if (patch.title !== undefined) record.title = patch.title.slice(0, 120);
    if (patch.content !== undefined) record.content = patch.content;
    if (patch.type !== undefined) record.type = patch.type;
    if (patch.tags !== undefined) record.tags = dedupeTags(patch.tags);
    record.updatedAt = new Date().toISOString();
    this.persist();
    return record;
  }

  delete(id: string): boolean {
    const index = this.memories.findIndex((record) => record.id === id);
    if (index === -1) return false;
    this.memories.splice(index, 1);
    this.persist();
    return true;
  }

  search(query: string, filters: SearchFilters = {}): SearchHit[] {
    const normalized = query.trim().toLowerCase();
    if (normalized === "") return [];
    const tokens = tokenize(normalized);
    const hits: SearchHit[] = [];

    for (const record of this.memories) {
      if (filters.type !== undefined && record.type !== filters.type) continue;
      if (
        filters.tags !== undefined &&
        !filters.tags.every((tag) =>
          record.tags.includes(tag.toLowerCase()),
        )
      ) {
        continue;
      }

      const title = record.title.toLowerCase();
      const content = record.content.toLowerCase();
      const tags = new Set(record.tags.map((tag) => tag.toLowerCase()));
      let score = 0;

      // Whole-query substring match: the only signal that works for
      // unsegmented scripts such as Chinese or Japanese.
      if (normalized.length >= 2) {
        if (title.includes(normalized)) score += 5;
        if (content.includes(normalized)) score += 2;
      }
      for (const token of tokens) {
        if (tags.has(token)) score += 3;
        if (title.includes(token)) score += 3;
        if (content.includes(token)) score += 1;
      }

      if (score > 0) hits.push({ record, score });
    }

    const scored = hits.map((hit, index) => ({ ...hit, index }));
    scored.sort(
      (a, b) =>
        b.score - a.score ||
        b.record.updatedAt.localeCompare(a.record.updatedAt) ||
        b.index - a.index,
    );
    return scored
      .slice(0, filters.limit ?? this.maxSearchResults)
      .map(({ record, score }) => ({ record, score }));
  }
}

function dedupeTags(tags: string[] | undefined): string[] {
  if (tags === undefined) return [];
  const seen = new Set<string>();
  for (const tag of tags) {
    const normalized = tag.trim().toLowerCase();
    if (normalized !== "") seen.add(normalized);
  }
  return [...seen];
}

/**
 * Most recently updated first. Timestamps only have millisecond resolution,
 * so records updated in the same millisecond fall back to insertion order
 * (later insertion = more recent).
 */
function sortByRecency(records: MemoryRecord[]): MemoryRecord[] {
  const indexed = records.map((record, index) => ({ record, index }));
  indexed.sort(
    (a, b) =>
      b.record.updatedAt.localeCompare(a.record.updatedAt) || b.index - a.index,
  );
  return indexed.map((entry) => entry.record);
}

function isValidRecord(value: unknown): value is MemoryRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.title === "string" &&
    typeof record.content === "string" &&
    typeof record.type === "string" &&
    Array.isArray(record.tags) &&
    record.tags.every((tag) => typeof tag === "string") &&
    typeof record.createdAt === "string" &&
    typeof record.updatedAt === "string"
  );
}
