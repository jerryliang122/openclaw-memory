/**
 * Minimal dev-time types for the OpenClaw plugin SDK.
 *
 * The `openclaw` package is the plugin *host* (~200 MB with its dependency
 * tree), so it is an optional peer dependency and is NOT installed for local
 * development. This ambient declaration mirrors the SDK surface verified
 * against openclaw@2026.9.4 (definePluginEntry / registerTool / AgentTool);
 * run `npm run verify:host` to typecheck against the real SDK types instead.
 *
 * When developing against a real openclaw checkout, delete this file to get
 * the full SDK types from the installed package. At runtime the published
 * plugin always imports the real module — this file emits no JavaScript.
 */
declare module "openclaw/plugin-sdk/plugin-entry" {
  export interface PluginToolResult {
    content: { type: "text"; text: string }[];
    details?: unknown;
  }

  export interface RegisteredTool {
    name: string;
    /** Human-readable label for UI display. */
    label: string;
    description: string;
    /** typebox Type.Object schema for the tool parameters. */
    parameters: unknown;
    /** Optional typebox schema describing the structured `details`. */
    outputSchema?: unknown;
    optional?: boolean;
    execute(
      toolCallId: string,
      // The real SDK derives param types from the typebox schema (Static<T>);
      // the dev stub cannot, so params stay untyped here.
      params: any,
    ): Promise<PluginToolResult> | PluginToolResult;
  }

  export interface PluginRegistrationApi {
    registerTool(tool: RegisteredTool): unknown;
  }

  export interface PluginEntry {
    id: string;
    name: string;
    description: string;
    register(api: PluginRegistrationApi): void;
  }

  export function definePluginEntry(entry: PluginEntry): PluginEntry;
}
