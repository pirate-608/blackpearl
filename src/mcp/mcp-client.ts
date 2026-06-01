import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs/promises";
import path from "node:path";
import type { McpToolDefinition, ToolContext } from "../tools/types.js";
import type { ToolRegistry } from "../tools/registry.js";

export type McpServerConfig = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

export type McpServersConfig = {
  mcpServers: Record<string, McpServerConfig>;
};

type ServerConnection = {
  name: string;
  client: Client;
  transport: StdioClientTransport;
  toolNames: string[];
};

export class McpClientManager {
  private readonly connections = new Map<string, ServerConnection>();

  constructor(
    private readonly workspaceRoot: string,
    private readonly registry: ToolRegistry,
    private readonly toolContext: ToolContext,
  ) {}

  get configPath(): string {
    return path.join(this.workspaceRoot, ".blackpearl", "mcp-servers.json");
  }

  /** Connect to all configured MCP servers and register their tools */
  async connectAll(): Promise<void> {
    const config = await this.loadConfig();
    if (!config) return;

    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      try {
        await this.connectServer(name, serverConfig);
        console.log(`[mcp] Connected to server: ${name}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[mcp] Failed to connect to ${name}: ${msg}`);
      }
    }
  }

  /** Disconnect all servers and unregister their tools */
  async disconnectAll(): Promise<void> {
    for (const [name, conn] of this.connections) {
      try {
        // Unregister tools
        for (const toolName of conn.toolNames) {
          this.registry.unregister(toolName);
        }
        await conn.transport.close();
        console.log(`[mcp] Disconnected from server: ${name}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[mcp] Error disconnecting from ${name}: ${msg}`);
      }
    }
    this.connections.clear();
  }

  /** Reconnect a single server (useful after connection loss) */
  async reconnect(name: string): Promise<void> {
    const existing = this.connections.get(name);
    if (existing) {
      for (const toolName of existing.toolNames) {
        this.registry.unregister(toolName);
      }
      try { await existing.transport.close(); } catch { /* ok */ }
      this.connections.delete(name);
    }

    const config = await this.loadConfig();
    const serverConfig = config?.mcpServers[name];
    if (!serverConfig) throw new Error(`No config for MCP server: ${name}`);

    await this.connectServer(name, serverConfig);
  }

  listConnections(): string[] {
    return [...this.connections.values()].map(
      (c) => `${c.name} (${c.toolNames.length} tools)`,
    );
  }

  // ── Private ────────────────────────────────────────

  private async loadConfig(): Promise<McpServersConfig | null> {
    try {
      const raw = await fs.readFile(this.configPath, "utf8");
      return JSON.parse(raw) as McpServersConfig;
    } catch (err) {
      if (isNodeFileNotFound(err)) return null;
      throw err;
    }
  }

  private async connectServer(
    name: string,
    config: McpServerConfig,
  ): Promise<void> {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      ...(config.env ? { env: config.env } : {}),
    });

    const client = new Client(
      { name: "blackpearl-agent", version: "0.1.0" },
      { capabilities: {} },
    );

    await client.connect(transport);

    const result = await client.listTools();
    const toolNames: string[] = [];

    for (const mcpTool of result.tools) {
      const toolDef: McpToolDefinition = {
        name: mcpTool.name,
        description: mcpTool.description ?? "",
        jsonSchema: (mcpTool.inputSchema as Record<string, unknown>) ?? {
          type: "object",
          properties: {},
        },
        execute: async (input: unknown, _context: ToolContext) => {
          const callResult = await client.callTool({
            name: mcpTool.name,
            arguments: input as Record<string, unknown>,
          });

          // Convert MCP content blocks to a simple result
          const content = callResult.content as Array<{
            type: string;
            text?: string;
          }>;

          if (callResult.isError) {
            const text = content
              .filter((c) => c.type === "text")
              .map((c) => c.text ?? "")
              .join("\n");
            throw new Error(text || `MCP tool ${mcpTool.name} returned an error`);
          }

          // Return text content directly, or the full result if mixed content
          const textParts = content
            .filter((c) => c.type === "text")
            .map((c) => c.text ?? "");

          if (textParts.length === content.length) {
            return textParts.join("\n");
          }

          return content;
        },
      };

      this.registry.registerMcpTool(toolDef);
      toolNames.push(mcpTool.name);
    }

    this.connections.set(name, { name, client, transport, toolNames });
  }
}

function isNodeFileNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
