# 架构设计

## 总览

项目采用分层结构：

```text
TUI / Web
  -> Agent Orchestrator / Multi-Agent Orchestrator
    -> Memory Store
    -> Provider Runner
      -> OpenAI-compatible API / Anthropic-compatible API
    -> Tool Registry
      -> Tools
    -> Transcript Store
```

对应源码：

```text
src/
  app/tui/        终端界面
  app/web/        Web 界面和本地 HTTP/SSE 服务
  agent/          会话、事件、编排器、提示词
  llm/            Provider profiles、连接存储、runner factory 与各厂商 runner
  memory/         短期记忆格式化与长期记忆 JSONL 存储
  tools/          工具定义、注册表、默认工具
  storage/        会话记录
  shared/         配置与通用错误
```

## 入口组装

公共组装逻辑位于 `src/bootstrap.ts`。TUI 入口 `src/index.tsx` 和 Web 入口 `src/app/web/server.ts` 都复用它。它负责：

1. 调用 `loadConfig()` 读取环境变量。
2. 创建 `AgentSession`。
3. 创建 `EventBus`。
4. 注册默认工具。
5. 读取 `.blackpearl/connections.json` 或环境变量 fallback。
6. 通过 runner factory 创建当前 provider 的 runner。
7. 创建 `AgentRuntime` 支持运行时切换 runner。
8. 创建 `TranscriptStore`。
9. 创建 `MemoryStore`。
10. 创建 `AgentOrchestrator`。
11. 创建 `MultiAgentOrchestrator`。

入口只做组装，不承载工具逻辑或模型调用细节。

## TUI 层

TUI 位于 `src/app/tui/`。

| 组件 | 职责 |
| --- | --- |
| `App.tsx` | 处理本地命令、连接 orchestrator、管理运行状态 |
| `StatusBar.tsx` | 显示 session、模式、模型、运行状态 |
| `ConversationPane.tsx` | 显示用户和 Agent 消息 |
| `ActivityPane.tsx` | 显示工具调用活动 |
| `InputBox.tsx` | 处理终端输入 |
| `slash-commands.ts` | 定义 `/` 命令元数据、查找与过滤逻辑 |

`/connect` 命令在 TUI 内进入连接配置向导，收集 provider、API key、model 和 base URL。`/model` 命令用于查看当前连接或切换到已配置 provider。

TUI 不直接调用模型服务，也不直接执行工具。它只把普通输入交给 `AgentOrchestrator`。

## Web 层

Web 层位于 `src/app/web/`。

`server.ts` 使用 Node 内置 HTTP 服务提供：

- `GET /`: Web 页面（内嵌 HTML/CSS/JS，支持完整 `/` 命令提示和 connect 模态框）。
- `GET /api/state`: 当前 session 快照。
- `GET /api/events`: Server-Sent Events 事件流。
- `POST /api/message`: 提交用户消息（单 Agent 模式）。
- `POST /api/plan`: 提交多 Agent 协作任务。
- `POST /api/command`: 执行 `/model`、`/connect` 等服务器端命令。
- `POST /api/exit`: 优雅关闭服务器。

Web 页面通过 SSE 消费与 TUI 相同的 `AgentEvent`。这使得流式文本、工具活动和错误处理都由同一套后端事件驱动。

## Agent 层

Agent 层位于 `src/agent/`。

### `AgentSession`

`AgentSession` 保存当前进程内的对话消息和活动记录。TUI 通过它读取展示数据。

### `EventBus`

`EventBus` 用于在 runtime 与 TUI 之间传递事件。当前事件包括：

- session 启动
- 用户消息
- Agent 增量文本
- Agent 消息
- 工具开始
- 工具完成
- 工具失败
- 计划创建（多 Agent）
- 步骤开始（多 Agent）
- 步骤完成（多 Agent）
- 错误

### `AgentOrchestrator`

`AgentOrchestrator` 是单次用户输入的协调器：

1. 从当前 session 获取短期记忆。
2. 从 `MemoryStore` 检索相关长期记忆。
3. 将记忆上下文和当前用户请求组合为 runner input。
4. 保存用户消息。
5. 调用当前 provider runner。
6. 将 runner 产生的事件写入 session、event bus 和 transcript。
7. 保存最终回答，并写入长期记忆。
8. 捕获并展示错误。

## LLM 层

LLM 层位于 `src/llm/`。

### `openai-client.ts`

只负责创建 OpenAI SDK client。该 client 默认连接 OpenAI API，也可以通过 `OPENAI_BASE_URL` 指向 OpenAI-compatible 的第三方模型服务。

### `providers.ts`

定义五类后端的 profile：

- OpenAI
- Gemini
- Claude
- DeepSeek
- Ollama

### `connection-store.ts`

负责读取和写入 `.blackpearl/connections.json`。

### `runner-factory.ts`

根据 active connection 创建具体 runner。

### `response-runner.ts`

`ResponseRunner` 实现 Responses API function-call loop。

关键策略：

- 使用 `SYSTEM_PROMPT` 作为 instructions。
- 每轮请求提供工具定义。
- 使用 `previous_response_id` 连接同一次任务中的后续工具结果。
- 使用 streaming 接收 `response.output_text.delta` 并发出 `assistant_delta`。
- 设置 `parallel_tool_calls: false`，保证工具串行执行。
- 将工具执行失败也作为 `function_call_output` 返回给模型，让模型有机会修正。
- 达到 `maxSteps` 后抛出错误，避免无限循环。

### `chat-completions-runner.ts`

`ChatCompletionsRunner` 实现 Chat Completions tool-call loop。它用于 Gemini、Ollama 等 Chat Completions 兼容接口。

关键策略：

- 使用 `messages` 承载 system、user、assistant 和 tool 消息。
- 使用 `tools` 暴露 function tool schema。
- 模型返回 `tool_calls` 时，本地执行工具。
- streaming chunk 中的 `delta.content` 会转成 `assistant_delta`。
- streaming chunk 中的 `delta.tool_calls` 会被累积为完整工具调用。
- 工具结果通过 `role: "tool"` 和 `tool_call_id` 回传。
- 达到 `maxSteps` 后抛出错误，避免无限循环。

### `claude-runner.ts`

使用 Anthropic Messages API，按 `tool_use` / `tool_result` 协议执行工具。Claude 使用 Anthropic 官方 API；DeepSeek 使用其官方推荐的 Anthropic-compatible endpoint。

关键策略：

- 使用 streaming 接收 `text_delta` 并发出 `assistant_delta`。
- 使用 `input_json_delta` 累积工具参数。
- 工具结果通过 `tool_result` 回传。

## 工具层

工具层位于 `src/tools/`。

每个工具都通过 `createToolDefinition` 创建，包含：

- `name`
- `description`
- `schema`
- `execute`

`ToolRegistry` 负责：

- 注册工具
- 列出工具
- 生成 OpenAI function tool 定义
- 执行工具并校验输入参数

## 存储层

存储层位于 `src/storage/`。

`TranscriptStore` 以 JSONL 格式保存运行记录。JSONL 适合增量追加，也方便后续用脚本分析或生成 demo 材料。

`MemoryStore` 保存长期记忆：

```text
.blackpearl/memory.jsonl
```

每条记录包含摘要和关键词。检索时按关键词计算简单相关度，并把候选记忆注入下一次模型请求。

## 数据流

一次普通任务的数据流如下：

```text
用户输入
  -> InputBox
  -> App.handleSubmit
  -> AgentOrchestrator.handleUserInput
  -> MemoryStore.search
  -> ProviderRunner.run
  -> Model API streaming
  -> assistant_delta events
  -> ToolRegistry.execute
  -> tool.execute
  -> tool result
  -> Model API streaming
  -> final answer
  -> AgentSession / TranscriptStore / MemoryStore / TUI or Web
```

多 Agent 协作数据流（`/plan`）：

```text
用户输入
  -> App.handleSubmit (detects /plan)
  -> MultiAgentOrchestrator.handleUserInput
  -> MemoryStore.search
  -> Phase 1: ProviderRunner.run (PLANNER_PROMPT, no tools)
  -> plan_created event
  -> Phase 2: for each step:
       ProviderRunner.run (EXECUTOR_PROMPT, with tools)
       -> step_started / step_completed events
  -> Phase 3: ProviderRunner.run (summarize, no tools)
  -> assistant_message event
  -> AgentSession / TranscriptStore / MemoryStore / TUI or Web
```
