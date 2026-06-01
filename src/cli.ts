#!/usr/bin/env node
import { fileURLToPath } from "node:url";

const USAGE = `
blackpearl-agent CLI

Usage:
  blackpearl                          Start TUI (new session)
  blackpearl web                      Start web UI (new session)
  blackpearl --resume <session-id>    Resume TUI session by ID
  blackpearl web --resume <session-id> Resume web session by ID
  blackpearl --help                   Show this help

Examples:
  blackpearl
  blackpearl web
  blackpearl --resume abc123
  blackpearl web --resume abc123
`.trim();

function parseArgs(argv: string[]): {
  mode: "tui" | "web";
  resumeId: string | undefined;
  help: boolean;
} {
  let mode: "tui" | "web" = "tui";
  let resumeId: string | undefined;
  let help = false;
  let i = 2; // skip node and script path

  while (i < argv.length) {
    const arg = argv[i]!;

    if (arg === "--help" || arg === "-h") {
      help = true;
      i++;
    } else if (arg === "web") {
      mode = "web";
      i++;
    } else if (arg === "--resume" || arg === "-r") {
      resumeId = argv[i + 1];
      if (!resumeId) {
        console.error("Error: --resume requires a session ID.");
        process.exit(1);
      }
      i += 2;
    } else {
      i++;
    }
  }

  return { mode, resumeId, help };
}

const { mode, resumeId, help } = parseArgs(process.argv);

if (help) {
  console.log(USAGE);
  process.exit(0);
}

if (mode === "web") {
  // Web mode: dynamic import to avoid loading React/Ink
  if (resumeId) {
    process.env.BLACKPEARL_RESUME_ID = resumeId;
  }
  await import("./app/web/server.js");
} else {
  // TUI mode: need a terminal, run Ink app
  const React = await import("react");
  const { render } = await import("ink");
  const { App } = await import("./app/tui/App.js");
  const { createAgentAppContext } = await import("./bootstrap.js");
  const { loadConfig } = await import("./shared/config.js");

  const config = loadConfig();
  const context = await createAgentAppContext(config, resumeId);

  render(
    React.default.createElement(App, {
      session: context.session,
      orchestrator: context.orchestrator,
      multiAgentOrchestrator: context.multiAgentOrchestrator,
      runtime: context.runtime,
      connectionStore: context.connectionStore,
      eventBus: context.eventBus,
      toolRegistry: context.toolRegistry,
      skillRegistry: context.skillRegistry,
      config: config,
    }),
  );
}

// Only run when executed directly (not via import)
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (!isMain) {
  // Allow importing this module for programmatic use
}
