# 基础构建说明

blackpearl-agent 已完成第一版 TypeScript + TUI + OpenAI SDK 基础骨架。

## 运行方式

```bash
corepack pnpm install
copy .env.example .env
corepack pnpm dev
```

在 `.env` 中配置：

```text
OPENAI_API_KEY=...
OPENAI_BASE_URL=
OPENAI_MODEL=...
OPENAI_API_MODE=responses
AGENT_MAX_STEPS=6
```

如果不配置 `OPENAI_MODEL`，代码会使用 `gpt-4.1-mini` 作为开发默认值。实际课程展示时建议按账号可用模型调整。

如果使用第三方服务，优先通过 `/connect` 选择 provider。DeepSeek 默认使用 `https://api.deepseek.com/anthropic`，走 Anthropic-compatible adapter。

## 当前模块

- `src/index.tsx`: 程序入口，组装配置、Agent、工具和 TUI。
- `src/app/tui/`: Ink 终端界面。
- `src/agent/`: 会话、事件、编排器和系统提示词。
- `src/llm/`: provider profiles、连接存储、runner factory、Responses runner、Chat Completions runner 与 Claude/DeepSeek Anthropic-compatible runner。
- `src/tools/`: 工具注册表与默认工具。
- `src/storage/`: JSONL 会话记录。

## 已实现工具

- `calculator`: 安全计算数学表达式。
- `wiki_search`: 查询 Wikipedia 摘要。
- `file_read`: 读取工作区内文本文件。
- `file_write`: 只允许写入 `artifacts/` 或 `notes/`。

## 已通过校验

```bash
corepack pnpm build
corepack pnpm test
```

当前测试覆盖了 `calculator` 的基础路径。

## 下一步建议

1. 给 `file_read` / `file_write` 补路径安全测试。
2. 给 OpenAI runner 增加 mock 集成测试。
3. 将非流式 `responses.create` 升级为流式事件展示。
4. 增加 `/history` 命令读取 `.agent-sessions/*.jsonl`。
