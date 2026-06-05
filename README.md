# blackpearl-agent

一个基于 TypeScript、Ink TUI 和多厂商模型后端的教学型 AI Agent 框架。

项目支持系统化模型后端配置：OpenAI、Gemini、Claude、DeepSeek 和 Ollama。OpenAI-compatible 后端使用 OpenAI SDK；Claude 使用 Anthropic Messages API。不同厂商对工具调用、鉴权和模型名的兼容程度不同，项目按 provider 分别适配。

## 项目文档

查看[项目文档](http://blackpearl.67656.fun/)

## 快速开始

### 一键安装（推荐）

无需安装 Node.js，下载独立可执行文件即可使用：

**Windows（PowerShell）：**

```powershell
irm https://pirate-608.github.io/blackpearl/install.ps1 | iex
```

**Linux / macOS（Bash）：**

```bash
curl -fsSL https://pirate-608.github.io/blackpearl/install.sh | bash
```

安装后重启终端即可使用：

```bash
blackpearl                  # 启动 TUI
blackpearl web              # 启动 Web UI
blackpearl --resume <id>    # 恢复会话
```

也可以从 [GitHub Releases](https://github.com/pirate-608/blackpearl/releases) 手动下载压缩包解压使用。

### 从源码运行

环境要求：Node.js ≥ 20，pnpm 由 Corepack 自动管理。

### Windows

```powershell
# 克隆仓库
git clone https://github.com/pirate-608/blackpearl.git
cd blackpearl

# 安装依赖并启动
corepack enable          # 首次需要管理员权限
corepack pnpm install
copy .env.example .env
corepack pnpm dev        # 启动 TUI
```

### macOS / Linux

```bash
# 克隆仓库
git clone https://github.com/pirate-608/blackpearl.git
cd blackpearl

# 安装依赖并启动
corepack enable          # 首次需要 sudo
corepack pnpm install
cp .env.example .env
corepack pnpm dev        # 启动 TUI
```

### Web 界面（全平台通用）

```bash
corepack pnpm web
```

默认访问 `http://localhost:4173`。

> **注意**：项目使用 `tsx` 直接执行 TypeScript 源码，无需编译。`.env` 仅作首次启动 fallback，推荐在 TUI 或 Web 界面中使用 `/connect` 交互式配置模型后端。

## 配置模型后端

`.env` 作为首次启动 fallback。启动后推荐在 TUI 中使用 `/connect` 交互式配置，配置会保存到 `.blackpearl/connections.json`。

当前支持五类后端：`openai`、`gemini`、`claude`、`deepseek`、`ollama`。

## TUI 命令

| 命令 | 功能 |
| --- | --- |
| `/help` | 显示可用命令 |
| `/tools` | 列出已注册工具 |
| `/connect` | 交互式配置模型后端 |
| `/model` | 查看或切换已配置模型 |
| `/clear` | 清空当前界面记录 |
| `/skills` | 列出已加载的 Skills |
| `/plan` | 多 Agent 协作：规划 Agent 分解任务 → 执行 Agent 逐步完成 |
| `/exit` | 退出 TUI |

快捷键：输入 `/` 显示命令提示，`↑`/`↓` 选择，`Tab` 补全，`Enter` 执行。Agent 执行中按 `Esc` 可中断。

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

## Skills 技能系统

Skills 使用主流 `skill-name/SKILL.md` 结构和 YAML frontmatter。项目级路径优先于用户级路径；同名技能会由项目级覆盖用户级。

| 范围 | 推荐路径 | 说明 |
| --- | --- | --- |
| 项目级 | `.agents/<skill-name>/SKILL.md` | 随项目生效，优先级最高 |
| 用户级 | `~/.agents/<skill-name>/SKILL.md` | 跨项目复用 |
| 旧兼容 | `.blackpearl/skills/<skill-name>/SKILL.md` | 继续可读，但不再推荐新建 |

Agent 会根据用户输入自动匹配并激活对应技能。技能可自定义系统提示词和可用工具白名单。

```markdown
---
name: code-review
description: 审查代码、发现 bug、提出改进建议
allowed-tools:
  - file_read
  - file_write
---

你是代码审查专家。审查代码时：
1. 先理解代码结构和意图
2. 检查潜在 bug 和边界条件
3. 将审查结果写入 artifacts/review.md
```

TUI 中输入 `/skills` 查看已加载的技能列表。

## MCP 工具扩展

支持通过 [Model Context Protocol](https://modelcontextprotocol.org/) 连接外部工具服务器，动态扩展 Agent 能力。将 `.blackpearl/mcp-servers.example.json` 复制为 `mcp-servers.json` 并编辑：

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

启动后 MCP 工具自动注册到工具注册表，Agent 可直接调用。Web 界面 `/api/state` 会返回当前 MCP 连接状态。

## 常用命令

```bash
corepack pnpm dev       # 启动 TUI（源码）
corepack pnpm web       # 启动 Web 界面（源码）
corepack pnpm build     # TypeScript 编译
corepack pnpm test      # 运行 Vitest 测试
corepack pnpm lint      # TypeScript 类型检查
```

编译后也可通过项目自带的 fallback 脚本启动：

```bash
# Windows（任意目录，需将项目目录加入 PATH）
blackpearl.cmd

# macOS / Linux
./blackpearl
```

## 当前能力

- 终端 TUI 对话入口
- Web 对话入口，支持 SSE 流式输出
- OpenAI Responses API / Chat Completions / Anthropic Messages API 流式工具调用循环
- 工具注册表
- 计算器、Wikipedia 查询、工作区文件读写、文本搜索、精确替换和受控命令行执行
- 本地会话记录
- 短期记忆和 JSONL 长期记忆
- `/connect` provider 配置
- `/model` 模型切换
- `/plan` 多 Agent 协作（规划 Agent + 执行 Agent）
- `/skills` 技能系统：SKILL.md 自定义提示词 + 工具白名单，关键词自动匹配
- MCP 协议支持：连接外部工具服务器，动态扩展 Agent 工具集
- Web 界面支持 `/` 命令提示、model 切换、connect 配置和 Stop 中断
- `Esc` 中断机制：TUI 按 Esc、Web 点 Stop 按钮，随时终止 Agent 执行
- 全局命令：`blackpearl` / `blackpearl web` / `--resume`，一键安装或从 PATH 启动
- Node.js SEA 独立可执行文件打包（基于 Node 26 `mainFormat: "module"`），Windows/Linux/macOS 三平台 Release 发布
