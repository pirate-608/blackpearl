# CLAUDE.md

This file provides guidance to any AI agent when working with code in this repository.

## Commands

```bash
corepack pnpm install          # Install dependencies
corepack pnpm dev              # Run TUI dev entry (tsx src/index.tsx)
corepack pnpm web              # Run web server (http://localhost:4173)
corepack pnpm build            # TypeScript compilation (tsc -p tsconfig.json)
corepack pnpm test             # Run Vitest suite
corepack pnpm lint             # TypeScript noEmit check
```

No vitest config file — Vitest auto-detects `*.test.ts` files under `src/`.

## Architecture

The project is a TypeScript + Ink TUI + multi-provider AI Agent framework for educational use. It has no dependency on high-level agent frameworks.

**Layered design:** TUI / Web → AgentOrchestrator → MemoryStore + Provider Runner → Tool Registry + Transcript Store

**Source layout:**

| Directory | Purpose |
|---|---|
| `src/app/tui/` | Ink terminal UI components and slash commands |
| `src/app/web/` | Web UI served via Node `http` with SSE streaming |
| `src/agent/` | Session state, event bus, orchestrator, runtime, prompts |
| `src/llm/` | Provider profiles, connection store, runner factory, per-provider streaming runners |
| `src/memory/` | Short-term context + long-term JSONL memory with keyword retrieval |
| `src/tools/` | Tool definitions, registry, Zod schemas, path safety |
| `src/storage/` | JSONL transcript persistence |
| `src/shared/` | Config loading from env vars, error types |

## Key patterns

**Bootstrap (`src/bootstrap.ts`):** Both TUI and Web entries share the same assembly logic — config loading, session/event bus/tool registry creation, connection store loading, runner factory, orchestrator wiring. This ensures TUI and Web have identical agent capabilities.

**Runner system:** Three runner implementations, all implementing the `AgentRunner` interface (`run(userInput, emit) => Promise<string>`):

- `ResponseRunner` — OpenAI Responses API with `previous_response_id` chaining
- `ChatCompletionsRunner` — OpenAI-compatible Chat Completions for Gemini, Ollama
- `ClaudeRunner` — Anthropic Messages API (`tool_use`/`tool_result`), also used for DeepSeek via their `/anthropic` endpoint

Runner selection happens in `runner-factory.ts` based on `ProviderProfile.kind` (`"openai_compatible"` vs `"anthropic"`) and `apiMode`.

**Provider system:** Five providers defined in `src/llm/providers.ts`. DeepSeek is deliberately mapped to Anthropic-compatible runner to avoid `reasoning_content` echo issues in Chat Completions thinking mode. Connections persist to `.blackpearl/connections.json`.

**Tool loop:** `parallel_tool_calls: false` — tools execute serially for educational clarity. Failed tool results are returned to the model as `function_call_output` / `tool_result` so the model can self-correct.

**Event-driven streaming:** All runners emit unified `AgentEvent` types. TUI and Web consume the same event stream — `assistant_delta` for incremental text, `tool_call_started`/`tool_call_finished`/`tool_call_failed` for activity display.

**Adding a tool:**
1. Define Zod input schema
2. Use `createToolDefinition({ name, description, schema, execute })` from `src/tools/registry.ts`
3. Register in `src/tools/index.ts`

**Strict TypeScript:** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `forceConsistentCasingInFileNames` are all enabled. Optional field access requires explicit checking.

## Environment

`.env` serves as a first-start fallback only. The recommended flow is `/connect` in TUI to interactively configure providers. Config persists to `.blackpearl/connections.json`. Key env vars: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`, `OPENAI_API_MODE` (`responses` or `chat_completions`), `AGENT_MAX_STEPS` (default 6), `BLACKPEARL_WEB_PORT` (default 4173).
