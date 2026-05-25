# 基础构建说明

blackpearl-agent 已完成 TypeScript + TUI + Web + 多 provider Agent 基础骨架。

## 运行方式

```bash
corepack pnpm install
copy .env.example .env
corepack pnpm dev
corepack pnpm web
```

在 `.env` 中配置：

```text
BLACKPEARL_API_KEY=...
BLACKPEARL_BASE_URL=
BLACKPEARL_MODEL=...
BLACKPEARL_SUBAGENT_MODEL=
BLACKPEARL_API_MODE=responses
AGENT_MAX_STEPS=6
```

如果不配置 `BLACKPEARL_MODEL`，代码会使用 `gpt-4.1-mini` 作为开发默认值。实际课程展示时建议按账号可用模型调整。`BLACKPEARL_SUBAGENT_MODEL` 可用于多 Agent 模式，当前要求与主 Agent 使用同一 provider 和 base URL。

如果使用第三方服务，优先通过 `/connect` 选择 provider。DeepSeek 默认使用 `https://api.deepseek.com/anthropic`，走 Anthropic-compatible adapter。

## 当前模块

- `src/bootstrap.ts`: 公共程序组装，供 TUI 和 Web 复用。
- `src/index.tsx`: TUI 程序入口。
- `src/app/tui/`: Ink 终端界面。
- `src/app/web/`: 本地 Web 界面和 HTTP/SSE 服务。
- `src/agent/`: 会话、事件、单 Agent 编排器、多 Agent 编排器和系统提示词。
- `src/llm/`: provider profiles、连接存储、runner factory、Responses runner、Chat Completions runner 与 Claude/DeepSeek Anthropic-compatible runner。
- `src/memory/`: 短期记忆上下文和长期记忆 JSONL 存储。
- `src/tools/`: 工具注册表与默认工具。
- `src/storage/`: JSONL 会话记录。

## 已实现加分功能

- 流式输出：runner 发出 `assistant_delta`，TUI 和 Web 统一消费。
- 短期记忆：当前 session 最近消息会注入下一次请求。
- 长期记忆：一轮问答摘要写入 `.blackpearl/memory.jsonl`，后续按关键词召回。
- Web 界面：`corepack pnpm web` 启动，默认访问 `http://localhost:4173`，支持完整 `/` 命令和 connect 模态框。
- 多 Agent 协作：`/plan` 命令触发规划 + 执行 + 汇总三阶段流程，可通过 `BLACKPEARL_SUBAGENT_MODEL` 指定同厂商子智能体模型。
- 优雅退出：Web 服务器支持 `/exit` 命令和 SIGINT 关闭，端口冲突时给出清晰提示。

## 已实现工具

- `calculator`: 安全计算数学表达式。
- `wiki_search`: 查询 Wikipedia 摘要。
- `file_list`: 列出工作区文件和目录。
- `file_read`: 读取工作区内文本文件。
- `file_search`: 搜索工作区文本文件。
- `file_edit`: 精确替换文件中的唯一文本块。
- `file_write`: 创建、覆盖或追加工作区文本文件。
- `shell_command`: 执行受控的非交互式命令。

## 已通过校验

```bash
corepack pnpm build
corepack pnpm test
```

当前测试覆盖了工具、provider profile、连接迁移、命令提示和记忆模块的基础路径。

## 下一步建议

1. 给 OpenAI runner 增加 mock 集成测试。
2. 增加 `/history` 命令读取 `.agent-sessions/*.jsonl`。
3. 给写文件和命令执行增加人工确认机制。
