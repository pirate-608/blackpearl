import React from "react";
import { render } from "ink";
import { App } from "./app/tui/App.js";
import { createAgentAppContext } from "./bootstrap.js";
import { loadConfig } from "./shared/config.js";

const config = loadConfig();
const context = await createAgentAppContext(config);

render(
  <App
    session={context.session}
    orchestrator={context.orchestrator}
    multiAgentOrchestrator={context.multiAgentOrchestrator}
    runtime={context.runtime}
    connectionStore={context.connectionStore}
    eventBus={context.eventBus}
    toolRegistry={context.toolRegistry}
    config={config}
  />,
);
