# 快速开始

本文说明如何在本地运行 blackpearl-agent。

## 环境要求

建议使用以下环境：

| 依赖 | 建议版本 | 说明 |
| --- | --- | --- |
| Node.js | 20 或更高 | 当前开发机使用 Node.js 24 可通过构建 |
| Corepack | 随 Node.js 提供 | 用于调用固定版本 pnpm |
| pnpm | 10.12.1 | 已在 `packageManager` 中声明 |
| Python | 3.13 或更高 | 仅用于 MkDocs 文档构建 |

## 安装 Node 依赖

在仓库根目录执行：

```powershell
corepack pnpm install
```

如果是首次使用 Corepack，可能需要允许它在用户目录创建缓存并下载 pnpm。

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

TUI 中输入：

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
| `/exit` | 退出 TUI |

## 推荐演示输入

```text
查一下 Albert Einstein 的出生年份，然后计算他活了多少岁
```

```text
读取 docs/raw-instruction.md，并总结这个作业的 3 个核心要求
```

```text
把上面的总结写入 artifacts/homework-summary.md
```

## 构建与运行编译结果

构建：

```powershell
corepack pnpm build
```

运行编译后的入口：

```powershell
corepack pnpm start
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
