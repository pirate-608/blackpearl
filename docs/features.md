# 功能与特性

## 核心功能

### 终端交互界面

项目使用 Ink 构建 TUI。界面由状态栏、对话区、活动区和输入区组成。

- 状态栏显示 session、模式、模型和运行状态。
- 对话区显示用户输入与 Agent 最终回答。
- 活动区显示工具调用开始、结束、失败等执行过程。
- 输入区接收自然语言任务和本地命令。
- 输入 `/` 时显示交互式命令提示，支持前缀过滤、上下选择、Tab 补全和 Enter 执行。

### Agent 工具调用循环

Agent 支持系统性 provider 配置，不再只依赖环境变量硬编码。通过 `/connect` 可配置 OpenAI、Gemini、Claude、DeepSeek 和 Ollama；通过 `/model` 可查看和切换已配置模型。

Agent 支持两种 OpenAI-compatible runner：

- `responses`: 使用 Responses API。
- `chat_completions`: 使用 Chat Completions API，适合 Gemini、Ollama 等兼容服务。

Claude 使用 Anthropic Messages API 单独适配。DeepSeek 也使用其官方推荐的 Anthropic-compatible endpoint，以避免 thinking 模式下 `reasoning_content` 回传兼容问题。

默认可连接 OpenAI API，也可通过 `OPENAI_BASE_URL` 指向第三方模型服务。一次用户请求会进入串行循环：

1. 将用户输入发送给模型。
2. 如果模型返回普通文本，作为最终回答展示。
3. 如果模型返回 `function_call`，本地执行对应工具。
4. 将 `function_call_output` 回传模型。
5. 重复直到模型给出最终回答，或达到 `AGENT_MAX_STEPS` 上限。

当前实现设置 `parallel_tool_calls: false`，有意保持串行工具链，便于课程展示和调试。

### 默认工具

| 工具名 | 功能 | 主要输入 | 输出概要 |
| --- | --- | --- | --- |
| `calculator` | 安全计算数学表达式 | `expression` | 表达式与计算结果 |
| `wiki_search` | 查询 Wikipedia 页面摘要 | `query`, `lang` | 标题、摘要、链接 |
| `file_read` | 读取工作区内 UTF-8 文本文件 | `path`, `maxChars` | 文件内容、截断信息 |
| `file_write` | 写入 UTF-8 文本文件 | `path`, `content` | 写入路径和字节数 |

### 路径安全约束

文件工具只允许访问工作区内路径。`file_write` 进一步限制写入目录：

- `artifacts/`
- `notes/`

这避免模型把内容写入项目外部路径，也方便集中管理演示产物。

### 会话记录

运行时会将消息与事件追加写入 JSONL 文件：

```text
.agent-sessions/<session-id>.jsonl
```

记录类型包括：

- 用户消息
- Agent 最终回答
- 工具调用事件
- 工具调用结果
- 工具失败事件

## 当前限制

当前版本是基础构建，不是完整生产级 Agent。已知限制如下：

- 输出尚未接入流式渲染。
- 多厂商支持限于 OpenAI-compatible API；不同厂商的工具调用兼容程度仍需实测。
- `/connect` 已提供基础交互式配置，但 API key 当前以明文保存在本地项目配置文件中，后续可改为系统密钥链。
- TUI 输入框已有 `/` 命令提示，但暂不支持完整行编辑能力，例如光标移动到行中间编辑。
- 会话历史已经落盘，但暂未提供 `/history` 命令读取。
- OpenAI runner 还缺少 mock 集成测试。
- Wikipedia 工具依赖公网访问，网络不可用时会失败或返回错误状态。
- `file_write` 当前没有二次确认机制，依赖目录白名单进行控制。

## 适合作业展示的亮点

- 没有依赖高层 Agent 框架，便于解释实现原理。
- 工具调用过程可见，能展示“模型决策 -> 工具执行 -> 结果回传”的闭环。
- 工具接口使用 Zod schema 校验，减少模型参数错误。
- 会话记录可用于补充 demo 截图或答辩说明。
