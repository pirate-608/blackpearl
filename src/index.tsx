import React from "react";
import { render } from "ink";
import { EventBus } from "./agent/events.js";
import { AgentOrchestrator } from "./agent/orchestrator.js";
import { AgentRuntime } from "./agent/runtime.js";
import { AgentSession } from "./agent/session.js";
import { App } from "./app/tui/App.js";
import { ConnectionStore } from "./llm/connection-store.js";
import { createRunner } from "./llm/runner-factory.js";
import type { ModelConnection } from "./llm/providers.js";
import { loadConfig } from "./shared/config.js";
import { TranscriptStore } from "./storage/transcript-store.js";
import { createDefaultToolRegistry } from "./tools/index.js";

const config = loadConfig();
const session = new AgentSession();
const eventBus = new EventBus();
const toolRegistry = createDefaultToolRegistry(config);
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
const orchestrator = new AgentOrchestrator({
  session,
  runtime,
  eventBus,
  transcriptStore,
});

eventBus.emit({
  type: "session_started",
  sessionId: session.id,
  model: activeConnection.model,
});

render(
  <App
    session={session}
    orchestrator={orchestrator}
    runtime={runtime}
    connectionStore={connectionStore}
    eventBus={eventBus}
    toolRegistry={toolRegistry}
    config={config}
  />,
);
