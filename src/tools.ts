import { MemoryStore, type MemoryRecord } from "./store.js";

/**
 * Tool handlers are plain functions (params, store) -> result so they can be
 * unit-tested without the OpenClaw plugin SDK. index.ts only wires them into
 * registerTool. The result shape matches what plugin tool execute() returns.
 */

export interface ToolResult {
  content: { type: "text"; text: string }[];
  details: Record<string, unknown>;
}

function text(body: string, details: Record<string, unknown>): ToolResult {
  return { content: [{ type: "text", text: body }], details };
}

function summary(record: MemoryRecord): string {
  const tags = record.tags.length > 0 ? ` ${record.tags.map((t) => `#${t}`).join(" ")}` : "";
  return `${record.id} [${record.type}]${tags} ${record.title}`;
}

function snippet(content: string, max = 160): string {
  const single = content.replaceAll("\n", " ").trim();
  return single.length <= max ? single : `${single.slice(0, max)}…`;
}

export interface SaveParams {
  content: string;
  title?: string;
  type?: string;
  tags?: string[];
}

export function save(params: SaveParams, store: MemoryStore): ToolResult {
  const record = store.add(params);
  return text(
    `Saved memory ${record.id} ("${record.title}", type: ${record.type}).`,
    { ok: true, id: record.id, title: record.title, type: record.type },
  );
}

export interface SearchParams {
  query: string;
  type?: string;
  tags?: string[];
  limit?: number;
}

export function search(params: SearchParams, store: MemoryStore): ToolResult {
  const hits = store.search(params.query, {
    type: params.type,
    tags: params.tags,
    limit: params.limit,
  });
  if (hits.length === 0) {
    return text(`No memories matched "${params.query}".`, {
      ok: true,
      query: params.query,
      results: [],
    });
  }
  const lines = hits.map(
    (hit, index) =>
      `[${index + 1}] (${hit.score}) ${summary(hit.record)}\n    ${snippet(hit.record.content)}`,
  );
  return text(`Found ${hits.length} memor${hits.length === 1 ? "y" : "ies"}:\n${lines.join("\n")}`, {
    ok: true,
    query: params.query,
    results: hits.map((hit) => ({
      id: hit.record.id,
      title: hit.record.title,
      type: hit.record.type,
      tags: hit.record.tags,
      score: hit.score,
    })),
  });
}

export interface ListParams {
  type?: string;
}

export function list(params: ListParams, store: MemoryStore): ToolResult {
  const records = store.list(params.type);
  if (records.length === 0) {
    return text(
      params.type === undefined
        ? "Memory store is empty."
        : `No memories of type "${params.type}".`,
      { ok: true, count: 0, results: [] },
    );
  }
  const lines = records.map((record) => `- ${summary(record)}`);
  return text(`${records.length} memor${records.length === 1 ? "y" : "ies"}:\n${lines.join("\n")}`, {
    ok: true,
    count: records.length,
    results: records.map((record) => ({
      id: record.id,
      title: record.title,
      type: record.type,
      tags: record.tags,
      updatedAt: record.updatedAt,
    })),
  });
}

export interface GetParams {
  id: string;
}

export function get(params: GetParams, store: MemoryStore): ToolResult {
  const record = store.get(params.id);
  if (!record) {
    return text(`Memory ${params.id} not found.`, { ok: true, found: false, id: params.id });
  }
  const body =
    `${record.title}\n` +
    `type: ${record.type}${record.tags.length > 0 ? ` | tags: ${record.tags.join(", ")}` : ""}\n` +
    `created: ${record.createdAt} | updated: ${record.updatedAt}\n\n` +
    record.content;
  return text(body, { ok: true, found: true, record });
}

export interface UpdateParams {
  id: string;
  title?: string;
  content?: string;
  type?: string;
  tags?: string[];
}

export function update(params: UpdateParams, store: MemoryStore): ToolResult {
  const record = store.update(params.id, params);
  if (!record) {
    return text(`Memory ${params.id} not found.`, { ok: true, updated: false, id: params.id });
  }
  return text(`Updated memory ${record.id}.`, { ok: true, updated: true, id: record.id });
}

export function remove(params: GetParams, store: MemoryStore): ToolResult {
  const deleted = store.delete(params.id);
  if (!deleted) {
    return text(`Memory ${params.id} not found.`, { ok: true, deleted: false, id: params.id });
  }
  return text(`Deleted memory ${params.id}.`, { ok: true, deleted: true, id: params.id });
}
