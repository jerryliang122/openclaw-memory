import { Type } from "typebox";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { MemoryStore } from "./src/store.js";
import * as memory from "./src/tools.js";

const MEMORY_TYPES = ["fact", "preference", "project", "reference"];

const tagsParam = Type.Optional(
  Type.Array(Type.String(), {
    description: "Lowercase tags used for filtering. Duplicates are dropped.",
  }),
);

const typeParam = Type.Optional(
  Type.String({
    description: `Memory type. Built-in values: ${MEMORY_TYPES.join(", ")}. Defaults to "fact".`,
  }),
);

function openStore(): MemoryStore {
  const dir = process.env.OPENCLAW_MEMORY_DIR ?? "~/.openclaw/memory";
  const maxSearchResults = Number.parseInt(
    process.env.OPENCLAW_MEMORY_MAX_RESULTS ?? "20",
    10,
  );
  return new MemoryStore(dir, Number.isNaN(maxSearchResults) ? 20 : maxSearchResults);
}

export default definePluginEntry({
  id: "memory",
  name: "OpenClaw Memory",
  description:
    "Persistent, file-backed long-term memory for OpenClaw agents: save, search, list, get, update and delete memories across sessions.",
  register(api) {
    const store = openStore();

    api.registerTool({
      name: "memory_save",
      description:
        "Persist a piece of information to long-term memory so it survives across sessions. " +
        "Save stable facts, user preferences, project context or references — not volatile details. " +
        "If a similar memory already exists, prefer memory_update over saving a duplicate.",
      parameters: Type.Object({
        content: Type.String({
          description: "The memory body. Self-contained prose the agent can act on later.",
        }),
        title: Type.Optional(
          Type.String({ description: "Short headline. Defaults to the first line of content." }),
        ),
        type: typeParam,
        tags: tagsParam,
      }),
      outputSchema: Type.Object({
        ok: Type.Boolean(),
        id: Type.String(),
        title: Type.String(),
        type: Type.String(),
      }),
      async execute(_id, params) {
        return memory.save(params as memory.SaveParams, store);
      },
    });

    api.registerTool({
      name: "memory_search",
      description:
        "Full-text keyword search over long-term memory. Title and tag matches rank above body matches; " +
        "whole-query substring matching also covers Chinese/Japanese. Returns top scored hits with snippets.",
      parameters: Type.Object({
        query: Type.String({ description: "Search keywords." }),
        type: typeParam,
        tags: tagsParam,
        limit: Type.Optional(
          Type.Integer({ minimum: 1, maximum: 100, description: "Max results. Default 20." }),
        ),
      }),
      async execute(_id, params) {
        return memory.search(params as memory.SearchParams, store);
      },
    });

    api.registerTool({
      name: "memory_list",
      description:
        "List all stored memories (most recently updated first), optionally narrowed to one type.",
      parameters: Type.Object({
        type: typeParam,
      }),
      async execute(_id, params) {
        return memory.list(params as memory.ListParams, store);
      },
    });

    api.registerTool({
      name: "memory_get",
      description: "Fetch one memory by id, with full content and metadata.",
      parameters: Type.Object({
        id: Type.String({ description: "Memory id, e.g. mem_xxxxxxxx." }),
      }),
      async execute(_id, params) {
        return memory.get(params as memory.GetParams, store);
      },
    });

    api.registerTool({
      name: "memory_update",
      description:
        "Edit an existing memory. Only provided fields change; tags replace the previous set.",
      parameters: Type.Object({
        id: Type.String({ description: "Memory id to edit." }),
        title: Type.Optional(Type.String()),
        content: Type.Optional(Type.String()),
        type: typeParam,
        tags: tagsParam,
      }),
      async execute(_id, params) {
        return memory.update(params as memory.UpdateParams, store);
      },
    });

    api.registerTool({
      name: "memory_delete",
      description:
        "Delete a memory by id. Use when a memory turned out to be wrong or obsolete.",
      parameters: Type.Object({
        id: Type.String({ description: "Memory id to delete." }),
      }),
      async execute(_id, params) {
        return memory.remove(params as memory.GetParams, store);
      },
    });
  },
});
