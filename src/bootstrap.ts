import { EventBus } from "./agent/events.js";
import { AgentOrchestrator } from "./agent/orchestrator.js";
import { AgentRuntime } from "./agent/runtime.js";
import { AgentSession } from "./agent/session.js";
import { ConnectionStore } from "./llm/connection-store.js";
import { getConnectionLabel, type ModelConnection } from "./llm/providers.js";
import { createRunner } from "./llm/runner-factory.js";
import type { AgentRunner } from "./llm/types.js";
import { McpClientManager } from "./mcp/mcp-client.js";
import { SkillRegistry } from "./skills/skill-registry.js";
import { MemoryStore } from "./memory/memory-store.js";
import { MultiAgentOrchestrator } from "./agent/multi-agent-orchestrator.js";
import type { AppConfig } from "./shared/config.js";
import { TranscriptStore } from "./storage/transcript-store.js";
import { createDefaultToolRegistry } from "./tools/index.js";

export type AgentAppContext = {
  config: AppConfig;
  session: AgentSession;
  eventBus: EventBus;
  runtime: AgentRuntime;
  orchestrator: AgentOrchestrator;
  multiAgentOrchestrator: MultiAgentOrchestrator;
  createSubagentRunner: (connection?: ModelConnection) => AgentRunner;
  connectionStore: ConnectionStore;
  toolRegistry: ReturnType<typeof createDefaultToolRegistry>;
  mcpManager: McpClientManager;
  skillRegistry: SkillRegistry;
  memoryStore: MemoryStore;
};

export async function createAgentAppContext(
  config: AppConfig,
  sessionId?: string,
): Promise<AgentAppContext> {
  const session = new AgentSession(sessionId);
  const eventBus = new EventBus();
  const toolRegistry = createDefaultToolRegistry(config);

  // ── MCP: connect to configured servers and register their tools ──
  const mcpManager = new McpClientManager(config.workspaceRoot, toolRegistry, {
    workspaceRoot: config.workspaceRoot,
  });
  mcpManager.connectAll().catch((err) => {
    console.warn("[mcp] Background connection error:", err);
  });

  const fallbackConnection = buildFallbackConnection(config);
  const connectionStore = new ConnectionStore(config.workspaceRoot, fallbackConnection);
  await connectionStore.load();

  const activeConnection = connectionStore.getActiveConnection();
  const runtime = new AgentRuntime(
    createRunner({
      connection: activeConnection,
      maxSteps: config.maxSteps,
      toolRegistry,
    }),
    activeConnection,
  );
  const transcriptStore = new TranscriptStore(config.workspaceRoot, session.id);
  const memoryStore = new MemoryStore(config.workspaceRoot);

  // ── Skills: load SKILL.md files ──
  const skillRegistry = new SkillRegistry();
  skillRegistry.loadAll(config.workspaceRoot).catch((err) => {
    console.warn("[skills] Background load error:", err);
  });

  const orchestrator = new AgentOrchestrator({
    session,
    runtime,
    eventBus,
    transcriptStore,
    memoryStore,
    skillRegistry,
  });
  const multiAgentOrchestrator = new MultiAgentOrchestrator({
    session,
    runtime,
    createSubagentRunner: () => createSubagentRunner(),
    eventBus,
    transcriptStore,
    memoryStore,
    skillRegistry,
  });

  // Replay transcript messages if resuming an existing session
  if (sessionId) {
    const records = await TranscriptStore.readSession(config.workspaceRoot, sessionId);
    for (const record of records) {
      if (record.kind === "message") {
        if (record.role === "user") {
          session.addUserMessage(record.content);
        } else {
          session.addAssistantMessage(record.content);
        }
      } else if (record.kind === "event") {
        session.applyEvent(record.event);
      }
    }
  }

  eventBus.emit({
    type: "session_started",
    sessionId: session.id,
    model: getSessionModelLabel(activeConnection, config.subagentModel),
  });
  function createSubagentRunner(connection = runtime.getConnection()): AgentRunner {
    return createRunner({
      connection: buildSubagentConnection(connection, config.subagentModel),
      maxSteps: config.maxSteps,
      toolRegistry,
    });
  }

  return {
    config,
    session,
    eventBus,
    runtime,
    orchestrator,
    multiAgentOrchestrator,
    createSubagentRunner,
    connectionStore,
    toolRegistry,
    mcpManager,
    skillRegistry,
    memoryStore,
  };
}

function buildFallbackConnection(config: AppConfig): ModelConnection {
  const fallbackConnection: ModelConnection = {
    provider: config.provider,
    model: config.model,
    apiMode: config.apiMode,
  };

  if (config.apiKey) {
    fallbackConnection.apiKey = config.apiKey;
  }

  if (config.baseUrl) {
    fallbackConnection.baseUrl = config.baseUrl;
  }

  return fallbackConnection;
}

function buildSubagentConnection(
  connection: ModelConnection,
  subagentModel: string | undefined,
): ModelConnection {
  if (!subagentModel) {
    return connection;
  }

  return {
    ...connection,
    model: subagentModel,
  };
}

function getSessionModelLabel(
  connection: ModelConnection,
  subagentModel: string | undefined,
): string {
  if (!subagentModel || subagentModel === connection.model) {
    return connection.model;
  }

  return `${getConnectionLabel(connection)}; subagent:${subagentModel}`;
}
