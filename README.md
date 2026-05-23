# blackpearl-agent

一个基于 TypeScript、Ink TUI 和多厂商模型后端的教学型 AI Agent 框架。

项目支持系统化模型后端配置：OpenAI、Gemini、Claude、DeepSeek 和 Ollama。OpenAI-compatible 后端使用 OpenAI SDK；Claude 使用 Anthropic Messages API。不同厂商对工具调用、鉴权和模型名的兼容程度不同，项目按 provider 分别适配。

## 快速开始

```bash
corepack enable
corepack pnpm install
copy .env.example .env
corepack pnpm dev
```

`.env` 现在只作为首次启动 fallback。启动后推荐用 `/connect` 交互式配置模型后端，用 `/model` 查看或切换已配置模型。配置会保存到 `.blackpearl/connections.json`。

## 当前能力

- 终端 TUI 对话入口
- OpenAI Responses API / Chat Completions / Anthropic Messages API 工具调用循环
- 工具注册表
- 计算器、Wikipedia 查询、工作区文件读取、受限文件写入
- 本地会话记录
- `/connect` provider 配置
- `/model` 模型切换
