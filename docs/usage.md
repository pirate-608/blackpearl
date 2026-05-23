# 快速开始

本文说明如何从源码运行 blackpearl-agent。

## 环境要求

| 依赖 | 建议版本 | 说明 |
| --- | --- | --- |
| Node.js | 20 或更高 | 当前开发机使用 Node.js 24 可通过构建 |
| Corepack | 随 Node.js 提供 | 用于调用固定版本 pnpm |
| Git | 任意版本 | 克隆仓库 |
| pnpm | 10.12.1 | 已在 `packageManager` 中声明，Corepack 自动管理 |
| Python | 3.13 或更高 | 仅用于 MkDocs 文档构建（可选） |

## 获取源码

```powershell
git clone https://github.com/YOUR_USERNAME/agent-project.git
cd agent-project
```

## 安装 Node 依赖

```powershell
# 启用 Corepack（首次需要）
corepack enable

# 安装依赖
corepack pnpm install
```

> 首次使用 Corepack 可能需要允许它在用户目录创建缓存并下载 pnpm。

## 运行方式

项目使用 `tsx` 直接执行 TypeScript 源码，无需编译。

```powershell
# 启动 TUI 终端界面
corepack pnpm dev

# 启动 Web 界面
corepack pnpm web

# 通过 CLI 入口启动（等价于上面两条）
tsx src/cli.ts                # TUI
tsx src/cli.ts web            # Web
tsx src/cli.ts --help         # 查看用法
tsx src/cli.ts --resume <id>  # 恢复会话
```

## 配置环境变量

复制示例配置：

```powershell
Copy-Item .env.example .env
```

编辑 `.env`：

```text
BLACKPEARL_PROVIDER=openai
OPENAI_API_KEY=你的 OpenAI API Key
OPENAI_BASE_URL=
OPENAI_MODEL=账号可用的模型 ID
OPENAI_API_MODE=responses
AGENT_MAX_STEPS=6
```

配置说明：

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `BLACKPEARL_PROVIDER` | 否 | `openai` | 初始后端：`openai`、`gemini`、`claude`、`deepseek`、`ollama` |
| `OPENAI_API_KEY` | 是 | 无 | OpenAI SDK 使用的 API Key，第三方兼容服务通常也会用这个字段承载密钥 |
| `OPENAI_BASE_URL` | 否 | OpenAI SDK 默认地址 | OpenAI-compatible 服务地址，例如第三方网关或厂商兼容端点 |
| `OPENAI_MODEL` | 否 | `gpt-4.1-mini` | Agent 调用的模型 |
| `OPENAI_API_MODE` | 否 | `responses` | API 适配模式：`responses` 或 `chat_completions` |
| `AGENT_MAX_STEPS` | 否 | `6` | 单次任务最多允许的模型/工具循环次数 |

`OPENAI_MODEL` 建议按账号实际可用模型配置。课程演示时可以选用更强模型，日常开发可选低成本模型。

`.env` 只作为首次启动或无连接配置时的 fallback。推荐在 TUI 中使用 `/connect` 完成系统性配置，配置会保存到 `.blackpearl/connections.json`。

## 多厂商模型配置

在 TUI 或 Web 界面中输入：

```text
/connect
```

按提示选择后端并输入 API key、model、base URL。当前支持：

| 后端 | 默认模式 | 默认模型 | 默认 base URL |
| --- | --- | --- | --- |
| `openai` | `responses` | `gpt-4.1-mini` | SDK 默认 |
| `gemini` | `chat_completions` | `gemini-2.5-flash` | `https://generativelanguage.googleapis.com/v1beta/openai` |
| `claude` | Anthropic Messages API | `claude-sonnet-4-5` | SDK 默认 |
| `deepseek` | Anthropic-compatible Messages API | `deepseek-v4-pro` | `https://api.deepseek.com/anthropic` |
| `ollama` | `chat_completions` | `qwen2.5:3b` | `http://localhost:11434/v1` |

查看或切换已配置模型：

```text
/model
/model deepseek
```

Web 界面同样支持 `/connect`（通过模态框）和 `/model` 命令。

项目使用 OpenAI SDK，并通过 `OPENAI_BASE_URL` 支持 OpenAI-compatible API。根据目标服务支持的接口选择 `OPENAI_API_MODE`：

- `responses`: 使用 `client.responses.create(...)`，适合支持 Responses API 的服务。
- `chat_completions`: 使用 `client.chat.completions.create(...)`，适合 Gemini、Ollama 等提供 Chat Completions 兼容接口的服务。

示例：

```text
OPENAI_API_KEY=第三方服务密钥
OPENAI_BASE_URL=https://example-provider.test/v1
OPENAI_MODEL=provider-model-name
OPENAI_API_MODE=chat_completions
```

DeepSeek 示例：

```text
OPENAI_API_KEY=你的 DeepSeek API Key
OPENAI_BASE_URL=https://api.deepseek.com/anthropic
OPENAI_MODEL=deepseek-v4-pro
OPENAI_API_MODE=chat_completions
```

DeepSeek 官方在 Copilot CLI 集成文档中推荐使用 Anthropic provider type 和 `https://api.deepseek.com/anthropic`，原因是 thinking 模式需要正确回传 reasoning 内容。blackpearl-agent 因此将 DeepSeek 单独映射到 Anthropic-compatible adapter，而不是 OpenAI Chat Completions adapter。

注意事项：

- 这不是对所有厂商原生 API 的无条件支持。
- 如果厂商只兼容 Chat Completions，而不兼容 Responses API，请使用 `OPENAI_API_MODE=chat_completions`。DeepSeek 是例外：默认走 Anthropic-compatible endpoint。
- Azure OpenAI 在官方 SDK 中有独立的 `AzureOpenAI` client，当前项目尚未封装 Azure 专用入口。
- 不同厂商的 function calling 支持程度可能不同，工具调用 demo 需要实测。

## 启动 TUI

```powershell
corepack pnpm dev
```

启动后会进入终端界面。普通文本会交给 Agent 执行，斜杠命令由 TUI 本地处理。

## 启动 Web 界面

```powershell
corepack pnpm web
```

默认监听：

```text
http://localhost:4173
```

如需修改端口：

```powershell
$env:BLACKPEARL_WEB_PORT=4180
corepack pnpm web
```

Web 界面提供与 TUI 共用的 Agent 编排、工具调用和记忆能力。浏览器通过 SSE 接收 `assistant_delta`、工具调用和错误事件，因此回答会按 token 增量显示。

## 记忆文件

当前实现包含两类记忆：

| 类型 | 存储位置 | 说明 |
| --- | --- | --- |
| 短期记忆 | 进程内 `AgentSession` | 注入最近若干轮对话，随进程退出清空 |
| 长期记忆 | `.blackpearl/memory.jsonl` | 每轮问答后追加摘要，后续请求按关键词召回 |

长期记忆是课程项目中的轻量实现，适合展示“记忆写入 -> 检索 -> 上下文注入”的基本闭环。它不是向量数据库，也不包含隐私脱敏或记忆管理 UI。

## TUI 命令

输入 `/` 时，输入框下方会显示命令提示。继续输入会按前缀过滤命令，类似 Claude Code 或 Copilot CLI 的交互方式。

快捷键：

| 快捷键 | 功能 |
| --- | --- |
| `↑` / `↓` | 在命令提示中切换选中项 |
| `Tab` / `→` | 将选中命令补全到输入框 |
| `Enter` | 执行选中命令；如果没有匹配命令，则提交当前输入 |

| 命令 | 功能 |
| --- | --- |
| `/help` | 显示可用命令 |
| `/tools` | 显示当前注册工具 |
| `/connect` | 交互式配置模型后端 |
| `/model` | 查看或切换已配置模型 |
| `/clear` | 清空当前界面中的对话和活动记录 |
| `/plan` | 多 Agent 协作模式：规划 Agent 分解任务，执行 Agent 逐步完成 |
| `/exit` | 退出 TUI |

## 推荐演示输入

```text
查一下 Albert Einstein 的出生年份，然后计算他活了多少岁
```

```text
/plan 查一下 Albert Einstein 的出生年份，然后计算他活了多少岁
```

```text
读取 docs/raw-instruction.md，并总结这个作业的 3 个核心要求
```

```text
把上面的总结写入 artifacts/homework-summary.md
```

## 开发常用命令

```powershell
corepack pnpm build     # TypeScript 编译到 dist/
corepack pnpm test      # 运行 Vitest 测试
corepack pnpm lint      # TypeScript 类型检查（noEmit）
```

## 构建与运行编译结果（可选）

如果需要运行编译后的 JS 而非 tsx 直解：

```powershell
corepack pnpm build
corepack pnpm start          # 编译后的 TUI
corepack pnpm start:web      # 编译后的 Web
```

## 文档构建

激活 Python 虚拟环境：

```powershell
.\.venv\Scripts\Activate.ps1
```

安装 MkDocs：

```powershell
python -m pip install mkdocs
```

构建文档：

```powershell
mkdocs build
```

构建产物输出到 `site/` 目录。
