import { exec } from "node:child_process";
import http, { type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import type { AgentEvent } from "../../agent/events.js";
import { createAgentAppContext } from "../../bootstrap.js";
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
      messages: context.session.messages,
      activities: context.session.activities,
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/events") {
    openEventStream(response);
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

  if (request.method === "POST" && url.pathname === "/api/exit") {
    sendJson(response, { ok: true, message: "Server shutting down." });
    gracefulShutdown();
    return;
  }

  sendText(response, "Not found", 404);
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
  const payload = `event: agent\ndata: ${JSON.stringify(event)}\n\n`;

  for (const client of clients) {
    client.write(payload);
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
      min-height: 100vh;
      display: grid;
      grid-template-rows: auto 1fr auto;
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
    </header>
    <main>
      <section class="pane">
        <h2>Conversation</h2>
        <div class="messages" id="messages"></div>
      </section>
      <aside class="pane">
        <h2>Activity</h2>
        <div class="activity" id="activity"></div>
      </aside>
    </main>
    <div class="input-area">
      <div class="hints" id="hints"></div>
      <form id="chat-form">
        <textarea id="message-input" placeholder="输入任务，或输入 / 查看命令…"></textarea>
        <button id="send-button" type="submit">发送</button>
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
    var hintsEl = document.querySelector("#hints");
    var noticeEl = document.querySelector("#notice");
    var selectedHintIdx = -1;
    var messages = [];
    var activities = [];
    var streamingMessage = null;

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

    form.addEventListener("submit", function(event) {
      event.preventDefault();
      var value = input.value.trim();
      if (!value) return;
      input.value = "";

      if (value.startsWith("/")) {
        handleSlashCommand(value);
        return;
      }

      button.disabled = true;
      setNotice("Agent processing...");
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
      var parts = input.split(/\s+/);
      var cmd = parts[0];
      var arg = parts.slice(1).join(" ");

      var def = COMMANDS.find(function(c) { return c.name === cmd; });
      if (!def) {
        setNotice("Unknown command: " + cmd + ". Type / for available commands.", true);
        return;
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
            fetch("/api/plan", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message: arg }),
            }).then(function(res) {
              if (!res.ok) {
                return res.json().then(function(b) { setNotice(b.error || "Plan failed", true); });
              }
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
          streamingMessage = null;
        } else {
          appendMessage({ role: "assistant", content: event.content });
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
      messagesEl.innerHTML = messages.map(function(message) {
        var role = message.role === "user" ? "User" : "Agent";
        return '<article class="message ' + message.role + '">' +
          '<div class="role">' + escapeHtml(role) + '</div>' +
          '<div>' + escapeHtml(message.content) + '</div>' +
          '</article>';
      }).join("");
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

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
  </script>
</body>
</html>`;
}

export const serverUrl = `http://localhost:${WEB_PORT}`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // The module starts the server at top level for the npm script entrypoint.
}
