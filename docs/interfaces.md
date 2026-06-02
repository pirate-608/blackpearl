# 技术接口

本文记录当前实现中稳定可用的命令、环境变量、工具接口和事件接口。

## 命令接口

### Node 脚本

| 命令 | 说明 |
| --- | --- |
| `corepack pnpm install` | 安装 Node 依赖 |
| `corepack pnpm dev` | 以 tsx 运行 TUI 开发入口 |
| `corepack pnpm web` | 启动本地 Web 界面 |
| `corepack pnpm build` | 执行 TypeScript 编译，主要用于验证 |
| `corepack pnpm start` | 运行 `dist/index.js`，实验性入口 |
| `corepack pnpm start:web` | 运行编译后的 Web 入口，实验性入口 |
| `corepack pnpm test` | 运行 Vitest 测试 |
| `corepack pnpm lint` | 执行 TypeScript noEmit 检查 |

### TUI 本地命令

| 命令 | 处理位置 | 说明 |
| --- | --- | --- |
| `/help` | `src/app/tui/App.tsx` | 显示命令提示 |
| `/tools` | `src/app/tui/App.tsx` | 列出注册工具名称 |
| `/connect` | `src/app/tui/App.tsx` | 交互式配置模型后端 |
| `/model` | `src/app/tui/App.tsx` | 查看或切换模型后端 |
| `/clear` | `src/app/tui/App.tsx` | 清空当前界面消息和活动 |
| `/skills` | `src/app/tui/App.tsx` | 列出已加载的 Skills |
| `/plan` | `src/app/tui/App.tsx` | 多 Agent 协作模式：规划 + 执行 |
| `/exit` | `src/app/tui/App.tsx` | 退出 Ink 应用 |

命令元数据定义在 `src/app/tui/slash-commands.ts`，输入框通过该定义展示 `/` 命令提示。当前支持：

- 输入 `/` 展示全部命令。
- 输入 `/t` 等前缀时过滤命令。
- `↑` / `↓` 切换选中项。
- `Tab` / `→` 补全选中命令。
- `Enter` 执行选中命令。

## 环境变量接口

环境变量由 `src/shared/config.ts` 读取，主要作为首次启动 fallback。交互式配置保存在 `.blackpearl/connections.json`。

| 变量 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `BLACKPEARL_PROVIDER` | provider id | `openai` | 初始后端 |
| `BLACKPEARL_API_KEY` | string | 无 | 当前 provider 使用的 API Key |
| `BLACKPEARL_BASE_URL` | string | provider 默认地址 | 模型服务 base URL |
| `BLACKPEARL_MODEL` | string | `gpt-4.1-mini` | 主 Agent 模型 |
| `BLACKPEARL_SUBAGENT_MODEL` | string | 同主模型 | 多 Agent 规划、执行、汇总阶段使用的模型；当前与主 Agent 同 provider、同 base URL |
| `BLACKPEARL_API_MODE` | `responses` 或 `chat_completions` | `responses` | LLM runner 适配模式 |
| `AGENT_MAX_STEPS` | number | `6` | 单次任务最大循环步数 |
| `BLACKPEARL_WEB_PORT` | number | `4173` | Web 界面监听端口 |

`AGENT_MAX_STEPS` 会通过 `Number.parseInt` 解析；解析失败时使用 `6`。
`BLACKPEARL_API_MODE` 只接受 `responses` 和 `chat_completions`；其他值会回退到 `responses`。
历史变量 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`、`OPENAI_API_MODE` 仍作为 fallback 读取，优先级低于 `BLACKPEARL_*`。

## 模型服务接口

blackpearl-agent 现在按 provider 分发到不同 adapter：

| Provider | Adapter | 说明 |
| --- | --- | --- |
| `openai` | Responses 或 Chat Completions | 默认使用 Responses |
| `gemini` | OpenAI-compatible Chat Completions | 使用 Google OpenAI-compatible endpoint |
| `claude` | Anthropic Messages API | 使用 Claude 原生 tool_use/tool_result |
| `deepseek` | Anthropic-compatible Messages API | 使用官方推荐的 `/anthropic` endpoint 兼容 thinking 模式 |
| `ollama` | OpenAI-compatible Chat Completions | 本地 `http://localhost:11434/v1` |

OpenAI-compatible provider 通过 OpenAI SDK 创建 client：

```ts
new OpenAI({
  apiKey: config.apiKey,
  baseURL: config.baseUrl,
});
```

当 `BLACKPEARL_BASE_URL` 为空时，SDK 使用默认 API 地址或 provider 默认地址。当它被设置时，请求会发往指定的模型服务。

`responses` runner 依赖以下能力：

| 能力 | 当前是否依赖 | 说明 |
| --- | --- | --- |
| Responses API | 是 | 使用 `client.responses.create(...)` |
| Function calling | 是 | 工具由 OpenAI function tool schema 暴露 |
| `function_call_output` | 是 | 工具结果通过该输入类型回传 |
| `previous_response_id` | 是 | 同一任务的后续轮次用它串联 |
| Streaming | 是 | 监听 `response.output_text.delta` 并发出 `assistant_delta` |

`chat_completions` runner 依赖以下能力：

| 能力 | 当前是否依赖 | 说明 |
| --- | --- | --- |
| Chat Completions API | 是 | 使用 `client.chat.completions.create(...)` |
| Tool calls | 是 | 使用 `tools` 与 `tool_calls` |
| Tool role message | 是 | 工具结果通过 `role: "tool"` 回传 |
| Streaming | 是 | 解析 streaming chunk 中的 `delta.content` 与 `delta.tool_calls` |

因此，多厂商支持的准确边界是：支持所选 provider adapter 所需能力的模型服务。DeepSeek 当前使用 Anthropic-compatible adapter，以规避 OpenAI-compatible 工具续轮中的 `reasoning_content` 回传问题。

Anthropic Messages runner 同样使用流式接口，解析 `text_delta` 输出文本，解析 `input_json_delta` 累积工具参数。

## Web HTTP 接口

Web 入口位于 `src/app/web/server.ts`，默认监听 `http://localhost:4173`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/` | 返回 Web 对话界面（支持完整 `/` 命令） |
| `GET` | `/api/state` | 返回当前 session、连接、消息和活动 |
| `GET` | `/api/events` | SSE 事件流 |
| `POST` | `/api/message` | 提交用户消息（单 Agent 模式） |
| `POST` | `/api/plan` | 提交多 Agent 协作任务 |
| `POST` | `/api/command` | 执行 `/model`、`/connect` 等命令 |
| `POST` | `/api/abort` | 中断当前 Agent 执行 |
| `POST` | `/api/parse-file` | 解析 PDF/DOCX 二进制文件为文本 |
| `GET` | `/api/sessions` | 列出所有历史会话 |
| `GET` | `/api/sessions/<id>` | 加载指定会话的完整消息记录 |
| `POST` | `/api/exit` | 优雅关闭服务器 |

`POST /api/message` 请求体：

```json
{
  "message": "查一下 Albert Einstein 的出生年份，然后算一下他活了多少岁"
}
```

`POST /api/plan` 请求体：

```json
{
  "message": "查一下 Albert Einstein 的出生年份，然后算一下他活了多少岁"
}
```

`POST /api/command` 请求体（model 切换）：

```json
{
  "command": "model",
  "provider": "openai"
}
```

`POST /api/command` 请求体（connect 配置）：

```json
{
  "command": "connect",
  "provider": "deepseek",
  "apiKey": "sk-...",
  "model": "deepseek-v4-pro",
  "baseUrl": "https://api.deepseek.com/anthropic"
}
```

`GET /api/events` 会发送 `agent` 事件，事件体与 `src/agent/events.ts` 中的 `AgentEvent` 一致。

## CLI 命令行接口

编译后通过 PATH 使用：

```bash
blackpearl                  # 当前目录启动 TUI
blackpearl web              # 当前目录启动 Web UI
blackpearl --resume <id>    # 恢复指定会话
blackpearl --help           # 查看帮助
```

启动脚本 `blackpearl.cmd`（Windows）和 `blackpearl`（macOS/Linux）自动选择编译后的 JS 或直接使用 `tsx` 运行源码。

## MCP 服务器配置

MCP 服务器配置文件：`.blackpearl/mcp-servers.json`

```json
{
  "mcpServers": {
    "time": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-time"]
    }
  }
}
```

启动后 MCP 工具自动注册到工具注册表，Agent 可直接调用。

## Skills 配置

Skills 定义在 `.blackpearl/skills/<名称>/SKILL.md`，使用 YAML frontmatter + Markdown 正文：

```markdown
---
name: code-review
description: 审查代码、发现 bug、提出改进建议
allowed-tools: file_read, file_write
---

你是代码审查专家...
```

Agent 根据 `description` 关键字自动匹配并激活技能，注入自定义提示词。`/skills` 命令可查看已加载的技能。

## 工具定义接口

源码位置：`src/tools/types.ts`

```ts
export type ToolDefinition<TInput extends z.ZodTypeAny = z.ZodTypeAny> = {
  name: string;
  description: string;
  schema: TInput;
  jsonSchema: Record<string, unknown> | null;
  execute: (input: z.infer<TInput>, context: ToolContext) => Promise<unknown>;
};
```

工具执行上下文：

```ts
export type ToolContext = {
  workspaceRoot: string;
};
```

工具参数 schema 由 Zod 转换为 JSON Schema 7，并去除 `$schema` 等不需要发送给模型服务的字段。这样可以避免部分 OpenAI-compatible 服务拒绝 OpenAPI 风格字段，例如布尔型 `exclusiveMinimum`。

## 工具注册表接口

源码位置：`src/tools/registry.ts`

| 方法 | 说明 |
| --- | --- |
| `register(tool)` | 注册工具。工具名重复时抛错 |
| `list()` | 返回已注册工具 |
| `registerMcpTool(tool)` | 注册 MCP 发现的工具（无 Zod schema） |
| `unregister(name)` | 移除工具（用于 MCP 服务器断连） |
| `getOpenAITools()` | 转换为 OpenAI function tool 定义 |
| `execute(name, input)` | 校验参数并执行工具 |

执行流程：

1. 根据工具名查找工具。
2. 使用 Zod schema 校验输入。
3. 调用工具的 `execute`。
4. 失败时抛出 `ToolExecutionError`。

## 默认工具接口

### `calculator`

用途：计算数学表达式。

输入：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `expression` | string | 是 | 数学表达式，例如 `(1955 - 1879)` |

输出：

```json
{
  "expression": "(1955 - 1879)",
  "result": 76
}
```

安全策略：

- 使用 `expr-eval`。
- 禁用 assignment、logical、comparison、conditional、in 等操作符。
- 不使用 JavaScript `eval`。

### `wiki_search`

用途：查询 Wikipedia 摘要。

输入：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `query` | string | 是 | 无 | 查询主题 |
| `lang` | string | 否 | `en` | Wikipedia 语言代码 |

成功输出：

```json
{
  "query": "Albert Einstein",
  "found": true,
  "title": "Albert Einstein",
  "summary": "...",
  "url": "https://en.wikipedia.org/wiki/Albert_Einstein"
}
```

失败输出：

```json
{
  "query": "unknown",
  "found": false,
  "status": 404,
  "message": "Wikipedia returned 404"
}
```

### `file_read`

用途：读取工作区内 UTF-8 文本文件。

输入：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `path` | string | 是 | 无 | 工作区相对路径 |
| `offset` | number | 否 | `0` | 字符读取起点 |
| `maxChars` | number | 否 | `8000` | 最大返回字符数，最大 `20000` |

输出：

```json
{
  "path": "docs/raw-instruction.md",
  "offset": 0,
  "content": "...",
  "truncated": false,
  "totalChars": 2882
}
```

安全策略：

- 使用 `path.resolve` 和 `path.relative` 确认目标路径位于工作区内。
- 阻止读取 `.git/`、`.blackpearl/`、`.env` 等敏感路径。
- 超出工作区或命中敏感路径时抛出 `ToolExecutionError`。

### `file_list`

用途：列出工作区文件和目录。

输入：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `path` | string | 否 | `.` | 工作区相对目录 |
| `recursive` | boolean | 否 | `false` | 是否递归列出 |
| `maxEntries` | number | 否 | `120` | 最大返回数量，最大 `500` |

输出：

```json
{
  "path": "src/tools",
  "recursive": false,
  "entries": [
    {
      "path": "src/tools/file-read.ts",
      "type": "file",
      "bytes": 1024
    }
  ],
  "truncated": false
}
```

### `file_search`

用途：在工作区文本文件中搜索字面量。

输入：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `query` | string | 是 | 无 | 搜索文本 |
| `path` | string | 否 | `.` | 搜索目录或文件 |
| `caseSensitive` | boolean | 否 | `false` | 是否区分大小写 |
| `maxMatches` | number | 否 | `50` | 最大匹配数，最大 `200` |

输出：

```json
{
  "query": "file_write",
  "matches": [
    {
      "path": "src/tools/file-write.ts",
      "line": 17,
      "text": "name: \"file_write\","
    }
  ],
  "truncated": false
}
```

### `file_edit`

用途：对工作区文本文件做精确替换。

输入：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `path` | string | 是 | 工作区相对路径 |
| `oldText` | string | 是 | 要替换的精确文本，必须只出现一次 |
| `newText` | string | 是 | 替换文本 |

输出：

```json
{
  "path": "src/example.ts",
  "replacedAt": 42,
  "oldBytes": 11,
  "newBytes": 11
}
```

### `file_write`

用途：写入 UTF-8 文本文件。

输入：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `path` | string | 是 | 无 | 工作区相对输出路径 |
| `content` | string | 是 | 无 | 写入内容 |
| `mode` | `create` / `overwrite` / `append` | 否 | `create` | 写入模式 |

输出：

```json
{
  "path": "artifacts/homework-summary.md",
  "mode": "create",
  "bytes": 128
}
```

安全策略：

- 路径仍必须位于工作区内。
- 阻止写入 `.git/`、`.blackpearl/`、`node_modules/`、`dist/`、`site/`、`.venv/`、`.env` 等路径。
- 写入前自动创建父目录。

### `shell_command`

用途：在工作区内执行非交互式命令。

输入：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `command` | string | 是 | 无 | 可执行命令名，不允许 shell 表达式 |
| `args` | string[] | 否 | `[]` | 命令参数 |
| `cwd` | string | 否 | `.` | 工作区相对工作目录 |
| `timeoutMs` | number | 否 | `10000` | 超时时间，最大 `30000` |

输出：

```json
{
  "command": "corepack pnpm test",
  "cwd": ".",
  "exitCode": 0,
  "stdout": {
    "content": "...",
    "truncated": false,
    "totalChars": 1200
  },
  "stderr": {
    "content": "",
    "truncated": false,
    "totalChars": 0
  }
}
```

安全策略：

- 使用 `execFile`，不经过 shell。
- 参数中阻止管道、重定向、命令连接符和换行。
- 阻止 `rm`、`del`、`cmd`、`powershell`、`pwsh`、`sudo` 等高风险命令。
- 工作目录必须位于工作区内。

## Agent 事件接口

源码位置：`src/agent/events.ts`

当前事件类型：

| 事件 | 说明 |
| --- | --- |
| `session_started` | 会话启动 |
| `user_message` | 用户输入 |
| `assistant_delta` | Agent 增量文本，用于 TUI 和 Web 流式输出 |
| `assistant_message` | Agent 最终文本 |
| `tool_call_started` | 工具调用开始 |
| `tool_call_finished` | 工具调用完成 |
| `tool_call_failed` | 工具调用失败 |
| `plan_created` | 多 Agent 规划阶段完成，包含步骤列表 |
| `step_started` | 多 Agent 执行步骤开始 |
| `step_completed` | 多 Agent 执行步骤完成 |
| `error` | Agent 运行错误 |

这些事件用于：

- 更新 TUI 活动区。
- 更新 Web 消息区和活动区。
- 写入 transcript。

## 记忆接口

源码位置：`src/memory/memory-store.ts`

| 方法 | 说明 |
| --- | --- |
| `search(query, limit)` | 按关键词召回长期记忆 |
| `rememberConversation(userInput, assistantOutput)` | 将一轮问答摘要追加到长期记忆 |
| `getShortTermMemory(messages, limit)` | 获取当前 session 最近消息 |
| `createMemoryContextPrompt(context)` | 将短期和长期记忆格式化为模型上下文 |

长期记忆记录格式：

```json
{
  "id": "...",
  "createdAt": "2026-05-23T00:00:00.000Z",
  "source": "conversation",
  "summary": "User asked: ... | Assistant answered: ...",
  "keywords": ["deepseek", "reasoning"]
}
```

## Transcript 记录格式

源码位置：`src/storage/transcript-store.ts`

消息记录：

```json
{
  "kind": "message",
  "sessionId": "...",
  "createdAt": "2026-05-23T00:00:00.000Z",
  "role": "user",
  "content": "..."
}
```

事件记录：

```json
{
  "kind": "event",
  "sessionId": "...",
  "createdAt": "2026-05-23T00:00:00.000Z",
  "event": {
    "type": "tool_call_started",
    "toolName": "calculator",
    "callId": "...",
    "args": {
      "expression": "1955 - 1879"
    }
  }
}
```
