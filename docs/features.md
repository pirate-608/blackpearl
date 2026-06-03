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

默认可连接 OpenAI API，也可通过 `BLACKPEARL_BASE_URL` 指向第三方模型服务。runner 使用流式 API 接收文本增量，并把增量转成统一的 `assistant_delta` 事件。一次用户请求会进入串行循环：

1. 将用户输入发送给模型。
2. 如果模型返回普通文本，作为最终回答展示。
3. 如果模型返回 `function_call`，本地执行对应工具。
4. 将 `function_call_output` 回传模型。
5. 重复直到模型给出最终回答，或达到 `AGENT_MAX_STEPS` 上限。

当前实现设置 `parallel_tool_calls: false`，有意保持串行工具链，便于课程展示和调试。

### Web 交互界面

项目提供轻量 Web 界面，入口命令为：

```powershell
corepack pnpm web
```

Web 界面复用同一套 `AgentOrchestrator`、runner、工具注册表和记忆模块。页面通过 Server-Sent Events 接收运行事件：

- `assistant_delta` 用于实时追加回答文本。
- `tool_call_started`、`tool_call_finished` 用于更新活动区。
- `error` 用于显示运行错误。

Web 界面同样支持完整的 `/` 命令系统：输入 `/` 显示命令下拉菜单，支持 `↑`/`↓` 导航、`Tab` 补全。`/connect` 通过模态框配置 provider，`/model` 查看和切换模型，`/exit` 停止服务。

该设计保持 TUI 和 Web 的能力一致，避免出现两个互相分叉的 Agent 实现。

### 多 Agent 协作

通过 `/plan` 命令触发多 Agent 协作模式，包含三个阶段：

1. **规划 Agent**：使用 `PLANNER_PROMPT` 且无工具，将用户请求分解为 JSON 步骤列表。
2. **执行 Agent**：使用 `EXECUTOR_PROMPT` 和完整工具，逐步执行每个步骤。上一步的结果作为后续步骤的上下文。
3. **汇总**：将所有步骤结果合并为一份连贯的最终回答。

此模式适合需要多步推理和工具组合的复杂任务，例如"查一下爱因斯坦的出生年份，然后算他活了多少岁"。

多 Agent 支持单独配置子智能体模型：`BLACKPEARL_SUBAGENT_MODEL`。当前实现只覆盖模型名，不覆盖 provider、API key 或 base URL，因此它适用于同一厂商、同一 base URL 下的模型分工，例如主 Agent 使用强模型，规划/执行子 Agent 使用同厂商更低成本模型。

### 短期记忆与长期记忆

Agent 在每次处理用户输入前会构建记忆上下文：

- 短期记忆：当前进程内最近若干条对话消息。
- 长期记忆：保存在 `.blackpearl/memory.jsonl` 中的一轮问答摘要。

长期记忆使用轻量关键词检索。当前实现重点服务课程展示，便于说明“写入记忆、召回记忆、注入上下文”的闭环；后续可以替换为 embeddings 和向量数据库。

### 默认工具

| 工具名 | 功能 | 主要输入 | 输出概要 |
| --- | --- | --- | --- |
| `calculator` | 安全计算数学表达式 | `expression` | 表达式与计算结果 |
| `wiki_search` | 查询 Wikipedia 页面摘要 | `query`, `lang` | 标题、摘要、链接 |
| `file_list` | 列出工作区文件和目录 | `path`, `recursive` | 文件路径、类型和大小 |
| `file_read` | 读取工作区内 UTF-8 文本文件 | `path`, `offset`, `maxChars` | 文件内容、截断信息 |
| `file_search` | 在文本文件中搜索字面量 | `query`, `path` | 匹配文件、行号和片段 |
| `file_edit` | 精确替换单个文本块 | `path`, `oldText`, `newText` | 替换位置和字节数 |
| `file_write` | 创建、覆盖或追加 UTF-8 文本文件 | `path`, `content`, `mode` | 写入路径、模式和字节数 |
| `shell_command` | 在工作区内执行非交互命令 | `command`, `args`, `cwd` | 退出码、stdout、stderr |

### 路径安全约束

文件工具只允许访问工作区内路径。为避免误读密钥或改坏生成产物，默认跳过或阻止以下路径：

- `.git/`
- `.blackpearl/`
- `.agents/`
- `node_modules/`
- `dist/`
- `site/`
- `.venv/`
- `.env` 和 `.env.*`

`shell_command` 不通过 shell 执行命令，因此不支持管道、重定向和命令连接符。它还会阻止 `rm`、`del`、`cmd`、`powershell`、`sudo` 等高风险命令。该工具适合运行 `git status`、`node --version`、`corepack pnpm test`、`corepack pnpm lint` 等非交互式命令。

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

- 流式输出已接入，但不同厂商的 streaming tool call 细节仍需用真实账号持续实测。
- 多厂商支持按 provider adapter 分别实现；不同厂商的工具调用兼容程度仍需实测。
- `/connect` 已提供基础交互式配置，但 API key 当前以明文保存在本地项目配置文件中，后续可改为系统密钥链。
- TUI 输入框已有 `/` 命令提示，但暂不支持完整行编辑能力，例如光标移动到行中间编辑。
- 会话历史已经落盘，但暂未提供 `/history` 命令读取。
- OpenAI runner 还缺少 mock 集成测试。
- 长期记忆是关键词检索，不是 embeddings 检索，也没有记忆删除/编辑 UI。
- Wikipedia 工具依赖公网访问，网络不可用时会失败或返回错误状态。
- 文件写入和命令执行当前没有二次确认机制，依赖工作区边界、敏感路径阻止和命令黑名单进行控制。

### Skills 技能系统

Skills 使用 `skill-name/SKILL.md` 结构和 YAML frontmatter。推荐在项目级 `.agents/<skill-name>/SKILL.md` 下创建技能；用户级技能可放在 `~/.agents/<skill-name>/SKILL.md` 供多个项目复用。

加载优先级为：用户级旧目录 `~/.blackpearl/skills`、用户级新目录 `~/.agents`、项目级旧目录 `.blackpearl/skills`、项目级新目录 `.agents`。同名技能后加载者覆盖先加载者，因此项目级优先于用户级，项目 `.agents` 优先于旧 `.blackpearl/skills`。

Agent 根据用户输入中的关键词自动匹配并激活技能，注入自定义系统提示词，并可限制可用工具白名单。

### MCP 协议扩展

通过 Model Context Protocol 连接外部工具服务器（`.blackpearl/mcp-servers.json`），启动时自动发现并注册远程工具。支持 stdio transport，断连时自动清理。

### Web 界面增强

- **暗色模式**：顶栏按钮切换浅色/深色主题
- **文件上传**：本地上传文本、PDF、DOCX 文件，内容自动插入输入框
- **Activity 隐藏**：顶栏按钮折叠/展开右侧活动面板
- **会话侧边栏**：左侧面板查看历史会话列表，点击加载历史消息
- **Markdown 渲染**：Agent 回复在服务端渲染为 HTML 后发送
- **复制/重跑/停止**：每条回复可复制原文，输入框旁可重跑上一条消息，执行中可随时中断

### 中断机制

TUI 按 Esc、Web 点停止按钮，即可中断当前 Agent 执行。实现基于 `AbortController`，Runner 在每步循环前检查信号。

### CLI 命令行

编译后通过 `blackpearl` / `blackpearl web` 全局命令行启动，支持 `--resume <id>` 恢复会话和 `--help` 查看用法。

## 适合作业展示的亮点

- 没有依赖高层 Agent 框架，便于解释实现原理。
- 工具调用过程可见，能展示“模型决策 -> 工具执行 -> 结果回传”的闭环。
- 工具接口使用 Zod schema 校验，减少模型参数错误。
- 会话记录可用于补充 demo 截图或答辩说明。
