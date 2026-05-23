import { EventBus } from "./agent/events.js";
import { AgentOrchestrator } from "./agent/orchestrator.js";
import { AgentRuntime } from "./agent/runtime.js";
import { AgentSession } from "./agent/session.js";
import { ConnectionStore } from "./llm/connection-store.js";
import type { ModelConnection } from "./llm/providers.js";
import { createRunner } from "./llm/runner-factory.js";
import { MemoryStore } from "./memory/memory-store.js";
import type { AppConfig } from "./shared/config.js";
import { TranscriptStore } from "./storage/transcript-store.js";
import { createDefaultToolRegistry } from "./tools/index.js";

export type AgentAppContext = {
  config: AppConfig;
  session: AgentSession;
  eventBus: EventBus;
  runtime: AgentRuntime;
  orchestrator: AgentOrchestrator;
  connectionStore: ConnectionStore;
  toolRegistry: ReturnType<typeof createDefaultToolRegistry>;
  memoryStore: MemoryStore;
};

export async function createAgentAppContext(config: AppConfig): Promise<AgentAppContext> {
  const session = new AgentSession();
  const eventBus = new EventBus();
  const toolRegistry = createDefaultToolRegistry(config);
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
  const orchestrator = new AgentOrchestrator({
    session,
    runtime,
    eventBus,
    transcriptStore,
    memoryStore,
  });

  eventBus.emit({
    type: "session_started",
    sessionId: session.id,
    model: activeConnection.model,
  });

  return {
    config,
    session,
    eventBus,
    runtime,
    orchestrator,
    connectionStore,
    toolRegistry,
    memoryStore,
  };
}

function buildFallbackConnection(config: AppConfig): ModelConnection {
  const fallbackConnection: ModelConnection = {
    provider: config.provider,
    model: config.openaiModel,
    apiMode: config.apiMode,
  };

  if (config.openaiApiKey) {
    fallbackConnection.apiKey = config.openaiApiKey;
  }

  if (config.openaiBaseUrl) {
    fallbackConnection.baseUrl = config.openaiBaseUrl;
  }

  return fallbackConnection;
}
