import { exec } from "node:child_process";
import fs from "node:fs/promises";
import http, { type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import type { AgentEvent } from "../../agent/events.js";
import { createAgentAppContext } from "../../bootstrap.js";
import { TranscriptStore } from "../../storage/transcript-store.js";
import {
  defaultConnectionFor,
  getConnectionLabel,
  getProviderProfile,
  isProviderId,
  providerProfiles,
  type ModelConnection,
} from "../../llm/providers.js";
import { createRunner } from "../../llm/runner-factory.js";
import { loadConfig } from "../../shared/config.js";
import { slashCommands, formatSlashCommandHelp } from "../tui/slash-commands.js";

const rawPort = Number.parseInt(process.env.BLACKPEARL_WEB_PORT ?? "4173", 10);
const WEB_PORT = Number.isFinite(rawPort) && rawPort > 0 ? rawPort : 4173;

const config = loadConfig();
const resumeId = process.env.BLACKPEARL_RESUME_ID || undefined;
const context = await createAgentAppContext(config, resumeId);
const clients = new Set<ServerResponse>();

context.eventBus.subscribe((event) => {
  broadcast(event);
});

const server = http.createServer((request, response) => {
  const url = new URL(
    request.url ?? "/",
    `http://${request.headers.host ?? "localhost"}`,
  );

  if (request.method === "GET" && url.pathname === "/") {
    sendHtml(response, renderPage());
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/state") {
    sendJson(response, {
      sessionId: context.session.id,
      connection: getConnectionLabel(context.runtime.getConnection()),
      provider: context.runtime.getConnection().provider,
      model: context.runtime.getConnection().model,
      configured: getConfiguredList(),
      tools: context.toolRegistry.list().map((t) => t.name),
      skills: (context.skillRegistry?.list() ?? []).map((s) => ({
        name: s.name,
        description: s.description,
      })),
      mcpConnections: context.mcpManager?.listConnections() ?? [],
      messages: context.session.messages,
      activities: context.session.activities,
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/events") {
    openEventStream(response);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/sessions") {
    void handleListSessions(response);
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/sessions/")) {
    const sid = url.pathname.slice("/api/sessions/".length);
    void handleLoadSession(sid, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/message") {
    void handleMessage(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/command") {
    void handleCommand(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/plan") {
    void handlePlan(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/abort") {
    context.orchestrator.abort();
    context.multiAgentOrchestrator.abort();
    sendJson(response, { ok: true, message: "Aborted." });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/parse-file") {
    void handleParseFile(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/exit") {
    sendJson(response, { ok: true, message: "Server shutting down." });
    gracefulShutdown();
    return;
  }
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\nPort ${WEB_PORT} is already in use.`);
    console.error("Stop the running instance or use a different port:\n");
    console.error(`  $env:BLACKPEARL_WEB_PORT=4180; corepack pnpm web\n`);
    process.exit(1);
  }
  throw err;
});

server.listen(WEB_PORT, () => {
  const url = `http://localhost:${WEB_PORT}`;
  console.log(`blackpearl-agent web listening on ${url}`);

  if (!process.env.BLACKPEARL_NO_BROWSER) {
    const platform = process.platform;
    const openCmd =
      platform === "darwin"
        ? `open ${url}`
        : platform === "win32"
          ? `start ${url}`
          : `xdg-open ${url}`;
    exec(openCmd, () => {});
  }
});

// ── Handlers ──────────────────────────────────────────────────────

async function handleMessage(
  request: http.IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<{ message?: unknown }>(request);
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!message) {
      sendJson(response, { error: "message is required" }, 400);
      return;
    }

    await context.orchestrator.handleUserInput(message);
    sendJson(response, { ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    sendJson(response, { error: msg }, 500);
  }
}

async function handlePlan(
  request: http.IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<{ message?: unknown }>(request);
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!message) {
      sendJson(response, { error: "message is required" }, 400);
      return;
    }

    await context.multiAgentOrchestrator.handleUserInput(message);
    sendJson(response, { ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    sendJson(response, { error: msg }, 500);
  }
}

async function handleParseFile(
  request: http.IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<{
      filename?: unknown;
      content?: unknown;
    }>(request);
    const filename = typeof body.filename === "string" ? body.filename : "";
    const content = typeof body.content === "string" ? body.content : "";

    if (!filename || !content) {
      sendJson(response, { error: "filename and content required" }, 400);
      return;
    }

    const buffer = Buffer.from(content, "base64");
    const ext = filename.toLowerCase().split(".").pop() ?? "";
    let text = "";

    if (ext === "docx" || ext === "doc") {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else if (ext === "pdf") {
      const parser = new PDFParse({ data: buffer });
      const data = await parser.getText();
      text = data.text;
    } else {
      // Plain text fallback
      text = buffer.toString("utf8");
    }

    sendJson(response, { ok: true, text: text.trim() });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    sendJson(response, { error: msg }, 500);
  }
}

async function handleListSessions(response: ServerResponse): Promise<void> {
  try {
    const dir = path.join(config.workspaceRoot, ".agent-sessions");
    let files: string[];
    try { files = await fs.readdir(dir); } catch { files = []; }

    const sessions = await Promise.all(
      files
        .filter((f) => f.endsWith(".jsonl"))
        .map(async (f) => {
          const id = f.replace(".jsonl", "");
          const filePath = path.join(dir, f);
          let firstUserMsg = "";
          let msgCount = 0;
          try {
            const raw = await fs.readFile(filePath, "utf8");
            const lines = raw.split(/\r?\n/).filter(Boolean);
            msgCount = lines.length;
            for (const line of lines) {
              const rec = JSON.parse(line) as { kind?: string; role?: string; content?: string };
              if (rec.kind === "message" && rec.role === "user") {
                firstUserMsg = (rec.content ?? "").slice(0, 80);
                break;
              }
            }
          } catch { /* skip unreadable */ }
          return {
            id,
            active: id === context.session.id,
            title: firstUserMsg || "(empty)",
            messageCount: msgCount,
          };
        }),
    );

    sessions.sort((a, b) => b.id.localeCompare(a.id));
    sendJson(response, { ok: true, sessions });
  } catch (err) {
    sendJson(response, { error: String(err) }, 500);
  }
}

async function handleLoadSession(sid: string, response: ServerResponse): Promise<void> {
  try {
    const records = await TranscriptStore.readSession(config.workspaceRoot, sid);
    const messages = records
      .filter((r) => r.kind === "message")
      .map((r) => ({
        role: r.role,
        content: r.content,
        createdAt: r.createdAt,
      }));
    sendJson(response, { ok: true, sessionId: sid, messages });
  } catch (err) {
    sendJson(response, { error: String(err) }, 500);
  }
}

async function handleCommand(
  request: http.IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<{
      command?: unknown;
      provider?: unknown;
      apiKey?: unknown;
      model?: unknown;
      baseUrl?: unknown;
    }>(request);
    const command = typeof body.command === "string" ? body.command.trim() : "";

    if (command === "model") {
      const providerArg =
        typeof body.provider === "string" ? body.provider.trim() : "";

      if (!providerArg) {
        sendJson(response, {
          ok: true,
          connection: getConnectionLabel(context.runtime.getConnection()),
          configured: getConfiguredList(),
        });
        return;
      }

      if (!isProviderId(providerArg)) {
        sendJson(response, {
          ok: false,
          message: `Unknown provider: ${providerArg}. Available: ${providerProfiles.map((p) => p.id).join(", ")}`,
        });
        return;
      }

      const nextConnection =
        await context.connectionStore.activateProvider(providerArg);
      const runner = createRunner({
        connection: nextConnection,
        maxSteps: config.maxSteps,
        toolRegistry: context.toolRegistry,
      });
      context.runtime.setRunner(runner, nextConnection);

      sendJson(response, {
        ok: true,
        message: `Switched to ${getConnectionLabel(nextConnection)}`,
        connection: getConnectionLabel(nextConnection),
        provider: nextConnection.provider,
        model: nextConnection.model,
        configured: getConfiguredList(),
      });
      return;
    }

    if (command === "connect") {
      const providerId =
        typeof body.provider === "string" ? body.provider.trim() : "";

      if (!providerId || !isProviderId(providerId)) {
        sendJson(response, {
          ok: false,
          message: `Please select a provider: ${providerProfiles.map((p) => p.id).join(", ")}`,
        });
        return;
      }

      const profile = getProviderProfile(providerId);
      const fallback = defaultConnectionFor(providerId);
      const existing =
        context.connectionStore.getState().connections[providerId];

      const apiKey =
        typeof body.apiKey === "string" && body.apiKey.trim()
          ? body.apiKey.trim()
          : existing?.apiKey;

      if (profile.requiresApiKey && !apiKey) {
        sendJson(response, {
          ok: false,
          message: `Provider ${providerId} requires an API key.`,
        });
        return;
      }

      const model =
        typeof body.model === "string" && body.model.trim()
          ? body.model.trim()
          : existing?.model ?? fallback.model;

      const baseUrl =
        typeof body.baseUrl === "string" && body.baseUrl.trim()
          ? body.baseUrl.trim()
          : existing?.baseUrl ?? fallback.baseUrl;

      const newConnection: ModelConnection = {
        provider: providerId,
        model,
        apiMode: profile.defaultApiMode,
      };
      if (apiKey) newConnection.apiKey = apiKey;
      if (baseUrl) newConnection.baseUrl = baseUrl;

      await context.connectionStore.saveConnection(newConnection);
      const runner = createRunner({
        connection: newConnection,
        maxSteps: config.maxSteps,
        toolRegistry: context.toolRegistry,
      });
      context.runtime.setRunner(runner, newConnection);

      sendJson(response, {
        ok: true,
        message: `Connected to ${getConnectionLabel(newConnection)}`,
        connection: getConnectionLabel(newConnection),
        provider: newConnection.provider,
        model: newConnection.model,
        configured: getConfiguredList(),
      });
      return;
    }

    sendJson(response, { ok: false, message: `Unknown command: ${command}` });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    sendJson(response, { ok: false, message: msg }, 500);
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function getConfiguredList(): string[] {
  const state = context.connectionStore.getState();
  return Object.entries(state.connections)
    .filter(([, c]) => c != null)
    .map(([p, c]) => `${p}:${(c as ModelConnection).model}`);
}

function openEventStream(response: ServerResponse): void {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  response.write(`event: ready\ndata: {}\n\n`);
  clients.add(response);
  response.on("close", () => {
    clients.delete(response);
  });
}

function broadcast(event: AgentEvent): void {
  // Render markdown on server for assistant_message events
  let html: string | undefined;
  if (event.type === "assistant_message") {
    try { html = marked.parse(event.content) as string; } catch { /* keep raw */ }
  }

  const payload = JSON.stringify(html ? { ...event, html } : event);
  const sse = `event: agent\ndata: ${payload}\n\n`;

  for (const client of clients) {
    client.write(sse);
  }
}

async function readJsonBody<T>(request: http.IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? (JSON.parse(raw) as T) : ({} as T);
}

function sendHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
}

function sendJson(
  response: ServerResponse,
  data: unknown,
  statusCode = 200,
): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(data));
}

function sendText(
  response: ServerResponse,
  text: string,
  statusCode = 200,
): void {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end(text);
}

// ── Shutdown ──────────────────────────────────────────────────────

function gracefulShutdown(): void {
  // Disconnect MCP servers
  context.mcpManager.disconnectAll().catch(() => {});
  for (const client of clients) {
    try {
      client.end();
    } catch {
      // already disconnected
    }
  }
  clients.clear();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000);
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

// ── HTML page ─────────────────────────────────────────────────────

function renderPage(): string {
  const commandsJson = JSON.stringify(
    slashCommands.map((c) => ({ id: c.id, name: c.name, description: c.description })),
  );
  const helpText = formatSlashCommandHelp();
  const providersJson = JSON.stringify(
    providerProfiles.map((p) => ({
      id: p.id,
      label: p.label,
      defaultModel: p.defaultModel,
      defaultBaseUrl: p.defaultBaseUrl ?? "",
      requiresApiKey: p.requiresApiKey,
    })),
  );

  return String.raw`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>blackpearl-agent</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --text: #171a1f;
      --muted: #667085;
      --line: #d9dee7;
      --brand: #0e7490;
      --accent: #b45309;
      --tool: #4f46e5;
      --danger: #b42318;
    }

    .dark {
      color-scheme: dark;
      --bg: #0d1117;
      --panel: #161b22;
      --text: #c9d1d9;
      --muted: #8b949e;
      --line: #30363d;
      --brand: #58a6ff;
      --accent: #d2991d;
      --tool: #7c83ff;
      --danger: #f85149;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .shell {
      height: 100vh;
      display: grid;
      grid-template-rows: auto 1fr auto;
      overflow: hidden;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 14px 20px;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
    }

    h1 {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 0;
    }

    .status {
      color: var(--muted);
      font-size: 13px;
    }

    main {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 360px;
      gap: 16px;
      padding: 16px;
      min-height: 0;
    }

    .pane {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      min-height: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .pane h2 {
      margin: 0;
      padding: 12px 14px;
      border-bottom: 1px solid var(--line);
      font-size: 13px;
      text-transform: uppercase;
      color: var(--muted);
      letter-spacing: 0;
    }

    .messages,
    .activity {
      overflow: auto;
      padding: 14px;
    }

    .message {
      margin: 0 0 14px;
      padding: 12px 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fbfcfe;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .message.user {
      border-left: 4px solid var(--brand);
    }

    .message.assistant {
      border-left: 4px solid var(--accent);
    }

    .role {
      margin-bottom: 6px;
      font-size: 12px;
      font-weight: 700;
      color: var(--muted);
      text-transform: uppercase;
    }

    .activity-item {
      margin: 0 0 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--line);
    }

    .activity-item strong {
      color: var(--tool);
    }

    .activity-item.error strong {
      color: var(--danger);
    }

    .activity-item pre {
      margin: 6px 0 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      color: var(--muted);
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      font-size: 12px;
    }

    /* input area */
    .input-area {
      border-top: 1px solid var(--line);
      background: var(--panel);
      position: relative;
    }

    form {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      padding: 14px 16px;
    }

    textarea {
      width: 100%;
      min-height: 44px;
      max-height: 160px;
      resize: vertical;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px 12px;
      font: inherit;
      color: var(--text);
    }

    button {
      min-width: 92px;
      border: 0;
      border-radius: 8px;
      background: var(--brand);
      color: white;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }

    button:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .notice {
      padding: 0 16px 8px;
      font-size: 12px;
      color: var(--muted);
      min-height: 20px;
    }

    .notice.error {
      color: var(--danger);
    }

    /* command hints dropdown */
    .hints {
      display: none;
      position: absolute;
      bottom: 100%;
      left: 16px;
      right: 16px;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px 8px 0 0;
      max-height: 220px;
      overflow-y: auto;
      z-index: 10;
      box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.08);
    }

    .hints.open {
      display: block;
    }

    .hint-item {
      padding: 8px 14px;
      cursor: pointer;
      display: flex;
      gap: 14px;
      align-items: baseline;
    }

    .hint-item.selected,
    .hint-item:hover {
      background: #e6f3f7;
    }

    .hint-item .cmd-name {
      color: var(--brand);
      font-weight: 700;
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      min-width: 90px;
    }

    .hint-item .cmd-desc {
      color: var(--muted);
      font-size: 13px;
    }

    /* modal */
    .modal-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      align-items: center;
      justify-content: center;
      z-index: 100;
    }

    .modal-overlay.open {
      display: flex;
    }

    .modal {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 28px;
      min-width: 400px;
      max-width: 500px;
    }

    .modal h2 {
      margin: 0 0 18px;
      font-size: 17px;
      color: var(--brand);
    }

    .modal .field {
      margin-bottom: 14px;
    }

    .modal label {
      display: block;
      font-size: 12px;
      color: var(--muted);
      margin-bottom: 4px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .modal select,
    .modal input {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 8px 10px;
      font: inherit;
      color: var(--text);
      background: var(--bg);
    }

    .modal select:focus,
    .modal input:focus {
      outline: none;
      border-color: var(--brand);
    }

    .modal .actions {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      margin-top: 18px;
    }

    .modal .actions button {
      min-width: 80px;
    }

    .modal .actions button.secondary {
      background: var(--line);
      color: var(--text);
    }

    .modal .error-msg {
      color: var(--danger);
      font-size: 12px;
      margin-top: 8px;
    }

    /* Markdown rendered content */
    .message-body h1, .message-body h2, .message-body h3 { margin: 8px 0 4px; font-size: 1.1em; }
    .message-body p { margin: 4px 0; }
    .message-body ul, .message-body ol { margin: 4px 0; padding-left: 20px; }
    .message-body li { margin: 2px 0; }
    .message-body code { background: #eef1f5; padding: 1px 4px; border-radius: 3px; font-size: 0.9em; }
    .message-body pre { background: #1e293b; color: #e2e8f0; padding: 10px 14px; border-radius: 6px; overflow-x: auto; font-size: 0.85em; }
    .message-body pre code { background: none; padding: 0; color: inherit; }
    .message-body blockquote { border-left: 3px solid var(--brand); margin: 6px 0; padding-left: 12px; color: var(--muted); }
    .message-body table { border-collapse: collapse; margin: 6px 0; }
    .message-body th, .message-body td { border: 1px solid var(--line); padding: 4px 8px; font-size: 0.9em; }
    .message-body a { color: var(--brand); }

    /* Action buttons */
    .msg-actions { display: flex; gap: 6px; margin-top: 8px; }
    .msg-actions button {
      font-size: 11px; padding: 2px 8px; border-radius: 4px; border: 1px solid var(--line);
      background: var(--panel); color: var(--muted); cursor: pointer; min-width: auto;
    }
    .msg-actions button:hover { border-color: var(--brand); color: var(--brand); }

    .rerun-btn { background: var(--brand) !important; color: white !important; border: none !important; }
    .rerun-btn:hover { opacity: 0.85; }

    /* Header utility buttons */
    .util-btn {
      background: none;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 4px 8px;
      cursor: pointer;
      font-size: 15px;
      min-width: auto;
      color: var(--text);
    }
    .util-btn:hover { border-color: var(--brand); }

    /* Session sidebar */
    #session-sidebar {
      width: 260px;
      background: var(--panel);
      border-right: 1px solid var(--line);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }
    #session-sidebar.hidden { display: none; }
    #session-sidebar h2 {
      margin: 0;
      padding: 12px 14px;
      border-bottom: 1px solid var(--line);
      font-size: 13px;
      text-transform: uppercase;
      color: var(--muted);
    }
    #session-list { overflow-y: auto; flex: 1; padding: 4px; }
    .session-item {
      padding: 8px 10px;
      cursor: pointer;
      border-radius: 6px;
      margin: 2px 0;
      font-size: 12px;
      border: 1px solid transparent;
    }
    .session-item:hover { background: var(--bg); }
    .session-item.active { border-color: var(--brand); background: var(--bg); }
    .session-item .sid { color: var(--muted); font-family: monospace; font-size: 10px; }
    .session-item .title { color: var(--text); font-weight: 600; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    @media (max-width: 860px) {
      main {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <h1>blackpearl-agent</h1>
      <div class="status" id="status">Connecting...</div>
      <div style="display:flex;gap:8px;">
        <button id="toggle-sidebar" class="util-btn" title="切换会话列表" type="button">&#x2630;</button>
        <button id="theme-btn" class="util-btn" title="切换暗色模式" type="button">&#x263E;</button>
        <button id="toggle-activity" class="util-btn" title="切换Activity面板" type="button">&#x25EB;</button>
      </div>
    </header>
    <main>
      <aside id="session-sidebar" class="hidden">
        <h2>Sessions</h2>
        <div id="session-list"></div>
      </aside>
      <section class="pane">
        <h2>Conversation</h2>
        <div class="messages" id="messages"></div>
      </section>
      <aside class="pane" id="activity-pane">
        <h2>Activity</h2>
        <div class="activity" id="activity"></div>
      </aside>
    </main>
    <div class="input-area">
      <div class="hints" id="hints"></div>
      <form id="chat-form">
        <input type="file" id="file-input" style="display:none;" multiple>
        <textarea id="message-input" placeholder="输入任务，或输入 / 查看命令…"></textarea>
        <div style="display:flex;gap:8px;align-items:center;">
          <button id="send-button" type="submit">发送</button>
          <button id="stop-button" type="button" disabled style="background:var(--danger);">停止</button>
          <button id="upload-btn" class="util-btn" type="button" title="上传文件">&#x1F4CE;</button>
          <button id="rerun-button" type="button" disabled class="rerun-btn" title="重新运行上一条消息">&#x21BB;</button>
        </div>
      </form>
      <div class="notice" id="notice">Ready. Type / for commands.</div>
    </div>
  </div>

  <!-- connect modal -->
  <div class="modal-overlay" id="modal-overlay">
    <div class="modal">
      <h2>Connect Provider</h2>
      <div id="modal-error" class="error-msg"></div>
      <div class="field">
        <label for="conn-provider">Provider</label>
        <select id="conn-provider"></select>
      </div>
      <div class="field" id="conn-apikey-field">
        <label for="conn-apikey">API Key</label>
        <input id="conn-apikey" type="password" placeholder="sk-..." autocomplete="off">
      </div>
      <div class="field">
        <label for="conn-model">Model</label>
        <input id="conn-model" type="text">
      </div>
      <div class="field">
        <label for="conn-baseurl">Base URL</label>
        <input id="conn-baseurl" type="text">
      </div>
      <div class="actions">
        <button class="secondary" id="conn-cancel" type="button">Cancel</button>
        <button id="conn-submit" type="button">Connect</button>
      </div>
    </div>
  </div>

  <script>
    var COMMANDS = ` + commandsJson + `;
    var HELP_TEXT = ` + JSON.stringify(helpText) + `;
    var PROVIDERS = ` + providersJson + `;

    var messagesEl = document.querySelector("#messages");
    var activityEl = document.querySelector("#activity");
    var statusEl = document.querySelector("#status");
    var form = document.querySelector("#chat-form");
    var input = document.querySelector("#message-input");
    var button = document.querySelector("#send-button");
    var stopButton = document.querySelector("#stop-button");
    var rerunButton = document.querySelector("#rerun-button");
    var hintsEl = document.querySelector("#hints");
    var noticeEl = document.querySelector("#notice");
    var selectedHintIdx = -1;
    var messages = [];
    var activities = [];
    var streamingMessage = null;
    var lastUserMessage = "";

    // connect modal
    var overlay = document.querySelector("#modal-overlay");
    var provSel = document.querySelector("#conn-provider");
    var apikeyField = document.querySelector("#conn-apikey-field");
    var apikeyInput = document.querySelector("#conn-apikey");
    var modelInput = document.querySelector("#conn-model");
    var baseurlInput = document.querySelector("#conn-baseurl");
    var modalError = document.querySelector("#modal-error");

    // populate provider dropdown
    PROVIDERS.forEach(function(p) {
      var opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.label + " (" + p.id + ")";
      provSel.appendChild(opt);
    });

    provSel.addEventListener("change", function() {
      var p = PROVIDERS.find(function(x) { return x.id === provSel.value; });
      if (p) {
        apikeyField.style.display = p.requiresApiKey ? "" : "none";
        modelInput.placeholder = "Default: " + p.defaultModel;
        baseurlInput.placeholder = p.defaultBaseUrl || "SDK default";
      }
    });
    provSel.dispatchEvent(new Event("change"));

    document.querySelector("#conn-cancel").addEventListener("click", closeModal);
    document.querySelector("#conn-submit").addEventListener("click", submitConnect);

    loadState();
    connectEvents();

    // ── Form submit ──────────────────────────────────────

    stopButton.addEventListener("click", function() {
      fetch("/api/abort", { method: "POST" }).then(function() {
        setNotice("Aborted.");
        button.disabled = false;
        stopButton.disabled = true;
      });
    });

    rerunButton.addEventListener("click", function() {
      if (!lastUserMessage) return;
      input.value = lastUserMessage;
      form.dispatchEvent(new Event("submit"));
    });

    // Sidebar toggle
    var sidebar = document.querySelector("#session-sidebar");
    var toggleSidebarBtn = document.querySelector("#toggle-sidebar");
    if (toggleSidebarBtn && sidebar) {
      toggleSidebarBtn.addEventListener("click", function() {
        sidebar.classList.toggle("hidden");
        if (!sidebar.classList.contains("hidden")) loadSessionList();
      });
    }

    // Load session list from API
    function loadSessionList() {
      fetch("/api/sessions").then(function(r) { return r.json(); }).then(function(data) {
        if (!data.ok) return;
        var list = document.querySelector("#session-list");
        if (!list) return;
        list.innerHTML = data.sessions.map(function(s) {
          var cls = "session-item" + (s.active ? " active" : "");
          return '<div class="' + cls + '" data-sid="' + s.id + '" title="' + s.id + '">' +
            '<div class="sid">' + s.id.slice(0, 8) + ' (' + s.messageCount + ' msgs)</div>' +
            '<div class="title">' + escapeHtml(s.title) + '</div>' +
            '</div>';
        }).join("");
        // Click handler
        list.querySelectorAll(".session-item").forEach(function(el) {
          el.addEventListener("click", function() {
            loadSessionMessages(el.dataset.sid, el);
          });
        });
      });
    }

    function loadSessionMessages(sid, el) {
      fetch("/api/sessions/" + sid).then(function(r) { return r.json(); }).then(function(data) {
        if (!data.ok) return;
        // Highlight active
        document.querySelectorAll(".session-item").forEach(function(e) { e.classList.remove("active"); });
        if (el) el.classList.add("active");
        // Replace current messages display with loaded session
        messages.splice(0, messages.length, ...data.messages);
        streamingMessage = null;
        renderMessages();
        setNotice("Loaded session " + sid.slice(0, 8) + " (" + data.messages.length + " messages).");
      });
    }

    // Theme toggle
    var themeBtn = document.querySelector("#theme-btn");
    if (themeBtn) themeBtn.addEventListener("click", function() {
      document.documentElement.classList.toggle("dark");
    });

    // Activity pane toggle
    var activityPane = document.querySelector("#activity-pane");
    var toggleActivityBtn = document.querySelector("#toggle-activity");
    if (toggleActivityBtn && activityPane) {
      toggleActivityBtn.addEventListener("click", function() {
        var hidden = activityPane.style.display === "none";
        activityPane.style.display = hidden ? "" : "none";
        var main = document.querySelector("main");
        if (main) main.style.gridTemplateColumns = hidden ? "" : "1fr";
      });
    }

    // File upload
    var uploadBtn = document.querySelector("#upload-btn");
    var fileInputEl = document.querySelector("#file-input");
    if (uploadBtn && fileInputEl) {
      uploadBtn.addEventListener("click", function() { fileInputEl.click(); });
      fileInputEl.addEventListener("change", function() {
        var files = fileInputEl.files;
        if (!files || files.length === 0) return;
        setNotice("Reading " + files.length + " file(s)...");
        var remaining = files.length;
        var results = new Array(files.length);

        function finish() {
          remaining--;
          if (remaining <= 0) {
            var NL = String.fromCharCode(10);
            var parts = [];
            for (var r = 0; r < results.length; r++) {
              if (results[r]) parts.push(results[r]);
            }
            if (parts.length > 0) {
              input.value = input.value + NL + NL + parts.join(NL + NL);
            }
            setNotice("Uploaded " + files.length + " file(s).");
          }
        }

        for (var i = 0; i < files.length; i++) {
          (function(idx, f) {
            var header = "=== " + f.name + " ===";
            var ext = (f.name.split(".").pop() || "").toLowerCase();

            if (ext === "pdf" || ext === "docx" || ext === "doc") {
              // Binary: send to server for parsing
              var r = new FileReader();
              r.onload = function(ev) {
                var raw = ev.target.result;
                if (!raw) { results[idx] = header; finish(); return; }
                // Strip data URL prefix
                var comma = raw.indexOf(",");
                var b64 = comma >= 0 ? raw.slice(comma + 1) : raw;
                fetch("/api/parse-file", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ filename: f.name, content: b64 }),
                }).then(function(resp) { return resp.json(); }).then(function(data) {
                  results[idx] = header + String.fromCharCode(10) + (data.ok ? data.text : ("(parse error: " + (data.error || "unknown") + ")"));
                  finish();
                }).catch(function(err) {
                  results[idx] = header + String.fromCharCode(10) + "(error: " + err.message + ")";
                  finish();
                });
              };
              r.onerror = function() { results[idx] = header; finish(); };
              r.readAsDataURL(f);
            } else {
              // Plain text
              var r2 = new FileReader();
              r2.onload = function(ev) {
                results[idx] = header + String.fromCharCode(10) + (ev.target.result || "");
                finish();
              };
              r2.onerror = function() { results[idx] = header; finish(); };
              r2.readAsText(f);
            }
          })(i, files[i]);
        }
        fileInputEl.value = "";
      });
    }

    form.addEventListener("submit", function(event) {
      event.preventDefault();
      var value = input.value.trim();
      if (!value) return;
      input.value = "";

      // Store for rerun
      lastUserMessage = value;
      rerunButton.disabled = false;

      if (value.startsWith("/")) {
        handleSlashCommand(value);
        return;
      }

      button.disabled = true;
      stopButton.disabled = false;
      setNotice("Agent processing. Press Stop to interrupt...");
      appendMessage({ role: "user", content: value });
      streamingMessage = null;

      fetch("/api/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: value }),
      }).then(function(res) {
        if (!res.ok) {
          return res.json().then(function(b) {
            appendActivity("error", b.error || "Request failed");
          });
        }
      }).catch(function(err) {
        appendActivity("error", err.message);
      }).finally(function() {
        button.disabled = false;
        stopButton.disabled = true;
        input.focus();
      });
    });

    // ── Input: slash command hints ──────────────────────

    input.addEventListener("input", function() {
      var val = input.value;
      if (val.startsWith("/") && val.indexOf(" ") === -1) {
        var query = val.toLowerCase();
        var filtered = COMMANDS.filter(function(c) {
          return c.name.indexOf(query) === 0;
        });
        if (filtered.length > 0) {
          showHints(filtered);
          selectedHintIdx = 0;
          updateHintSelection();
          return;
        }
      }
      hideHints();
    });

    input.addEventListener("keydown", function(e) {
      if (hintsEl.classList.contains("open")) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          var items = hintsEl.querySelectorAll(".hint-item");
          selectedHintIdx += e.key === "ArrowDown" ? 1 : -1;
          if (selectedHintIdx < 0) selectedHintIdx = items.length - 1;
          if (selectedHintIdx >= items.length) selectedHintIdx = 0;
          updateHintSelection();
          return;
        }
        if (e.key === "Tab" || e.key === "ArrowRight") {
          e.preventDefault();
          var sel = hintsEl.querySelector(".hint-item.selected");
          if (sel) applyHint(sel.dataset.cmd);
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          var s = hintsEl.querySelector(".hint-item.selected");
          if (s) {
            input.value = s.dataset.cmd + " ";
            hideHints();
            input.focus();
            return;
          }
        }
        if (e.key === "Escape") {
          e.preventDefault();
          hideHints();
          return;
        }
        return;
      }

      // Enter submits form (textarea default is newline, so shift+enter for newline)
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        form.dispatchEvent(new Event("submit"));
      }
    });

    // hide hints when clicking outside
    document.addEventListener("click", function(e) {
      if (!input.contains(e.target) && !hintsEl.contains(e.target)) {
        hideHints();
      }
    });

    function showHints(cmds) {
      hintsEl.innerHTML = cmds.map(function(c) {
        return '<div class="hint-item" data-cmd="' + c.name + '"><span class="cmd-name">' + c.name + '</span><span class="cmd-desc">' + c.description + '</span></div>';
      }).join("");
      hintsEl.classList.add("open");
      hintsEl.querySelectorAll(".hint-item").forEach(function(el) {
        el.addEventListener("click", function() { applyHint(el.dataset.cmd); });
      });
    }

    function updateHintSelection() {
      hintsEl.querySelectorAll(".hint-item").forEach(function(el, i) {
        el.classList.toggle("selected", i === selectedHintIdx);
      });
    }

    function applyHint(cmd) {
      input.value = cmd + " ";
      input.focus();
      hideHints();
      // submit right away for parameterless commands
      if (cmd === "/help" || cmd === "/tools" || cmd === "/clear" || cmd === "/exit") {
        form.dispatchEvent(new Event("submit"));
      }
    }

    function hideHints() {
      hintsEl.classList.remove("open");
      hintsEl.innerHTML = "";
      selectedHintIdx = -1;
    }

    // ── Slash commands ───────────────────────────────────

    function handleSlashCommand(input) {
      // Use prefix matching — more robust than split() against Unicode spaces
      var def = COMMANDS.find(function(c) { return input.indexOf(c.name + " ") === 0 || input === c.name; });
      if (!def) {
        setNotice("Unknown command: " + input.split(/\s+/)[0] + ". Type / for available commands.", true);
        return;
      }

      // Extract argument (everything after "/cmd ")
      var arg = "";
      var prefix = def.name + " ";
      if (input.indexOf(prefix) === 0) {
        arg = input.slice(prefix.length).trim();
      }

      switch (def.id) {
        case "help":
          setNotice("Commands: " + HELP_TEXT + ". Plain text is sent to the agent.");
          break;
        case "tools":
          fetch("/api/state").then(function(r) { return r.json(); }).then(function(s) {
            setNotice("Available tools: " + (s.tools || []).join(", "));
          });
          break;
        case "clear":
          messages.splice(0);
          activities.splice(0);
          streamingMessage = null;
          renderMessages();
          renderActivities();
          setNotice("Cleared.");
          break;
        case "model":
          if (arg) {
            fetch("/api/command", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ command: "model", provider: arg }),
            }).then(function(r) { return r.json(); }).then(function(data) {
              if (data.ok) {
                statusEl.textContent = data.connection + " · " + data.sessionId;
                setNotice(data.message);
              } else {
                setNotice(data.message, true);
              }
            });
          } else {
            fetch("/api/state").then(function(r) { return r.json(); }).then(function(s) {
              setNotice("Current: " + s.connection + ". Configured: " + (s.configured || []).join(", ") + ". Use /model <provider> to switch.");
            });
          }
          break;
        case "connect":
          openModal();
          break;
        case "plan":
          if (arg) {
            button.disabled = true;
            stopButton.disabled = false;
            streamingMessage = null;
            setNotice("Multi-agent planning... Press Stop to interrupt.");
            fetch("/api/plan", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message: arg }),
            }).then(function(res) {
              if (!res.ok) {
                return res.json().then(function(b) { setNotice(b.error || "Plan failed", true); });
              }
            }).finally(function() {
              button.disabled = false;
              stopButton.disabled = true;
            });
          } else {
            setNotice("Usage: /plan <task>, e.g. /plan Look up Einstein's birth year and calculate his age");
          }
          break;
        case "exit":
          fetch("/api/exit", { method: "POST" }).then(function() {
            setNotice("Server shutting down.");
            document.body.style.opacity = "0.5";
            button.disabled = true;
            input.disabled = true;
          });
          break;
      }
    }

    function setNotice(msg, isError) {
      noticeEl.textContent = msg;
      noticeEl.className = "notice" + (isError ? " error" : "");
    }

    // ── Connect modal ────────────────────────────────────

    function openModal() {
      modalError.textContent = "";
      apikeyInput.value = "";
      modelInput.value = "";
      baseurlInput.value = "";
      provSel.dispatchEvent(new Event("change"));
      overlay.classList.add("open");
      setTimeout(function() { apikeyInput.focus(); }, 100);
    }

    function closeModal() {
      overlay.classList.remove("open");
    }

    function submitConnect() {
      modalError.textContent = "";
      var provider = provSel.value;
      var apiKey = apikeyInput.value.trim();
      var model = modelInput.value.trim();
      var baseUrl = baseurlInput.value.trim();
      var profile = PROVIDERS.find(function(p) { return p.id === provider; });

      if (profile && profile.requiresApiKey && !apiKey) {
        modalError.textContent = "This provider requires an API key.";
        return;
      }

      var body = { command: "connect", provider: provider };
      if (apiKey) body.apiKey = apiKey;
      if (model) body.model = model;
      if (baseUrl) body.baseUrl = baseUrl;

      fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(function(r) { return r.json(); }).then(function(data) {
        if (data.ok) {
          statusEl.textContent = data.connection;
          setNotice(data.message);
          closeModal();
        } else {
          modalError.textContent = data.message;
        }
      }).catch(function(err) {
        modalError.textContent = "Connection failed: " + err.message;
      });
    }

    // ── SSE events ───────────────────────────────────────

    async function loadState() {
      var state = await fetch("/api/state").then(function(r) { return r.json(); });
      statusEl.textContent = state.connection + " · " + state.sessionId.slice(0, 8);
      messages.splice(0, messages.length, ...state.messages);
      activities.splice(0, activities.length, ...state.activities);
      renderMessages();
      renderActivities();
    }

    function connectEvents() {
      var es = new EventSource("/api/events");

      es.addEventListener("agent", function(event) {
        applyAgentEvent(JSON.parse(event.data));
      });

      es.addEventListener("error", function() {
        statusEl.textContent = "Disconnected, reconnecting...";
      });
    }

    function applyAgentEvent(event) {
      if (event.type === "assistant_delta") {
        if (!streamingMessage) {
          streamingMessage = appendMessage({ role: "assistant", content: "" });
        }
        streamingMessage.content += event.content;
        renderMessages();
        return;
      }

      if (event.type === "assistant_message") {
        if (streamingMessage) {
          streamingMessage.content = event.content;
          if (event.html) streamingMessage.html = event.html;
          streamingMessage = null;
        } else {
          appendMessage({ role: "assistant", content: event.content, html: event.html });
        }
        setNotice("Done.");
        renderMessages();
        return;
      }

      if (event.type === "tool_call_started") {
        streamingMessage = null;
        appendActivity("tool: " + event.toolName, JSON.stringify(event.args, null, 2));
        return;
      }

      if (event.type === "tool_call_finished") {
        appendActivity(
          "done: " + event.toolName,
          event.elapsedMs + "ms " + JSON.stringify(event.result),
        );
        return;
      }

      if (event.type === "tool_call_failed" || event.type === "error") {
        appendActivity("error", event.message);
        setNotice("Error: " + event.message, true);
      }
    }

    function appendMessage(message) {
      var next = {
        role: message.role,
        content: message.content,
        createdAt: new Date().toISOString(),
      };
      messages.push(next);
      renderMessages();
      return next;
    }

    function appendActivity(label, detail) {
      activities.push({ label: label, detail: detail, createdAt: new Date().toISOString() });
      renderActivities();
    }

    function renderMessages() {
      messagesEl.innerHTML = messages.map(function(message, idx) {
        var role = message.role === "user" ? "User" : "Agent";
        var bodyHtml;
        if (message.role === "assistant") {
          // Prefer server-rendered HTML, then client-side markdown, then plain text
          if (message.html) {
            bodyHtml = message.html;
          } else {
            try { bodyHtml = renderMarkdown(message.content); }
            catch(e) { bodyHtml = escapeHtml(message.content); }
          }
        } else {
          bodyHtml = escapeHtml(message.content);
        }
        var actionsHtml = "";
        if (message.role === "assistant" && message.content) {
          actionsHtml = '<div class="msg-actions">' +
            '<button onclick="copyMessage(' + idx + ')">复制</button>' +
            '</div>';
        }
        return '<article class="message ' + message.role + '">' +
          '<div class="role">' + escapeHtml(role) + '</div>' +
          '<div class="message-body">' + bodyHtml + '</div>' +
          actionsHtml +
          '</article>';
      }).join("");
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    window.copyMessage = function(idx) {
      var msg = messages[idx];
      if (!msg) return;
      navigator.clipboard.writeText(msg.content).then(function() {
        setNotice("Copied to clipboard.");
      }).catch(function() {
        setNotice("Copy failed.", true);
      });
    };

    function renderActivities() {
      activityEl.innerHTML = activities.slice(-30).map(function(activity) {
        var cls = activity.label === "error" ? "activity-item error" : "activity-item";
        return '<div class="' + cls + '">' +
          '<strong>' + escapeHtml(activity.label) + '</strong>' +
          (activity.detail ? '<pre>' + escapeHtml(activity.detail) + '</pre>' : "") +
          '</div>';
      }).join("");
      activityEl.scrollTop = activityEl.scrollHeight;
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    function renderMarkdown(text) {
      return escapeHtml(text);
    }
  </script>
</body>
</html>`;
}

export const serverUrl = `http://localhost:${WEB_PORT}`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // The module starts the server at top level for the npm script entrypoint.
}
