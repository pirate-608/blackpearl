import fs from "node:fs/promises";
import path from "node:path";
import {
  defaultConnectionFor,
  getConnectionsFilePath,
  isProviderId,
  type ModelConnection,
  type ProviderId,
} from "./providers.js";

export type ConnectionState = {
  activeProvider: ProviderId;
  connections: Partial<Record<ProviderId, ModelConnection>>;
};

export class ConnectionStore {
  private state: ConnectionState;
  private readonly filePath: string;

  constructor(workspaceRoot: string, fallbackConnection: ModelConnection) {
    this.filePath = getConnectionsFilePath(workspaceRoot);
    const normalizedFallback = normalizeConnection(fallbackConnection);
    this.state = {
      activeProvider: normalizedFallback.provider,
      connections: {
        [normalizedFallback.provider]: normalizedFallback,
      },
    };
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<ConnectionState>;
      const connections = sanitizeConnections(parsed.connections);
      const activeProvider =
        parsed.activeProvider && isProviderId(parsed.activeProvider)
          ? parsed.activeProvider
          : this.state.activeProvider;

      this.state = {
        activeProvider,
        connections: {
          ...this.state.connections,
          ...connections,
        },
      };
    } catch (error) {
      if (isNodeFileNotFound(error)) {
        return;
      }

      throw error;
    }
  }

  getActiveConnection(): ModelConnection {
    return (
      this.state.connections[this.state.activeProvider] ??
      defaultConnectionFor(this.state.activeProvider)
    );
  }

  getState(): ConnectionState {
    return {
      activeProvider: this.state.activeProvider,
      connections: { ...this.state.connections },
    };
  }

  async saveConnection(connection: ModelConnection): Promise<void> {
    const normalized = normalizeConnection(connection);
    this.state.connections[normalized.provider] = normalized;
    this.state.activeProvider = normalized.provider;
    await this.persist();
  }

  async activateProvider(provider: ProviderId): Promise<ModelConnection> {
    const connection = normalizeConnection(
      this.state.connections[provider] ?? defaultConnectionFor(provider),
    );
    this.state.connections[provider] = connection;
    this.state.activeProvider = provider;
    await this.persist();
    return connection;
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, `${JSON.stringify(this.state, null, 2)}\n`, "utf8");
  }
}

function sanitizeConnections(
  connections: Partial<Record<ProviderId, ModelConnection>> | undefined,
): Partial<Record<ProviderId, ModelConnection>> {
  if (!connections) {
    return {};
  }

  const sanitized: Partial<Record<ProviderId, ModelConnection>> = {};

  for (const [provider, connection] of Object.entries(connections)) {
    if (!isProviderId(provider) || !connection) {
      continue;
    }

    sanitized[provider] = normalizeConnection({ ...connection, provider });
  }

  return sanitized;
}

function normalizeConnection(connection: ModelConnection): ModelConnection {
  const fallback = defaultConnectionFor(connection.provider);
  const normalized: ModelConnection = {
    ...fallback,
    ...connection,
  };

  if (normalized.provider === "deepseek") {
    return migrateDeepSeekConnection(normalized);
  }

  return normalized;
}

function migrateDeepSeekConnection(connection: ModelConnection): ModelConnection {
  const defaultBaseUrl = defaultConnectionFor("deepseek").baseUrl;

  if (!defaultBaseUrl) {
    return connection;
  }

  const legacyOfficialUrls = new Set([
    undefined,
    "https://api.deepseek.com",
    "https://api.deepseek.com/",
    "https://api.deepseek.com/v1",
    "https://api.deepseek.com/v1/",
  ]);

  if (legacyOfficialUrls.has(connection.baseUrl)) {
    return {
      ...connection,
      baseUrl: defaultBaseUrl,
    };
  }

  return connection;
}

function isNodeFileNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
